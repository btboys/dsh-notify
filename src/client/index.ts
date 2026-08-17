/**
 * dsh-notify-plugin browser half: registers a top-level "通知" settings page
 * (settings.section) — the same entry style dsh-pocket uses — through which the
 * user views and edits the notify configuration.
 *
 * The page talks to the host over the loopback-only /dsh-notify RPC channel
 * (ctx.connection.rpc.call) rather than the settings scope, so it needs no
 * `@deepseek-ai/dsh-client-*` runtime dependency beyond what the DSH host
 * injects. See src/notify-rpc.ts for the host side.
 *
 * Built by tsdown into the DSH window.__ModuleLoader__.load closure-factory
 * bundle at client/client.js.
 */

import { NotifySettings } from './NotifySettings.tsx'
import { en, zh } from './locales.ts'
import type { NotifyRpcCall } from './rpc.ts'

/** Dictionary namespace owned by this settings page. */
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
  connection: {
    rpc: { call: NotifyRpcCall }
  }
}

export const name = 'dsh-notify-plugin'

/** Required services this page injects (host-provided cordis services). */
export const inject = ['slots', 'connection', 'locale']

/** Mount the notify settings page into the Settings sidebar. */
export function apply(ctx: NotifyClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'notify: settings dictionaries')
  const t = ctx.locale.bind(NS)

  // Normalize the connection.rpc result to the shape the page consumes.
  const rpcCall: NotifyRpcCall = (channel, endpoint, payload, signal) => {
    return ctx.connection.rpc.call(channel, endpoint, payload, signal).then((result) => ({
      ok: Boolean(result?.ok),
      value: result && result.ok ? (result as { value?: unknown }).value : undefined,
      error: (result && !result.ok ? (result as { error?: { message?: string } } | undefined)?.error : undefined),
    }))
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'notify',
    order: 60,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ rpcCall }),
  }, NotifySettings))
}
