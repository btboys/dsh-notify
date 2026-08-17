/**
 * dsh-notify-plugin browser half: registers the notify configuration card into
 * DSH's Settings → 插件配置 section (`settings.plugin.item` slot).
 *
 * The entry is built by tsdown into the DSH `window.__ModuleLoader__.load`
 * closure-factory bundle at client/client.js. It departs from the DSH-internal
 * card pattern only in that it types the injected `settingsScope` service
 * structurally (scope.ts) rather than importing `dsh-client-ui-settings` /
 * `dsh-client-runtime`, whose published packages are not installable outside
 * the DSH monorepo. The host in practice already serves the `notify` namespace
 * (it lists it in its WEB_SETTINGS_NAMESPACES allowlist) and injects the
 * `settingsScope` service because this entry declares it in `dsh.client.inject`.
 */

import { NotifyCardController } from './controller.ts'
import { NotifyCard } from './NotifyCard.tsx'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this card. */
const NS = 'settings.notify'

/** The browser cordis context surface this entry touches (structural). */
interface NotifyClientContext {
  effect(callback: () => unknown, label?: string): void
  locale: {
    register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): unknown
    bind(namespace: string): (key: string) => string
  }
  slots: {
    inject(slot: string, register: () => unknown): void
    register(meta: Record<string, unknown>, component: unknown): unknown
  }
  settingsScope: {
    bind(spec: { namespace: string }): import('./scope.ts').SettingsScope<import('./scope.ts').NotifyNsSettings>
  }
}

/** The settings namespace this card edits. */
export const NAMESPACE = 'notify'

export const name = 'dsh-notify-plugin'

/** Required services this card injects (host-provided cordis services). */
export const inject = ['slots', 'locale', 'settingsScope']

/** Mount the notify card into the plugin configuration section. */
export function apply(ctx: NotifyClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'notify: card dictionaries')
  const t = ctx.locale.bind(NS)

  const controller = new NotifyCardController(ctx.settingsScope.bind({ namespace: NAMESPACE }))

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'notify',
    order: 30,
    label: () => t('notifyTitle'),
    inject: () => ({
      hooks: {
        notifyCard: {
          getSnapshot: () => controller.getSnapshot(),
          subscribe: (listener: () => void) => controller.subscribe(listener),
        },
      },
      // Spread the actions onto the card's props.
      ...controller.actions(),
    }),
  }, NotifyCard))
}
