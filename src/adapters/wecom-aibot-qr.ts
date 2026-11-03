import axios from 'axios'

/**
 * WeCom AI Bot (智能机器人) QR-code association flow.
 *
 * WeCom exposes a scan-to-create/associate endpoint pair (no auth required):
 *
 *   1. GET /ai/qc/generate?source=<name>  → { scode, auth_url }
 *      `auth_url` is rendered as a QR code; the user scans it in 企业微信 and
 *      picks (or creates) the 智能机器人 to associate with this plugin.
 *   2. GET /ai/qc/query_result?scode=…    → poll until
 *      `data.status === 'success'`, which carries `data.bot_info`
 *      ({ botid, secret }) — the credentials the WS adapter needs.
 *
 * The flow only OBTAINS credentials; the adapter's WebSocket connection does
 * the rest. `baseUrl` is injectable for tests.
 */

const DEFAULT_BASE_URL = 'https://work.weixin.qq.com'
/** How often the service polls query_result while waiting for a scan. */
export const QR_POLL_INTERVAL_MS = 3_000
/** A QR association attempt waits at most this long for scan + confirm. */
export const QR_LOGIN_TIMEOUT_MS = 5 * 60_000

/** Result of one QR-code generation. */
export interface QrGenerateResult {
  /** Opaque scan code, passed back to query_result. */
  scode: string
  /** URL to encode as the QR code the user scans. */
  authUrl: string
}

/** Terminal states of one association attempt. */
export type QrPollResult =
  | { status: 'pending' }
  | { status: 'success'; botId: string; secret: string }
  | { status: 'expired' }

/** Fetch a fresh QR payload. Throws on transport/protocol failure. */
export async function generateQrCode(source = 'dsh-notify', baseUrl = DEFAULT_BASE_URL, signal?: AbortSignal): Promise<QrGenerateResult> {
  const resp = await axios.get(`${baseUrl}/ai/qc/generate`, {
    params: { source },
    signal,
    timeout: 15_000,
  })
  const data = resp.data?.data ?? {}
  const scode = typeof data.scode === 'string' ? data.scode.trim() : ''
  const authUrl = typeof data.auth_url === 'string' ? data.auth_url.trim() : ''
  if (!scode || !authUrl) {
    throw new Error('获取扫码关联二维码失败（服务器无响应），请稍后重试')
  }
  return { scode, authUrl }
}

/**
 * Poll one association attempt once. Transport errors are reported as
 * 'pending' (a single blip must not kill the wait); only explicit server
 * states resolve the attempt.
 */
export async function queryQrResult(scode: string, baseUrl = DEFAULT_BASE_URL, signal?: AbortSignal): Promise<QrPollResult> {
  let resp
  try {
    resp = await axios.get(`${baseUrl}/ai/qc/query_result`, {
      params: { scode },
      signal,
      timeout: 10_000,
    })
  } catch {
    return { status: 'pending' }
  }
  const data = resp.data?.data ?? {}
  const status = String(data.status ?? '').toLowerCase()
  if (status === 'success') {
    const info = data.bot_info ?? {}
    const botId = String(info.botid ?? info.bot_id ?? '').trim()
    const secret = String(info.secret ?? '').trim()
    if (botId && secret) return { status: 'success', botId, secret }
    return { status: 'pending' }
  }
  if (status === 'expired' || status === 'invalid') {
    return { status: 'expired' }
  }
  return { status: 'pending' }
}
