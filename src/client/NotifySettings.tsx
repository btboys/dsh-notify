/**
 * The "通知" settings page — a top-level Settings sidebar entry that lets the
 * user configure notify channels and event filters. Data is read/written over
 * the host's /dsh-notify RPC channel; edits are staged locally and committed as
 * one config write on Save, and the host persists them for the next start.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import type { NotifyRpcCall, NotifyRpcConfig } from './rpc.ts'
import { NOTIFY_ENDPOINTS, NOTIFY_RPC_CHANNEL } from './rpc.ts'
import css from './NotifySettings.module.css'

/** Props the settings.section renderer binds (inject face + locale copy). */
export interface NotifySettingsProps {
  rpcCall: NotifyRpcCall
  t: (key: string) => string
}

/** Load status of the page. */
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

/**
 * Recursively set a path like `channels.system.sound` in a shallow copy.
 * @param obj - source object.
 * @param path - dot path to the leaf.
 * @param value - leaf value.
 * @returns a new object with the leaf replaced.
 */
function setAt(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.')
  const head = parts[0]
  if (parts.length === 1) return { ...obj, [head]: value }
  const next = (obj[head] as Record<string, unknown> | undefined) ?? {}
  return { ...obj, [head]: setAt(next, parts.slice(1).join('.'), value) }
}

/** Read a value at a dot path. */
function getAt(obj: Record<string, unknown> | undefined, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj)
}

/** Default config the page shows before the first load lands. */
const DEFAULTS: NotifyRpcConfig = {
  enabled: true,
  channels: {
    system: { enabled: true, sound: true, soundName: '' },
    webhook: { enabled: false, url: '' },
    wecom: { enabled: false, webhookUrl: '', msgType: 'markdown' },
    telegram: { enabled: false, botToken: '', chatId: '', parseMode: 'HTML' },
  },
  events: {
    conversationCompleted: true,
    conversationPaused: true,
    conversationFailed: true,
    authorizationRequired: true,
    confirmationRequired: true,
  },
  titlePrefix: '',
}

/** One labelled toggle row. */
function ToggleRow(props: {
  t: (key: string) => string
  labelKey: string
  hintKey: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}): JSX.Element {
  const { t } = props
  return (
    <div className={css.field}>
      <div className={css.fieldHead}>
        <label className={css.label} htmlFor={`notify-${props.labelKey}`}>{t(props.labelKey)}</label>
        <span className={css.toggle}>
          <input
            id={`notify-${props.labelKey}`}
            className={css.toggleInput}
            type="checkbox"
            checked={props.checked}
            disabled={props.disabled === true}
            onChange={(event) => { props.onChange(event.target.checked) }}
          />
          <span className={css.toggleTrack} />
          <span className={css.toggleThumb} />
        </span>
      </div>
      <p className={css.hint}>{t(props.hintKey)}</p>
    </div>
  )
}

/** One text input row. */
function TextRow(props: {
  t: (key: string) => string
  labelKey: string
  hintKey: string
  placeholder?: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}): JSX.Element {
  const { t } = props
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={`notify-${props.labelKey}`}>{t(props.labelKey)}</label>
      <input
        id={`notify-${props.labelKey}`}
        className={css.input}
        type="text"
        value={props.value}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled === true}
        spellCheck={false}
        onChange={(event) => { props.onChange(event.target.value) }}
      />
      <p className={css.hint}>{t(props.hintKey)}</p>
    </div>
  )
}

/** A segmented enum select (markdown/text, HTML/MarkdownV2/text). */
function SelectRow(props: {
  t: (key: string) => string
  labelKey: string
  options: readonly string[]
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}): JSX.Element {
  const { t } = props
  return (
    <div className={css.field}>
      <label className={css.label}>{t(props.labelKey)}</label>
      <div className={css.select} role="radiogroup" aria-label={t(props.labelKey)}>
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className={css.selectOption}
            data-active={props.value === option ? '' : undefined}
            disabled={props.disabled === true}
            role="radio"
            aria-checked={props.value === option}
            onClick={() => { props.onChange(option) }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The full notify configuration page. */
export function NotifySettings(props: NotifySettingsProps): JSX.Element | null {
  const { t } = props
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [config, setConfig] = useState<NotifyRpcConfig>(DEFAULTS)
  const [draft, setDraft] = useState<NotifyRpcConfig>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(draft), [config, draft])

  const fetchConfig = async (): Promise<void> => {
    const res = await props.rpcCall(NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS.configGet, {})
    if (res.ok && res.value && typeof res.value === 'object') {
      setConfig(res.value as NotifyRpcConfig)
      setDraft(res.value as NotifyRpcConfig)
      setLoad({ status: 'ready' })
    } else if (!res.ok) {
      setLoad({ status: 'error', message: res.error?.message ?? 'failed to load config' })
    } else {
      setLoad({ status: 'error', message: 'config not available' })
    }
  }

  useEffect(() => { void fetchConfig() }, [])

  const setField = (path: string, value: unknown): void => {
    setDraft((d) => setAt({ ...d } as Record<string, unknown>, path, value) as NotifyRpcConfig)
    setSaveError(null)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    const res = await props.rpcCall(NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS.configSet, draft)
    if (res.ok) {
      // Re-seed from what the host accepted.
      const next = res.value ?? draft
      setConfig(next as NotifyRpcConfig)
      setDraft(next as NotifyRpcConfig)
    } else {
      setSaveError(res.error?.message ?? 'save failed')
    }
    setSaving(false)
  }

  const startOver = (): void => {
    setDraft(config)
    setSaveError(null)
  }

  const c = (path: string): unknown => getAt(draft as Record<string, unknown>, path)
  const cd = (path: string, fallback: boolean): boolean => {
    const v = c(path)
    return typeof v === 'boolean' ? v : fallback
  }
  const cs = (path: string, fallback = ''): string => {
    const v = c(path)
    return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : fallback)
  }
  const enabled = (): boolean => cd('enabled', true)

  if (load.status === 'loading') return <div className={css.page}><p className={css.status}>{t('loading')}</p></div>
  if (load.status === 'error') return <div className={css.page}><p className={css.status} role="alert">{t('loadError')}: {load.message}</p></div>

  const sysOn = cd('channels.system.enabled', true)
  const webhookOn = cd('channels.webhook.enabled', false)
  const wecomOn = cd('channels.wecom.enabled', false)
  const telegramOn = cd('channels.telegram.enabled', false)

  return (
    <div className={css.page}>
      <p className={css.pageHint}>{t('pageHint')}</p>

      <section className={css.section} aria-label={t('notify')}>
        <h3 className={css.sectionTitle}>{t('notifyTitle')}</h3>
        <ToggleRow t={t} labelKey="enabled" hintKey="enabledHint" checked={enabled()} onChange={(v) => setField('enabled', v)} />
      </section>

      <section className={css.section} aria-label={t('channelsSystem')}>
        <h3 className={css.sectionTitle}>{t('channelsSystem')}</h3>
        <ToggleRow t={t} labelKey="systemEnabled" hintKey="systemEnabledHint" checked={sysOn}
          disabled={!enabled()} onChange={(v) => setField('channels.system.enabled', v)} />
        <ToggleRow t={t} labelKey="systemSound" hintKey="systemSoundHint" checked={cd('channels.system.sound', true)}
          disabled={!enabled() || !sysOn} onChange={(v) => setField('channels.system.sound', v)} />
        <TextRow t={t} labelKey="systemSoundName" hintKey="systemSoundNameHint" placeholder="Glass"
          value={cs('channels.system.soundName')} disabled={!enabled()}
          onChange={(v) => setField('channels.system.soundName', v)} />
      </section>

      <section className={css.section} aria-label={t('channelsWebhook')}>
        <h3 className={css.sectionTitle}>{t('channelsWebhook')}</h3>
        <ToggleRow t={t} labelKey="webhookEnabled" hintKey="webhookEnabledHint" checked={webhookOn}
          disabled={!enabled()} onChange={(v) => setField('channels.webhook.enabled', v)} />
        <TextRow t={t} labelKey="webhookUrl" hintKey="webhookUrlHint" placeholder="https://example.com/notify"
          value={cs('channels.webhook.url')} disabled={!enabled()}
          onChange={(v) => setField('channels.webhook.url', v)} />
      </section>

      <section className={css.section} aria-label={t('channelsWecom')}>
        <h3 className={css.sectionTitle}>{t('channelsWecom')}</h3>
        <ToggleRow t={t} labelKey="wecomEnabled" hintKey="wecomEnabledHint" checked={wecomOn}
          disabled={!enabled()} onChange={(v) => setField('channels.wecom.enabled', v)} />
        <TextRow t={t} labelKey="wecomWebhookUrl" hintKey="wecomWebhookUrlHint" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
          value={cs('channels.wecom.webhookUrl')} disabled={!enabled()} 
          onChange={(v) => setField('channels.wecom.webhookUrl', v)} />
        <SelectRow t={t} labelKey="wecomMsgType" options={['markdown', 'text']} value={cs('channels.wecom.msgType', 'markdown')}
          disabled={!enabled() || !wecomOn} onChange={(v) => setField('channels.wecom.msgType', v)} />
      </section>

      <section className={css.section} aria-label={t('channelsTelegram')}>
        <h3 className={css.sectionTitle}>{t('channelsTelegram')}</h3>
        <ToggleRow t={t} labelKey="telegramEnabled" hintKey="telegramEnabledHint" checked={telegramOn}
          disabled={!enabled()} onChange={(v) => setField('channels.telegram.enabled', v)} />
        <TextRow t={t} labelKey="telegramToken" hintKey="telegramTokenHint" placeholder="123456:ABC-DEF…"
          value={cs('channels.telegram.botToken')} disabled={!enabled() || !telegramOn}
          onChange={(v) => setField('channels.telegram.botToken', v)} />
        <TextRow t={t} labelKey="telegramChatId" hintKey="telegramChatIdHint" placeholder="123456789"
          value={cs('channels.telegram.chatId')} disabled={!enabled() || !telegramOn}
          onChange={(v) => setField('channels.telegram.chatId', v)} />
        <SelectRow t={t} labelKey="telegramParseMode" options={['HTML', 'MarkdownV2', 'text']} value={cs('channels.telegram.parseMode', 'HTML')}
          disabled={!enabled() || !telegramOn} onChange={(v) => setField('channels.telegram.parseMode', v)} />
      </section>

      <section className={css.section} aria-label={t('eventsTitle')}>
        <h3 className={css.sectionTitle}>{t('eventsTitle')}</h3>
        {(['conversationCompleted', 'conversationPaused', 'conversationFailed', 'authorizationRequired', 'confirmationRequired'] as const).map((key) => (
          <ToggleRow key={key} t={t} labelKey={key} hintKey={`${key}Hint`} checked={cd(`events.${key}`, true)}
            disabled={!enabled()} onChange={(v) => setField(`events.${key}`, v)} />
        ))}
      </section>

      <section className={css.section} aria-label={t('titlePrefix')}>
        <h3 className={css.sectionTitle}>{t('titlePrefix')}</h3>
        <TextRow t={t} labelKey="titlePrefix" hintKey="titlePrefixHint" placeholder="[MyApp]"
          value={cs('titlePrefix')} disabled={!enabled()}
          onChange={(v) => setField('titlePrefix', v)} />
      </section>

      <div className={css.footer}>
        {saveError ? <p className={css.failed} role="alert">{t('saveFailed')}: {saveError}</p> : null}
        <button type="button" className={css.discard} disabled={!dirty || saving} onClick={startOver}>{t('discard')}</button>
        <button type="button" className={css.save} disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}
