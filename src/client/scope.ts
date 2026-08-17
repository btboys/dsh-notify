/**
 * Structural types for the DSH settings scope the notify card binds.
 *
 * The real services live in the DSH host (`@deepseek-ai/dsh-client-ui-settings`
 * → `settingsScope` and the `@deepseek-ai/dsh-client-runtime` snapshot types),
 * but those published packages are not installable outside the DSH monorepo
 * (a broken `@deepseek-ai/dsh-compact` transitive dependency). The notify
 * card therefore depends on NO `@deepseek-ai/dsh-client-*` runtime package:
 * it asks the host to inject `settingsScope` through cordis (`dsh.client.inject`)
 * and types only the narrow surface it touches, structurally, here.
 *
 * The field/value shapes below mirror the host-published `notify` namespace
 * section (see src/settings.ts), kept in step by hand.
 */

/** The flat `notify` settings section the host composes (see src/settings.ts). */
export interface NotifyNsSettings {
  enabled?: boolean
  systemEnabled?: boolean
  systemSound?: boolean
  systemSoundName?: string
  webhookEnabled?: boolean
  webhookUrl?: string
  wecomEnabled?: boolean
  wecomWebhookUrl?: string
  wecomMsgType?: 'markdown' | 'text'
  telegramEnabled?: boolean
  telegramBotToken?: string
  telegramChatId?: string
  telegramParseMode?: 'HTML' | 'MarkdownV2' | 'text'
  notifyOnCompleted?: boolean
  notifyOnPaused?: boolean
  notifyOnFailed?: boolean
  notifyOnAuthorization?: boolean
  notifyOnConfirmation?: boolean
  titlePrefix?: string
}

/** The effective composition the host serves for a bound namespace. */
export interface SettingsScopeSnapshot<T> {
  /** read resolves to 'ready' once the host publishes a decodable section. */
  status: 'loading' | 'ready' | 'unavailable'
  /** Effective value: user layer over base layer (defaults applied). */
  value?: T
  /** The base/composition layer (bundle default), before user overrides. */
  base?: T
  /** The user layer; a key present here is a user override. */
  user?: Partial<T>
  /** Namespace revision, incremented by every host document mutation. */
  revision?: number
  /** Whether the host document accepts writes for this namespace. */
  writable: boolean
}

/** The scope the notify card interacts with (structural subset). */
export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  /** Write one scalar field; resolves after the wire settles. */
  set(field: string, value: unknown): Promise<void>
  /** Clear one scalar field (re-inherits the base layer). */
  unset(field: string): Promise<void>
}
