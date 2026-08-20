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
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
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
  let sendRet = 0 // flip to -2 to simulate a dead context token
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
        res.end(JSON.stringify(sendRet === 0 ? { ret: 0 } : { ret: sendRet, errmsg: 'prepare failed' }))
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

  // Test 2b: turn-summary pushes are slim — title + 💬/🤖 body, no footer,
  // standard turn-summary metadata is not dumped (the 🔧/📊 lines no longer
  // exist in the body at all; the source emits only 💬/🤖).
  console.log('✓ Test 2b: turn-summary push keeps only user/AI content')
  sent.length = 0
  await adapter.send({
    type: 'conversationCompleted',
    title: '✅ [notify] 对话完成',
    message: '💬 用户的真实问题\n🤖 助手的回复摘要',
    timestamp: Date.now(),
    metadata: { turn: 2, reason: 'completed', userPrompt: '用户的真实问题', workspace: 'notify', sessionId: 'session-1' },
  })
  const slim = sent[0].payload.msg.item_list[0].text_item.text
  console.log('  - text:', JSON.stringify(slim))
  if (!slim.includes('💬 用户的真实问题') || !slim.includes('🤖 助手的回复摘要')) throw new Error('💬/🤖 lines missing')
  if (slim.includes('类型:') || slim.includes('时间:') || slim.includes('详细信息')) throw new Error('footer not dropped')
  if (slim.includes('userPrompt') || slim.includes('sessionId')) throw new Error('metadata dumped')
  // Single newlines are promoted to paragraph breaks (blank lines) — the only
  // line break the ClawBot markdown renderer preserves.
  if (!slim.includes('💬 用户的真实问题\n\n🤖 助手的回复摘要')) throw new Error('single newline not promoted: ' + JSON.stringify(slim))
  if (!slim.includes('对话完成】\n\n💬')) throw new Error('paragraph break should pass through untouched')

  // Test 2b2: custom (non-standard) metadata keys are still appended
  console.log('✓ Test 2b2: custom metadata keys survive slimming')
  sent.length = 0
  await adapter.send({
    type: 'conversationCompleted',
    title: 't', message: '💬 x',
    metadata: { turn: 3, workspace: 'notify', customKey: 'custom-value' },
  })
  const withCustom = sent[0].payload.msg.item_list[0].text_item.text
  if (!withCustom.includes('customKey: custom-value')) throw new Error('custom metadata dropped: ' + JSON.stringify(withCustom))
  if (withCustom.includes('turn:') || withCustom.includes('workspace:')) throw new Error('standard metadata leaked')

  // Test 2b3: markdown tables stay tightly packed — hardBreaks must NOT
  // insert blank lines between table rows (that dissolves the table back
  // into plain text), while paragraph lines around it are still promoted.
  console.log('✓ Test 2b3: markdown table rows keep single newlines')
  sent.length = 0
  await adapter.send({
    type: 'conversationCompleted',
    title: 't',
    message: '🤖 结果如下\n| 名称 | 状态 |\n|---|---|\n| 构建 | ✅ |\n| 测试 | ❌ |\n以上是本次结果。',
  })
  const table = sent[0].payload.msg.item_list[0].text_item.text
  console.log('  - text:', JSON.stringify(table))
  if (!table.includes('| 名称 | 状态 |\n|---|---|\n| 构建 | ✅ |\n| 测试 | ❌ |')) {
    throw new Error('table rows split by blank lines: ' + JSON.stringify(table))
  }
  if (!table.includes('🤖 结果如下\n\n| 名称 |')) throw new Error('paragraph before table not promoted')
  if (!table.includes('| 测试 | ❌ |\n\n以上是本次结果。')) throw new Error('paragraph after table not promoted')

  // Test 2c: ret=-2 "prepare failed" evicts the dead context token and send throws.
  // Uses an isolated session file + adapter so later tests keep their users.
  console.log('✓ Test 2c: dead context token (ret=-2) is evicted and surfaces as failure')
  const sessionFile2 = join(dir, 'wechat-session-2.json')
  writeFileSync(sessionFile2, JSON.stringify({
    token: 'test-bot-token', baseUrl, accountId: 'testbot@im.bot', savedAt: new Date().toISOString(),
    users: { 'stale@im.wechat': { contextToken: 'dead-token', updatedAt: Date.now() } },
  }))
  const ctx2 = makeCtx()
  const stale = new WeChatClawBotAdapter(ctx2, { enabled: true, sessionFile: sessionFile2 })
  for (let i = 0; i < 50 && stale.getStatus().state !== 'ready'; i++) await sleep(100)
  sendRet = -2
  let threw = null
  try {
    await stale.send({ type: 'conversationCompleted', title: 't', message: '💬 x' })
  } catch (error) { threw = error }
  sendRet = 0
  stale.dispose()
  await ctx2.fiber.dispose()
  if (!threw || !threw.message.includes('全部失败')) throw new Error('send() should throw when every delivery fails: ' + threw)
  if (stale.getStatus().knownUsers.length !== 0) {
    throw new Error('dead context token users were not evicted: ' + JSON.stringify(stale.getStatus().knownUsers))
  }
  // Session file must no longer contain the evicted users
  const persisted = JSON.parse(readFileSync(sessionFile2, 'utf8'))
  if (Object.keys(persisted.users ?? {}).length !== 0) throw new Error('evicted users still persisted')

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
