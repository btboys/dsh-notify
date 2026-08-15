import { Context } from '@deepseek-ai/cordis'
// @ts-ignore - node-notifier types not available
import notifier from 'node-notifier'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, SystemNotifyConfig } from '../types.js'

/**
 * System notification adapter using node-notifier
 */
export class SystemNotificationAdapter implements NotificationAdapter {
  readonly name = 'system'
  readonly enabled: boolean
  
  private config: SystemNotifyConfig
  private ctx: Context
  
  constructor(ctx: Context, config: SystemNotifyConfig) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
  }
  
  async send(event: NotifyEvent): Promise<void> {
    if (!this.enabled) {
      return
    }
    
    try {
      await new Promise<void>((resolve, reject) => {
        notifier.notify(
          {
            title: event.title,
            message: event.message,
            sound: this.config.sound ?? true,
            icon: this.config.icon,
            wait: false,
          },
          (error: Error | null) => {
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          }
        )
      })
      
      this.ctx.logger.info('[notify] System notification sent: %s', event.title)
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send system notification:', error)
      throw error
    }
  }
}
