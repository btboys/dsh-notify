import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from './service.js'
import { NotifyPluginConfig } from './types.js'
import { configToSettings, installNotifySettings, settingsToConfig } from './settings.js'

/**
 * DSH Notify Plugin
 * 
 * Provides notification capabilities for DeepSeek Harness, supporting:
 * - System notifications (desktop)
 * - Webhook notifications (HTTP POST)
 * - WeCom bot notifications (Enterprise WeChat)
 * 
 * Triggers on:
 * - Conversation completion
 * - Conversation pause
 * - Conversation failure
 * - Authorization requests
 * - Confirmation requests
 */
export default function notifyPlugin(ctx: Context, config?: NotifyPluginConfig) {
  const service = new NotifyService(ctx, config)
  
  // Register the settings namespace so the plugin's configuration can be
  // edited from the Web "插件配置" page (host plane only).
  // NOTE: the 'notify' namespace must also be added to the apiproxy
  // WEB_SETTINGS_NAMESPACES allowlist for the Web page to serve it.
  if (ctx.get('settings')) {
    try {
      installNotifySettings(ctx, configToSettings(config || {}), {
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
      await service.dispose()
    }
  }, 'notify plugin cleanup')
  
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
