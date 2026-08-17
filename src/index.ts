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
export default function notifyPlugin(ctx: Context, config?: NotifyPluginConfig) {
  // The Web settings page edits configuration through the /dsh-notify RPC
  // channel. Persisted edits (from a previous run) win over the patch config.
  const persisted = loadPersistedConfig()
  const effective = mergePersisted(config || {}, persisted)
  const service = new NotifyService(ctx, effective)

  // Expose a read/write channel to the browser so the "通知" settings page can
  // view and edit the configuration. Requires `connection` + `webServer`.
  const rpc = (ctx.get('connection') as { rpc?: { handle(...args: unknown[]): unknown } } | undefined)?.rpc
  const disposeRpc = installNotifyRpc(rpc, {
    read: () => service.getConfig(),
    write: (partial) => {
      service.updateConfig(partial as Partial<NotifyPluginConfig>)
      persistConfig(service.getConfig())
    },
  }, { warn: (...args) => ctx.logger.warn(...(args as [string, ...unknown[]])) })

  // Keep the legacy settings-namespace registration for consumers that read
  // the `notify` namespace through the DSH settings service (harmless).
  if (ctx.get('settings')) {
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
