/**
 * The notify card's staged form over the `notify` settings namespace.
 *
 * The card stages what the user types and writes it only when they save —
 * the same model as DSH's own plugin cards. Each control renders its
 * effective value (user layer over base over default) and whether the user
 * layer carries it; saving writes a revision-fenced field op for every staged
 * edit, then re-seeds from what the Host accepted. The Host is the sole
 * authority on whether a write landed, so the card reads the outcome back
 * from the scope rather than predicting it.
 */

import type { NotifyNsSettings, SettingsScope } from './scope.ts'

/**
 * The settings scope the host injects (`settingsScope` service). Structurally
 * typed in scope.ts; injected through `dsh.client.inject` on the client entry.
 */
export type NotifySettingsScope = SettingsScope<NotifyNsSettings>

/** Form state every notify card control shares. */
export interface NotifyCardShell {
  /** False while the namespace is not served to this client; the card renders nothing. */
  available: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** Whether the form holds edits that a save would write. */
  dirty: boolean
  /** Whether any staged draft is invalid, which blocks the save. */
  invalid: boolean
  /** Whether a save is crossing the wire. */
  saving: boolean
  /** Whether the last save did not land as staged; cleared by the next edit or save. */
  failed: boolean
}

/** One text control's rendered state. */
export interface TextFieldState {
  /** Draft text the control renders. */
  text: string
  /** Whether saving would leave a user-layer entry for this field. */
  overridden: boolean
}

/** One boolean toggle's rendered state. */
export interface BoolFieldState {
  /** Current effective boolean (default applied). */
  value: boolean
  /** Whether the user layer carries a value for this field. */
  overridden: boolean
}

/** One enum select's rendered state. */
export interface SelectFieldState<T extends string> {
  /** Effective choice (default applied). */
  value: T
  /** Whether the user layer carries a value for this field. */
  overridden: boolean
}

/** The full notify card view. */
export interface NotifyCardState extends NotifyCardShell {
  enabled: BoolFieldState
  systemEnabled: BoolFieldState
  systemSound: BoolFieldState
  systemSoundName: TextFieldState
  webhookEnabled: BoolFieldState
  webhookUrl: TextFieldState
  wecomEnabled: BoolFieldState
  wecomWebhookUrl: TextFieldState
  wecomMsgType: SelectFieldState<'markdown' | 'text'>
  telegramEnabled: BoolFieldState
  telegramToken: TextFieldState
  telegramChatId: TextFieldState
  telegramParseMode: SelectFieldState<'HTML' | 'MarkdownV2' | 'text'>
  notifyOnCompleted: BoolFieldState
  notifyOnPaused: BoolFieldState
  notifyOnFailed: BoolFieldState
  notifyOnAuthorization: BoolFieldState
  notifyOnConfirmation: BoolFieldState
  titlePrefix: TextFieldState
}

/** The actions the card's slot entry injects. */
export interface NotifyCardActions {
  editText: (field: string, text: string) => void
  toggle: (field: string, value: boolean) => void
  pick: (field: string, value: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}

/** The registration-side face the notify card's slot entry injects. */
export interface NotifyCardFace extends NotifyCardActions {
  hooks: {
    notifyCard: NotifyCardState
  }
}

/** A staged edit pending a save. */
type Staged =
  | { kind: 'text'; text: string }
  | { kind: 'value'; value: unknown }
  | { kind: 'clear' }

/** Booleans this card renders as toggles. */
const BOOL_FIELDS = [
  'enabled', 'systemEnabled', 'systemSound', 'webhookEnabled', 'wecomEnabled',
  'telegramEnabled', 'notifyOnCompleted', 'notifyOnPaused', 'notifyOnFailed',
  'notifyOnAuthorization', 'notifyOnConfirmation',
] as const

/** Free-text fields rendered as inputs. */
const TEXT_FIELDS = [
  'systemSoundName', 'webhookUrl', 'wecomWebhookUrl', 'telegramBotToken',
  'telegramChatId', 'titlePrefix',
] as const

/** Enum select fields. */
const SELECT_FIELDS: Record<string, readonly string[]> = {
  wecomMsgType: ['markdown', 'text'],
  telegramParseMode: ['HTML', 'MarkdownV2', 'text'],
}

/** Field names the notify card can edit. */
type FieldName = typeof BOOL_FIELDS[number] | typeof TEXT_FIELDS[number] | keyof typeof SELECT_FIELDS

const VALUE_FIELD = /^(systemSoundName|webhookUrl|wecomWebhookUrl|telegramBotToken|telegramChatId|titlePrefix)$/

/** Read the effective scalar for a field (default applied). */
function effective(scope: SettingsScope<NotifyNsSettings>, field: string): unknown {
  const value = scope.getSnapshot().value
  const raw = (value as Record<string, unknown> | undefined)?.[field]
  if (raw !== undefined) return raw
  // The namespace schema's defaults already ride the value once the scope is
  // 'ready'; the fallbacks below only cover a schema that omits a default.
  const fallback = BOOL_DEFAULTS[field]
  return fallback
}

const BOOL_DEFAULTS: Record<string, boolean> = {
  enabled: true,
  systemEnabled: true,
  systemSound: true,
  webhookEnabled: false,
  wecomEnabled: false,
  telegramEnabled: false,
  notifyOnCompleted: true,
  notifyOnPaused: true,
  notifyOnFailed: true,
  notifyOnAuthorization: true,
  notifyOnConfirmation: true,
}

const TEXT_DEFAULTS: Record<string, string> = {
  systemSoundName: '',
  webhookUrl: '',
  wecomWebhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
  titlePrefix: '',
}

const SELECT_DEFAULTS: Record<string, string> = {
  wecomMsgType: 'markdown',
  telegramParseMode: 'HTML',
}

/** Whether the user layer currently carries a value for a field. */
function overridden(scope: SettingsScope<NotifyNsSettings>, field: string): boolean {
  const user = scope.getSnapshot().user
  return user !== undefined && Object.hasOwn(user, field)
}

/** The notify card's staged form over its namespace scope. */
export class NotifyCardController {
  private readonly staged = new Map<string, Staged>()
  private readonly listeners = new Set<() => void>()
  private saving = false
  private failed = false

  /** @param scope - the bound `notify` namespace scope (host-injected). */
  constructor(private readonly scope: SettingsScope<NotifyNsSettings>) {
    scope.subscribe(() => this.publish())
  }

  /** @returns the current card snapshot. */
  getSnapshot(): NotifyCardState {
    const scope = this.scope
    const snapshot = scope.getSnapshot()
    const shell: NotifyCardShell = {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.plan().length > 0,
      invalid: this.plan().some(item => item.run === undefined),
      saving: this.saving,
      failed: this.failed,
    }
    return {
      ...shell,
      enabled: this.bool('enabled'),
      systemEnabled: this.bool('systemEnabled'),
      systemSound: this.bool('systemSound'),
      systemSoundName: this.text('systemSoundName'),
      webhookEnabled: this.bool('webhookEnabled'),
      webhookUrl: this.text('webhookUrl'),
      wecomEnabled: this.bool('wecomEnabled'),
      wecomWebhookUrl: this.text('wecomWebhookUrl'),
      wecomMsgType: this.select('wecomMsgType'),
      telegramEnabled: this.bool('telegramEnabled'),
      telegramToken: this.text('telegramBotToken'),
      telegramChatId: this.text('telegramChatId'),
      telegramParseMode: this.select('telegramParseMode'),
      notifyOnCompleted: this.bool('notifyOnCompleted'),
      notifyOnPaused: this.bool('notifyOnPaused'),
      notifyOnFailed: this.bool('notifyOnFailed'),
      notifyOnAuthorization: this.bool('notifyOnAuthorization'),
      notifyOnConfirmation: this.bool('notifyOnConfirmation'),
      titlePrefix: this.text('titlePrefix'),
    }
  }

  /** Subscribe to card snapshot changes. @returns a disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Build the actions the card's slot entry injects. */
  actions(): NotifyCardActions {
    return {
      editText: (field, text) => this.stage(field, { kind: 'text', text }),
      toggle: (field, value) => this.stageValue(field, value),
      pick: (field, value) => this.stageValue(field, value),
      resetField: (field) => {
        // Reset is a clear, never a write of the base value: the field
        // re-inherits the composition (base) layer, leaving no user override.
        this.stage(field, { kind: 'clear' })
      },
      save: () => { void this.save() },
      discard: () => { this.discard() },
    }
  }

  private bool(field: string): BoolFieldState {
    return { value: Boolean(effective(this.scope, field)), overridden: overridden(this.scope, field) }
  }

  private text(field: string): TextFieldState {
    const staged = this.staged.get(field)
    if (staged === undefined) {
      return { text: String(effective(this.scope, field) ?? TEXT_DEFAULTS[field] ?? ''), overridden: overridden(this.scope, field) }
    }
    if (staged.kind === 'clear') return { text: String(this.baseValue(field) ?? TEXT_DEFAULTS[field] ?? ''), overridden: false }
    return { text: staged.kind === 'text' ? staged.text : String(staged.value ?? ''), overridden: true }
  }

  private select(field: 'wecomMsgType'): SelectFieldState<'markdown' | 'text'>
  private select(field: 'telegramParseMode'): SelectFieldState<'HTML' | 'MarkdownV2' | 'text'>
  private select(field: string): SelectFieldState<string> {
    const staged = this.staged.get(field)
    if (staged !== undefined && staged.kind === 'value') {
      return { value: String(staged.value), overridden: true } as SelectFieldState<never>
    }
    return {
      value: String(effective(this.scope, field) ?? SELECT_DEFAULTS[field] ?? (SELECT_FIELDS[field]?.[0] ?? '')),
      overridden: overridden(this.scope, field),
    } as SelectFieldState<never>
  }

  private stageValue(field: string, value: unknown): void {
    this.stage(field, { kind: 'value', value })
  }

  private stage(field: string, edit: Staged): void {
    this.staged.set(field, edit)
    this.failed = false
    this.publish()
  }

  private discard(): void {
    if (this.staged.size === 0 && !this.failed) return
    this.staged.clear()
    this.failed = false
    this.publish()
  }

  private async save(): Promise<void> {
    const plan = this.plan()
    if (plan.length === 0 || this.saving || plan.some(item => item.run === undefined)) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const item of plan) {
      landed = await item.run!() && landed
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  /** Every staged edit a save would write, in the order they were staged. */
  private plan(): Array<{ run: (() => Promise<boolean>) | undefined }> {
    const plan: Array<{ run: (() => Promise<boolean>) | undefined }> = []
    for (const [field, staged] of this.staged) {
      if (staged.kind === 'clear') {
        plan.push({ run: overridden(this.scope, field) ? () => this.clear(field) : undefined })
      } else if (staged.kind === 'text') {
        if (staged.text === String(this.effectiveText(field))) continue
        // A text field's empty draft clears it (re-inherit the composition layer).
        const trimmed = staged.text.trim()
        if (trimmed === '' && VALUE_FIELD.test(field)) {
          plan.push({ run: overridden(this.scope, field) ? () => this.clear(field) : undefined })
        } else {
          const value = typeof staged.text === 'string' ? staged.text : String(staged.text)
          plan.push({ run: () => this.set(field, value) })
        }
      } else {
        // A staged enum value equal to the effective one is a no-op; otherwise write it.
        if (staged.value === effective(this.scope, field)) continue
        plan.push({ run: () => this.set(field, staged.value) })
      }
    }
    return plan
  }

  private effectiveText(field: string): string {
    return String(effective(this.scope, field) ?? TEXT_DEFAULTS[field] ?? '')
  }

  private async set(field: string, value: unknown): Promise<boolean> {
    await this.scope.set(field, value)
    const user = this.scope.getSnapshot().user
    return user !== undefined && user[field as keyof NotifyNsSettings] === value
  }

  private async clear(field: string): Promise<boolean> {
    await this.scope.unset(field)
    return !overridden(this.scope, field)
  }

  private baseValue(field: string): unknown {
    const base = this.scope.getSnapshot().base
    return (base as Record<string, unknown> | undefined)?.[field]
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}

/** Narrow export: the field names the card can edit, for the component. */
export type NotifyCardField = FieldName
