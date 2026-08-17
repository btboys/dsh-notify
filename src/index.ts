import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from './service.js'
import { NotifyPluginConfig } from './types.js'
import { configToSettings, installNotifySettings } from './settings.js'
import { installNotifyRpc, NOTIFY_RPC_CHANNEL } from './notify-rpc.js'
import { loadPersistedConfig, mergePersisted, persistConfig } from './persist.js'

/**
 * DSH Notify Plugin
 *
 * Provides notification capabilities for DeepSeek Harness, supporting:
 * - System notifications (desktop)
 * - Webhook notifications (HTTP POST)
 * - WeCom bot notifications (Enterprise WeChat)
 * - Telegram bot notifications
 *
 * Triggers on:
 * - Conversation completion
 * - Conversation pause
 * - Conversation failure
 * - Authorization requests
 * - Confirmation requests
 */

/**
 * Host services this plugin depends on. Cordis resolves ONLY the services a
 * plugin declares here: `ctx.get(name)` / `ctx.connection` return undefined for
 * anything absent from the fiber's inject set, even when the service exists in
 * a parent scope. Declaring `connection` + `webServer` (exactly the pair
 * dsh-pocket uses for its RPC channel) guarantees the /dsh-notify RPC channel
 * can be mounted. `settings` is deliberately NOT declared: it is not a Cordis
 * host service, so declaring it would block activation while Cordis waits.
 */
export const inject = ['connection', 'webServer']

/** Require a host service, or null when Cordis has not provided it. */
function serviceOf(ctx: Context, name: string): unknown {
  try {
    return ctx.get(name)
  } catch {
    return null
  }
}

export default function notifyPlugin(ctx: Context, config?: NotifyPluginConfig) {
  // The Web settings page edits configuration through the /dsh-notify RPC
  // channel. Persisted edits (from a previous run) win over the patch config.
  const persisted = loadPersistedConfig()
  const effective = mergePersisted(config || {}, persisted)
  const service = new NotifyService(ctx, effective)

  // Expose the settings (read/write) channel to the browser so the "通知"
  // settings page can view and edit the configuration. `connection` is declared
  // via `inject`, so `ctx.get('connection').rpc` resolves here.
  const connection = serviceOf(ctx, 'connection') as { rpc?: { handle(...args: unknown[]): unknown } } | null
  const rpc = connection?.rpc
  const disposeRpc = installNotifyRpc(rpc, {
    read: () => service.getConfig(),
    write: (partial) => {
      service.updateConfig(partial as Partial<NotifyPluginConfig>)
      persistConfig(service.getConfig())
    },
  }, { warn: (...args) => ctx.logger.warn(...(args as [string, ...unknown[]])) })

  // Keep the legacy settings-namespace registration for consumers that read
  // the `notify` namespace through the DSH settings service.
  if (serviceOf(ctx, 'settings')) {
    try {
      installNotifySettings(ctx, configToSettings(effective), {
        apply: (next) => service.updateConfig(next),
      })
      ctx.logger.info('[notify] Settings namespace "notify" registered')
    } catch (error) {
      ctx.logger.warn('[notify] Failed to register settings namespace:', error)
    }
  }

  // Register cleanup using effect
  ctx.effect(() => {
    return async () => {
      disposeRpc()
      await service.dispose()
    }
  }, 'notify plugin cleanup')

  ctx.logger.info(`[notify] ready on RPC channel ${NOTIFY_RPC_CHANNEL}`)
  return service
}

// Cordis reads `plugin.inject` off the plugin function; attach it so the
// module-default (function) form declares its host dependencies.
// `inject` is also exported so the object form (`{ name, inject, apply }`)
// carries the same declaration.
;(notifyPlugin as unknown as { inject: string[] }).inject = inject

// Re-export types and classes for external use
export { NotifyService } from './service.js'
export * from './types.js'
export * from './adapters/base.js'
export { SystemNotificationAdapter } from './adapters/system.js'
export { WebhookNotificationAdapter } from './adapters/webhook.js'
export { WeComNotificationAdapter } from './adapters/wecom.js'
export { TelegramNotificationAdapter } from './adapters/telegram.js'
export { NOTIFY_SETTINGS_NAMESPACE, NOTIFY_SETTINGS_SCHEMA, settingsToConfig, configToSettings } from './settings.js'
export type { NotifySettings } from './settings.js'
export { NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS } from './notify-rpc.js'
