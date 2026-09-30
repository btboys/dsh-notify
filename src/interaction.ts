import { Context } from '@deepseek-ai/cordis'

/**
 * Chat-channel two-way interaction bridge.
 *
 * Upgrades the WeChat/Telegram channels from one-way pushes to a remote-control
 * surface for DSH. It no longer talks to any API gateway: until 1.4.3 it drove
 * everything through `ctx.apiProxy` (`@deepseek-ai/dsh-host-apiproxy`), a
 * package the harness removed. It now composes with the current HOST seams:
 *
 *   - `approval/request`       — the Agent-scoped answerer waterfall. The
 *                                bridge registers with `prepend: true` (the
 *                                Remote/browser answerer is terminal once it
 *                                registers first), pushes the card, starts the
 *                                downstream chain itself and returns
 *                                `Promise.race([chatAnswer, downstream])` — so
 *                                whichever side answers first still wins.
 *   - `user-questions/request` — the same shape for `ask_user_question`.
 *   - `ctx.agents` / `agent.followup()`  — free-text continuation.
 *   - `ctx.sessionQuery` / `ctx.workspaceRegistry` — the /sessions and
 *                                /workspace menus.
 *
 * Every host service is soft-resolved through {@link InteractionHost}; a
 * deployment without one degrades to a clear chat message instead of failing.
 * All host shapes below are structural, so this file never imports a harness
 * package (that coupling is what broke the plugin on dsh-settings 0.1.2+).
 */

// ── Structural host types ──────────────────────────────────────────────────

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

/** One answer item, matching the host's `AskUserQuestionAnswerItem`. */
export interface QuestionAnswerItem {
  id: string
  selected: string[]
  custom?: string
}

/** The host's `AskUserQuestionAnswer`, structurally. */
export interface QuestionAnswer {
  answers: QuestionAnswerItem[]
}

/** Outcome vocabulary the approval seam accepts from a claiming answerer. */
export type ApprovalOutcome = 'allowed-once' | 'rejected'

/** One approval awaiting a human decision, as a chat channel sees it. */
export interface ApprovalRequestView {
  /** Session the request belongs to. */
  sessionId: string
  /** Tool whose operation needs the decision. */
  toolName: string
  /** Exact tool call, when the asker had one. */
  callId?: string
  /** Human-readable reason supplied by the asker. */
  reason?: string
  /** Cancellation lifetime of the pending request. */
  signal?: AbortSignal
}

/** One `ask_user_question` batch awaiting a human answer. */
export interface QuestionRequestView {
  /** Session the request belongs to ('' when the host supplied no agent). */
  sessionId: string
  /** Questions to display. */
  questions: QuestionItem[]
  /** Tool call the card is keyed by, when the host supplied one. */
  callId?: string
  /** Cancellation lifetime of the pending request. */
  signal?: AbortSignal
}

/**
 * Inbound prompts the host hands to the bridge. Each resolves with the chat's
 * answer, or `null` when the chat declined to claim (aborted / another
 * answerer already settled it) so the host can fall back to `next()`.
 */
export interface InteractionSink {
  /** Surface an approval and resolve with the decision the chat user made. */
  approval(view: ApprovalRequestView): Promise<ApprovalOutcome | null>
  /** Surface a question batch and resolve with the chat user's answer. */
  question(view: QuestionRequestView): Promise<QuestionAnswer | null>
  /** Forget a prompt another answerer settled, so a late chat reply reports it. */
  drop(kind: 'approval' | 'question', sessionId: string, callId?: string): void
}

/** Structural session row the /sessions menu consumes. */
export interface SessionSummaryLike {
  sessionId: string
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
  origin?: 'subagent'
  projections?: { values?: { title?: string | null } }
}

/** Structural workspace row the /workspace menu consumes. */
export interface WorkspaceViewLike {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
}

/** Outcome of injecting a chat reply as a follow-up user message. */
export interface PromptResult {
  ok: boolean
  error?: string
}

/** Outcome of creating a session inside a workspace. */
export interface CreateSessionResult {
  ok: boolean
  sessionId?: string
  error?: string
}

/**
 * Host seams the bridge drives. `attach` wires the answerer waterfalls;
 * everything else is a plain host call. Implemented by `DshInteractionHost`.
 */
export interface InteractionHost {
  /** Register the inbound prompt listeners; returns a disposer. */
  attach(sink: InteractionSink): () => void
  /** Inject `text` into `sessionId` as an ordinary follow-up user message. */
  prompt(sessionId: string, text: string): Promise<PromptResult>
  /** Recent continuable sessions, or null when the host cannot list them. */
  listSessions(): Promise<SessionSummaryLike[] | null>
  /** Registered workspaces, or null when the host cannot list them. */
  listWorkspaces(): Promise<WorkspaceViewLike[] | null>
  /** Create (or adopt) a session in a workspace. */
  createSession(workspaceId: string): Promise<CreateSessionResult>
}

/** A pending approval pushed to the interactive channels. */
interface PendingApproval {
  kind: 'approval'
  sessionId: string
  callId?: string
  toolName: string
  reason?: string
  createdAt: number
  workspace?: string
  settle(outcome: ApprovalOutcome | null): void
}

/** A pending question batch pushed to the interactive channels. */
interface PendingQuestion {
  kind: 'question'
  sessionId: string
  questions: QuestionItem[]
  createdAt: number
  workspace?: string
  settle(answer: QuestionAnswer | null): void
}

/** A pending answerable interaction pushed to interactive channels. */
export type PromptInteraction = PendingApproval | PendingQuestion

/** Internal alias. */
type PendingInteraction = PromptInteraction

/** One button of a channel menu (text label + opaque callback payload). */
export interface MenuButton {
  text: string
  data: string
}

/**
 * A structured selection menu. Channels with inline keyboards (Telegram)
 * render the buttons; text-only channels (WeChat) fall back to `text`,
 * which must list entries numbered so the user can reply `/sel <kind> <n>`.
 */
export interface MenuMessage {
  text: string
  buttons: MenuButton[][]
}

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
  /**
   * Push a selection menu (session/workspace picker) with channel-native
   * buttons. Same contract as sendPrompt: TRUE means served; false/undefined
   * falls back to plain pushText of menu.text.
   */
  sendMenu?(menu: MenuMessage): Promise<boolean>
  /** Whether a channel user may drive interactions (channel allowlists). */
  canInteract(userId: string): boolean
}

/** Reply vocabulary for approvals (case-insensitive). */
const APPROVE_WORDS = new Set(['y', 'yes', 'ok', 'approve', '允许', '批准', '同意', '好', '好的', '是', '确认'])
const REJECT_WORDS = new Set(['n', 'no', 'reject', 'deny', '拒绝', '不', '不用', '否', '取消'])

/** Pending interactions older than this are dropped defensively (the host
 *  normally resolves or cancels them long before). */
const PENDING_TTL_MS = 60 * 60_000

/** How many entries the /sessions and /workspace menus list at most. */
const MENU_PAGE_SIZE = 8

/** Selection menus reference entries by 1-based index; callback payloads and
 *  typed `/sel` commands resolve through these per-kind alias tables. Each
 *  newly pushed menu replaces its kind's table. */
type MenuKind = 's' | 'w'

export class InteractionBridge {
  private ctx: Context
  private host: InteractionHost
  private hooks: InteractionBridgeHooks

  /** Pending answerable interactions in arrival order (newest last). */
  private pending: PendingInteraction[] = []
  /** Session that received the most recent push — the continuation target. */
  private lastSessionId: string | undefined
  /** Human labels per session (workspace basename), learned from pushes. */
  private sessionLabels = new Map<string, string>()
  /** Latest menu alias tables: kind → ordered ids (1-based for the user). */
  private menuAliases = new Map<MenuKind, string[]>()
  /** Host listener disposer while attached. */
  private detach: (() => void) | null = null
  private running = false

  constructor(ctx: Context, host: InteractionHost, hooks: InteractionBridgeHooks) {
    this.ctx = ctx
    this.host = host
    this.hooks = hooks
  }

  /** Subscribe to the host's answerer waterfalls. Idempotent. */
  start(): void {
    if (this.running) return
    this.running = true
    this.detach = this.host.attach({
      approval: (view) => this.onApprovalRequest(view),
      question: (view) => this.onQuestionRequest(view),
      drop: (kind, sessionId, callId) => this.dropPending(kind, sessionId, callId),
    })
  }

  /** Detach from the host and release every pending prompt unanswered. */
  dispose(): void {
    this.running = false
    this.detach?.()
    this.detach = null
    for (const entry of this.pending) entry.settle(null)
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

  /** Whether the bridge is attached to the host answerer seams. */
  get isActive(): boolean {
    return this.running
  }

  /** Number of pending interactions (diagnostics/tests). */
  get pendingCount(): number {
    return this.pending.length
  }

  // ── inbound prompts (host → chat) ─────────────────────────────────────────

  /**
   * Surface one approval and hold the seam open until the chat answers. The
   * host adapter races this against the downstream answerer chain, so the Web
   * UI can still claim the request first; a `null` resolution means the chat
   * lost (or the bridge was disposed) and the host falls back to the chain.
   */
  private async onApprovalRequest(view: ApprovalRequestView): Promise<ApprovalOutcome | null> {
    let settle!: (outcome: ApprovalOutcome | null) => void
    const answered = new Promise<ApprovalOutcome | null>((resolve) => { settle = resolve })
    const entry: PendingApproval = {
      kind: 'approval',
      sessionId: view.sessionId,
      callId: view.callId,
      toolName: view.toolName,
      reason: view.reason,
      createdAt: Date.now(),
      settle,
    }
    this.track(entry)
    this.noteNotification(view.sessionId)
    await this.pushPromptSafely(entry, this.formatApprovalPush(entry))
    return answered
  }

  /** Surface one question batch and hold the seam open until the chat answers. */
  private async onQuestionRequest(view: QuestionRequestView): Promise<QuestionAnswer | null> {
    let settle!: (answer: QuestionAnswer | null) => void
    const answered = new Promise<QuestionAnswer | null>((resolve) => { settle = resolve })
    const entry: PendingQuestion = {
      kind: 'question',
      sessionId: view.sessionId,
      questions: view.questions,
      createdAt: Date.now(),
      settle,
    }
    this.track(entry)
    if (view.sessionId) this.noteNotification(view.sessionId)
    await this.pushPromptSafely(entry, this.formatQuestionPush(entry))
    return answered
  }

  /**
   * Another answerer settled a prompt first (the host reports the downstream
   * winner). Resolve it with `null` so the waiting seam delegates, and drop it
   * so a later chat reply reports "已在其他端处理" instead of re-answering.
   */
  private dropPending(kind: 'approval' | 'question', sessionId: string, callId?: string): void {
    const dropped = this.pending.filter((entry) => {
      if (entry.kind !== kind) return false
      if (entry.sessionId !== sessionId) return false
      if (kind === 'approval' && callId !== undefined) {
        const approval = entry as PendingApproval
        if (approval.callId !== undefined && approval.callId !== callId) return false
      }
      return true
    })
    if (dropped.length === 0) return
    this.pending = this.pending.filter((entry) => !dropped.includes(entry))
    for (const entry of dropped) entry.settle(null)
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

    // Slash commands (menu/selection) take priority over pending-answer
    // routing so the user can always navigate away mid-approval.
    if (reply.startsWith('/')) {
      await this.handleCommand(reply)
      return
    }

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

    // Claim the waterfall slot. The bridge returns from its answerer seam the
    // moment this resolves, and the racing downstream chain (Web UI) loses.
    this.pending = this.pending.filter((p) => p !== pending)
    pending.settle(outcome)
    const label = this.labelOf(pending.sessionId)
    await this.hooks.pushText(outcome === 'allowed-once'
      ? `✅ 已批准${label}的 ${pending.toolName} 操作`
      : `🚫 已拒绝${label}的 ${pending.toolName} 操作`)
  }

  private async answerQuestion(pending: Extract<PendingInteraction, { kind: 'question' }>, reply: string): Promise<void> {
    const answers = this.parseQuestionAnswers(pending.questions, reply)
    if (!answers) {
      await this.hooks.pushText(`❓ 无法识别「${reply}」。\n\n${this.formatQuestionPush(pending)}`)
      return
    }

    // Claim the waterfall slot: the answerer that resolves first wins, so a
    // browser that answered a moment ago has already dropped this entry.
    this.pending = this.pending.filter((p) => p !== pending)
    pending.settle({ answers })
    const summary = answers
      .map((a) => a.selected.join('、') || a.custom || '')
      .filter(Boolean)
      .join('；')
    await this.hooks.pushText(`✅ 已提交回答: ${summary}`)
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
    const result = await this.host.prompt(sessionId, text)
    if (result.ok) {
      await this.hooks.pushText(`📨 已发送到${this.labelOf(sessionId)}会话，排队等待执行`)
    } else {
      const message = result.error ?? 'unknown error'
      this.ctx.logger.warn('[notify] continuation failed: %s', message)
      await this.hooks.pushText(`⚠️ 发送失败: ${message}`)
    }
  }

  // ── slash commands (session/workspace menus) ─────────────────────────────

  /**
   * Route a `/`-prefixed message. Grammar:
   *
   *   /sessions          — list recent conversations, tap/reply to switch
   *   /workspace         — list workspaces, tap/reply to switch (reuses the
   *                        workspace's latest conversation, else creates one)
   *   /current           — show the current continuation target
   *   /sel s|w <n|id>    — pick entry n (latest menu) or a raw id
   *   /help, /start      — command help
   *
   * Telegram delivers these as typed commands (registered via setMyCommands)
   * or as button callbacks translated back into `/sel …`; WeChat users type
   * them. A trailing `@botname` (Telegram group syntax) is stripped.
   */
  private async handleCommand(reply: string): Promise<void> {
    const [rawToken, ...rest] = reply.slice(1).split(/\s+/)
    const token = (rawToken ?? '').split('@')[0].toLowerCase()

    switch (token) {
      case 'sessions':
      case 'session':
        await this.cmdSessions()
        return
      case 'workspace':
      case 'workspaces':
        await this.cmdWorkspaces()
        return
      case 'current':
        await this.cmdCurrent()
        return
      case 'sel':
      case 'select':
        await this.cmdSelect(rest)
        return
      case 'help':
      case 'start':
      default:
        await this.hooks.pushText([
          '📱 可用命令：',
          '  /sessions — 选择要续接的对话',
          '  /workspace — 切换工作区（沿用其最新对话，没有则新建）',
          '  /current — 查看当前对话',
          '',
          '直接发送文字即续接当前对话；有待处理的审批/问题时，回复 Y/N 或选项序号。',
        ].join('\n'))
    }
  }

  /** /sessions — menu of recent conversations. */
  private async cmdSessions(): Promise<void> {
    const sessions = await this.listRecentSessions()
    if (!sessions) return // failure receipt already pushed
    if (sessions.length === 0) {
      await this.hooks.pushText('ℹ️ 还没有可选择的对话（可先用 /workspace 切换工作区新建一个）')
      return
    }
    this.menuAliases.set('s', sessions.map((s) => s.sessionId))
    const lines = sessions.map((s, i) => {
      const running = s.running ? ' ⏳' : ''
      const current = s.sessionId === this.lastSessionId ? ' 👈当前' : ''
      return `${i + 1}. [${this.workspaceLabel(s.cwd)}] ${this.titleOf(s)}${running}${current}`
    })
    await this.pushMenu({
      text: ['💬 选择要续接的对话（回复 /sel s 序号）：', '', ...lines].join('\n'),
      buttons: sessions.map((s, i) => [{
        text: `${i + 1}. ${this.titleOf(s)}${s.sessionId === this.lastSessionId ? ' 👈' : ''}`,
        data: `/sel s ${i + 1}`,
      }]),
    })
  }

  /** /workspace — menu of workspaces. */
  private async cmdWorkspaces(): Promise<void> {
    const items = await this.host.listWorkspaces()
    if (!items) {
      await this.hooks.pushText('⚠️ 获取工作区列表失败：当前宿主未提供工作区注册表')
      return
    }
    if (items.length === 0) {
      await this.hooks.pushText('ℹ️ 还没有注册任何工作区（先在 Web 界面创建一个）')
      return
    }
    this.menuAliases.set('w', items.map((w) => w.workspaceId))
    const lines = items.map((w, i) => `${i + 1}. ${w.title} — ${w.path}`)
    await this.pushMenu({
      text: ['📁 选择工作区（回复 /sel w 序号）：', '', ...lines].join('\n'),
      buttons: items.map((w, i) => [{ text: `📁 ${w.title}`, data: `/sel w ${i + 1}` }]),
    })
  }

  /** /current — report the continuation target. */
  private async cmdCurrent(): Promise<void> {
    if (!this.lastSessionId) {
      await this.hooks.pushText('ℹ️ 当前没有选中的对话（/sessions 选择，/workspace 切换工作区）')
      return
    }
    await this.hooks.pushText(`📍 当前对话：${this.labelOf(this.lastSessionId)}${this.lastSessionId.slice(0, 8)}…`)
  }

  /** /sel s|w <n|id> — apply a menu pick (button callback or typed). */
  private async cmdSelect(args: string[]): Promise<void> {
    const kind = (args[0] ?? '').toLowerCase()
    const ref = args[1] ?? ''
    if ((kind !== 's' && kind !== 'w') || !ref) {
      await this.hooks.pushText('❓ 用法: /sel s <序号> 选择对话，/sel w <序号> 选择工作区')
      return
    }
    const id = this.resolveAlias(kind, ref)
    if (!id) {
      await this.hooks.pushText('❓ 无效的序号，请先用 /sessions 或 /workspace 调出菜单')
      return
    }
    if (kind === 's') await this.selectSession(id)
    else await this.selectWorkspace(id)
  }

  /** Switch the continuation target to a conversation. */
  private async selectSession(sessionId: string): Promise<void> {
    this.lastSessionId = sessionId
    await this.hooks.pushText(`✅ 已切换到对话 ${this.labelOf(sessionId)}${sessionId.slice(0, 8)}…，直接发消息即可续接`)
  }

  /**
   * Switch the default workspace: reuse the workspace's most recent
   * conversation when one exists, otherwise create a fresh session there.
   */
  private async selectWorkspace(workspaceId: string): Promise<void> {
    const items = await this.host.listWorkspaces()
    const workspace = items?.find((w) => w.workspaceId === workspaceId)
    if (!workspace) {
      await this.hooks.pushText('⚠️ 该工作区不存在或已删除，请重新 /workspace 调出菜单')
      return
    }

    const sessions = await this.listRecentSessions()
    const existing = sessions?.find((s) => s.cwd === workspace.path)
    if (existing) {
      this.lastSessionId = existing.sessionId
      this.sessionLabels.set(existing.sessionId, workspace.title)
      await this.hooks.pushText(`✅ 已切换到工作区「${workspace.title}」的对话：${this.titleOf(existing)}`)
      return
    }

    const created = await this.host.createSession(workspaceId)
    if (created.ok && created.sessionId) {
      this.lastSessionId = created.sessionId
      this.sessionLabels.set(created.sessionId, workspace.title)
      await this.hooks.pushText(`✅ 工作区「${workspace.title}」暂无对话，已新建一个，直接发消息即可开始`)
    } else {
      await this.hooks.pushText(`⚠️ 在工作区「${workspace.title}」新建对话失败: ${created.error ?? 'unknown error'}`)
    }
  }

  /** Recent continuable conversations (non-blank, non-subagent), or null on failure. */
  private async listRecentSessions(): Promise<SessionSummaryLike[] | null> {
    const items = await this.host.listSessions()
    if (!items) {
      await this.hooks.pushText('⚠️ 获取会话列表失败：当前宿主未提供会话查询服务')
      return null
    }
    const recent = items
      .filter((s) => !s.blank && s.origin !== 'subagent')
      .slice(0, MENU_PAGE_SIZE)
    // Learn labels/titles so receipts can name sessions later.
    for (const s of recent) this.sessionLabels.set(s.sessionId, this.workspaceLabel(s.cwd))
    return recent
  }

  /** Resolve a menu pick: an all-digit ref indexes the latest menu of that
   *  kind; anything else is treated as a raw id. */
  private resolveAlias(kind: MenuKind, ref: string): string | null {
    if (/^\d+$/.test(ref)) {
      const aliases = this.menuAliases.get(kind)
      const id = aliases?.[Number(ref) - 1]
      return id ?? null
    }
    return ref
  }

  /** Push a selection menu: channels with buttons get the structured form,
   *  others the numbered text (whose /sel commands the bridge parses back). */
  private async pushMenu(menu: MenuMessage): Promise<void> {
    const handled = (await this.hooks.sendMenu?.(menu)) === true
    if (!handled) await this.hooks.pushText(menu.text)
  }

  /** Display title of a session row: projection title, else a short id. */
  private titleOf(session: SessionSummaryLike): string {
    const title = session.projections?.values?.title
    return title && title.trim() ? title.trim() : `会话 ${session.sessionId.slice(0, 8)}…`
  }

  /** Basename of a cwd, for labeling sessions. */
  private workspaceLabel(cwd: string | undefined): string {
    if (!cwd) return '?'
    return cwd.split('/').filter(Boolean).pop() || cwd
  }

  // ── push formatting ────────────────────────────────────────────────────────

  /**
   * Push an answerable prompt: channels with native affordances get the
   * structured entry via hooks.sendPrompt; when no channel claims it the
   * plain-text rendering goes to hooks.pushText.
   */
  private async pushPrompt(entry: PendingInteraction, plainText: string): Promise<void> {
    // Attach the workspace label when known so button-ized channels can head
    // their cards with `[workspace] 需要授权` like the plain-text rendering.
    const workspace = this.sessionLabels.get(entry.sessionId)
    if (workspace) entry.workspace = workspace
    const handled = (await this.hooks.sendPrompt?.(entry)) === true
    if (!handled) await this.hooks.pushText(plainText)
  }

  /**
   * Push an answerable prompt without letting a channel failure escape into the
   * host's answerer waterfall: a throw there fails the approval closed
   * ('unavailable') and denies the operation, even though the browser could
   * still have answered. The seam stays open either way.
   */
  private async pushPromptSafely(entry: PendingInteraction, plainText: string): Promise<void> {
    try {
      await this.pushPrompt(entry, plainText)
    } catch (error) {
      this.ctx.logger.warn('[notify] Failed to push an interaction prompt:', error)
    }
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
