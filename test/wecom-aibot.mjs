/**
 * Integration test for the WeCom AI Bot (智能机器人) channel:
 *   1. QR association helpers parse the generate/query_result protocol,
 *   2. queryQrResult treats transport blips as 'pending' (never kills the wait),
 *   3. a disabled adapter is a no-op,
 *   4. formatWeComMarkdown renders title + body + custom metadata only.
 *
 * The WS send path is covered by the SDK itself; what we own is the QR
 * protocol parsing and the adapter's config/disabled semantics.
 */

import { Context } from '@deepseek-ai/cordis'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateQrCode, queryQrResult } from '../lib/adapters/wecom-aibot-qr.js'
import { WeComAiBotAdapter } from '../lib/adapters/wecom-aibot.js'
import { formatWeComMarkdown } from '../lib/adapters/wecom.js'

/** Fake WSClient: captures sends/updates, lets the test emit inbound frames. */
function fakeClient() {
  const emitter = new EventEmitter()
  emitter.sent = []
  emitter.updates = []
  emitter.sendMessage = async (chatid, body) => { emitter.sent.push({ chatid, body }) }
  emitter.updateTemplateCard = async (frame, card) => { emitter.updates.push({ frame, card }) }
  emitter.connect = () => {}
  emitter.disconnect = () => {}
  return emitter
}

let failures = 0
function assert(cond, label) {
  if (cond) {
    console.log('  ✓', label)
  } else {
    failures += 1
    console.error('  ✗', label)
  }
}

async function main() {
  console.log('🧪 Testing WeCom AiBot channel...\n')

  // Mock the WeCom QR endpoints.
  let queryCount = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/ai/qc/generate') {
      res.end(JSON.stringify({ data: { scode: 'scode-1', auth_url: 'https://work.weixin.qq.com/ai/qc/gen?scode=scode-1' } }))
      return
    }
    if (url.pathname === '/ai/qc/query_result') {
      queryCount += 1
      if (url.searchParams.get('scode') !== 'scode-1') {
        res.end(JSON.stringify({ data: { status: 'invalid' } }))
        return
      }
      // First two polls pending, then success.
      if (queryCount < 3) {
        res.end(JSON.stringify({ data: { status: 'waiting' } }))
      } else {
        res.end(JSON.stringify({ data: { status: 'success', bot_info: { botid: 'bot-1', secret: 'sec-1' } } }))
      }
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  // Test 1: QR generate + poll protocol
  console.log('✓ Test 1: QR association protocol')
  const qr = await generateQrCode('test', baseUrl)
  assert(qr.scode === 'scode-1', 'generate returns scode')
  assert(qr.authUrl.includes('scode-1'), 'generate returns auth_url')

  const p1 = await queryQrResult('scode-1', baseUrl)
  assert(p1.status === 'pending', 'waiting → pending')
  const p2 = await queryQrResult('scode-1', baseUrl)
  assert(p2.status === 'pending', 'still waiting → pending')
  const p3 = await queryQrResult('scode-1', baseUrl)
  assert(p3.status === 'success' && p3.botId === 'bot-1' && p3.secret === 'sec-1', 'success carries botid/secret')
  const p4 = await queryQrResult('wrong-scode', baseUrl)
  assert(p4.status === 'expired', 'invalid scode → expired')

  // Test 2: transport error is pending, not fatal
  console.log('✓ Test 2: transport blip stays pending')
  const dead = await queryQrResult('scode-1', 'http://127.0.0.1:1')
  assert(dead.status === 'pending', 'connection refused → pending')

  // Test 3: disabled adapter is a no-op
  console.log('✓ Test 3: disabled adapter no-op')
  const ctx = new Context()
  const adapter = new WeComAiBotAdapter(ctx, { enabled: false, botId: '', secret: '' })
  await adapter.send({ type: 'conversationCompleted', title: 't', message: 'm' })
  assert(adapter.getStatus().state === 'disabled', 'state disabled')
  assert(adapter.enabled === false, 'enabled flag false without credentials')
  adapter.dispose()

  // Test 4: markdown rendering stays slim
  console.log('✓ Test 4: markdown formatting')
  const md = formatWeComMarkdown({
    type: 'conversationCompleted',
    title: '✅ 对话完成',
    message: '💬 你好',
    metadata: { turn: 3, custom: 'x' },
  })
  assert(md.includes('## ✅ 对话完成'), 'renders title')
  assert(md.includes('💬 你好'), 'renders body')
  assert(md.includes('- custom: x'), 'appends custom metadata')
  assert(!md.includes('turn'), 'omits standard turn-summary metadata')

  // Test 5: notification goes out as proactive markdown to known chats
  // (a proactive text_notice card is rejected by WeCom with errcode 42045
  // unless it carries a card_action jump target).
  console.log('✓ Test 5: notification markdown push')
  const dir = mkdtempSync(join(tmpdir(), 'dsh-notify-aibot-'))
  const client = fakeClient()
  const bot = new WeComAiBotAdapter(ctx, {
    enabled: true, botId: 'b', secret: 's',
    sessionFile: join(dir, 'session.json'),
  }, { client })
  assert(bot.getStatus().state === 'ready', 'injected client → ready')

  // Learn a chat from an inbound single-chat text message.
  client.emit('message.text', { headers: { req_id: 'r1' }, body: { chattype: 'single', from: { userid: 'zhangsan' }, text: { content: '你好' } } })
  assert(bot.getStatus().knownChats.includes('zhangsan'), 'inbound message captures chat id')

  await bot.send({ type: 'conversationCompleted', title: '✅ 对话完成', message: '💬 你好', metadata: { turn: 1 } })
  const notice = client.sent.at(-1)
  assert(notice.chatid === 'zhangsan', 'notification pushed to the learned chat')
  assert(notice.body.msgtype === 'markdown', 'completion sent as proactive markdown')
  assert(notice.body.markdown.content.includes('## ✅ 对话完成'), 'markdown carries the title')
  assert(notice.body.markdown.content.includes('💬 你好'), 'markdown carries the body')

  // Test 5b: a server take-over (disconnected_event) rebuilds the connection.
  // The SDK treats the kick as a manual close and never reconnects by itself.
  console.log('✓ Test 5b: take-over reconnect')
  const created = []
  const first = fakeClient()
  const kickBot = new WeComAiBotAdapter(ctx, {
    enabled: true, botId: 'b', secret: 's',
    sessionFile: join(dir, 'kick-session.json'),
  }, {
    client: first,
    reconnectDelayMs: 5,
    createClient: () => { const c = fakeClient(); created.push(c); return c },
  })
  first.emit('event.disconnected_event', {})
  assert(kickBot.getStatus().state === 'ready', 'take-over does not flip the state before the retry')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert(created.length === 1, 'a fresh client is built after a take-over')
  assert(kickBot.getStatus().state === 'connecting', 'state returns to connecting until re-auth')
  created[0].emit('authenticated')
  assert(kickBot.getStatus().state === 'ready', 're-authentication restores ready')
  kickBot.dispose()
  assert(kickBot.getStatus().state === 'disabled', 'dispose still disables')

  // A queued reconnect must not fire after dispose.
  const after = []
  const second = fakeClient()
  const goneBot = new WeComAiBotAdapter(ctx, {
    enabled: true, botId: 'b', secret: 's',
    sessionFile: join(dir, 'gone-session.json'),
  }, {
    client: second,
    reconnectDelayMs: 5,
    createClient: () => { const c = fakeClient(); after.push(c); return c },
  })
  second.emit('event.disconnected_event', {})
  goneBot.dispose()
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert(after.length === 0, 'dispose cancels a queued reconnect')

  // Test 6: approval prompt is a two-button card
  console.log('✓ Test 6: approval prompt card')
  const served = await bot.sendPrompt({ kind: 'approval', sessionId: 'sess-1', toolName: 'bash', reason: '需要权限', createdAt: Date.now(), workspace: 'notify', settle: () => {} })
  assert(served === true, 'approval served')
  const prompt = client.sent.at(-1).body.template_card
  assert(prompt.card_type === 'button_interaction', 'button_interaction card')
  assert(prompt.main_title.title.includes('[notify] 需要授权'), 'workspace in title')
  assert(prompt.button_list.length === 2 && prompt.button_list[0].key === 'a' && prompt.button_list[1].key === 'r', 'approve/reject buttons')
  assert(typeof prompt.task_id === 'string' && prompt.task_id.length > 0, 'unique task_id')

  // Test 7: question prompts always use the complete text fallback — a WeCom
  // card clips its quote area and button labels, so any option card loses copy.
  console.log('✓ Test 7: question prompts use text fallback')
  const q = (over) => ({ kind: 'question', sessionId: 's', questions: [{ id: 'q1', question: '选哪个？', ...over }], createdAt: Date.now(), settle: () => {} })
  const beforeQuestion = client.sent.length
  assert(await bot.sendPrompt(q({ options: [{ label: '甲' }, { label: '乙', description: '说明' }] })) === false, 'single-select question is not a card')
  assert(client.sent.length === beforeQuestion, 'no question card is pushed')
  assert(await bot.sendPrompt(q({ options: [{ label: 'x' }], multiSelect: true })) === false, 'multi-select uses text fallback')
  assert(await bot.sendPrompt(q({ options: Array.from({ length: 7 }, (_, i) => ({ label: `o${i}` })) })) === false, 'large selection uses text fallback')
  assert(await bot.sendPrompt(q({})) === false, 'free-text uses text fallback')

  // Test 8: menu button-ization rules
  console.log('✓ Test 8: menu cards')
  const menu = (n) => ({ text: '💬 选择要续接的对话（回复 /sel s 序号）：', buttons: Array.from({ length: n }, (_, i) => [{ text: `${i + 1}. 会话`, data: `/sel s ${i + 1}` }]) })
  assert(await bot.sendMenu(menu(3)) === true, 'small menu served as card')
  const mcard = client.sent.at(-1).body.template_card
  assert(mcard.button_list.length === 3 && mcard.button_list[2].key === 'c:/sel s 3', 'menu buttons keyed c:<cmd>')
  assert(mcard.button_list.every(button => button.text.length <= 10), 'menu button labels respect WeCom recommended width')
  assert(await bot.sendMenu(menu(8)) === false, '>6 entries → text fallback')

  // Only issued, matching, allowlisted tasks can route a callback.
  const replies = []
  bot.onPromptReply = async (chatId, text, entry) => { replies.push({ chatId, text, entry }); return true }
  const approval = { kind: 'approval', sessionId: 'a', toolName: 'bash', createdAt: Date.now(), settle() {} }
  await bot.sendPrompt(approval)
  const issued = client.sent.at(-1).body.template_card.task_id
  const tap = (task, key, user = 'zhangsan') => client.emit('event.template_card_event', {
    headers: { req_id: 'ev' }, body: { chattype: 'single', from: { userid: user },
      event: { eventtype: 'template_card_event', task_id: task, event_key: key } },
  })
  tap('unknown', 'a')
  tap(issued, 'a', 'other-chat')
  assert(replies.length === 0, 'unknown tasks and wrong chats denied')
  tap(issued, 'a')
  tap(issued, 'a')
  await new Promise(resolve => setImmediate(resolve))
  assert(replies.length === 1 && replies[0].entry === approval && replies[0].text === 'Y', 'exact prompt and replay protection')
  assert(client.updates.length === 1, 'only accepted callback acknowledged')

  bot.dispose()
  rmSync(dir, { recursive: true, force: true })
  server.close()
  console.log(failures === 0 ? '\n✅ all passed' : `\n❌ ${failures} assertion(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
