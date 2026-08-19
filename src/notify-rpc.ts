/**
 * Notify plugin Web RPC (loopback-only): the Web settings page ⇄ Host
 * notification-configuration channel. Mirrors the dsh-pocket RPC pattern:
 *
 *   - host registers a logical channel with `ctx.connection.rpc.handle(channel, handler)`
 *   - the browser plug-in calls it with `ctx.connection.rpc.call(channel, endpoint, payload)`
 *
 * THE CONSTANTS BELOW ARE DUPLICATED IN `src/client/rpc.ts` — the browser
 * bundle cannot import a Host file. Keep the channel string, endpoint names,
 * and the wire shapes in lockstep across the two.
 */

export const NOTIFY_RPC_CHANNEL = '/dsh-notify'

export const NOTIFY_ENDPOINTS = Object.freeze({
  configGet: 'notify.config.get',
  configSet: 'notify.config.set',
  wechatStatus: 'notify.wechat.status',
  wechatRelogin: 'notify.wechat.relogin',
})

/** DSH rpcErrorSchema-discriminated failure. */
function ok(value: unknown): { ok: true; value: unknown } {
  return { ok: true, value }
}

/** Build a `bad-request` RPC error (issues is a free array). */
function fail(message: string): { ok: false; error: { code: string; message: string; details: { issues: [{ message: string }] } } } {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [{ message }] } } }
}

/** The persistence + apply surface the host notify service exposes to the channel. */
export interface NotifyRpcBridge {
  /** Read the current effective config. */
  read(): unknown
  /** Apply a partial config to the running service and persist it. */
  write(partial: unknown): void
  /** Read the WeChat ClawBot adapter status (login state, QR payload, users). */
  wechatStatus?(): unknown
  /** Forget the WeChat session and restart QR login; returns the new status. */
  wechatRelogin?(): unknown | Promise<unknown>
}

/**
 * Install the /dsh-notify logical channel on the host `connection.rpc`.
 * @param ctx - host cordis context (must inject `connection` and `webServer`).
 * @param bridge - service wiring: read the current config and apply a partial write.
 * @param log - optional logger.
 * @returns the channel disposer.
 */
export function installNotifyRpc(
  rpc: { handle(channel: string, handler: (endpoint: string, payload?: unknown, signal?: { aborted?: boolean }) => unknown, options?: { authority: string }): unknown } | undefined,
  bridge: NotifyRpcBridge,
  log: { warn?: (...args: unknown[]) => void } = {},
): () => void {
  if (rpc?.handle === undefined) {
    log.warn?.(`[notify] DSH Host Connection RPC unavailable — settings page disabled | 无 Connection RPC，设置页不可用`)
    return () => {}
  }
  const dispose = rpc.handle(NOTIFY_RPC_CHANNEL, async (endpoint: string, payload = {}, signal?: { aborted?: boolean }) => {
    if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.', details: {} } }
    if (endpoint === NOTIFY_ENDPOINTS.configGet) {
      return ok(bridge.read())
    }
    if (endpoint === NOTIFY_ENDPOINTS.configSet) {
      if (payload === null || typeof payload !== 'object') return fail('notify.config.set expects an object payload')
      bridge.write(payload)
      return ok(bridge.read())
    }
    if (endpoint === NOTIFY_ENDPOINTS.wechatStatus) {
      if (!bridge.wechatStatus) return fail('wechat status is not available')
      return ok(bridge.wechatStatus())
    }
    if (endpoint === NOTIFY_ENDPOINTS.wechatRelogin) {
      if (!bridge.wechatRelogin) return fail('wechat relogin is not available')
      return ok(await bridge.wechatRelogin())
    }
    return fail(`unknown notify endpoint: ${String(endpoint)}`)
  }, { authority: 'loopback' })
  return (): void => { void dispose }
}
