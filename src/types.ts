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
   * Takes effect when `sound` is true (or unset) and `soundFile` is not set.
   */
  soundName?: string
  /**
   * Path to a custom audio file (e.g. .mp3/.wav/.aiff) to play with the
   * notification via `afplay`. Overrides `soundName`.
   */
  soundFile?: string
  /**
   * Per-event-type macOS sound name overrides, e.g.
   * `{ conversationFailed: 'Basso', conversationCompleted: 'Glass' }`.
   * Has the highest priority.
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
