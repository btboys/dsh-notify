import { Context } from '@deepseek-ai/cordis'
import axios from 'axios'
import { NotificationAdapter, extraMetadataEntries } from './base.js'
import { NotifyEvent, WeComNotifyConfig } from '../types.js'

/**
 * WeCom (Enterprise WeChat) bot notification adapter
 */
export class WeComNotificationAdapter implements NotificationAdapter {
  readonly name = 'wecom'
  readonly enabled: boolean
  
  private config: WeComNotifyConfig
  private ctx: Context
  
  constructor(ctx: Context, config: WeComNotifyConfig) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
  }
  
  async send(event: NotifyEvent): Promise<void> {
    if (!this.enabled) {
      return
    }
    
    try {
      const msgType = this.config.msgType || 'markdown'
      
      let content: string
      if (msgType === 'markdown') {
        content = this.formatMarkdown(event)
      } else {
        content = `${event.title}\n\n${event.message}`
      }
      
      const payload: any = {
        msgtype: msgType,
      }
      
      if (msgType === 'markdown') {
        payload.markdown = {
          content,
        }
      } else {
        payload.text = {
          content,
          mentioned_list: this.config.mentions || [],
        }
      }
      
      // Add mentions for markdown type as well
      if (this.config.mentions && this.config.mentions.length > 0) {
        if (msgType === 'markdown') {
          payload.markdown.mentioned_list = this.config.mentions
        }
      }
      
      await axios.post(this.config.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      })
      
      this.ctx.logger.info('[notify] WeCom notification sent')
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send WeCom notification:', error)
      throw error
    }
  }
  
  private formatMarkdown(event: NotifyEvent): string {
    const lines: string[] = []
    
    // Title
    lines.push(`## ${event.title}`)
    lines.push('')
    
    // Message
    lines.push(event.message)
    
    // Slim by design: no type/time footer (the title carries the state, the
    // chat client timestamps the message). Only custom metadata outside the
    // standard turn-summary set is appended.
    const extra = extraMetadataEntries(event)
    if (extra.length > 0) {
      lines.push('')
      for (const [key, value] of extra) {
        lines.push(`- ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      }
    }
    
    return lines.join('\n')
  }
}
