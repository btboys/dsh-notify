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
