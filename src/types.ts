import { Context } from '@deepseek-ai/cordis'

/**
 * Notification event types that trigger notifications
 */
export type NotifyEventType =
  | 'conversationCompleted'
  | 'conversationPaused'
  | 'conversationFailed'
  | 'authorizationRequired'
  | 'confirmationRequired'

/**
 * Metadata attached to a notification
 */
export interface NotifyMetadata {
  [key: string]: any
}

/**
 * A notification payload
 */
export interface NotifyEvent {
  /** Event type */
  type: NotifyEventType
  /** Notification title */
  title: string
  /** Notification message body */
  message: string
  /** Optional metadata for additional context */
  metadata?: NotifyMetadata
  /** Timestamp when the event occurred */
  timestamp?: number
}

/**
 * System notification channel configuration
 */
export interface SystemNotifyConfig {
  enabled: boolean
  /** Play sound with notification (default: true) */
  sound?: boolean
  /**
   * macOS system sound name, e.g. "Glass", "Ping", "Sosumi", "Basso", "default".
   * macOS only — Windows plays SystemSounds.Asterisk and Linux the freedesktop
   * stock sound unless `soundFile` is set.
   */
  soundName?: string
  /**
   * Path to a custom audio file to play with the notification (macOS `afplay`,
   * Linux `paplay`; Windows only supports .wav via SoundPlayer). Overrides
   * `soundName`.
   */
  soundFile?: string
  /**
   * Per-event-type macOS sound name overrides, e.g.
   * `{ conversationFailed: 'Basso', conversationCompleted: 'Glass' }`.
   * macOS only; has the highest priority.
   */
  sounds?: Partial<Record<NotifyEventType, string>>
  /** Icon path for the notification */
  icon?: string
}

/**
 * Webhook notification channel configuration
 */
export interface WebhookNotifyConfig {
  enabled: boolean
  /** Webhook URL to send POST requests to */
  url: string
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH'
  /** Custom headers */
  headers?: Record<string, string>
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number
}

/**
 * WeCom (Enterprise WeChat) bot notification configuration
 */
export interface WeComNotifyConfig {
  enabled: boolean
  /** WeCom webhook URL */
  webhookUrl: string
  /** Users to mention (@all or specific user IDs) */
  mentions?: string[]
  /** Message type (default: markdown) */
  msgType?: 'text' | 'markdown'
}

/**
 * WeChat ClawBot (iLink) bot notification configuration.
 *
 * ClawBot is Tencent's official personal-WeChat bot channel (iLink protocol,
 * `ilinkai.weixin.qq.com`). Unlike webhook channels, sending is REPLY-based:
 * proactive pushes require a `context_token` captured from an inbound message,
 * so the adapter runs a long-poll loop and the user must message the bot once
 * after login before notifications can reach them.
 */
export interface WeChatNotifyConfig {
  enabled: boolean
  /**
   * Restrict push targets to these iLink user IDs (`xxx@im.wechat`).
   * Empty (default) pushes to every user who has messaged the bot.
   * The same allowlist gates INTERACTIVE replies: only these users may
   * answer approvals/questions or continue a conversation from WeChat.
   */
  toUserIds?: string[]
  /**
   * Enable two-way interaction (default: true when the channel is enabled):
   * approval/question prompts are pushed with reply instructions, and the
   * user's WeChat replies answer them (first answer wins against the Web UI)
   * or continue the most recently notified conversation.
   */
  interactive?: boolean
  /**
   * Path of the session file that stores the bot token and captured
   * context tokens. Defaults to `<DSH_HOME>/notify/wechat-session.json`.
   */
  sessionFile?: string
  /** iLink channel version sent in `base_info` (default: '1.0.2'). */
  channelVersion?: string
}

/**
 * Telegram bot notification configuration
 */
export interface TelegramNotifyConfig {
  enabled: boolean
  /** Telegram bot token from @BotFather */
  botToken: string
  /** Target chat ID (user or group) that started the bot */
  chatId: string
  /** Message parse mode (default: HTML, safest for rich formatting) */
  parseMode?: 'HTML' | 'MarkdownV2' | 'text'
  /** Send silently (no notification sound on the receiver side) */
  disableNotification?: boolean
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number
  /**
   * Enable two-way interaction (default: true when the channel is enabled):
   * the adapter long-polls getUpdates; replies from the configured chat may
   * answer approvals/questions (inline buttons or Y/N text) or continue the
   * most recently notified conversation. Only the configured chatId may
   * drive interactions.
   */
  interactive?: boolean
}

/**
 * Event filter configuration - which events to notify on
 */
export interface NotifyEventFilter {
  conversationCompleted: boolean
  conversationPaused: boolean
  conversationFailed: boolean
  authorizationRequired: boolean
  confirmationRequired: boolean
}

/**
 * Main plugin configuration
 */
export interface NotifyPluginConfig {
  /** Enable/disable the entire plugin (default: true) */
  enabled?: boolean
  /** Notification channels */
  channels?: {
    system?: SystemNotifyConfig
    webhook?: WebhookNotifyConfig
    wecom?: WeComNotifyConfig
    wechat?: WeChatNotifyConfig
    telegram?: TelegramNotifyConfig
  }
  /** Event filters - which events trigger notifications */
  events?: NotifyEventFilter
  /** Default title prefix for all notifications */
  titlePrefix?: string
}

/**
 * Declare plugin services and events in Cordis context
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    notify: any // Will be typed as NotifyService when imported
  }

  interface Events {
    'notify/send'(event: NotifyEvent): void
    'notify/conversationCompleted'(event: NotifyEvent): void
    'notify/conversationPaused'(event: NotifyEvent): void
    'notify/conversationFailed'(event: NotifyEvent): void
    'notify/authorizationRequired'(event: NotifyEvent): void
    'notify/confirmationRequired'(event: NotifyEvent): void
  }
}
