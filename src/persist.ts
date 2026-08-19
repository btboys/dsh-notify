/**
 * Persistence for the notify plugin's configuration when it is edited from the
 * Web settings page.
 *
 * The settings page writes through the /dsh-notify RPC channel, which applies
 * the new config to the running service and persists it to a JSON file under
 * DSH_HOME so the choice survives restarts. The file path and shape are
 * internal to the plugin; the Web page never reads it directly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type {
  NotifyEventFilter,
  NotifyPluginConfig,
  SystemNotifyConfig,
  TelegramNotifyConfig,
  WebhookNotifyConfig,
  WeChatNotifyConfig,
  WeComNotifyConfig,
} from './types.js'

/** Relative path under DSH_HOME where the notify config is persisted. */
const CONFIG_REL = join('notify', 'config.json')

/**
 * Resolve DSH_HOME, falling back to ~/.dsh.
 * @returns the absolute DSH home directory.
 */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
}

/**
 * The absolute path of the persisted notify config file.
 * @returns the config file path.
 */
export function configFilePath(): string {
  return join(dshHome(), CONFIG_REL)
}

/**
 * Read the persisted notify config, if any.
 * @returns the parsed config, or null when absent or malformed.
 */
export function loadPersistedConfig(): NotifyPluginConfig | null {
  const file = configFilePath()
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as NotifyPluginConfig) : null
  } catch {
    return null
  }
}

/**
 * Merge a persisted config over the base config, favoring the persisted keys.
 * @param base - the config passed to the plugin (e.g. from cordis.patch.yml).
 * @param persisted - the persisted overrides, or null.
 * @returns the merged config.
 */
export function mergePersisted(base: NotifyPluginConfig, persisted: NotifyPluginConfig | null): NotifyPluginConfig {
  if (!persisted) return base
  // Shallow-ish merge: top-level keys from persisted win; channel objects merge
  // field-wise so a partial persisted channel does not wipe the rest.
  const merged = {
    ...base,
    ...persisted,
    channels: {
      system: { ...base.channels?.system, ...persisted.channels?.system } as SystemNotifyConfig,
      webhook: { ...base.channels?.webhook, ...persisted.channels?.webhook } as WebhookNotifyConfig,
      wecom: { ...base.channels?.wecom, ...persisted.channels?.wecom } as WeComNotifyConfig,
      wechat: { ...base.channels?.wechat, ...persisted.channels?.wechat } as WeChatNotifyConfig,
      telegram: { ...base.channels?.telegram, ...persisted.channels?.telegram } as TelegramNotifyConfig,
    },
    events: { ...base.events, ...persisted.events } as NotifyEventFilter,
  } as NotifyPluginConfig
  // Channel/enabled are required by the config types but the spread of the
  // OPTIONAL `channels`/`events` groups widens the leaves to optional; the
  // downstream NotifyService.mergeConfig fills every default before use.
  return merged as NotifyPluginConfig
}

/**
 * Serialize the notify config to disk. Creates the parent directory on demand.
 * @param config - the config to persist.
 * @throws when the write fails (caller may log and continue).
 */
export function persistConfig(config: NotifyPluginConfig): void {
  const file = configFilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

/** Drop the persisted config file, if present. */
export function clearPersistedConfig(): void {
  const file = configFilePath()
  if (existsSync(file)) writeFileSync(file, '{}', 'utf8')
}
