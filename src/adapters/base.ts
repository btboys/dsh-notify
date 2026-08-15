import { NotifyEvent } from '../types.js'

/**
 * Base interface for all notification adapters
 */
export interface NotificationAdapter {
  /** Adapter name for logging */
  readonly name: string
  
  /** Whether this adapter is enabled */
  readonly enabled: boolean
  
  /** Send a notification */
  send(event: NotifyEvent): Promise<void>
  
  /** Clean up resources */
  dispose?(): void | Promise<void>
}
