import { Context } from '@deepseek-ai/cordis'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { NotificationAdapter } from './base.js'
import { NotifyEvent, SystemNotifyConfig } from '../types.js'

const execFileAsync = promisify(execFile)

/** Test seam: command runner signature (matches promisified child_process.execFile). */
type ExecFileFn = (cmd: string, args: string[]) => Promise<unknown>

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
 * AUMID borrowed for Windows toasts: an unregistered AppUserModelID can make
 * CreateToastNotifier throw, so we present as Windows PowerShell (the toast
 * still shows our title/body; attribution reads "Windows PowerShell").
 */
const WINDOWS_TOAST_AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

/** freedesktop stock sound played on Linux when no custom file is configured. */
const LINUX_DEFAULT_SOUND_FILE = '/usr/share/sounds/freedesktop/stereo/complete.oga'

/**
 * System notification adapter — native desktop notifications per platform:
 *
 * - macOS:  osascript `display notification` + afplay for sound
 *           (avoids terminal-notifier's Rosetta warnings; the AppleScript
 *           `sound name` parameter silently fails on current macOS releases)
 * - Windows: PowerShell WinRT toast (ToastNotificationManager), no modules
 *           required; sound via System.Media
 * - Linux:  notify-send (libnotify); sound via paplay / canberra-gtk-play,
 *           best effort. Headless systems without libnotify get a one-time
 *           install hint instead of silent failure.
 */
export class SystemNotificationAdapter implements NotificationAdapter {
  readonly name = 'system'
  readonly enabled: boolean
  
  private config: SystemNotifyConfig
  private ctx: Context
  private platform: NodeJS.Platform
  private execFile: ExecFileFn
  /** One-time warn flags so a missing desktop tool does not spam the log. */
  private warnedUnavailable = false
  /** Linux sound probe result: undefined = not probed, null = none available. */
  private linuxSoundCmd: string[] | null | undefined
  
  constructor(
    ctx: Context,
    config: SystemNotifyConfig,
    internal?: { platform?: NodeJS.Platform; execFile?: ExecFileFn },
  ) {
    this.ctx = ctx
    this.config = config
    this.enabled = config.enabled ?? false
    this.platform = internal?.platform ?? process.platform
    this.execFile = internal?.execFile ?? (execFileAsync as unknown as ExecFileFn)
  }
  
  async send(event: NotifyEvent): Promise<void> {
    if (!this.enabled) {
      return
    }
    try {
      if (this.platform === 'darwin') {
        await this.sendMacOS(event)
      } else if (this.platform === 'win32') {
        await this.sendWindows(event)
      } else {
        await this.sendLinux(event)
      }
      this.ctx.logger.info('[notify] System notification sent (%s): %s', this.platform, event.title)
    } catch (error) {
      this.ctx.logger.error('[notify] Failed to send system notification:', error)
      throw error
    }
  }

  // ── macOS ──────────────────────────────────────────────────────────────

  private async sendMacOS(event: NotifyEvent): Promise<void> {
    // Multi-line content must carry REAL newlines (not the two-char `\n`), or
    // AppleScript prints them literally. execFile passes the script arg without
    // shell quoting so real newlines survive intact.
    const script = `display notification "${this.escapeAppleScript(event.message, true)}" with title "${this.escapeAppleScript(event.title)}"`
    
    const soundPromise = this.config.sound !== false
      ? this.playSoundMacOS(event)
      : Promise.resolve()
    
    await Promise.all([
      this.execFile('osascript', ['-e', script]),
      soundPromise,
    ])
  }
  
  /**
   * Resolve and play the alert sound (macOS).
   * Priority: per-event sound name > custom sound file > named macOS sound > default.
   */
  private async playSoundMacOS(event: NotifyEvent): Promise<void> {
    try {
      // 1. Per-event macOS sound name override
      const eventSound = this.config.sounds?.[event.type]
      if (eventSound) {
        await this.playNamedSound(eventSound)
        return
      }
      // 2. Custom audio file played via afplay
      if (this.config.soundFile) {
        await this.execFile('afplay', [this.config.soundFile])
        return
      }
      // 3. Named macOS system sound
      await this.playNamedSound(this.config.soundName || DEFAULT_SOUND)
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
    await this.execFile('afplay', [path])
  }

  // ── Windows ────────────────────────────────────────────────────────────

  private async sendWindows(event: NotifyEvent): Promise<void> {
    const script = this.buildWindowsToastScript(event)
    await this.execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ])
  }

  /**
   * Build the PowerShell toast script. Single-quoted PowerShell strings are
   * used throughout (no interpolation; `'` doubled); title/body are also
   * XML-escaped before embedding in the toast template. Sound plays in the
   * same process with a short sleep so playback is not cut off at exit.
   */
  private buildWindowsToastScript(event: NotifyEvent): string {
    const esc = (s: string) => this.escapePowerShell(this.escapeXml(s))
    const lines = [
      '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]',
      '[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]',
      '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
      `$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${esc(event.title)}</text><text>${esc(event.message)}</text></binding></visual></toast>')`,
      '$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)',
      `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${WINDOWS_TOAST_AUMID}').Show($toast)`,
    ]
    if (this.config.sound !== false) {
      if (this.config.soundFile) {
        // SoundPlayer only supports .wav; PlaySync blocks until done.
        lines.push(`(New-Object System.Media.SoundPlayer '${this.escapePowerShell(this.config.soundFile)}').PlaySync()`)
      } else {
        lines.push('[System.Media.SystemSounds]::Asterisk.Play()')
        lines.push('Start-Sleep -Milliseconds 700')
      }
    }
    return lines.join('; ')
  }

  // ── Linux ──────────────────────────────────────────────────────────────

  private async sendLinux(event: NotifyEvent): Promise<void> {
    try {
      await this.execFile('notify-send', [event.title, event.message])
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !this.warnedUnavailable) {
        this.warnedUnavailable = true
        this.ctx.logger.warn('[notify] notify-send 未安装（libnotify），系统通知不可用：Debian/Ubuntu 安装 libnotify-bin，Fedora 安装 libnotify')
      }
      throw error
    }
    if (this.config.sound !== false) {
      await this.playSoundLinux()
    }
  }

  /**
   * Best-effort Linux sound: custom file via paplay, else the freedesktop
   * stock sound via paplay, else canberra-gtk-play. The probe result is
   * cached; when nothing is available the sound is skipped with one warning.
   */
  private async playSoundLinux(): Promise<void> {
    if (this.linuxSoundCmd === null) return
    const candidates: string[][] = this.linuxSoundCmd
      ? [this.linuxSoundCmd]
      : this.config.soundFile
        ? [['paplay', this.config.soundFile], ['canberra-gtk-play', '-f', this.config.soundFile]]
        : [['paplay', LINUX_DEFAULT_SOUND_FILE], ['canberra-gtk-play', '-i', 'message-new-instant']]
    for (const [cmd, ...args] of candidates) {
      try {
        await this.execFile(cmd, args)
        this.linuxSoundCmd = [cmd, ...args]
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        this.ctx.logger.warn('[notify] Linux 通知声音播放失败: %s', error)
        return
      }
    }
    this.linuxSoundCmd = null
    this.ctx.logger.warn('[notify] 未找到可用的 Linux 声音播放器（paplay/canberra-gtk-play），后续通知静音')
  }

  // ── escaping ───────────────────────────────────────────────────────────

  /**
   * Escape text for embedding in a double-quoted AppleScript string literal.
   * @param multiLine - keep real newlines so AppleScript displays line breaks;
   *   when false collapse them to the two-char `\n` (single-line title).
   */
  private escapeAppleScript(str: string, multiLine = false): string {
    const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    return normalized
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, multiLine ? '\n' : '\\n')
  }

  /** Escape text for a single-quoted PowerShell string literal ('' doubling). */
  private escapePowerShell(str: string): string {
    return str.replace(/'/g, "''")
  }

  /** Escape text for embedding in XML character data. */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}
