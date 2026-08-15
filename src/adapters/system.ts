import { Context } from '@deepseek-ai/cordis'
import { exec } from 'child_process'
import { promisify } from 'util'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, SystemNotifyConfig } from '../types.js'

const execAsync = promisify(exec)

/**
 * System notification adapter using native macOS notifications
 * Avoids Rosetta compatibility warnings by using osascript instead of terminal-notifier
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
      // Escape special characters for AppleScript
      const title = this.escapeAppleScript(event.title)
      const message = this.escapeAppleScript(event.message)
      
      // Use native macOS notification
      const soundOption = this.config.sound !== false ? 'sound name "default"' : ''
      const script = `display notification "${message}" with title "${title}" ${soundOption}`
      
      await execAsync(`osascript -e '${script}'`)
      
      this.ctx.logger.info('[notify] System notification sent: %s', event.title)
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send system notification:', error)
      throw error
    }
  }
  
  private escapeAppleScript(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
  }
}
