import { Context } from '@deepseek-ai/cordis'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, SystemNotifyConfig } from '../types.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

/**
 * macOS built-in sound files (afplay targets).
 */
const MACOS_SYSTEM_SOUNDS = [
  'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero',
  'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink',
] as const

/** Default macOS system sound used when none is configured. */
const DEFAULT_SOUND = 'Ping'

/**
 * System notification adapter using native macOS notifications.
 * Avoids Rosetta compatibility warnings by using osascript instead of
 * terminal-notifier, and plays the alert sound with afplay (the AppleScript
 * `sound name` parameter of `display notification` silently fails to make a
 * sound on current macOS releases).
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
      
      // Notification via osascript (no `sound name` — it does not ring on macOS)
      const script = `display notification "${message}" with title "${title}"`
      
      // Sound via afplay (reliable on every macOS release)
      const soundPromise = this.config.sound !== false
        ? this.playSound(event)
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
   * Resolve and play the alert sound.
   * Priority: per-event sound name > custom sound file > named macOS sound > default.
   */
  private async playSound(event: NotifyEvent): Promise<void> {
    try {
      // 1. Per-event macOS sound name override
      const eventSound = this.config.sounds?.[event.type]
      if (eventSound) {
        await this.playNamedSound(eventSound)
        return
      }
      
      // 2. Custom audio file played via afplay
      if (this.config.soundFile) {
        await this.playSoundFile(this.config.soundFile)
        return
      }
      
      // 3. Named macOS system sound
      if (this.config.soundName) {
        await this.playNamedSound(this.config.soundName)
        return
      }
      
      // 4. Default sound
      await this.playNamedSound(DEFAULT_SOUND)
    } catch (error) {
      // Sound playback failure should not fail the whole notification
      this.ctx.logger.warn('[notify] Failed to play notification sound:', error)
    }
  }
  
  /**
   * Play a named macOS system sound via afplay.
   * Accepts either the bare name (`Ping`) or a full path
   * (`/System/Library/Sounds/Ping.aiff`).
   */
  private async playNamedSound(name: string): Promise<void> {
    let path = name
    if (!name.startsWith('/')) {
      const base = name.endsWith('.aiff') ? name.slice(0, -5) : name
      if (!(MACOS_SYSTEM_SOUNDS as readonly string[]).includes(base)) {
        this.ctx.logger.warn('[notify] Unknown macOS sound "%s", falling back to Ping', name)
        path = `/System/Library/Sounds/${DEFAULT_SOUND}.aiff`
      } else {
        path = `/System/Library/Sounds/${base}.aiff`
      }
    }
    await execFileAsync('afplay', [path])
    this.ctx.logger.debug('[notify] Played system sound: %s', path)
  }
  
  /**
   * Play a custom audio file with afplay (macOS). Uses execFile to avoid
   * shell escaping issues with arbitrary paths.
   */
  private async playSoundFile(filePath: string): Promise<void> {
    await execFileAsync('afplay', [filePath])
    this.ctx.logger.debug('[notify] Played custom sound file: %s', filePath)
  }
  
  private escapeAppleScript(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
  }
}
