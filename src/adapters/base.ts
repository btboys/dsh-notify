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

/**
 * Metadata keys the host already renders into the notification body/title
 * (turn summaries, approvals, questions). Chat-channel formatters stay slim
 * by omitting these from any metadata dump.
 */
const STANDARD_METADATA_KEYS = new Set([
  'turn', 'reason', 'durationMs', 'userPrompt', 'reply', 'tools', 'steps',
  'title', 'workspace', 'sessionId', 'error', 'questions', 'toolName', 'callId',
])

/**
 * Metadata entries worth appending to a chat push: keys outside the standard
 * turn-summary set (i.e. custom metadata from programmatic sends). Standard
 * keys are already conveyed by the title/body and dumping them — including
 * full prompt text — is noise.
 */
export function extraMetadataEntries(event: NotifyEvent): Array<[string, unknown]> {
  return Object.entries(event.metadata ?? {}).filter(([key]) => !STANDARD_METADATA_KEYS.has(key))
}
