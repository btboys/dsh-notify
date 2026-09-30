import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from './service.js'
import { NotifyPluginConfig } from './types.js'
import { installNotifyRpc, NOTIFY_RPC_CHANNEL } from './notify-rpc.js'
import { loadPersistedConfig, mergePersisted, persistConfig } from './persist.js'

/**
 * DSH Notify Plugin
 *
 * Provides notification capabilities for DeepSeek Harness, supporting:
 * - System notifications (desktop)
 * - Webhook notifications (HTTP POST)
 * - WeCom bot notifications (Enterprise WeChat)
 * - WeChat ClawBot notifications (personal WeChat, Tencent iLink protocol)
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
 * Host services this plugin REQUIRES before activation — none.
 *
 * Everything the plugin touches is either optional or soft-injected:
 * `connection` + `webServer` (the `/dsh-notify` settings channel) through
 * `ctx.inject(...)` inside `installNotifyRpc`, and `sessionController` /
 * `workspaceRegistry` / `sessionQuery` / `agents` / `sessions` through
 * `ctx.get()` inside `DshInteractionHost`. Cordis `inject` declarations are
 * all-required, so listing any of them here would block activation on a
 * composition that lacks it (headless has no `webServer`), while the plugin's
 * core — notifications on `session/event` — works everywhere. Missing services
 * degrade to a warning or a clear chat message for the one feature that needs
 * them.
 */
export const inject: string[] = []

export default function notifyPlugin(ctx: Context, config?: NotifyPluginConfig) {
  // The Web settings page edits configuration through the /dsh-notify RPC
  // channel. Persisted edits (from a previous run) win over the patch config.
  const persisted = loadPersistedConfig()
  const effective = mergePersisted(config || {}, persisted)
  const service = new NotifyService(ctx, effective)

  // Wire the chat interaction bridge (approval/question answerers + session
  // continuation). It talks to the current host seams directly, so there is
  // nothing to wait for: the bridge attaches now and stays idle until an
  // interactive channel is configured. Deployments missing a host service
  // degrade to a clear chat message per command, never a failed activation.
  service.attachHost()

  // Expose the settings (read/write) channel to the browser so the "通知"
  // settings page can view and edit the configuration. The route registers
  // itself on the host web server once `connection` + `webServer` exist (see
  // notify-rpc.ts for why it is not `connection.rpc.handle()`).
  installNotifyRpc(ctx, {
    read: () => service.getConfig(),
    write: (partial) => {
      service.updateConfig(partial as Partial<NotifyPluginConfig>)
      persistConfig(service.getConfig())
    },
    wechatStatus: () => service.getWechatStatus(),
    wechatRelogin: () => service.reloginWechat(),
  }, { warn: (...args) => ctx.logger.warn(...(args as [string, ...unknown[]])) })

  // NOTE: no legacy `settings` namespace registration. Current dsh-settings
  // exposes `SettingsForms` (profile-entry configuration forms) with no
  // `register(ns, schema)` API, and the removed `installNotifySettings()` call
  // could only ever throw-and-log here. The Web page reads and writes through
  // the `/dsh-notify` RPC channel above; persisted writes live in
  // `$DSH_HOME/notify/config.json`.

  // Register cleanup using effect. The RPC route is owned by the
  // `ctx.inject(...)` child fiber inside installNotifyRpc, so cordis disposes
  // it with the plugin; only the service needs explicit teardown here.
  ctx.effect(() => {
    return async () => {
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
export { WeChatClawBotAdapter } from './adapters/wechat.js'
export type { WeChatAdapterState, WeChatAdapterStatus } from './adapters/wechat.js'
export { InteractionBridge } from './interaction.js'
export { DshInteractionHost } from './host-interaction.js'
export type {
  ApprovalOutcome,
  ApprovalRequestView,
  CreateSessionResult,
  InteractionBridgeHooks,
  InteractionHost,
  InteractionSink,
  PromptInteraction,
  PromptResult,
  QuestionAnswer,
  QuestionAnswerItem,
  QuestionItem,
  QuestionOption,
  QuestionRequestView,
  SessionSummaryLike,
  WorkspaceViewLike,
} from './interaction.js'
export { TelegramNotificationAdapter } from './adapters/telegram.js'
export { NOTIFY_SETTINGS_NAMESPACE, NOTIFY_SETTINGS_SCHEMA, settingsToConfig, configToSettings } from './settings.js'
export type { NotifySettings } from './settings.js'
export { NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS } from './notify-rpc.js'
