/**
 * Integration test for the WeChat ClawBot adapter (src/adapters/wechat.ts).
 *
 * Spins up a local mock of the iLink server (getupdates + sendmessage),
 * seeds a session file pointing at it, and verifies:
 *   1. the adapter resumes the persisted session and becomes ready,
 *   2. long polling hits getupdates,
 *   3. send() POSTs a well-formed iLink message for each known user,
 *   4. a disabled adapter is a no-op.
 */

import { Context } from '@deepseek-ai/cordis'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WeChatClawBotAdapter } from '../lib/adapters/wechat.js'

function makeCtx() {
  const ctx = new Context()
  ctx.provide('connection', { rpc: { handle: () => () => {} } })
  ctx.provide('webServer', {})
  return ctx
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('🧪 Testing WeChat ClawBot adapter...\n')

  const sent = []
  let pollCount = 0
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (req.url === '/ilink/bot/getupdates') {
        pollCount += 1
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ret: 0, msgs: [], get_updates_buf: 'buf-1' }))
        return
      }
      if (req.url === '/ilink/bot/sendmessage') {
        sent.push({ headers: req.headers, payload })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ret: 0 }))
        return
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const dir = mkdtempSync(join(tmpdir(), 'dsh-notify-wechat-'))
  const sessionFile = join(dir, 'wechat-session.json')
  writeFileSync(sessionFile, JSON.stringify({
    token: 'test-bot-token',
    baseUrl,
    accountId: 'testbot@im.bot',
    savedAt: new Date().toISOString(),
    users: {
      'user1@im.wechat': { contextToken: 'ctx-token-1', updatedAt: Date.now() },
      'user2@im.wechat': { contextToken: 'ctx-token-2', updatedAt: Date.now() },
    },
  }))

  const ctx = makeCtx()

  // Test 1: resume persisted session → ready, and poll loop starts
  console.log('✓ Test 1: resume persisted session')
  const adapter = new WeChatClawBotAdapter(ctx, { enabled: true, sessionFile })
  for (let i = 0; i < 50 && adapter.getStatus().state !== 'ready'; i++) await sleep(100)
  const status = adapter.getStatus()
  console.log('  - state:', status.state)
  console.log('  - account:', status.accountId)
  console.log('  - known users:', status.knownUsers.join(', '))
  if (status.state !== 'ready') throw new Error(`expected ready, got ${status.state} (${status.error ?? ''})`)
  if (status.knownUsers.length !== 2) throw new Error('expected 2 known users')

  await sleep(300)
  console.log('  - poll requests so far:', pollCount)
  if (pollCount === 0) throw new Error('poll loop never called getupdates')

  // Test 2: send() dispatches one iLink message per known user
  console.log('✓ Test 2: send notification to all known users')
  await adapter.send({
    type: 'conversationCompleted',
    title: '✅ [notify] 对话完成',
    message: '💬 测试消息',
    timestamp: Date.now(),
  })
  console.log('  - sendmessage calls:', sent.length)
  if (sent.length !== 2) throw new Error(`expected 2 sendmessage calls, got ${sent.length}`)
  const first = sent[0]
  if (first.headers.authorization !== 'Bearer test-bot-token') throw new Error('missing Bearer token')
  if (!first.headers['x-wechat-uin']) throw new Error('missing X-WECHAT-UIN header')
  if (first.headers.authorizationtype !== 'ilink_bot_token') throw new Error('missing AuthorizationType header')
  const msg = first.payload.msg
  if (msg.message_type !== 2 || msg.message_state !== 2) throw new Error('bad message_type/state')
  if (msg.context_token !== 'ctx-token-1' && msg.context_token !== 'ctx-token-2') throw new Error('context_token not propagated')
  if (msg.item_list?.[0]?.type !== 1 || !msg.item_list[0].text_item.text.includes('对话完成')) {
    throw new Error('text item malformed')
  }
  if (first.payload.base_info?.channel_version !== '1.0.2') throw new Error('base_info missing')
  console.log('  - to:', msg.to_user_id, '| text head:', JSON.stringify(msg.item_list[0].text_item.text.slice(0, 24)))

  // Test 3: toUserIds allowlist narrows the targets
  console.log('✓ Test 3: toUserIds allowlist')
  sent.length = 0
  const narrow = new WeChatClawBotAdapter(ctx, { enabled: true, sessionFile, toUserIds: ['user2@im.wechat', 'ghost@im.wechat'] })
  for (let i = 0; i < 50 && narrow.getStatus().state !== 'ready'; i++) await sleep(100)
  await narrow.send({ type: 'conversationFailed', title: 't', message: 'm' })
  console.log('  - sendmessage calls:', sent.length, '→', sent[0]?.payload.msg.to_user_id)
  if (sent.length !== 1 || sent[0].payload.msg.to_user_id !== 'user2@im.wechat') {
    throw new Error('allowlist did not narrow targets to user2 only')
  }
  narrow.dispose()

  // Test 4: disabled adapter is a no-op
  console.log('✓ Test 4: disabled adapter')
  const off = new WeChatClawBotAdapter(ctx, { enabled: false, sessionFile })
  await off.send({ type: 'conversationCompleted', title: 't', message: 'm' })
  console.log('  - status:', off.getStatus().state)
  if (off.getStatus().state !== 'disabled') throw new Error('expected disabled state')

  // Test 5: QR login survives a transient get_bot_qrcode timeout
  console.log('✓ Test 5: QR login retries a transient timeout')
  let qrHits = 0
  const loginServer = createServer((req, res) => {
    if (req.url.startsWith('/ilink/bot/get_bot_qrcode')) {
      qrHits += 1
      const respond = () => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ qrcode: 'qr-token', qrcode_img_content: 'qr-img' }))
      }
      if (qrHits === 1) setTimeout(respond, 500) // exceed the 300ms test timeout
      else respond()
      return
    }
    if (req.url.startsWith('/ilink/bot/get_qrcode_status')) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'confirmed', bot_token: 'qr-bot-token', ilink_bot_id: 'qrbot@im.bot' }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise((r) => loginServer.listen(0, '127.0.0.1', r))
  const loginBase = `http://127.0.0.1:${loginServer.address().port}`
  const loginDir = mkdtempSync(join(tmpdir(), 'dsh-notify-wechat-login-'))
  // No session file → forces the QR login path.
  const loginAdapter = new WeChatClawBotAdapter(ctx, { enabled: true, sessionFile: join(loginDir, 'wechat-session.json') }, { loginBaseUrl: loginBase, httpTimeoutMs: 300, retryBackoffMs: 50 })
  for (let i = 0; i < 80 && loginAdapter.getStatus().state !== 'ready'; i++) await sleep(100)
  const loginStatus = loginAdapter.getStatus()
  console.log('  - state:', loginStatus.state, '| qr hits:', qrHits, '| error:', loginStatus.error ?? '-')
  if (loginStatus.state !== 'ready') throw new Error(`login should recover from transient timeout, got ${loginStatus.state} (${loginStatus.error ?? ''})`)
  if (qrHits !== 2) throw new Error(`expected 1 timeout + 1 retry (2 qr hits), got ${qrHits}`)
  loginAdapter.dispose()
  loginServer.close()
  rmSync(loginDir, { recursive: true, force: true })

  adapter.dispose()
  server.close()
  rmSync(dir, { recursive: true, force: true })
  await ctx.fiber.dispose()

  console.log('\n✅ All WeChat adapter tests passed!')
}

main().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
