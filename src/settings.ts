import z from '@deepseek-ai/schemastery'
import { NotifyPluginConfig } from './types.js'

/**
 * Key of the notify configuration section, kept for consumers that read
 * notify configuration under this name.
 *
 * Historical note: this was `settingsNamespace('notify')` from
 * `@deepseek-ai/dsh-settings` until 1.4.2. That runtime helper (and the whole
 * namespace-registration API) was removed from dsh-settings in 0.1.2-alpha.2,
 * and importing the missing export is an ESM link error that stops the plugin
 * from loading at all on any harness since. A namespace is a plain string now;
 * nothing in this plugin needs the `settings` service — the Web page reads and
 * writes configuration through the `/dsh-notify` RPC channel
 * (see `notify-rpc.ts`).
 */
export const NOTIFY_SETTINGS_NAMESPACE = 'notify'

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
  /** Enable WeChat ClawBot (personal WeChat) notifications. */
  wechatEnabled: boolean
  /** Comma-separated iLink user IDs to push to; empty pushes to every user who messaged the bot. */
  wechatUserIds: string
  /** Two-way interaction: answer approvals/questions and continue conversations from WeChat. */
  wechatInteractive: boolean
  /** Enable Telegram bot notifications. */
  telegramEnabled: boolean
  /** Telegram bot token. */
  telegramBotToken: string
  /** Telegram target chat ID. */
  telegramChatId: string
  /** Telegram message parse mode. */
  telegramParseMode: 'HTML' | 'MarkdownV2' | 'text'
  /** Telegram two-way interaction (buttons / replies drive DSH). */
  telegramInteractive: boolean
  /** Event filters. */
  notifyOnCompleted: boolean
  notifyOnPaused: boolean
  notifyOnFailed: boolean
  notifyOnAuthorization: boolean
  notifyOnConfirmation: boolean
  /** Push the agent's TODO list and progress (todo_write tool calls). */
  notifyOnTodo: boolean
  /** Title prefix. */
  titlePrefix: string
  /** Suppress subagent completion/TODO notifications; only the main agent notifies. */
  mainAgentOnly: boolean
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
  wechatEnabled: z.boolean().default(false),
  wechatUserIds: z.string().default(''),
  wechatInteractive: z.boolean().default(true),
  telegramEnabled: z.boolean().default(false),
  telegramBotToken: z.string().default(''),
  telegramChatId: z.string().default(''),
  telegramParseMode: z.union([z.const('HTML'), z.const('MarkdownV2'), z.const('text')]).default('HTML'),
  telegramInteractive: z.boolean().default(true),
  notifyOnCompleted: z.boolean().default(true),
  notifyOnPaused: z.boolean().default(true),
  notifyOnFailed: z.boolean().default(true),
  notifyOnAuthorization: z.boolean().default(true),
  notifyOnConfirmation: z.boolean().default(true),
  notifyOnTodo: z.boolean().default(true),
  titlePrefix: z.string().default(''),
  mainAgentOnly: z.boolean().default(true),
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
      wechat: {
        enabled: settings.wechatEnabled,
        toUserIds: settings.wechatUserIds
          .split(/[,\s]+/)
          .map((id) => id.trim())
          .filter(Boolean),
        interactive: settings.wechatInteractive,
      },
      telegram: {
        enabled: settings.telegramEnabled,
        botToken: settings.telegramBotToken,
        chatId: settings.telegramChatId,
        parseMode: settings.telegramParseMode,
        interactive: settings.telegramInteractive,
      },
    },
    events: {
      conversationCompleted: settings.notifyOnCompleted,
      conversationPaused: settings.notifyOnPaused,
      conversationFailed: settings.notifyOnFailed,
      authorizationRequired: settings.notifyOnAuthorization,
      confirmationRequired: settings.notifyOnConfirmation,
      todoProgress: settings.notifyOnTodo,
    },
    titlePrefix: settings.titlePrefix,
    mainAgentOnly: settings.mainAgentOnly,
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
    wechatEnabled: config.channels?.wechat?.enabled ?? false,
    wechatUserIds: (config.channels?.wechat?.toUserIds ?? []).join(', '),
    wechatInteractive: config.channels?.wechat?.interactive ?? true,
    telegramEnabled: config.channels?.telegram?.enabled ?? false,
    telegramBotToken: config.channels?.telegram?.botToken ?? '',
    telegramChatId: config.channels?.telegram?.chatId ?? '',
    telegramParseMode: config.channels?.telegram?.parseMode ?? 'HTML',
    telegramInteractive: config.channels?.telegram?.interactive ?? true,
    notifyOnCompleted: config.events?.conversationCompleted ?? true,
    notifyOnPaused: config.events?.conversationPaused ?? true,
    notifyOnFailed: config.events?.conversationFailed ?? true,
    notifyOnAuthorization: config.events?.authorizationRequired ?? true,
    notifyOnConfirmation: config.events?.confirmationRequired ?? true,
    notifyOnTodo: config.events?.todoProgress ?? true,
    titlePrefix: config.titlePrefix ?? '',
    mainAgentOnly: config.mainAgentOnly ?? true,
  }
}

/*
 * `installNotifySettings()` lived here until 1.4.4. It registered a `notify`
 * settings namespace through `ctx.settings.register(ns, schema, { base })`,
 * an API that no longer exists: current dsh-settings exposes a
 * profile-entry-based `SettingsForms` service (`describe` / `update` /
 * `replace` / `mutate` / `configure`) with no namespace registration at all.
 * The call only ever produced a caught `TypeError` on modern harnesses, so it
 * was removed. The Web page and every other consumer use the `/dsh-notify`
 * RPC channel (`notify-rpc.ts`) instead.
 */
