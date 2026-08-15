import { Context } from '@deepseek-ai/cordis'
import axios, { AxiosInstance } from 'axios'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, WebhookNotifyConfig } from '../types.js'

/**
 * Webhook notification adapter using HTTP POST requests
 */
export class WebhookNotificationAdapter implements NotificationAdapter {
  readonly name = 'webhook'
  readonly enabled: boolean
  
  private config: WebhookNotifyConfig
  private ctx: Context
  private client: AxiosInstance
  
  constructor(ctx: Context, config: WebhookNotifyConfig) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
    
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeout ?? 5000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    })
  }
  
  async send(event: NotifyEvent): Promise<void> {
    if (!this.enabled) {
      return
    }
    
    try {
      const payload = {
        type: event.type,
        title: event.title,
        message: event.message,
        metadata: event.metadata || {},
        timestamp: event.timestamp || Date.now(),
      }
      
      await this.client.request({
        method: this.config.method || 'POST',
        url: '',
        data: payload,
      })
      
      this.ctx.logger.info('[notify] Webhook notification sent to %s', this.config.url)
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send webhook notification:', error)
      throw error
    }
  }
}
