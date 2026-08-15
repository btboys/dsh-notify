import { Context } from '@deepseek-ai/cordis'
import axios, { AxiosInstance } from 'axios'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, TelegramNotifyConfig } from '../types.js'

const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Telegram bot notification adapter using the Bot API `sendMessage` method.
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
  
  constructor(ctx: Context, config: TelegramNotifyConfig) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
    
    this.client = axios.create({
      baseURL: `${TELEGRAM_API}/bot${config.botToken}`,
      timeout: config.timeout ?? 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
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
   */
  private formatPlainText(event: NotifyEvent): string {
    return [
      `🔔 ${event.title}`,
      '',
      event.message,
      '',
      `类型: ${this.typeLabel(event.type)}`,
      event.timestamp ? `时间: ${new Date(event.timestamp).toLocaleString('zh-CN')}` : '',
      this.formatMetadata(event),
    ].filter(Boolean).join('\n')
  }
  
  /**
   * Format the notification as rich text (HTML or MarkdownV2).
   */
  private formatRichText(event: NotifyEvent, parseMode: 'HTML' | 'MarkdownV2'): string {
    const md = parseMode === 'MarkdownV2'
    const lines: string[] = []
    
    // Title
    lines.push(md ? `*${this.escapeMarkdown(event.title)}*` : `<b>🔔 ${this.escapeHtml(event.title)}</b>`)
    lines.push('')
    
    // Message
    lines.push(md ? this.escapeMarkdown(event.message) : this.escapeHtml(event.message))
    lines.push('')
    
    // Event type badge
    lines.push(md ? `*类型*: ${this.typeLabel(event.type)}` : `类型: ${this.typeLabel(event.type)}`)
    
    // Timestamp
    if (event.timestamp) {
      const time = new Date(event.timestamp).toLocaleString('zh-CN')
      lines.push(md ? `*时间*: ${this.escapeMarkdown(time)}` : `时间: ${this.escapeHtml(time)}`)
    }
    
    // Metadata
    const metadata = this.formatMetadata(event)
    if (metadata) {
      lines.push('')
      lines.push(md ? '*详细信息*:' : '<b>详细信息</b>:')
      lines.push(metadata)
    }
    
    return lines.join('\n')
  }
  
  private formatMetadata(event: NotifyEvent): string {
    if (!event.metadata || Object.keys(event.metadata).length === 0) {
      return ''
    }
    
    const md = this.config.parseMode === 'MarkdownV2'
    const html = this.config.parseMode === 'HTML'
    
    return Object.entries(event.metadata)
      .map(([key, value]) => {
        const display = String(value)
        if (md) return `- ${this.escapeMarkdown(key)}: ${this.escapeMarkdown(display)}`
        if (html) return `- ${this.escapeHtml(key)}: ${this.escapeHtml(display)}`
        return `- ${key}: ${display}`
      })
      .join('\n')
  }
  
  private typeLabel(type: string): string {
    const labels: Record<string, string> = {
      conversationCompleted: '✅ 对话完成',
      conversationPaused: '⏸️ 对话暂停',
      conversationFailed: '❌ 对话失败',
      authorizationRequired: '🔐 需要授权',
      confirmationRequired: '❓ 需要确认',
    }
    return labels[type] || type
  }
  
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
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
