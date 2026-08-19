import { Context } from '@deepseek-ai/cordis'
import axios from 'axios'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { NotificationAdapter, extraMetadataEntries } from './base.js'
import { NotifyEvent, WeChatNotifyConfig } from '../types.js'
import { dshHome } from '../persist.js'

/**
 * WeChat ClawBot notification adapter (Tencent iLink Bot protocol).
 *
 * ClawBot is the official personal-WeChat bot channel exposed through
 * `https://ilinkai.weixin.qq.com`. The protocol is HTTP/JSON and mirrors the
 * Telegram Bot API shape:
 *
 *   1. LOGIN  — GET /ilink/bot/get_bot_qrcode?bot_type=3 returns a QR payload;
 *      the user scans it in WeChat; GET /ilink/bot/get_qrcode_status?qrcode=…
 *      eventually reports `status: "confirmed"` with a `bot_token`.
 *   2. RECEIVE — POST /ilink/bot/getupdates long-polls (server holds ~35s) and
 *      returns inbound messages. Every inbound message carries a
 *      `context_token` that binds the conversation.
 *   3. SEND   — POST /ilink/bot/sendmessage. Proactive pushes MUST carry a
 *      `context_token` captured from a previous inbound message, so the user
 *      has to message the bot once after login before notifications can
 *      reach them. Captured tokens are persisted alongside the bot token.
 *
 * Session state (bot token + per-user context tokens) lives in a JSON file
 * under `<DSH_HOME>/notify/wechat-session.json` (mode 0600) and survives
 * restarts. When the server reports the session as expired the adapter drops
 * back into the QR login flow automatically.
 */

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
const DEFAULT_CHANNEL_VERSION = '1.0.2'
const BOT_TYPE = '3'
/** Server holds getupdates for ~35s; the HTTP timeout must exceed that. */
const LONG_POLL_TIMEOUT_MS = 40_000
/** How long a QR login attempt waits for the user to scan + confirm. */
const LOGIN_TIMEOUT_MS = 5 * 60_000
/** A QR code refreshes at most this many times before the login attempt fails. */
const MAX_QR_REFRESHES = 3
/** Backoff between poll retries after a transport error. */
const POLL_RETRY_BACKOFF_MS = 5_000
/** WeChat text items are plain text; keep pushes comfortably small. */
const MAX_TEXT_LENGTH = 2000

/**
 * The ClawBot UI renders text items as markdown AND strips trailing spaces,
 * so both single newlines (soft breaks) and two-space hard breaks collapse —
 * multi-line pushes (💬 user / 🤖 reply, approval cards, menus) arrive glued
 * onto one line. The only break that survives is a blank line: promote every
 * single newline to a paragraph break.
 */
function hardBreaks(text: string): string {
  return text.replace(/([^\n])\n(?!\n)/g, '$1\n\n')
}

/** Persisted ClawBot session: credentials plus captured context tokens. */
interface WeChatSession {
  token: string
  baseUrl: string
  accountId?: string
  userId?: string
  savedAt: string
  /** getupdates cursor, persisted to avoid re-reading old messages. */
  updatesBuf?: string
  /** Latest context token per iLink user id (`xxx@im.wechat`). */
  users: Record<string, { contextToken: string; updatedAt: number }>
}

/** Adapter lifecycle state surfaced to the settings page over RPC. */
export type WeChatAdapterState = 'disabled' | 'login' | 'ready' | 'error'

/** Status payload the settings page renders (login QR, known users, errors). */
export interface WeChatAdapterStatus {
  state: WeChatAdapterState
  /** Bot account id once logged in. */
  accountId?: string
  /** QR payload to encode and scan — present while login waits for a scan. */
  qrContent?: string
  /** Last error message when state is 'error'. */
  error?: string
  /** Users the bot can currently push to (they messaged the bot before). */
  knownUsers: string[]
}

/** X-WECHAT-UIN: random uint32 → decimal string → base64 (anti-replay). */
function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf8').toString('base64')
}

export class WeChatClawBotAdapter implements NotificationAdapter {
  readonly name = 'wechat'
  readonly enabled: boolean

  private ctx: Context
  private config: WeChatNotifyConfig
  private sessionFile: string
  private channelVersion: string
  /** HTTP timeout for iLink GETs (login QR + status); internal test hook. */
  private httpTimeoutMs: number
  /** Backoff between transient GET retries; internal test hook. */
  private retryBackoffMs: number
  /** Base URL for the QR login flow (no session yet); internal test hook. */
  private loginBaseUrl: string

  private session: WeChatSession | null = null
  private state: WeChatAdapterState
  private qrContent: string | undefined
  private lastError: string | undefined
  /** Aborts the poll/login loops; recreated on every (re)start. */
  private controller: AbortController | null = null

  /**
   * Inbound-message hook, set by the service when two-way interaction is on.
   * Invoked (fire-and-forget) for every text/voice message a WeChat user
   * sends the bot, AFTER the context token is captured.
   */
  onUserMessage: ((userId: string, text: string) => void | Promise<void>) | undefined

  constructor(ctx: Context, config: WeChatNotifyConfig, internal?: { httpTimeoutMs?: number; retryBackoffMs?: number; loginBaseUrl?: string }) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
    this.sessionFile = config.sessionFile || join(dshHome(), 'notify', 'wechat-session.json')
    this.channelVersion = config.channelVersion || DEFAULT_CHANNEL_VERSION
    this.httpTimeoutMs = internal?.httpTimeoutMs ?? 15_000
    this.retryBackoffMs = internal?.retryBackoffMs ?? POLL_RETRY_BACKOFF_MS
    this.loginBaseUrl = internal?.loginBaseUrl ?? DEFAULT_BASE_URL
    this.state = this.enabled ? 'login' : 'disabled'

    if (this.enabled) {
      // Async start: load a persisted session or fall into QR login. Failures
      // surface through getStatus() — never through the constructor.
      void this.start()
    }
  }

  /**
   * Current status for the settings page (RPC `notify.wechat.status`).
   */
  getStatus(): WeChatAdapterStatus {
    return {
      state: this.state,
      accountId: this.session?.accountId,
      qrContent: this.state === 'login' ? this.qrContent : undefined,
      error: this.state === 'error' ? this.lastError : undefined,
      knownUsers: Object.keys(this.session?.users ?? {}),
    }
  }

  /**
   * Forget the persisted session and restart the QR login flow.
   * Wired to the RPC `notify.wechat.relogin` endpoint.
   */
  async relogin(): Promise<void> {
    this.stopLoops()
    this.session = null
    this.qrContent = undefined
    this.lastError = undefined
    if (existsSync(this.sessionFile)) {
      try {
        writeFileSync(this.sessionFile, '{}\n', 'utf8')
      } catch (error) {
        this.ctx.logger.warn('[notify] Failed to clear WeChat session file:', error)
      }
    }
    this.state = this.enabled ? 'login' : 'disabled'
    if (this.enabled) {
      await this.start()
    }
  }

  /**
   * Send a notification to every reachable WeChat user.
   */
  async send(event: NotifyEvent): Promise<void> {
    if (!this.enabled) {
      return
    }
    if (this.state !== 'ready' || !this.session?.token) {
      throw new Error('WeChat ClawBot 尚未登录（请在设置页扫码登录）')
    }

    const targets = this.resolveTargets()
    if (targets.length === 0) {
      throw new Error('没有可推送的微信用户：请先在微信里给 ClawBot 发一条消息，或在配置中填写 toUserIds')
    }

    const text = this.formatText(event)
    const failures: string[] = []
    for (const userId of targets) {
      const contextToken = this.session.users[userId]?.contextToken
      if (!contextToken) continue
      try {
        await this.sendMessage(userId, text, contextToken)
        this.ctx.logger.info('[notify] WeChat notification sent to %s', userId)
      } catch (error) {
        failures.push(`${userId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // Surface delivery failures so the service's allSettled log shows them;
    // a notification that reached nobody must not look successful.
    if (failures.length === targets.length) {
      throw new Error(`WeChat 推送全部失败: ${failures.join('; ')}`)
    }
  }

  /**
   * Stop the poll/login loops. Called by the service on config rebuilds and
   * plugin disposal; safe to call multiple times.
   */
  dispose(): void {
    this.stopLoops()
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  private stopLoops(): void {
    this.controller?.abort()
    this.controller = null
  }

  /**
   * Entry point: resume a persisted session or run QR login, then poll.
   */
  private async start(): Promise<void> {
    this.controller = new AbortController()
    const signal = this.controller.signal

    try {
      this.session = this.loadSession()
      if (!this.session?.token) {
        await this.login(signal)
      }
      if (signal.aborted || !this.session?.token) return

      this.state = 'ready'
      this.qrContent = undefined
      this.ctx.logger.info('[notify] WeChat ClawBot adapter ready (account: %s)', this.session.accountId ?? 'unknown')
      await this.pollLoop(signal)
    } catch (error) {
      if (signal.aborted) return
      this.state = 'error'
      this.lastError = error instanceof Error ? error.message : String(error)
      this.ctx.logger.error('[notify] WeChat ClawBot adapter failed:', error)
    }
  }

  // ── QR login ─────────────────────────────────────────────────────────────

  /**
   * Run the QR login flow: fetch a QR payload, wait for the user to scan and
   * confirm in WeChat, then persist the issued bot token.
   */
  private async login(signal: AbortSignal): Promise<void> {
    this.state = 'login'

    let qr = await this.apiGet(this.loginBaseUrl, `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`, { timeoutMs: this.httpTimeoutMs, backoffMs: this.retryBackoffMs, signal })
    if (!qr?.qrcode) throw new Error('获取微信登录二维码失败（服务器无响应），请稍后重试')
    let qrcode: string = qr.qrcode
    this.qrContent = qr.qrcode_img_content
    this.ctx.logger.info('[notify] WeChat ClawBot 登录：请用微信扫描二维码（二维码内容已推送到设置页）: %s', this.qrContent)

    const deadline = Date.now() + LOGIN_TIMEOUT_MS
    let refreshes = 0

    while (!signal.aborted && Date.now() < deadline) {
      const status = await this.apiGet(
        this.loginBaseUrl,
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
        { timeoutMs: this.httpTimeoutMs, backoffMs: this.retryBackoffMs, signal },
      )
      if (!status) {
        // Transient status-check timeout — keep waiting, don't kill the login.
        await sleep(POLL_RETRY_BACKOFF_MS, signal)
        continue
      }

      switch (status.status) {
        case 'wait':
        case 'scaned':
          break
        case 'expired': {
          refreshes += 1
          if (refreshes > MAX_QR_REFRESHES) {
            throw new Error('微信登录二维码多次过期，请重新登录')
          }
          this.ctx.logger.info('[notify] WeChat QR code expired, refreshing (%d/%d)', refreshes, MAX_QR_REFRESHES)
          qr = await this.apiGet(this.loginBaseUrl, `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`, { timeoutMs: this.httpTimeoutMs, backoffMs: this.retryBackoffMs, signal })
          if (!qr?.qrcode) throw new Error('刷新微信登录二维码失败（服务器无响应），请稍后重试')
          qrcode = qr.qrcode
          this.qrContent = qr.qrcode_img_content
          break
        }
        case 'confirmed': {
          this.session = {
            token: status.bot_token,
            baseUrl: status.baseurl || DEFAULT_BASE_URL,
            accountId: status.ilink_bot_id,
            userId: status.ilink_user_id,
            savedAt: new Date().toISOString(),
            users: {},
          }
          this.saveSession()
          this.ctx.logger.info('[notify] WeChat ClawBot 登录成功 (bot: %s)', this.session.accountId ?? 'unknown')
          this.ctx.logger.info('[notify] 提示：请先在微信里给 ClawBot 发一条消息，之后才能收到主动推送')
          return
        }
      }

      await sleep(1000, signal)
    }

    if (!signal.aborted) {
      throw new Error('微信登录超时（5 分钟内未扫码确认）')
    }
  }

  // ── long-poll loop ─────────────────────────────────────────────────────────

  /**
   * Long-poll getupdates and capture context tokens from inbound messages.
   * Runs until disposed; session-expiry drops back into the QR login flow.
   */
  private async pollLoop(signal: AbortSignal): Promise<void> {
    let buf = this.session?.updatesBuf ?? ''

    while (!signal.aborted) {
      try {
        const resp = await this.apiPost(
          this.session!.baseUrl,
          'ilink/bot/getupdates',
          { get_updates_buf: buf },
          LONG_POLL_TIMEOUT_MS,
          signal,
        )
        if (signal.aborted) return
        if (!resp) continue // local timeout on the long poll — just re-poll

        if (typeof resp.ret === 'number' && resp.ret !== 0) {
          if (resp.ret === -14 || /session/i.test(String(resp.errmsg ?? ''))) {
            this.ctx.logger.warn('[notify] WeChat session expired (%s), restarting QR login', resp.errmsg ?? resp.ret)
            this.session = null
            await this.login(signal)
            if (signal.aborted) return
            this.state = 'ready'
            buf = ''
            continue
          }
          this.ctx.logger.warn('[notify] WeChat getupdates returned ret=%s: %s', resp.ret, resp.errmsg ?? '')
          await sleep(POLL_RETRY_BACKOFF_MS, signal)
          continue
        }

        if (typeof resp.get_updates_buf === 'string' && resp.get_updates_buf.length > 0) {
          buf = resp.get_updates_buf
          this.session!.updatesBuf = buf
        }

        let dirty = false
        for (const msg of resp.msgs ?? []) {
          // Only inbound user messages (message_type=1) carry a usable token.
          if (msg?.message_type !== 1) continue
          const userId: string | undefined = msg.from_user_id
          const contextToken: string | undefined = msg.context_token
          if (!userId || !contextToken) continue
          const isNewUser = !this.session!.users[userId]
          this.session!.users[userId] = { contextToken, updatedAt: Date.now() }
          dirty = true
          if (isNewUser) {
            this.ctx.logger.info('[notify] WeChat 用户 %s 已可接收推送（context token 已捕获）', userId)
          }

          // Two-way interaction: surface the message text to the bridge.
          const inboundText = extractInboundText(msg)
          if (inboundText && this.onUserMessage) {
            Promise.resolve(this.onUserMessage(userId, inboundText)).catch((error) => {
              this.ctx.logger.warn('[notify] WeChat onUserMessage handler failed:', error)
            })
          }
        }
        if (dirty) this.saveSession()
      } catch (error) {
        if (signal.aborted) return
        this.ctx.logger.warn('[notify] WeChat poll error, retrying in %ds:', POLL_RETRY_BACKOFF_MS / 1000, error)
        await sleep(POLL_RETRY_BACKOFF_MS, signal)
      }
    }
  }

  // ── two-way interaction ──────────────────────────────────────────────────

  /**
   * Whether a WeChat user may drive interactions: the toUserIds allowlist
   * gates replies when set; an empty allowlist allows every known user.
   */
  canInteract(userId: string): boolean {
    const allowlist = (this.config.toUserIds ?? []).filter((id) => id.length > 0)
    if (allowlist.length === 0) return true
    return allowlist.includes(userId)
  }

  /**
   * Push a raw plain-text message to every reachable interactive user
   * (used by the InteractionBridge for prompts and receipts). Skips silently
   * when not logged in or nobody is reachable — interaction pushes are
   * best-effort complements to the Web UI, never hard failures.
   */
  async pushText(text: string): Promise<void> {
    if (!this.enabled || this.state !== 'ready' || !this.session?.token) return
    for (const userId of this.resolveTargets()) {
      const contextToken = this.session.users[userId]?.contextToken
      if (!contextToken) continue
      try {
        await this.sendMessage(userId, text, contextToken)
      } catch (error) {
        this.ctx.logger.warn('[notify] WeChat pushText to %s failed:', userId, error)
      }
    }
  }

  // ── send ───────────────────────────────────────────────────────────────────

  /**
   * Resolve push targets: the configured allowlist intersected with users we
   * hold a context token for, or every known user when no allowlist is set.
   */
  private resolveTargets(): string[] {
    const known = Object.keys(this.session?.users ?? {})
    const allowlist = (this.config.toUserIds ?? []).filter((id) => id.length > 0)
    if (allowlist.length === 0) {
      return known
    }
    const missing = allowlist.filter((id) => !known.includes(id))
    if (missing.length > 0) {
      this.ctx.logger.warn('[notify] WeChat toUserIds 中以下用户还没有 context token（请让他们先给 ClawBot 发消息）: %s', missing.join(', '))
    }
    return allowlist.filter((id) => known.includes(id))
  }

  /** POST a plain-text message to one user. */
  private async sendMessage(toUserId: string, text: string, contextToken: string): Promise<void> {
    const resp = await this.apiPost(
      this.session!.baseUrl,
      'ilink/bot/sendmessage',
      {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: `dsh-notify-${randomUUID()}`,
          message_type: 2, // BOT
          message_state: 2, // FINISH
          context_token: contextToken,
          item_list: [{ type: 1, text_item: { text: hardBreaks(text) } }],
        },
      },
      15_000,
      this.controller?.signal,
    )
    if (resp && typeof resp.ret === 'number' && resp.ret !== 0) {
      // ret=-2 "prepare failed": the context token is dead. iLink context
      // tokens are EPHEMERAL — the official openclaw plugin keeps them
      // in-process only because they do not reliably survive restarts / long
      // gaps. Evict the stale token so status/knownUsers reflects reality and
      // the next inbound message recaptures a fresh one.
      if (resp.ret === -2) {
        this.ctx.logger.warn('[notify] WeChat context token for %s 已失效（ret=-2），已清除；请让对方给 Bot 发条消息以恢复推送', toUserId)
        if (this.session?.users[toUserId]) {
          delete this.session.users[toUserId]
          this.saveSession()
        }
        throw new Error('context token 已失效（请先在微信里给 Bot 发一条消息）')
      }
      // ret=-14: bot session expired — the poll loop owns the relogin flow
      // (it hits the same error on getupdates and restarts QR login); here we
      // only report the failure so a concurrent second login never starts.
      if (resp.ret === -14 || /session/i.test(String(resp.errmsg ?? ''))) {
        throw new Error('WeChat 登录会话已过期，等待重新扫码（轮询循环会自动发起）')
      }
      throw new Error(`WeChat sendmessage failed: ret=${resp.ret} ${resp.errmsg ?? ''}`)
    }
  }

  /**
   * Plain-text rendering of a notification (iLink text items only).
   *
   * Slim by design: title + message body only. Turn-summary bodies carry just
   * 💬 user prompt and 🤖 AI reply (the source no longer emits 🔧/📊 lines);
   * the type/time footer is redundant (title carries the state, WeChat
   * timestamps the message). Custom metadata outside the standard turn-summary
   * set is still appended.
   */
  private formatText(event: NotifyEvent): string {
    const lines: string[] = []

    lines.push(`【${event.title}】`)
    lines.push('')
    lines.push(event.message.trim())

    const extra = extraMetadataEntries(event)
    if (extra.length > 0) {
      lines.push('')
      for (const [key, value] of extra) {
        lines.push(`- ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      }
    }

    const text = lines.join('\n')
    return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  /** Request headers shared by every iLink call. */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': randomWechatUin(),
    }
    if (this.session?.token) {
      headers.Authorization = `Bearer ${this.session.token}`
    }
    return headers
  }

  /**
   * GET an iLink endpoint, retrying transient transport timeouts with backoff.
   * Returns null when aborted by us or when retries are exhausted — callers
   * decide whether null is fatal. Mirrors apiPost's null-on-abort contract so
   * a single network blip can't kill the whole QR login.
   */
  private async apiGet(
    baseUrl: string,
    path: string,
    opts: { timeoutMs?: number; retries?: number; backoffMs?: number; signal?: AbortSignal } = {},
  ): Promise<any> {
    const { timeoutMs = 15_000, retries = 2, backoffMs = POLL_RETRY_BACKOFF_MS, signal } = opts
    const url = `${baseUrl.replace(/\/$/, '')}/${path}`
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const resp = await axios.get(url, { headers: this.buildHeaders(), timeout: timeoutMs, signal })
        return resp.data
      } catch (error) {
        if (signal?.aborted || axios.isCancel(error)) return null
        // Only axios timeouts (ECONNABORTED) are worth retrying; anything else
        // (HTTP status, DNS, TLS) will just fail again identically.
        if (!axios.isAxiosError(error) || error.code !== 'ECONNABORTED') throw error
        if (attempt < retries) await sleep(backoffMs, signal)
      }
    }
    return null
  }

  /**
   * POST to an iLink endpoint, automatically attaching `base_info` and the
   * Bearer token. Returns null when the request was aborted by us (dispose or
   * a client-side long-poll timeout — both are normal control flow).
   */
  private async apiPost(
    baseUrl: string,
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<any> {
    const payload = { ...body, base_info: { channel_version: this.channelVersion } }
    try {
      const resp = await axios.post(`${baseUrl.replace(/\/$/, '')}/${endpoint}`, payload, {
        headers: this.buildHeaders(),
        timeout: timeoutMs,
        signal,
      })
      return resp.data
    } catch (error) {
      if (signal?.aborted) return null
      if (axios.isCancel(error)) return null
      // axios times out long polls with ECONNABORTED — treat as an empty poll.
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') return null
      throw error
    }
  }

  // ── session persistence ────────────────────────────────────────────────────

  private loadSession(): WeChatSession | null {
    if (!existsSync(this.sessionFile)) return null
    try {
      const parsed = JSON.parse(readFileSync(this.sessionFile, 'utf8'))
      if (!parsed || typeof parsed.token !== 'string' || parsed.token.length === 0) return null
      return {
        token: parsed.token,
        baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl ? parsed.baseUrl : DEFAULT_BASE_URL,
        accountId: parsed.accountId,
        userId: parsed.userId,
        savedAt: parsed.savedAt ?? '',
        updatesBuf: typeof parsed.updatesBuf === 'string' ? parsed.updatesBuf : undefined,
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      }
    } catch (error) {
      this.ctx.logger.warn('[notify] Failed to read WeChat session file %s:', this.sessionFile, error)
      return null
    }
  }

  private saveSession(): void {
    if (!this.session) return
    try {
      mkdirSync(dirname(this.sessionFile), { recursive: true })
      writeFileSync(this.sessionFile, JSON.stringify(this.session, null, 2) + '\n', 'utf8')
      chmodSync(this.sessionFile, 0o600)
    } catch (error) {
      this.ctx.logger.warn('[notify] Failed to persist WeChat session file:', error)
    }
  }
}

/** Sleep that resolves early when the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Extract the user-readable text of an inbound iLink message: the text item,
 * or a voice item's transcript (marked so the user knows it was transcribed).
 * Returns '' for media-only messages (image/file/video), which the
 * interaction bridge ignores.
 */
function extractInboundText(msg: any): string {
  for (const item of msg?.item_list ?? []) {
    if (item?.type === 1 && typeof item.text_item?.text === 'string') return item.text_item.text
    if (item?.type === 3 && typeof item.voice_item?.text === 'string') return `[语音] ${item.voice_item.text}`
  }
  return ''
}
