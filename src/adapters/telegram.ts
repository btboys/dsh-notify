import { Context } from '@deepseek-ai/cordis'
import axios, { AxiosInstance } from 'axios'
import { NotificationAdapter, extraMetadataEntries } from './base.js'
import { NotifyEvent, TelegramNotifyConfig } from '../types.js'
import { PromptInteraction } from '../interaction.js'

const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Callback-data vocabulary for inline keyboards. Button taps are translated
 * back into the same text the InteractionBridge already parses (`Y`/`N`/
 * option number), so one routing path serves both text and button replies.
 */
const CB_APPROVE = 'notify:a'
const CB_REJECT = 'notify:r'
const CB_QUESTION = 'notify:q:' // suffix: 1-based option index

/** getUpdates long-poll hold time (server-side seconds). */
const POLL_TIMEOUT_S = 25

/**
 * Telegram bot adapter — Bot API `sendMessage` push plus, when `interactive`
 * is on (default), a `getUpdates` long-poll loop that feeds replies back to
 * the InteractionBridge:
 *
 *   - text messages from the configured chat → bridge routing (Y/N approval,
 *     option number for questions, free text continues the last session),
 *   - inline-keyboard button taps (callback_query) → translated to the same
 *     vocabulary, so buttons and text are interchangeable.
 *
 * Unlike WeChat iLink there is no ephemeral context token: the configured
 * chatId alone suffices to push, and it survives restarts.
 *
 * Setup:
 * 1. Create a bot with @BotFather and copy the token.
 * 2. Start a chat with the bot (or add it to a group).
 * 3. Find the chat ID (e.g. via `getUpdates` or @userinfobot).
 * 4. Configure `botToken` and `chatId`.
 */
export class TelegramNotificationAdapter implements NotificationAdapter {
  readonly name = 'telegram'
  readonly enabled: boolean
  
  private config: TelegramNotifyConfig
  private ctx: Context
  private client: AxiosInstance
  
  /** Whether the update-poll loop is running (interactive mode). */
  private interactive: boolean
  private controller: AbortController | null = null
  private updateOffset: number | undefined

  /**
   * Inbound-interaction hook — set by the service when the InteractionBridge
   * is active. userId is the chat ID as a string.
   */
  onUserMessage?: (userId: string, text: string) => void | Promise<void>

  constructor(
    ctx: Context,
    config: TelegramNotifyConfig,
    internal?: { apiBase?: string },
  ) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
    this.interactive = this.enabled && config.interactive !== false && !!config.botToken && !!config.chatId
    
    this.client = axios.create({
      baseURL: `${internal?.apiBase ?? TELEGRAM_API}/bot${config.botToken}`,
      timeout: config.timeout ?? 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (this.interactive) {
      this.controller = new AbortController()
      void this.pollLoop(this.controller.signal)
    }
  }

  /** Stop the poll loop. */
  dispose(): void {
    this.controller?.abort()
    this.controller = null
  }

  // ── interaction surface (used by the InteractionBridge hooks) ─────────

  /** Whether this adapter participates in two-way interaction. */
  isInteractive(): boolean {
    return this.interactive
  }

  /** Only the configured chat may drive interactions. */
  canInteract(userId: string): boolean {
    return this.interactive && userId === String(this.config.chatId)
  }

  /** Best-effort plain-text push (interaction receipts); never throws. */
  async pushText(text: string): Promise<void> {
    try {
      await this.api('sendMessage', { chat_id: this.config.chatId, text })
    } catch (error) {
      this.ctx.logger.warn('[notify] Telegram pushText failed:', error)
    }
  }

  /**
   * Push an approval/question prompt with inline-keyboard buttons.
   * Returns false for prompts that cannot be button-ized (multi-question,
   * option-less free-text questions) — the bridge then falls back to plain
   * text via pushText.
   */
  async sendPrompt(entry: PromptInteraction): Promise<boolean> {
    if (!this.interactive) return false
    try {
      if (entry.kind === 'approval') {
        const lines = [`🔐 需要授权（${entry.sessionId.slice(0, 8)}…）`, '', `🔧 操作: ${entry.toolName}`]
        if (entry.reason) lines.push(`📝 原因: ${entry.reason}`)
        lines.push('', '点击按钮，或回复 Y 批准 / N 拒绝')
        await this.api('sendMessage', {
          chat_id: this.config.chatId,
          text: lines.join('\n'),
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 批准', callback_data: CB_APPROVE },
              { text: '❌ 拒绝', callback_data: CB_REJECT },
            ]],
          },
        })
        return true
      }

      const question = entry.questions[0]
      const options = question?.options ?? []
      if (entry.questions.length !== 1 || options.length === 0 || options.length > 8) return false
      const lines = [`❓ 需要回答（${entry.sessionId.slice(0, 8)}…）`, '']
      if (question.header) lines.push(`📌 ${question.header}`)
      lines.push(question.question, '')
      options.forEach((o, i) => lines.push(`  ${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ''}`))
      lines.push('', question.multiSelect ? '多选请回复序号（空格分隔），单选可点按钮' : '点击按钮，或回复序号/自定义文字')
      await this.api('sendMessage', {
        chat_id: this.config.chatId,
        text: lines.join('\n'),
        reply_markup: {
          inline_keyboard: options.map((o, i) => [{ text: `${i + 1}. ${o.label}`, callback_data: `${CB_QUESTION}${i + 1}` }]),
        },
      })
      return true
    } catch (error) {
      this.ctx.logger.warn('[notify] Telegram sendPrompt failed, falling back to text:', error)
      return false
    }
  }

  // ── getUpdates long poll ────────────────────────────────────────────────

  private async pollLoop(signal: AbortSignal): Promise<void> {
    // Drain any backlog so a restart does not replay stale replies.
    try {
      const backlog = await this.api('getUpdates', { timeout: 0, allowed_updates: ['message', 'callback_query'] }, signal, 15_000)
      const updates = backlog?.result ?? []
      if (updates.length > 0) {
        this.updateOffset = updates[updates.length - 1].update_id + 1
      }
    } catch (error) {
      if (signal.aborted) return
      this.ctx.logger.warn('[notify] Telegram getUpdates 初始化失败（若配置了 webhook 需先删除）:', error)
    }

    while (!signal.aborted) {
      try {
        const resp = await this.api('getUpdates', {
          offset: this.updateOffset,
          timeout: POLL_TIMEOUT_S,
          allowed_updates: ['message', 'callback_query'],
        }, signal, (POLL_TIMEOUT_S + 10) * 1000)
        for (const update of resp?.result ?? []) {
          this.updateOffset = update.update_id + 1
          await this.handleUpdate(update)
        }
      } catch (error) {
        if (signal.aborted) return
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          this.ctx.logger.warn('[notify] Telegram getUpdates 冲突（409）：该 Bot 已配置 webhook，请先调用 deleteWebhook 或关闭交互')
        }
        this.ctx.logger.warn('[notify] Telegram poll error, retrying in 5s:', (error as Error)?.message ?? error)
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }

  private async handleUpdate(update: any): Promise<void> {
    try {
      const message = update.message
      if (message?.text) {
        const chatId = String(message.chat?.id ?? '')
        if (!this.canInteract(chatId)) return
        if (!this.onUserMessage) return
        await Promise.resolve(this.onUserMessage(chatId, message.text)).catch((error) => {
          this.ctx.logger.warn('[notify] Telegram inbound handler failed:', error)
        })
        return
      }

      const callback = update.callback_query
      if (callback?.data) {
        const chatId = String(callback.message?.chat?.id ?? callback.from?.id ?? '')
        // Always answer so the client's loading spinner clears.
        await this.api('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {})
        if (!this.canInteract(chatId)) return
        const text = this.translateCallback(String(callback.data))
        if (text && this.onUserMessage) {
          await Promise.resolve(this.onUserMessage(chatId, text)).catch((error) => {
            this.ctx.logger.warn('[notify] Telegram callback handler failed:', error)
          })
        }
        // Clear the keyboard so a settled prompt cannot be tapped twice.
        if (callback.message?.message_id) {
          await this.api('editMessageReplyMarkup', {
            chat_id: callback.message.chat.id,
            message_id: callback.message.message_id,
            reply_markup: { inline_keyboard: [] },
          }).catch(() => {})
        }
      }
    } catch (error) {
      this.ctx.logger.warn('[notify] Telegram update handling failed:', error)
    }
  }

  /** Map button callback data onto the bridge's text vocabulary. */
  private translateCallback(data: string): string | null {
    if (data === CB_APPROVE) return 'Y'
    if (data === CB_REJECT) return 'N'
    if (data.startsWith(CB_QUESTION)) {
      const index = data.slice(CB_QUESTION.length)
      return /^\d+$/.test(index) ? index : null
    }
    return null
  }

  // ── Bot API helper ──────────────────────────────────────────────────────

  private async api(method: string, payload: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number): Promise<any> {
    const response = await this.client.post(`/${method}`, payload, { signal, timeout: timeoutMs })
    if (!response.data?.ok) {
      throw new Error(`Telegram ${method} failed: ${response.data?.description || 'unknown'}`)
    }
    return response.data
  }
  
  async send(event: NotifyEvent): Promise<void> {
    if (!this.enabled) {
      return
    }
    
    try {
      const parseMode = this.config.parseMode || 'HTML'
      const text = parseMode === 'text'
        ? this.formatPlainText(event)
        : this.formatRichText(event, parseMode)
      
      const payload: Record<string, any> = {
        chat_id: this.config.chatId,
        text,
      }
      
      if (parseMode !== 'text') {
        payload.parse_mode = parseMode
      }
      
      if (this.config.disableNotification) {
        payload.disable_notification = true
      }
      
      const response = await this.client.post('/sendMessage', payload)
      
      if (!response.data?.ok) {
        throw new Error(`Telegram API error: ${response.data?.description || 'unknown'}`)
      }
      
      this.ctx.logger.info('[notify] Telegram notification sent to chat %s', this.config.chatId)
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send Telegram notification:', error)
      throw error
    }
  }
  
  /**
   * Format the notification as plain text.
   * Slim: title + message; no type/time footer, no standard-metadata dump.
   */
  private formatPlainText(event: NotifyEvent): string {
    const extra = this.formatMetadata(event)
    return [
      `🔔 ${event.title}`,
      '',
      event.message,
      extra ? `\n${extra}` : '',
    ].filter(Boolean).join('\n')
  }
  
  /**
   * Format the notification as rich text (HTML or MarkdownV2).
   * Slim: title + message; only custom (non-standard) metadata appended.
   */
  private formatRichText(event: NotifyEvent, parseMode: 'HTML' | 'MarkdownV2'): string {
    const md = parseMode === 'MarkdownV2'
    const lines: string[] = []
    
    // Title
    lines.push(md ? `*${this.escapeMarkdown(event.title)}*` : `<b>🔔 ${this.escapeHtml(event.title)}</b>`)
    lines.push('')
    
    // Message — HTML mode renders the assistant's markdown (bold, code,
    // headers, links, quotes) as native Telegram formatting
    lines.push(md ? this.escapeMarkdown(event.message) : this.markdownToTelegramHtml(event.message))
    
    // Custom metadata only (standard turn-summary keys are omitted)
    const metadata = this.formatMetadata(event)
    if (metadata) {
      lines.push('')
      lines.push(metadata)
    }
    
    return lines.join('\n')
  }
  
  /** Custom metadata outside the standard turn-summary set, escaped per mode. */
  private formatMetadata(event: NotifyEvent): string {
    const extra = extraMetadataEntries(event)
    if (extra.length === 0) {
      return ''
    }
    
    const md = this.config.parseMode === 'MarkdownV2'
    const html = this.config.parseMode === 'HTML'
    
    return extra
      .map(([key, value]) => {
        const display = typeof value === 'string' ? value : JSON.stringify(value)
        if (md) return `- ${this.escapeMarkdown(key)}: ${this.escapeMarkdown(display)}`
        if (html) return `- ${this.escapeHtml(key)}: ${this.escapeHtml(display)}`
        return `- ${key}: ${display}`
      })
      .join('\n')
  }
  
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
  
  /**
   * Convert the assistant's markdown body into Telegram-supported HTML
   * (<b> <i> <s> <code> <pre> <a> <blockquote>), used in HTML parse mode so
   * the reply renders with real formatting instead of raw `**`/`##` markers.
   *
   * Safety model: everything is HTML-escaped FIRST, then markdown constructs
   * are translated on the escaped text, so arbitrary model output can never
   * inject Telegram tags. Fenced code blocks are extracted before escaping
   * and re-inserted as <pre> afterwards, so their content is shown verbatim.
   * Underscore emphasis (`_x_`) is deliberately NOT translated — identifiers
   * like `some_variable` are far more common than `_italic_` in replies.
   */
  private markdownToTelegramHtml(markdown: string): string {
    // 1. Extract fenced code blocks (``` … ```) before any processing.
    const codeBlocks: string[] = []
    let text = markdown.replace(/```[^\n`]*\n?([\s\S]*?)```/g, (_m, code: string) => {
      codeBlocks.push(`<pre>${this.escapeHtml(code.replace(/\n$/, ''))}</pre>`)
      return `%%DSHCB${codeBlocks.length - 1}%%`
    })

    // 2. Escape everything else, then translate markdown constructs.
    text = this.escapeHtml(text)
      // inline code
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // bold / strikethrough / italic (bold first so ** is consumed before *)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/(?<![\w*])\*([^*\n]+)\*(?!\*)/g, '<i>$1</i>')
      // [label](url) — escape the URL's quotes, keep http(s) only
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
        const safe = url.replace(/&quot;/g, '').replace(/"/g, '')
        return /^https?:\/\//i.test(safe) ? `<a href="${safe}">${label}</a>` : label
      })
      // ATX headers → bold line
      .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
      // blockquote lines (the '>' is already escaped to &gt;)
      .replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>')

    // 3. Restore code blocks.
    return text.replace(/%%DSHCB(\d+)%%/g, (_m, i: string) => codeBlocks[Number(i)])
  }
  
  private escapeMarkdown(str: string): string {
    return str
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!')
  }
}
