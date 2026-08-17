/**
 * The notify plugin's configuration card in the Settings → 插件配置 section.
 *
 * Self-contained: depends only on react and the DSH browser primitives
 * (icons, host-injected externals). It mirrors the shape of DSH's own plugin
 * cards (a disclosing header with an "unsaved" marker, staged controls with
 * override/reset badges, and a single Save that writes every draft) but ships
 * its own chrome and form so it needs no DSH-internal package.
 */

import { useState, type JSX } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NotifyCardFace, NotifyCardState } from './controller.ts'
import css from './NotifyCard.module.css'

/** Props the slot renderer binds: locale copy + injected notify card face. */
export type NotifyCardProps = NotifyCardFace & {
  t: (key: string) => string
  useNotifyCard: (selector: (state: NotifyCardState) => NotifyCardState) => NotifyCardState
}

/** One boolean toggle row. */
function ToggleRow(props: {
  t: (key: string) => string
  field: string
  labelKey: string
  hintKey: string
  state: { value: boolean; overridden: boolean }
  disabled: boolean
  onToggle: (value: boolean) => void
  onReset: () => void
}): JSX.Element {
  const { t } = props
  return (
    <div className={css.field}>
      <div className={css.fieldHead}>
        <label className={css.label} htmlFor={`notify-${props.field}`}>{t(props.labelKey)}</label>
        <span className={css.badges}>
          {props.state.overridden ? (
            <>
              <span className={css.badge}>{t('overridden')}</span>
              <button type="button" className={css.reset} disabled={props.disabled} onClick={props.onReset}>{t('reset')}</button>
            </>
          ) : null}
        </span>
      </div>
      <div className={css.toggle}>
        <input
          id={`notify-${props.field}`}
          className={css.toggleInput}
          type="checkbox"
          checked={props.state.value}
          disabled={props.disabled}
          onChange={(event) => { props.onToggle(event.target.checked) }}
        />
        <span className={css.toggleTrack} />
        <span className={css.toggleThumb} />
      </div>
      <p className={css.hint}>{t(props.hintKey)}</p>
    </div>
  )
}

/** One text field row. */
function TextFieldRow(props: {
  t: (key: string) => string
  field: string
  labelKey: string
  hintKey: string
  placeholder?: string
  state: { text: string; overridden: boolean }
  disabled: boolean
  onEdit: (text: string) => void
  onReset: () => void
}): JSX.Element {
  const { t } = props
  return (
    <div className={css.field}>
      <div className={css.fieldHead}>
        <label className={css.label} htmlFor={`notify-${props.field}`}>{t(props.labelKey)}</label>
        {props.state.overridden ? (
          <span className={css.badges}>
            <span className={css.badge}>{t('overridden')}</span>
            <button type="button" className={css.reset} disabled={props.disabled} onClick={props.onReset}>{t('reset')}</button>
          </span>
        ) : null}
      </div>
      <input
        id={`notify-${props.field}`}
        className={css.input}
        type="text"
        value={props.state.text}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled}
        spellCheck={false}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <p className={css.hint}>{t(props.hintKey)}</p>
    </div>
  )
}

/** One enum select row. */
function SelectRow(props: {
  t: (key: string) => string
  field: string
  labelKey: string
  hintKey: string
  options: readonly string[]
  state: { value: string; overridden: boolean }
  disabled: boolean
  onPick: (value: string) => void
  onReset: () => void
}): JSX.Element {
  const { t } = props
  return (
    <div className={css.field}>
      <div className={css.fieldHead}>
        <label className={css.label}>{t(props.labelKey)}</label>
        {props.state.overridden ? (
          <span className={css.badges}>
            <span className={css.badge}>{t('overridden')}</span>
            <button type="button" className={css.reset} disabled={props.disabled} onClick={props.onReset}>{t('reset')}</button>
          </span>
        ) : null}
      </div>
      <div className={css.select} role="radiogroup" aria-label={t(props.labelKey)}>
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className={css.selectOption}
            data-active={props.state.value === option ? '' : undefined}
            disabled={props.disabled}
            aria-checked={props.state.value === option}
            role="radio"
            onClick={() => { props.onPick(option) }}
          >
            {option}
          </button>
        ))}
      </div>
      <p className={css.hint}>{t(props.hintKey)}</p>
    </div>
  )
}

/** Render the notify configuration card. */
export function NotifyCard(props: NotifyCardProps): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const state = props.useNotifyCard(snapshot => snapshot)
  const { t } = props
  if (!state.available) return null
  const blocked = !state.dirty || state.invalid || state.saving
  const disabled = !state.writable || state.saving

  return (
    <li className={css.card} data-open={open ? '' : undefined}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('notifyTitle')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('notifyTitle')}</span>
          <span className={css.description}>{t('notifyDescription')}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? css.chevronOpen : css.chevron} />
      </button>
      {open ? (
        <div className={css.body}>
          {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('notifyEnabled')}</p>
            <ToggleRow t={t} field="enabled" labelKey="notifyEnabled" hintKey="notifyEnabledHint"
              state={state.enabled} disabled={disabled}
              onToggle={(v) => props.toggle('enabled', v)}
              onReset={() => props.resetField('enabled')} />
          </div>

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('systemEnabled')}</p>
            <ToggleRow t={t} field="systemEnabled" labelKey="systemEnabled" hintKey="systemEnabledHint"
              state={state.systemEnabled} disabled={disabled || !state.enabled.value}
              onToggle={(v) => props.toggle('systemEnabled', v)}
              onReset={() => props.resetField('systemEnabled')} />
            <ToggleRow t={t} field="systemSound" labelKey="systemSound" hintKey="systemSoundHint"
              state={state.systemSound} disabled={disabled || !state.systemEnabled.value}
              onToggle={(v) => props.toggle('systemSound', v)}
              onReset={() => props.resetField('systemSound')} />
            <TextFieldRow t={t} field="systemSoundName" labelKey="systemSoundName" hintKey="systemSoundNameHint"
              placeholder="Glass" state={state.systemSoundName} disabled={disabled}
              onEdit={(v) => props.editText('systemSoundName', v)}
              onReset={() => props.resetField('systemSoundName')} />
          </div>

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('webhookEnabled')}</p>
            <ToggleRow t={t} field="webhookEnabled" labelKey="webhookEnabled" hintKey="webhookEnabledHint"
              state={state.webhookEnabled} disabled={disabled}
              onToggle={(v) => props.toggle('webhookEnabled', v)}
              onReset={() => props.resetField('webhookEnabled')} />
            <TextFieldRow t={t} field="webhookUrl" labelKey="webhookUrl" hintKey="webhookUrlHint"
              placeholder="https://example.com/notify" state={state.webhookUrl} disabled={disabled}
              onEdit={(v) => props.editText('webhookUrl', v)}
              onReset={() => props.resetField('webhookUrl')} />
          </div>

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('wecomEnabled')}</p>
            <ToggleRow t={t} field="wecomEnabled" labelKey="wecomEnabled" hintKey="wecomEnabledHint"
              state={state.wecomEnabled} disabled={disabled}
              onToggle={(v) => props.toggle('wecomEnabled', v)}
              onReset={() => props.resetField('wecomEnabled')} />
            <TextFieldRow t={t} field="wecomWebhookUrl" labelKey="wecomWebhookUrl" hintKey="wecomWebhookUrlHint"
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
              state={state.wecomWebhookUrl} disabled={disabled}
              onEdit={(v) => props.editText('wecomWebhookUrl', v)}
              onReset={() => props.resetField('wecomWebhookUrl')} />
            <SelectRow t={t} field="wecomMsgType" labelKey="wecomMsgType" hintKey="wecomMsgType"
              options={['markdown', 'text']} state={state.wecomMsgType} disabled={disabled}
              onPick={(v) => props.pick('wecomMsgType', v)}
              onReset={() => props.resetField('wecomMsgType')} />
          </div>

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('telegramEnabled')}</p>
            <ToggleRow t={t} field="telegramEnabled" labelKey="telegramEnabled" hintKey="telegramEnabledHint"
              state={state.telegramEnabled} disabled={disabled}
              onToggle={(v) => props.toggle('telegramEnabled', v)}
              onReset={() => props.resetField('telegramEnabled')} />
            <TextFieldRow t={t} field="telegramToken" labelKey="telegramToken" hintKey="telegramTokenHint"
              placeholder="123456:ABC-DEF…" state={state.telegramToken} disabled={disabled}
              onEdit={(v) => props.editText('telegramBotToken', v)}
              onReset={() => props.resetField('telegramBotToken')} />
            <TextFieldRow t={t} field="telegramChatId" labelKey="telegramChatId" hintKey="telegramChatIdHint"
              placeholder="123456789" state={state.telegramChatId} disabled={disabled}
              onEdit={(v) => props.editText('telegramChatId', v)}
              onReset={() => props.resetField('telegramChatId')} />
            <SelectRow t={t} field="telegramParseMode" labelKey="telegramParseMode" hintKey="telegramParseMode"
              options={['HTML', 'MarkdownV2', 'text']} state={state.telegramParseMode} disabled={disabled}
              onPick={(v) => props.pick('telegramParseMode', v)}
              onReset={() => props.resetField('telegramParseMode')} />
          </div>

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('notifyOnCompleted')}</p>
            {(['notifyOnCompleted', 'notifyOnPaused', 'notifyOnFailed', 'notifyOnAuthorization', 'notifyOnConfirmation'] as const).map((key) => (
              <ToggleRow key={key} t={t} field={key} labelKey={key} hintKey={`${key}Hint`}
                state={state[key]} disabled={disabled}
                onToggle={(v) => props.toggle(key, v)}
                onReset={() => props.resetField(key)} />
            ))}
          </div>

          <div className={css.section}>
            <p className={css.sectionTitle}>{t('titlePrefix')}</p>
            <TextFieldRow t={t} field="titlePrefix" labelKey="titlePrefix" hintKey="titlePrefixHint"
              placeholder="[MyApp]" state={state.titlePrefix} disabled={disabled}
              onEdit={(v) => props.editText('titlePrefix', v)}
              onReset={() => props.resetField('titlePrefix')} />
          </div>

          <div className={css.footer}>
            {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
            <button type="button" className={css.discard} disabled={!state.dirty || state.saving} onClick={props.discard}>
              {t('discard')}
            </button>
            <button type="button" className={css.save} disabled={blocked} onClick={props.save}>
              {t(state.saving ? 'saving' : 'save')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
