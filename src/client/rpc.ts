/**
 * Browser-side RPC contract for the notify configuration channel.
 *
 * The channel/endpoint strings and the config wire shape are DUPLICATED with
 * `src/notify-rpc.ts` / `src/types.ts` (the browser bundle cannot import a Host
 * file). Keep them in lockstep. The client calls a loopback-only channel on the
 * host `connection.rpc`; the host applies the write and persists it.
 */

/** Absolute logical channel the host registers (see src/notify-rpc.ts). */
export const NOTIFY_RPC_CHANNEL = '/dsh-notify'

/** Endpoint names (see src/notify-rpc.ts). */
export const NOTIFY_ENDPOINTS = Object.freeze({
  configGet: 'notify.config.get',
  configSet: 'notify.config.set',
  wechatStatus: 'notify.wechat.status',
  wechatRelogin: 'notify.wechat.relogin',
  wecomAibotStatus: 'notify.wecom-aibot.status',
  wecomAibotQrStart: 'notify.wecom-aibot.qr-start',
})

/** The notification config the settings page edits (see src/types.ts). */
export interface NotifyRpcConfig {
  enabled?: boolean
  channels?: {
    system?: { enabled?: boolean; sound?: boolean; soundName?: string; soundFile?: string; icon?: string }
    webhook?: { enabled?: boolean; url?: string; method?: 'POST' | 'PUT' | 'PATCH'; timeout?: number; headers?: Record<string, string> }
    wecom?: { enabled?: boolean; webhookUrl?: string; mentions?: string[]; msgType?: 'text' | 'markdown' }
    wecomAibot?: { enabled?: boolean; botId?: string; secret?: string; toChatIds?: string[]; interactive?: boolean; wsUrl?: string; sessionFile?: string }
    wechat?: { enabled?: boolean; toUserIds?: string[]; interactive?: boolean; sessionFile?: string; channelVersion?: string }
    telegram?: { enabled?: boolean; botToken?: string; chatId?: string; parseMode?: 'HTML' | 'MarkdownV2' | 'text'; disableNotification?: boolean; timeout?: number; interactive?: boolean }
  }
  events?: {
    conversationCompleted?: boolean
    conversationPaused?: boolean
    conversationFailed?: boolean
    authorizationRequired?: boolean
    confirmationRequired?: boolean
    todoProgress?: boolean
  }
  titlePrefix?: string
  /** Suppress subagent completion/TODO notifications (see src/types.ts). */
  mainAgentOnly?: boolean
}

/** WeChat ClawBot adapter status (see src/adapters/wechat.ts). */
export interface WeChatStatus {
  state: 'disabled' | 'login' | 'ready' | 'error'
  accountId?: string
  /** QR payload to encode and scan while state is 'login'. */
  qrContent?: string
  error?: string
  knownUsers: string[]
}

/** WeCom AI Bot adapter status (see src/service.ts). */
export interface WeComAiBotStatus {
  state: 'disabled' | 'connecting' | 'ready' | 'error'
  error?: string
  knownChats: string[]
  qr: {
    phase: 'idle' | 'pending' | 'error'
    /** URL to render as a QR code while phase is 'pending'. */
    authUrl?: string
    error?: string
  }
}

/** The unary RPC result shape the host connection returns. */
export interface NotifyRpcResult {
  ok: boolean
  value?: unknown
  error?: { message?: string }
}

/** The connection.rpc.call face the settings page injects. */
export interface NotifyRpcCall {
  (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<NotifyRpcResult>
}
