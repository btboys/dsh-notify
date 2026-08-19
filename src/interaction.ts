import { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'

/**
 * WeChat two-way interaction bridge.
 *
 * Upgrades the WeChat ClawBot channel from one-way pushes to a remote-control
 * surface for DSH. It uses the host's IN-PROCESS API gateway (`ctx.apiProxy`,
 * the same contract the browser client talks to over HTTP):
 *
 *   - `events.mux()`      — subscribes to the all-session frame stream and
 *                           picks up the two ANSWERABLE frames:
 *                           `approval/requested` and `question/requested`
 *                           (each carries the stable rpcId that answers echo).
 *   - `respond()`         — settles a pending approval/question. The pending
 *                           table is shared with the Web UI and the FIRST
 *                           claimant wins: whichever side (WeChat or browser)
 *                           answers first settles it; the other gets
 *                           `not-pending` and its UI auto-dismisses via the
 *                           "resolved" frames (which we also listen to).
 *   - `sessions.prompt()` — injects a free-text WeChat reply as an ordinary
 *                           follow-up user message into the most recently
 *                           notified session, continuing the conversation.
 *
 * The bridge deliberately avoids the cordis-level seams (`approval/request`
 * waterfall listener, `userQuestions.registerProvider`): the Web UI's
 * apiproxy already owns both (the provider is single-registration), and
 * answering through `respond()` composes with it instead of fighting it.
 *
 * All wire shapes below are structural — see
 * `@deepseek-ai/dsh-host-apiproxy` lib/types/api/{events,approvals,questions,rpc,sessions}.d.ts
 * (the runtime deployment always provides the real service; the plugin only
 * soft-resolves it so non-web deployments degrade gracefully).
 */

// ── Structural wire types (mirrors of dsh-host-apiproxy contracts) ──────────

/** One selectable option of a question. */
export interface QuestionOption {
  label: string
  description?: string
}

/** One question in an ask_user_question batch. */
export interface QuestionItem {
  id: string
  question: string
  detail?: string
  header?: string
  options?: QuestionOption[]
  multiSelect?: boolean
}

/** The subset of mux frames this bridge consumes. Other frame types (session
 *  events, queue snapshots, …) arrive on the same stream and are ignored —
 *  they simply match no branch in handleFrame(). */
export type MuxFrameView =
  | { type: 'approval/requested'; sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string }
  | { type: 'approval/resolved'; sessionId: string; approvalId: string; outcome: string }
  | { type: 'question/requested'; sessionId: string; questions: QuestionItem[] }
  | { type: 'question/resolved'; sessionId: string; questionRpcId: string; outcome: string }

/** Minimal structural face of `ctx.apiProxy` used here. */
export interface ApiProxyLike {
  events: {
    mux(
      request: { rpcId: string; payload: Record<string, never> },
      signal: AbortSignal,
    ): AsyncIterable<{ rpcId: string; payload: MuxFrameView }>
  }
  respond(message: {
    type: 'client-response'
    rpcId: string
    result:
      | { ok: true; value: unknown }
      | { ok: false; error: { code: string; message: string } }
  }): Promise<{ accepted: true } | { accepted: false; reason: 'not-pending' | 'bad-response' }>
  sessions: {
    prompt(request: {
      rpcId: string
      payload: { sessionId: string; mode: 'queue' | 'steer'; content: Array<{ type: 'text'; text: string }>; clientTimeZone?: string }
    }): Promise<{ type: string; rpcId: string; result: { ok: boolean; value?: unknown; error?: { code?: string; message?: string } } }>
  }
}

/** A pending answerable interaction pushed to interactive channels. */
export type PromptInteraction =
  | { kind: 'approval'; rpcId: string; sessionId: string; approvalId: string; toolName: string; reason?: string; createdAt: number }
  | { kind: 'question'; rpcId: string; sessionId: string; questions: QuestionItem[]; createdAt: number }

/** Internal alias. */
type PendingInteraction = PromptInteraction

/** Wiring the bridge needs from the notify service. */
export interface InteractionBridgeHooks {
  /** Push a plain-text message to every interactive channel. */
  pushText(text: string): Promise<void>
  /**
   * Push an approval/question prompt with channel-native affordances (e.g.
   * Telegram inline-keyboard buttons). Channels without buttons render text
   * via the bridge's public formatters. Resolve TRUE when every configured
   * channel was served; false/undefined falls back to plain pushText.
   */
  sendPrompt?(entry: PromptInteraction): Promise<boolean>
  /** Whether a channel user may drive interactions (channel allowlists). */
  canInteract(userId: string): boolean
}

/** Reply vocabulary for approvals (case-insensitive). */
const APPROVE_WORDS = new Set(['y', 'yes', 'ok', 'approve', '允许', '批准', '同意', '好', '好的', '是', '确认'])
const REJECT_WORDS = new Set(['n', 'no', 'reject', 'deny', '拒绝', '不', '不用', '否', '取消'])

/** Pending interactions older than this are dropped defensively (the host
 *  normally resolves or cancels them long before). */
const PENDING_TTL_MS = 60 * 60_000

export class InteractionBridge {
  private ctx: Context
  private apiProxy: ApiProxyLike
  private hooks: InteractionBridgeHooks

  /** Pending answerable interactions in arrival order (newest last). */
  private pending: PendingInteraction[] = []
  /** Session that received the most recent push — the continuation target. */
  private lastSessionId: string | undefined
  /** Human labels per session (workspace basename), learned from pushes. */
  private sessionLabels = new Map<string, string>()
  private controller: AbortController | null = null
  private running = false

  constructor(ctx: Context, apiProxy: ApiProxyLike, hooks: InteractionBridgeHooks) {
    this.ctx = ctx
    this.apiProxy = apiProxy
    this.hooks = hooks
  }

  /** Start consuming the mux stream. Idempotent. */
  start(): void {
    if (this.running) return
    this.running = true
    this.controller = new AbortController()
    void this.consumeMux(this.controller.signal)
  }

  /** Stop the mux consumer and drop pending state. */
  dispose(): void {
    this.running = false
    this.controller?.abort()
    this.controller = null
    this.pending = []
  }

  /**
   * Remember that a notification went out for a session, so a later free-text
   * WeChat reply continues THAT conversation.
   */
  noteNotification(sessionId: string | undefined, workspace?: string): void {
    if (!sessionId) return
    this.lastSessionId = sessionId
    if (workspace) this.sessionLabels.set(sessionId, workspace)
  }

  /** Whether the mux consumer is running. */
  get isActive(): boolean {
    return this.running
  }

  /** Number of pending interactions (diagnostics/tests). */
  get pendingCount(): number {
    return this.pending.length
  }

  // ── mux consumption ──────────────────────────────────────────────────────

  private async consumeMux(signal: AbortSignal): Promise<void> {
    while (this.running && !signal.aborted) {
      try {
        const stream = this.apiProxy.events.mux({ rpcId: randomUUID(), payload: {} }, signal)
        for await (const item of stream) {
          if (!this.running || signal.aborted) return
          await this.handleFrame(item.rpcId, item.payload)
        }
      } catch (error) {
        if (signal.aborted || !this.running) return
        this.ctx.logger.warn('[notify] WeChat interaction mux stream error, reconnecting in 5s:', error)
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }

  private async handleFrame(rpcId: string, frame: MuxFrameView): Promise<void> {
    try {
      if (frame.type === 'approval/requested') {
        const entry: PendingInteraction = {
          kind: 'approval',
          rpcId,
          sessionId: frame.sessionId,
          approvalId: frame.approvalId,
          toolName: frame.toolName,
          reason: frame.reason,
          createdAt: Date.now(),
        }
        this.track(entry)
        this.noteNotification(frame.sessionId)
        await this.pushPrompt(entry, this.formatApprovalPush(entry))
      } else if (frame.type === 'question/requested') {
        const entry: PendingInteraction = {
          kind: 'question',
          rpcId,
          sessionId: frame.sessionId,
          questions: frame.questions,
          createdAt: Date.now(),
        }
        this.track(entry)
        this.noteNotification(frame.sessionId)
        await this.pushPrompt(entry, this.formatQuestionPush(entry))
      } else if (frame.type === 'approval/resolved') {
        // Settled elsewhere (e.g. the Web UI answered first) — drop ours.
        this.pending = this.pending.filter(
          (p) => !(p.kind === 'approval' && p.approvalId === frame.approvalId && p.sessionId === frame.sessionId),
        )
      } else if (frame.type === 'question/resolved') {
        this.pending = this.pending.filter(
          (p) => !(p.kind === 'question' && p.rpcId === frame.questionRpcId),
        )
      }
    } catch (error) {
      this.ctx.logger.warn('[notify] Failed to handle interaction frame %s:', frame.type, error)
    }
  }

  private track(entry: PendingInteraction): void {
    const cutoff = Date.now() - PENDING_TTL_MS
    this.pending = this.pending.filter((p) => p.createdAt >= cutoff)
    this.pending.push(entry)
  }

  // ── reply routing ──────────────────────────────────────────────────────────

  /**
   * Route one inbound WeChat text message: answer the newest pending
   * interaction when one exists, otherwise continue the most recently
   * notified conversation. Sends a WeChat receipt for every outcome.
   */
  async handleReply(userId: string, text: string): Promise<void> {
    if (!this.hooks.canInteract(userId)) {
      this.ctx.logger.warn('[notify] Ignoring WeChat reply from non-allowlisted user %s', userId)
      return
    }

    const reply = text.trim()
    if (!reply) return

    const pending = this.pending[this.pending.length - 1]
    if (pending?.kind === 'approval') {
      await this.answerApproval(pending, reply)
      return
    }
    if (pending?.kind === 'question') {
      await this.answerQuestion(pending, reply)
      return
    }
    await this.continueConversation(reply)
  }

  private async answerApproval(pending: Extract<PendingInteraction, { kind: 'approval' }>, reply: string): Promise<void> {
    const word = reply.toLowerCase()
    const outcome = APPROVE_WORDS.has(word) ? 'allowed-once' : REJECT_WORDS.has(word) ? 'rejected' : null
    if (!outcome) {
      await this.hooks.pushText(`❓ 无法识别「${reply}」。当前有待处理的授权请求（${pending.toolName}），请回复 Y 批准 / N 拒绝`)
      return
    }

    const receipt = await this.apiProxy.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: true,
        value: { sessionId: pending.sessionId, approvalId: pending.approvalId, outcome },
      },
    })

    if (receipt.accepted) {
      this.pending = this.pending.filter((p) => p !== pending)
      const label = this.labelOf(pending.sessionId)
      await this.hooks.pushText(outcome === 'allowed-once'
        ? `✅ 已批准${label}的 ${pending.toolName} 操作`
        : `🚫 已拒绝${label}的 ${pending.toolName} 操作`)
    } else {
      this.pending = this.pending.filter((p) => p !== pending)
      await this.hooks.pushText('ℹ️ 该授权请求已在其他端处理或已失效')
    }
  }

  private async answerQuestion(pending: Extract<PendingInteraction, { kind: 'question' }>, reply: string): Promise<void> {
    const answers = this.parseQuestionAnswers(pending.questions, reply)
    if (!answers) {
      await this.hooks.pushText(`❓ 无法识别「${reply}」。\n\n${this.formatQuestionPush(pending)}`)
      return
    }

    const receipt = await this.apiProxy.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: true,
        value: { sessionId: pending.sessionId, answer: { answers } },
      },
    })

    if (receipt.accepted) {
      this.pending = this.pending.filter((p) => p !== pending)
      const summary = answers
        .map((a) => a.selected.join('、') || a.custom || '')
        .filter(Boolean)
        .join('；')
      await this.hooks.pushText(`✅ 已提交回答: ${summary}`)
    } else {
      this.pending = this.pending.filter((p) => p !== pending)
      await this.hooks.pushText('ℹ️ 该问题已在其他端回答或已失效')
    }
  }

  /**
   * Parse a WeChat reply into per-question answers.
   *
   * - Multiple questions: split the reply on newlines / ，；; and assign one
   *   segment per question in order; questions without a segment are answered
   *   with their first option... no — left with an empty selection and the
   *   full reply as custom text is wrong too. They are simply OMITTED from
   *   the answers array (the host passes answers through verbatim; the model
   *   sees which questions got answered).
   * - Optioned question, numeric segment → that option's label (multi-select
   *   accepts several numbers); a segment equal to an option label selects it;
   *   anything else becomes a custom free-text answer.
   * - Question without options → the segment is the custom answer.
   *
   * Returns null when the reply cannot be mapped at all.
   */
  private parseQuestionAnswers(
    questions: QuestionItem[],
    reply: string,
  ): Array<{ id: string; selected: string[]; custom?: string }> | null {
    const segments = questions.length > 1
      ? reply.split(/[\n，；;,]/).map((s) => s.trim()).filter(Boolean)
      : [reply]
    if (segments.length === 0) return null

    const answers: Array<{ id: string; selected: string[]; custom?: string }> = []
    for (let i = 0; i < Math.min(segments.length, questions.length); i++) {
      const question = questions[i]
      const segment = segments[i]
      const options = question.options ?? []

      if (options.length > 0) {
        // Numeric selection (multi-select allows several numbers).
        const nums = segment.split(/[\s、]+/).filter(Boolean)
        const numeric = nums.every((n) => /^\d+$/.test(n))
        if (numeric && nums.length > 0) {
          const picked = nums
            .map((n) => options[Number(n) - 1]?.label)
            .filter((label): label is string => typeof label === 'string')
          if (picked.length === 0) return null
          if (!question.multiSelect && picked.length > 1) return null
          answers.push({ id: question.id, selected: question.multiSelect ? picked : [picked[0]] })
          continue
        }
        // Exact option label match.
        const byLabel = options.find((o) => o.label === segment || o.label.toLowerCase() === segment.toLowerCase())
        if (byLabel) {
          answers.push({ id: question.id, selected: [byLabel.label] })
          continue
        }
        // Free text on an optioned question = the "Other" custom answer.
        answers.push({ id: question.id, selected: [], custom: segment })
      } else {
        answers.push({ id: question.id, selected: [], custom: segment })
      }
    }
    return answers.length > 0 ? answers : null
  }

  /**
   * Free-text continuation: inject the reply into the most recently notified
   * session as an ordinary follow-up message (queue mode — it runs as the
   * next turn, or after the in-flight one settles).
   */
  private async continueConversation(text: string): Promise<void> {
    const sessionId = this.lastSessionId
    if (!sessionId) {
      await this.hooks.pushText('ℹ️ 还没有可续接的会话（先让 DSH 推送一条通知）')
      return
    }
    const resp = await this.apiProxy.sessions.prompt({
      rpcId: randomUUID(),
      payload: {
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: 'Asia/Shanghai',
      },
    })
    if (resp.result.ok) {
      await this.hooks.pushText(`📨 已发送到${this.labelOf(sessionId)}会话，排队等待执行`)
    } else {
      const message = resp.result.error?.message ?? 'unknown error'
      this.ctx.logger.warn('[notify] WeChat continuation failed: %s', message)
      await this.hooks.pushText(`⚠️ 发送失败: ${message}`)
    }
  }

  // ── push formatting ────────────────────────────────────────────────────────

  /**
   * Push an answerable prompt: channels with native affordances get the
   * structured entry via hooks.sendPrompt; when no channel claims it the
   * plain-text rendering goes to hooks.pushText.
   */
  private async pushPrompt(entry: PendingInteraction, plainText: string): Promise<void> {
    const handled = (await this.hooks.sendPrompt?.(entry)) === true
    if (!handled) await this.hooks.pushText(plainText)
  }

  /** Public plain-text rendering of an approval prompt (channels without buttons). */
  formatApprovalPush(entry: Extract<PendingInteraction, { kind: 'approval' }>): string {
    const lines: string[] = []
    lines.push(`🔐 ${this.labelOf(entry.sessionId)}需要授权`)
    lines.push('')
    lines.push(`🔧 操作: ${entry.toolName}`)
    if (entry.reason) lines.push(`📝 原因: ${entry.reason}`)
    lines.push('')
    lines.push('回复 Y 批准 / N 拒绝')
    return lines.join('\n')
  }

  /** Public plain-text rendering of a question prompt (channels without buttons). */
  formatQuestionPush(entry: Extract<PendingInteraction, { kind: 'question' }>): string {
    const lines: string[] = []
    lines.push(`❓ ${this.labelOf(entry.sessionId)}需要回答`)
    lines.push('')
    entry.questions.forEach((q, qi) => {
      if (entry.questions.length > 1) lines.push(`【问题 ${qi + 1}】`)
      if (q.header) lines.push(`📌 ${q.header}`)
      lines.push(q.question)
      if (q.options && q.options.length > 0) {
        q.options.forEach((o, oi) => {
          lines.push(`  ${oi + 1}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)
        })
        lines.push(q.multiSelect ? '回复选项序号（可多选，空格分隔）或自定义文字' : '回复选项序号或自定义文字')
      } else {
        lines.push('直接回复文字作答')
      }
    })
    if (entry.questions.length > 1) {
      lines.push('')
      lines.push('多个问题请按顺序用「，」或换行分隔回答')
    }
    return lines.join('\n')
  }

  private labelOf(sessionId: string): string {
    const workspace = this.sessionLabels.get(sessionId)
    return workspace ? `[${workspace}] ` : ''
  }
}
