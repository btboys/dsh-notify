import { Context } from '@deepseek-ai/cordis'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, SystemNotifyConfig } from '../types.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

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
      const { appleScriptSound, soundFile } = this.resolveSound(event)
      const script = `display notification "${message}" with title "${title}" ${appleScriptSound}`
      
      // Play a custom sound file alongside the notification if configured
      const soundPromise = soundFile
        ? this.playSoundFile(soundFile)
        : Promise.resolve()
      
      await Promise.all([
        execAsync(`osascript -e '${script}'`),
        soundPromise,
      ])
      
      this.ctx.logger.info('[notify] System notification sent: %s', event.title)
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send system notification:', error)
      throw error
    }
  }
  
  /**
   * Resolve the sound to play for this event.
   * Priority: per-event sound name > custom sound file > sound name > default.
   */
  private resolveSound(event: NotifyEvent): { appleScriptSound: string; soundFile?: string } {
    // Per-event macOS sound name override (highest priority)
    const eventSound = this.config.sounds?.[event.type]
    if (eventSound) {
      return { appleScriptSound: `sound name "${this.escapeAppleScript(eventSound)}"` }
    }
    
    // Custom audio file played via afplay
    if (this.config.soundFile) {
      return { appleScriptSound: '', soundFile: this.config.soundFile }
    }
    
    // Named macOS system sound
    if (this.config.soundName) {
      return { appleScriptSound: `sound name "${this.escapeAppleScript(this.config.soundName)}"` }
    }
    
    // Default sound unless explicitly disabled
    if (this.config.sound === false) {
      return { appleScriptSound: '' }
    }
    
    return { appleScriptSound: 'sound name "default"' }
  }
  
  /**
   * Play a custom audio file with afplay (macOS). Uses execFile to avoid
   * shell escaping issues with arbitrary paths.
   */
  private async playSoundFile(filePath: string): Promise<void> {
    try {
      await execFileAsync('afplay', [filePath])
      this.ctx.logger.debug('[notify] Played custom sound file: %s', filePath)
    } catch (error) {
      // Sound playback failure should not fail the whole notification
      this.ctx.logger.warn('[notify] Failed to play custom sound file %s:', filePath, error)
    }
  }
  
  private escapeAppleScript(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
  }
}
