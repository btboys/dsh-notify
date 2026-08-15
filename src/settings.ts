import { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { NotifyPluginConfig } from './types.js'

/**
 * Settings namespace for the notify plugin.
 * This must be added to the apiproxy `WEB_SETTINGS_NAMESPACES` allowlist
 * to appear in the Web "插件配置" (Plugin Configuration) page.
 */
export const NOTIFY_SETTINGS_NAMESPACE = settingsNamespace('notify')

/**
 * The notify fields a user owns through the Web settings page.
 * A strict subset of {@link NotifyPluginConfig}: only the values that make
 * sense to edit from the browser UI.
 */
export interface NotifySettings {
  /** Enable/disable the entire plugin. */
  enabled: boolean
  /** Enable desktop system notifications. */
  systemEnabled: boolean
  /** Play sound with system notifications. */
  systemSound: boolean
  /** macOS system sound name (e.g. Glass, Ping, Sosumi, Basso). */
  systemSoundName: string
  /** Enable webhook notifications. */
  webhookEnabled: boolean
  /** Webhook URL. */
  webhookUrl: string
  /** Enable WeCom (Enterprise WeChat) bot notifications. */
  wecomEnabled: boolean
  /** WeCom webhook URL. */
  wecomWebhookUrl: string
  /** WeCom message type: markdown or text. */
  wecomMsgType: 'markdown' | 'text'
  /** Enable Telegram bot notifications. */
  telegramEnabled: boolean
  /** Telegram bot token. */
  telegramBotToken: string
  /** Telegram target chat ID. */
  telegramChatId: string
  /** Telegram message parse mode. */
  telegramParseMode: 'HTML' | 'MarkdownV2' | 'text'
  /** Event filters. */
  notifyOnCompleted: boolean
  notifyOnPaused: boolean
  notifyOnFailed: boolean
  notifyOnAuthorization: boolean
  notifyOnConfirmation: boolean
  /** Title prefix. */
  titlePrefix: string
}

/**
 * Schema of the notify settings section (schemastery).
 * The Web settings page renders a form from this schema.
 */
export const NOTIFY_SETTINGS_SCHEMA: z<NotifySettings> = z.object({
  enabled: z.boolean().default(true),
  systemEnabled: z.boolean().default(true),
  systemSound: z.boolean().default(true),
  systemSoundName: z.string().default(''),
  webhookEnabled: z.boolean().default(false),
  webhookUrl: z.string().default(''),
  wecomEnabled: z.boolean().default(false),
  wecomWebhookUrl: z.string().default(''),
  wecomMsgType: z.union([z.const('markdown'), z.const('text')]).default('markdown'),
  telegramEnabled: z.boolean().default(false),
  telegramBotToken: z.string().default(''),
  telegramChatId: z.string().default(''),
  telegramParseMode: z.union([z.const('HTML'), z.const('MarkdownV2'), z.const('text')]).default('HTML'),
  notifyOnCompleted: z.boolean().default(true),
  notifyOnPaused: z.boolean().default(true),
  notifyOnFailed: z.boolean().default(true),
  notifyOnAuthorization: z.boolean().default(true),
  notifyOnConfirmation: z.boolean().default(true),
  titlePrefix: z.string().default('[DSH]'),
})

/**
 * Map a stored notify settings section onto a {@link NotifyPluginConfig}.
 * @param settings - resolved settings section (defaults applied).
 * @returns a plugin config the NotifyService can consume.
 */
export function settingsToConfig(settings: NotifySettings): NotifyPluginConfig {
  return {
    enabled: settings.enabled,
    channels: {
      system: {
        enabled: settings.systemEnabled,
        sound: settings.systemSound,
        soundName: settings.systemSoundName || undefined,
      },
      webhook: {
        enabled: settings.webhookEnabled,
        url: settings.webhookUrl,
      },
      wecom: {
        enabled: settings.wecomEnabled,
        webhookUrl: settings.wecomWebhookUrl,
        msgType: settings.wecomMsgType,
      },
      telegram: {
        enabled: settings.telegramEnabled,
        botToken: settings.telegramBotToken,
        chatId: settings.telegramChatId,
        parseMode: settings.telegramParseMode,
      },
    },
    events: {
      conversationCompleted: settings.notifyOnCompleted,
      conversationPaused: settings.notifyOnPaused,
      conversationFailed: settings.notifyOnFailed,
      authorizationRequired: settings.notifyOnAuthorization,
      confirmationRequired: settings.notifyOnConfirmation,
    },
    titlePrefix: settings.titlePrefix,
  }
}

/**
 * Map a plugin composition config onto a notify settings section.
 * @param config - the plugin's composition entry config.
 * @returns the section used as the settings `base` layer.
 */
export function configToSettings(config: NotifyPluginConfig): NotifySettings {
  return {
    enabled: config.enabled ?? true,
    systemEnabled: config.channels?.system?.enabled ?? true,
    systemSound: config.channels?.system?.sound ?? true,
    systemSoundName: config.channels?.system?.soundName ?? '',
    webhookEnabled: config.channels?.webhook?.enabled ?? false,
    webhookUrl: config.channels?.webhook?.url ?? '',
    wecomEnabled: config.channels?.wecom?.enabled ?? false,
    wecomWebhookUrl: config.channels?.wecom?.webhookUrl ?? '',
    wecomMsgType: config.channels?.wecom?.msgType ?? 'markdown',
    telegramEnabled: config.channels?.telegram?.enabled ?? false,
    telegramBotToken: config.channels?.telegram?.botToken ?? '',
    telegramChatId: config.channels?.telegram?.chatId ?? '',
    telegramParseMode: config.channels?.telegram?.parseMode ?? 'HTML',
    notifyOnCompleted: config.events?.conversationCompleted ?? true,
    notifyOnPaused: config.events?.conversationPaused ?? true,
    notifyOnFailed: config.events?.conversationFailed ?? true,
    notifyOnAuthorization: config.events?.authorizationRequired ?? true,
    notifyOnConfirmation: config.events?.confirmationRequired ?? true,
    titlePrefix: config.titlePrefix ?? '[DSH]',
  }
}

/**
 * Hooks a NotifyService exposes to the settings wiring: the service must
 * re-resolve its config whenever the stored section changes.
 */
export interface NotifySettingsHooks {
  /** Apply a resolved settings section to the running service. */
  apply: (config: NotifyPluginConfig) => void
}

/**
 * Register the notify settings namespace on the host plane.
 * The registration is an effect on the calling plugin's fiber; disposing
 * the fiber removes the namespace. Must be mounted on the HOST plane
 * (e.g. `~/.dsh/profiles/web/cordis.patch.yml`) — agent-preset mounts
 * cannot register settings namespaces.
 *
 * @param ctx - host cordis context.
 * @param entry - the plugin's composition entry section (used as settings `base` layer).
 * @param hooks - service wiring: apply each resolved section to the service.
 */
export function installNotifySettings(ctx: Context, entry: NotifySettings, hooks: NotifySettingsHooks): void {
  // Access the settings service via ctx.get (a plain property read would throw
  // "cannot get property settings without inject").
  const settings = ctx.get('settings') as { register(ns: string, schema: unknown, options?: { base?: unknown }): { get(): NotifySettings; watch(cb: () => void): () => void } } | undefined
  if (!settings) return

  // Direct registration on the settings service (synchronous, unlike
  // installSettingsSection which defers through ctx.inject).
  const scope = settings.register(NOTIFY_SETTINGS_NAMESPACE, NOTIFY_SETTINGS_SCHEMA, {
    base: entry,
  })
  hooks.apply(settingsToConfig(scope.get()))
  scope.watch(() => {
    hooks.apply(settingsToConfig(scope.get()))
  })
}
