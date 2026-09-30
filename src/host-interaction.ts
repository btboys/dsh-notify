import { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type {
  ApprovalRequestView,
  CreateSessionResult,
  InteractionHost,
  InteractionSink,
  PromptResult,
  QuestionAnswer,
  QuestionRequestView,
  SessionSummaryLike,
  WorkspaceViewLike,
} from './interaction.js'

/**
 * Host-plane implementation of {@link InteractionHost} for current DSH.
 *
 * Until 1.4.3 the bridge drove everything through `ctx.apiProxy`
 * (`@deepseek-ai/dsh-host-apiproxy`), which the harness removed. This module
 * composes with the replacement seams instead:
 *
 *   - `approval/request` (waterfall, Agent-scoped) — the single approval
 *     decision slot. Registered with `prepend: true`: the Remote/browser
 *     answerer is terminal once it registers first, so an unprepended listener
 *     would never be consulted while a Web client is connected. The bridge's
 *     answer is raced against the downstream chain, which preserves
 *     "whichever surface answers first wins".
 *   - `user-questions/request` (waterfall) — the same shape for
 *     `ask_user_question`. Unlike approvals, an unsettled listener hangs
 *     `ask()` forever, so an aborted request signal rejects the seam with the
 *     wait's own reason (a timed wait maps that to `{ pending: true }`).
 *   - `ctx.sessionController` — prompt/list/create, the same methods the
 *     browser calls over Remote, including cold-session resume. Falls back to
 *     `ctx.sessionQuery` + `ctx.agents` where the controller is not mounted
 *     (e.g. a headless composition), and reports clearly when neither exists.
 *   - `ctx.workspaceRegistry` — the /workspace menu.
 *
 * Every host shape here is structural and every service is soft-resolved, so
 * the plugin never imports a harness package at runtime.
 */

// ── Structural host shapes (all fields optional: a composition may lack any) ──

/** The chat text part a prompt carries. */
interface PromptTextPart {
  type: 'text'
  text: string
}

/** `ctx.sessionController` — prompt/list/create, shared with the Web client. */
interface SessionControllerLike {
  prompt?(
    request: {
      requestId: string
      sessionId: string
      mode: 'queue' | 'steer'
      content: PromptTextPart[]
      clientTimeZone?: string
    },
    signal: AbortSignal,
  ): Promise<unknown>
  list?(
    request: Record<string, never>,
    signal: AbortSignal,
  ): Promise<{ items?: Array<Record<string, unknown>> }>
  create?(request: { workspaceId?: string; cwd?: string }): Promise<{ sessionId?: string }>
}

/** `ctx.sessionQuery` — the controller-free session corpus reader. */
interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<Array<{ header?: Record<string, unknown> }>>
}

/** One live Agent (the subset the bridge reads). */
interface AgentLike {
  id?: string
  status?: string
  session?: SessionLike
  followup?(message: unknown): void
}

/** One live Session (the subset the bridge reads). */
interface SessionLike {
  seq?: number
  header?: Record<string, unknown>
  snapshotEvents?(): readonly unknown[]
  log?: readonly unknown[]
}

/** `ctx.agents` — the live Agent registry. */
interface AgentRegistryLike {
  get?(id: string): AgentLike | undefined
}

/** `ctx.sessions` — the live Session store. */
interface SessionStoreLike {
  get?(id: string): SessionLike | undefined
}

/** One registered Workspace (the subset the bridge reads). */
interface WorkspaceLike {
  id?: string
  path?: string
  title?: string
  sessionIds?: readonly string[]
}

/** `ctx.workspaceRegistry`. */
interface WorkspaceRegistryLike {
  list?(): WorkspaceLike[]
  get?(id: string): WorkspaceLike | undefined
}

/** The cordis surface this adapter uses, typed structurally. */
interface HostContextLike {
  get(name: string): unknown
  on(name: string, listener: (...args: any[]) => unknown, options?: { prepend?: boolean }): () => void
  logger: {
    debug(...args: unknown[]): void
    warn(...args: unknown[]): void
  }
}

/** A winner of the chat-vs-downstream race. */
type RaceOutcome<T> =
  | { side: 'chat'; value: T | null }
  | { side: 'down'; value: T }

/** Fixed client time zone stamped onto chat-originated prompts. */
const CLIENT_TIME_ZONE = 'Asia/Shanghai'

/** Human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

/**
 * One promise that settles when a request signal aborts.
 *
 * `release` resolves with the chat-side `null`, which makes the adapter
 * delegate downstream — correct for approvals, whose service races the signal
 * itself and answers `cancelled`. `throw` rejects with the signal's own reason,
 * which is what the question seam needs: `ask()` awaits the outermost answerer
 * with no timeout of its own, so a listener that never settles hangs the tool.
 *
 * @param signal - the request's cancellation lifetime, when it has one.
 * @param mode - how an abort should settle the gate.
 * @returns the gate promise plus its listener disposer.
 */
function abortGate(signal: AbortSignal | undefined, mode: 'release' | 'throw'): {
  promise: Promise<unknown>
  dispose(): void
} {
  if (signal === undefined) return { promise: new Promise(() => {}), dispose: () => {} }
  let fire: (() => void) | null = null
  const promise = new Promise<unknown>((resolve, reject) => {
    fire = (): void => {
      if (mode === 'release') resolve({ side: 'chat', value: null })
      else reject(signal.reason ?? new Error('user question request aborted'))
    }
    if (signal.aborted) fire()
    else signal.addEventListener('abort', fire, { once: true })
  })
  return {
    promise,
    dispose: () => {
      if (fire !== null) signal.removeEventListener('abort', fire)
    },
  }
}

/** A string field of an unknown record, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** The session id behind a request's Agent, or undefined when unknown. */
function sessionIdOf(agent: unknown): string | undefined {
  const view = agent as { id?: unknown; session?: { id?: unknown; header?: { id?: unknown } } } | undefined
  return text(view?.id) ?? text(view?.session?.id) ?? text(view?.session?.header?.id)
}

/**
 * The bridge's host side: answerer waterfalls in, session/workspace calls out.
 */
export class DshInteractionHost implements InteractionHost {
  private readonly ctx: HostContextLike

  /** @param ctx - the plugin's host cordis context. */
  constructor(ctx: Context) {
    this.ctx = ctx as unknown as HostContextLike
  }

  /**
   * Register the inbound answerer listeners.
   *
   * Both are prepended: the browser/Remote answerer is terminal (it holds the
   * decision slot until a Web client answers), so a listener registered after
   * it is never consulted while a Web UI is connected.
   *
   * @param sink - bridge callbacks that own the chat side of each prompt.
   * @returns a disposer removing both listeners.
   */
  attach(sink: InteractionSink): () => void {
    const listeners: Array<() => void> = []
    try {
      listeners.push(this.ctx.on(
        'approval/request',
        (request: any, next: () => Promise<unknown>) => this.handleApproval(sink, request, next),
        { prepend: true },
      ))
    } catch (error) {
      this.ctx.logger.warn('[notify] Cannot listen for approval requests:', error)
    }
    try {
      listeners.push(this.ctx.on(
        'user-questions/request',
        (request: any, next: () => Promise<unknown>) => this.handleQuestion(sink, request, next),
        { prepend: true },
      ))
    } catch (error) {
      this.ctx.logger.warn('[notify] Cannot listen for user questions:', error)
    }
    return () => {
      for (const dispose of listeners) {
        try {
          dispose()
        } catch (error) {
          this.ctx.logger.warn('[notify] Interaction listener disposal failed:', error)
        }
      }
    }
  }

  // ── answerer waterfalls ──────────────────────────────────────────────────

  /**
   * Offer one approval to the chat and race it against the downstream chain.
   * A `null` chat answer (aborted request, or another answerer already won)
   * delegates by returning the downstream promise.
   */
  private async handleApproval(
    sink: InteractionSink,
    request: any,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const sessionId = sessionIdOf(request?.agent)
    if (!sessionId) return next()

    const view: ApprovalRequestView = {
      sessionId,
      toolName: text(request?.toolName) ?? '未知操作',
      ...(text(request?.callId) === undefined ? {} : { callId: text(request?.callId) }),
      ...(text(request?.reason) === undefined ? {} : { reason: text(request?.reason) }),
      ...(request?.signal === undefined ? {} : { signal: request.signal }),
    }

    const mine = sink.approval(view)
    const downstream = this.downstream(next)
    const onLose = (): void => sink.drop('approval', sessionId, view.callId)
    const gate = abortGate(view.signal, 'release')

    try {
      return await this.race([
        mine.then((value) => ({ side: 'chat' as const, value })),
        downstream.then((value) => ({ side: 'down' as const, value })),
        gate.promise as Promise<RaceOutcome<unknown>>,
      ], downstream, onLose)
    } finally {
      gate.dispose()
    }
  }

  /**
   * Offer one `ask_user_question` batch to the chat and race it against the
   * downstream chain. An aborted request signal rejects with that signal's own
   * reason: `ask()` awaits the outermost listener with no timeout of its own,
   * so an unsettled (or silently delegated) listener would hang the tool call.
   */
  private async handleQuestion(
    sink: InteractionSink,
    request: any,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const sessionId = sessionIdOf(request?.agent) ?? ''
    const questions = Array.isArray(request?.questions) ? request.questions : []
    if (questions.length === 0) return next()

    const view: QuestionRequestView = {
      sessionId,
      questions,
      ...(text(request?.wait?.callId) === undefined ? {} : { callId: text(request?.wait?.callId) }),
      ...(request?.signal === undefined ? {} : { signal: request.signal }),
    }

    const mine = sink.question(view)
    const downstream = this.downstream(next)
    const onLose = (): void => sink.drop('question', sessionId, view.callId)
    // A question listener MUST settle: `ask()` awaits the outermost answerer
    // with no timeout of its own, so an abort rejects with the wait's own
    // reason (a timed wait turns that into `{ pending: true }`, a turn abort
    // into ASK_ABORTED) instead of hanging the tool call.
    const gate = abortGate(view.signal, 'throw')

    try {
      return await this.race([
        mine.then((value) => ({ side: 'chat' as const, value })),
        downstream.then((value) => ({ side: 'down' as const, value })),
        gate.promise as Promise<RaceOutcome<unknown>>,
      ], downstream, onLose)
    } catch (error) {
      onLose()
      throw error
    } finally {
      gate.dispose()
    }
  }

  /** Start the downstream answerer chain without letting a sync throw escape. */
  private downstream(next: () => Promise<unknown>): Promise<unknown> {
    return Promise.resolve().then(() => next())
  }

  /**
   * Resolve the first winner of the chat answer, the downstream chain, or an
   * abort gate. A chat `null` means the chat did not claim, so the downstream
   * promise is returned as-is (it may still settle later).
   */
  private async race<T>(
    racers: Array<Promise<RaceOutcome<T>>>,
    downstream: Promise<T>,
    onLose: () => void,
  ): Promise<T> {
    const winner = await Promise.race(racers)
    if (winner.side === 'down') {
      onLose()
      return winner.value
    }
    if (winner.value === null) {
      onLose()
      return downstream
    }
    return winner.value
  }

  // ── outbound host calls ──────────────────────────────────────────────────

  /** {@inheritDoc InteractionHost.prompt} */
  async prompt(sessionId: string, text_: string): Promise<PromptResult> {
    const controller = this.ctx.get('sessionController') as SessionControllerLike | undefined
    if (controller?.prompt) {
      try {
        await controller.prompt({
          requestId: randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: text_ }],
          clientTimeZone: CLIENT_TIME_ZONE,
        }, new AbortController().signal)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    }

    // Fallback for compositions without the session controller: append to a
    // LIVE agent only. A cold session cannot be resumed here without the
    // controller's preset/ownership handling, so say so instead of guessing.
    const agents = this.ctx.get('agents') as AgentRegistryLike | undefined
    const agent = agents?.get?.(sessionId)
    if (!agent) {
      return { ok: false, error: '该会话当前不在运行，请先在 DSH Web 端打开它再重试' }
    }
    if (typeof agent.followup !== 'function') {
      return { ok: false, error: '当前宿主不支持向会话追加消息' }
    }
    try {
      agent.followup(makeUserMessage(text_))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  }

  /** {@inheritDoc InteractionHost.listSessions} */
  async listSessions(): Promise<SessionSummaryLike[] | null> {
    const controller = this.ctx.get('sessionController') as SessionControllerLike | undefined
    if (controller?.list) {
      try {
        const result = await controller.list({}, new AbortController().signal)
        const items = Array.isArray(result?.items) ? result.items : []
        return items.map((row) => this.summaryOf(row))
      } catch (error) {
        this.ctx.logger.warn('[notify] session list failed:', error)
        return null
      }
    }

    // Controller-free fallback: the corpus reader knows headers only, so rows
    // carry no title and "blank" is approximated by the live session's log.
    const query = this.ctx.get('sessionQuery') as SessionQueryLike | undefined
    if (!query?.listSessions) return null
    try {
      const records = await query.listSessions()
      const sessions = this.ctx.get('sessions') as SessionStoreLike | undefined
      const agents = this.ctx.get('agents') as AgentRegistryLike | undefined
      return records.flatMap((record) => {
        const header = record?.header ?? {}
        const sessionId = text(header.id)
        if (!sessionId) return []
        const live = sessions?.get?.(sessionId)
        const agent = agents?.get?.(sessionId)
        return [{
          sessionId,
          updatedAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
          running: agent?.status === 'running',
          blank: live?.seq === 0,
          ...(text(header.cwd) === undefined ? {} : { cwd: text(header.cwd) }),
          ...(header.origin === 'subagent' ? { origin: 'subagent' as const } : {}),
          ...(live === undefined ? {} : { projections: { values: { title: this.titleOfLive(live) } } }),
        }]
      })
    } catch (error) {
      this.ctx.logger.warn('[notify] session list failed:', error)
      return null
    }
  }

  /** {@inheritDoc InteractionHost.listWorkspaces} */
  async listWorkspaces(): Promise<WorkspaceViewLike[] | null> {
    const registry = this.ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
    if (!registry?.list) return null
    try {
      return registry.list().flatMap((workspace) => {
        const workspaceId = workspace?.id === undefined ? undefined : String(workspace.id)
        if (workspaceId === undefined || workspace?.path === undefined) return []
        return [{
          workspaceId,
          path: workspace.path,
          title: workspace.title ?? workspace.path,
          sessionIds: [...(workspace.sessionIds ?? [])].map(String),
        }]
      })
    } catch (error) {
      this.ctx.logger.warn('[notify] workspace list failed:', error)
      return null
    }
  }

  /** {@inheritDoc InteractionHost.createSession} */
  async createSession(workspaceId: string): Promise<CreateSessionResult> {
    const controller = this.ctx.get('sessionController') as SessionControllerLike | undefined
    if (controller?.create) {
      try {
        const created = await controller.create({ workspaceId })
        const sessionId = text(created?.sessionId)
        return sessionId === undefined
          ? { ok: false, error: '宿主未返回新的会话 id' }
          : { ok: true, sessionId }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    }
    return { ok: false, error: '当前宿主不支持新建会话，请先在 DSH Web 端打开该工作区' }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Project one controller summary row onto the menu's structural shape. */
  private summaryOf(row: Record<string, unknown>): SessionSummaryLike {
    const sessionId = String(row.sessionId ?? '')
    const summary: SessionSummaryLike = {
      sessionId,
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
      running: row.running === true,
      blank: row.blank === true,
    }
    const cwd = text(row.cwd)
    if (cwd !== undefined) summary.cwd = cwd
    if (row.origin === 'subagent') summary.origin = 'subagent'
    const title = (row.projections as { values?: { title?: unknown } } | undefined)?.values?.title
    if (typeof title === 'string' || title === null) {
      summary.projections = { values: { title: title ?? null } }
    }
    return summary
  }

  /** Latest `session/title` recorded in a live session's log. */
  private titleOfLive(session: SessionLike): string | undefined {
    const events = typeof session.snapshotEvents === 'function'
      ? session.snapshotEvents()
      : Array.isArray(session.log) ? session.log : undefined
    if (!Array.isArray(events)) return undefined
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index] as { type?: unknown; data?: { title?: unknown } } | undefined
      if (event?.type === 'session/title') {
        const title = text(event.data?.title)
        if (title !== undefined) return title
      }
    }
    return undefined
  }
}

/**
 * Build the ordinary follow-up user message the Agent accepts.
 *
 * Mirrors the harness's `createUserMessage()` exactly (a detached, deep-frozen
 * `{ id, role, content, source }` with a fresh uuid id) so the plugin needs no
 * runtime import of `@deepseek-ai/dsh-llm`.
 */
function makeUserMessage(text_: string): unknown {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: text_ }],
    source: { kind: 'user', rpcId: randomUUID() },
  })
}

/** Recursively freeze a plain JSON value (message snapshots are immutable). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
