import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Notify plugin Web RPC (authenticated channel): the Web settings page ⇄ Host
 * notification-configuration channel.
 *
 * The channel is a plain `webServer` prefix route fenced by Connection's own
 * Host/Origin + browser-auth check (`connection.requestRejection`). It does NOT
 * use `ctx.connection.rpc.handle()`: on current dsh-client-connection that
 * registry captures the Connection service's OWN context as the route owner
 * (`get rpc() { const owner = this.ctx; … }`) and registers through
 * `owner.webServer`, which the service's fiber does not inject — a third-party
 * caller gets `Error: cannot get property "webServer" without inject`, and the
 * throw aborts the calling plugin's activation entirely. Registering the route
 * ourselves is the same transport minus that ownership trap; dsh-advisors
 * (same author, same Web page pattern) does the same.
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

/** RPC bodies are small JSON config documents; far above any realistic edit. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

/** Mirrors dsh-client-connection: endpoint segments after the channel prefix. */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/

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

/** DSH rpcErrorSchema-discriminated success. */
function ok(value: unknown): { ok: true; value: unknown } {
  return { ok: true, value }
}

/** Build a `bad-request` RPC error (issues is a free array). */
function fail(message: string): { ok: false; error: { code: string; message: string; details: { issues: [{ message: string }] } } } {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [{ message }] } } }
}

/** The endpoint after the channel prefix, or undefined for a foreign path. */
function endpointFromPath(channel: string, pathname: string): string | undefined {
  if (!pathname.startsWith(`${channel}/`)) return undefined
  const endpoint = pathname.slice(channel.length + 1)
  const segments = endpoint.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..' || !ENDPOINT_SEGMENT_PATTERN.test(s))) {
    return undefined
  }
  return endpoint
}

/** Whether a parsed body is a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** `server-response` envelope, wire-identical to dsh-client-connection. */
function respondEnvelope(res: ServerResponse, rpcId: string, result: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ type: 'server-response', rpcId, result }))
}

/** One channel request: buffered node:http ⇄ envelope bridge. */
async function serveRpc(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>,
): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  const endpoint = endpointFromPath(NOTIFY_RPC_CHANNEL, pathname)
  if (req.method !== 'POST' || endpoint === undefined) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : ''
  if (contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    res.writeHead(415)
    res.end('content type must be application/json')
    return
  }
  const declaredLength = Number(req.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    res.writeHead(413, { connection: 'close' })
    res.end()
    req.destroy()
    return
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    received += buffer.byteLength
    if (received > MAX_BODY_BYTES) {
      res.writeHead(413, { connection: 'close' })
      res.end()
      req.destroy()
      return
    }
    chunks.push(buffer)
  }
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    res.writeHead(400)
    res.end('body is not JSON')
    return
  }
  const rpcId = typeof (body as { rpcId?: unknown } | null)?.rpcId === 'string'
    ? (body as { rpcId: string }).rpcId
    : 'invalid-request'
  if (!isRecord(body) || body.type !== 'client-request' || typeof body.rpcId !== 'string' || typeof body.method !== 'string') {
    respondEnvelope(res, rpcId, { ok: false, error: { code: 'gateway/bad-request', message: 'invalid client-request message', details: {} } })
    return
  }
  if (body.method !== endpoint) {
    respondEnvelope(res, rpcId, {
      ok: false,
      error: {
        code: 'gateway/bad-request',
        message: `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
        details: {},
      },
    })
    return
  }
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })
  try {
    respondEnvelope(res, rpcId, await handler(endpoint, body.payload, abort.signal))
  } catch (error) {
    res.writeHead(500)
    res.end(`handler failure: ${String(error)}`)
  }
}

/**
 * Endpoint dispatch for the notify channel — shared by the mounted route and
 * callable directly by tests.
 * @param bridge - the host notify service surface.
 * @returns a handler mapping one endpoint to its RPC result.
 */
export function createNotifyRpcHandler(
  bridge: NotifyRpcBridge,
): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown> {
  return async (endpoint, payload = {}, signal) => {
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.', details: {} } }
    }
    if (endpoint === NOTIFY_ENDPOINTS.configGet) {
      return ok(bridge.read())
    }
    if (endpoint === NOTIFY_ENDPOINTS.configSet) {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return fail('notify.config.set expects an object payload')
      }
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
  }
}

/** The Connection slice the route fences with; structural, so no host import. */
interface HostConnectionLike {
  requestRejection(request: IncomingMessage): 401 | 403 | undefined
}

/** The WebServer slice the route registers on; structural. */
interface HostWebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** The cordis inject/effect surface used here, typed structurally. */
interface InjectContextLike {
  connection?: HostConnectionLike
  webServer?: HostWebServerLike
  effect(callback: () => unknown, label?: string): unknown
}

/**
 * Mount the `/dsh-notify` channel on the host web server.
 *
 * Soft-injected: a deployment without `connection`/`webServer` (headless) skips
 * the channel and keeps notifying. The route is fenced by the same Host/Origin
 * + browser-auth check Connection applies to its own channels.
 *
 * @param ctx - the plugin's host cordis context.
 * @param bridge - service wiring: read the current config and apply a partial write.
 * @param log - optional logger.
 */
export function installNotifyRpc(
  ctx: Context,
  bridge: NotifyRpcBridge,
  log: { warn?: (...args: unknown[]) => void } = {},
): void {
  ctx.inject(['connection', 'webServer'], (rpcCtxUnknown: unknown) => {
    const rpcCtx = rpcCtxUnknown as InjectContextLike
    const { connection, webServer } = rpcCtx
    if (typeof connection?.requestRejection !== 'function' || typeof webServer?.register !== 'function') {
      log.warn?.('[notify] DSH Connection RPC transport unavailable — settings page disabled | 无 Connection/webServer，设置页不可用')
      return
    }
    const handler = createNotifyRpcHandler(bridge)
    rpcCtx.effect(
      () => webServer.register({
        kind: 'prefix',
        path: NOTIFY_RPC_CHANNEL,
        handler: async (req, res) => {
          const rejection = connection.requestRejection(req)
          if (rejection !== undefined) {
            res.writeHead(rejection)
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
            return
          }
          await serveRpc(req, res, handler)
        },
      }),
      `notify: ${NOTIFY_RPC_CHANNEL} rpc channel`,
    )
  })
}
