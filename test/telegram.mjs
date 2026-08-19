/**
 * Integration test for the Telegram adapter's interactive mode
 * (src/adapters/telegram.ts).
 *
 * Mock Bot API server (sendMessage / getUpdates / answerCallbackQuery /
 * editMessageReplyMarkup) verifying:
 *   1. the poll loop drains the backlog, then routes text messages from the
 *      configured chat to onUserMessage (foreign chats are ignored),
 *   2. callback_query button taps translate to the bridge's text vocabulary
 *      (notify:a → 'Y', notify:q:2 → '2'), answer the callback, and clear
 *      the keyboard,
 *   3. sendPrompt renders approval buttons and question option buttons,
 *      and declines non-buttonizable prompts (multi-question),
 *   4. sendMenu renders selection-menu buttons under the notify:c: prefix,
 *      menu callbacks translate back to slash commands, oversized payloads
 *      are dropped, and setMyCommands is registered at startup,
 *   5. canInteract/pushText gating and the interactive:false kill switch.
 */

import { Context } from '@deepseek-ai/cordis'
import { createServer } from 'node:http'
import { TelegramNotificationAdapter } from '../lib/adapters/telegram.js'

function makeCtx() {
  const ctx = new Context()
  ctx.provide('connection', { rpc: { handle: () => () => {} } })
  ctx.provide('webServer', {})
  return ctx
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('🧪 Testing Telegram adapter (interactive)...\n')

  const calls = []
  const pendingUpdates = []
  let updateId = 1000

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      const method = req.url.split('/').pop()
      calls.push({ method, payload })
      res.setHeader('Content-Type', 'application/json')
      if (method === 'getUpdates') {
        // Backlog drain (timeout 0) and subsequent polls: return queued updates.
        const updates = pendingUpdates.splice(0)
        res.end(JSON.stringify({ ok: true, result: updates }))
        return
      }
      if (method === 'sendMessage') {
        res.end(JSON.stringify({ ok: true, result: { message_id: calls.length } }))
        return
      }
      // answerCallbackQuery / editMessageReplyMarkup
      res.end(JSON.stringify({ ok: true, result: true }))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const apiBase = `http://127.0.0.1:${server.address().port}`

  const ctx = makeCtx()
  const received = []
  const adapter = new TelegramNotificationAdapter(ctx, {
    enabled: true, botToken: 'test-token', chatId: '4242', interactive: true,
  }, { apiBase })
  adapter.onUserMessage = (userId, text) => { received.push([userId, text]) }

  // Seed: one stale backlog update (should be drained, never delivered),
  // then a live text message from the allowed chat and one from a stranger.
  pendingUpdates.push(
    { update_id: updateId++, message: { chat: { id: 4242 }, text: 'stale backlog' } },
  )
  await sleep(150) // let the drain happen
  if (received.length !== 0) throw new Error('backlog update should have been drained silently')

  console.log('✓ Test 1: poll loop routes allowed-chat text, ignores strangers')
  pendingUpdates.push(
    { update_id: updateId++, message: { chat: { id: 9999 }, text: 'intruder' } },
    { update_id: updateId++, message: { chat: { id: 4242 }, text: '你好' } },
  )
  for (let i = 0; i < 40 && received.length === 0; i++) await sleep(50)
  console.log('  - received:', JSON.stringify(received))
  if (received.length !== 1 || received[0][0] !== '4242' || received[0][1] !== '你好') {
    throw new Error('text routing wrong: ' + JSON.stringify(received))
  }

  console.log('✓ Test 2: callback_query translates to bridge vocabulary')
  pendingUpdates.push({
    update_id: updateId++,
    callback_query: { id: 'cb-1', data: 'notify:a', from: { id: 4242 }, message: { chat: { id: 4242 }, message_id: 7 } },
  })
  pendingUpdates.push({
    update_id: updateId++,
    callback_query: { id: 'cb-2', data: 'notify:q:2', from: { id: 4242 }, message: { chat: { id: 4242 }, message_id: 8 } },
  })
  for (let i = 0; i < 40 && received.length < 3; i++) await sleep(50)
  console.log('  - received:', JSON.stringify(received.slice(1)))
  if (received[1]?.[1] !== 'Y' || received[2]?.[1] !== '2') throw new Error('callback translation wrong')
  if (!calls.some((c) => c.method === 'answerCallbackQuery' && c.payload.callback_query_id === 'cb-1')) {
    throw new Error('answerCallbackQuery not called')
  }
  if (!calls.some((c) => c.method === 'editMessageReplyMarkup' && c.payload.message_id === 8)) {
    throw new Error('keyboard not cleared after tap')
  }

  console.log('✓ Test 3: sendPrompt renders inline keyboards')
  const okApproval = await adapter.sendPrompt({
    kind: 'approval', rpcId: 'r1', sessionId: 'session-abcdef', approvalId: 'a1', toolName: 'bash', reason: '测试', createdAt: Date.now(), workspace: 'financial-v5',
  })
  if (!okApproval) throw new Error('approval sendPrompt should claim')
  const approvalMsg = calls.filter((c) => c.method === 'sendMessage').pop().payload
  if (!approvalMsg.text.startsWith('🔐 [financial-v5] 需要授权（session-…）')) {
    throw new Error('approval header should carry the workspace label: ' + approvalMsg.text.split('\n')[0])
  }
  const kb = approvalMsg.reply_markup?.inline_keyboard
  if (!kb?.[0]?.some((b) => b.callback_data === 'notify:a') || !kb[0].some((b) => b.callback_data === 'notify:r')) {
    throw new Error('approval keyboard malformed: ' + JSON.stringify(kb))
  }
  console.log('  - approval keyboard:', JSON.stringify(kb[0].map((b) => b.text)))

  // No workspace label → header falls back to the plain form.
  await adapter.sendPrompt({
    kind: 'approval', rpcId: 'r1b', sessionId: 'session-x', approvalId: 'a1b', toolName: 'write', createdAt: Date.now(),
  })
  const unlabeled = calls.filter((c) => c.method === 'sendMessage').pop().payload
  if (!unlabeled.text.startsWith('🔐 需要授权（session-…）')) {
    throw new Error('unlabeled approval header wrong: ' + unlabeled.text.split('\n')[0])
  }

  const okQuestion = await adapter.sendPrompt({
    kind: 'question', rpcId: 'r2', sessionId: 'session-abcdef', createdAt: Date.now(),
    questions: [{ id: 'q1', question: '选哪个？', options: [{ label: '甲' }, { label: '乙' }] }],
  })
  if (!okQuestion) throw new Error('question sendPrompt should claim')
  const questionMsg = calls.filter((c) => c.method === 'sendMessage').pop().payload
  if (questionMsg.reply_markup?.inline_keyboard?.[1]?.[0]?.callback_data !== 'notify:q:2') {
    throw new Error('question keyboard malformed')
  }

  const declined = await adapter.sendPrompt({
    kind: 'question', rpcId: 'r3', sessionId: 's', createdAt: Date.now(),
    questions: [{ id: 'q1', question: 'a' }, { id: 'q2', question: 'b' }],
  })
  if (declined) throw new Error('multi-question prompt should fall back to text')

  console.log('✓ Test 4: sendMenu renders menu buttons and menu callbacks translate to slash commands')
  const menuCallsBefore = calls.filter((c) => c.method === 'sendMessage').length
  const okMenu = await adapter.sendMenu({
    text: '💬 选择要续接的对话：\n\n1. [app] 修 bug\n2. [web] 写文档',
    buttons: [
      [{ text: '1. 修 bug', data: '/sel s 1' }],
      [{ text: '2. 写文档', data: '/sel s 2' }],
      [{ text: 'x'.repeat(80), data: `/sel s ${'9'.repeat(80)}` }], // oversized → dropped
    ],
  })
  if (!okMenu) throw new Error('sendMenu should claim')
  const menuMsg = calls.filter((c) => c.method === 'sendMessage').pop().payload
  const menuKb = menuMsg.reply_markup?.inline_keyboard
  if (menuKb?.length !== 2) throw new Error('oversized menu button should be dropped: ' + JSON.stringify(menuKb))
  if (menuKb[0][0]?.callback_data !== 'notify:c:/sel s 1') throw new Error('menu callback_data malformed')
  console.log('  - menu keyboard:', JSON.stringify(menuKb.map((r) => r[0].callback_data)))

  pendingUpdates.push({
    update_id: updateId++,
    callback_query: { id: 'cb-3', data: 'notify:c:/sel s 2', from: { id: 4242 }, message: { chat: { id: 4242 }, message_id: 9 } },
  })
  for (let i = 0; i < 40 && received.length < 4; i++) await sleep(50)
  if (received[3]?.[1] !== '/sel s 2') throw new Error('menu callback should translate to slash command: ' + JSON.stringify(received))
  if (calls.filter((c) => c.method === 'sendMessage').length !== menuCallsBefore + 1) throw new Error('sendMenu should send exactly one message')
  if (!calls.some((c) => c.method === 'setMyCommands')) throw new Error('setMyCommands should be registered at startup')

  console.log('✓ Test 5: pushText + canInteract gating')
  await adapter.pushText('回执测试')
  const receipt = calls.filter((c) => c.method === 'sendMessage').pop().payload
  if (receipt.text !== '回执测试' || receipt.chat_id !== '4242') throw new Error('pushText payload wrong')
  if (!adapter.canInteract('4242') || adapter.canInteract('9999')) throw new Error('canInteract gating wrong')

  console.log('✓ Test 6: markdown body renders as Telegram HTML in HTML parse mode')
  await adapter.send({
    type: 'conversationCompleted',
    title: 'Markdown Test',
    message: '## 结论\n这是 **重点** 和 `code`\n```js\nlet a = 1 < 2\n```\n详见 [文档](https://example.com)\n代码里的 `**星号**` 保持字面\n- 列表项甲\n- 列表项乙',
  })
  const mdMsg = calls.filter((c) => c.method === 'sendMessage').pop().payload
  if (mdMsg.parse_mode !== 'HTML') throw new Error('expected HTML parse mode')
  for (const frag of ['<b>结论</b>', '<b>重点</b>', '<code>code</code>', '<pre>let a = 1 &lt; 2</pre>', '<a href="https://example.com">文档</a>', '<code>**星号**</code>', '• 列表项甲']) {
    if (!mdMsg.text.includes(frag)) throw new Error(`missing ${frag} in: ${mdMsg.text}`)
  }
  if (mdMsg.text.includes('##') || mdMsg.text.includes('```') || mdMsg.text.includes('\n- ')) {
    throw new Error('raw markdown markers leaked: ' + mdMsg.text)
  }
  // Telegram rejects entities nested INSIDE <code> (400 can't parse entities)
  if (/<code>[^<]*<(b|i|s)>/.test(mdMsg.text)) {
    throw new Error('entity nested inside <code> — Telegram would reject the whole message: ' + mdMsg.text)
  }

  console.log('✓ Test 6b: markdown body renders as MarkdownV2 entities in MarkdownV2 parse mode')
  const mdAdapter = new TelegramNotificationAdapter(makeCtx(), {
    enabled: true, botToken: 't', chatId: '1', interactive: false, parseMode: 'MarkdownV2',
  }, { apiBase })
  await mdAdapter.send({
    type: 'conversationCompleted',
    title: 'T',
    message: '## 根因\n旧实现**串行**执行，挤在 `deleteDetail` 里\n## 修复（与 `push()` 同款）\n1. **去重**：新增 `deleteUnchecked(primaryKey, reference)`\n> 引用一行\n详见 [文档](https://example.com)\n- 列表项丙',
  })
  const mdV2Msg = calls.filter((c) => c.method === 'sendMessage').pop().payload
  if (mdV2Msg.parse_mode !== 'MarkdownV2') throw new Error('expected MarkdownV2 parse mode')
  for (const frag of ['*根因*', '*串行*', '`deleteDetail`', '`push\\(\\)`', '>引用一行', '[文档](https://example.com)', '1\\.', '• 列表项丙']) {
    if (!mdV2Msg.text.includes(frag)) throw new Error(`missing ${frag} in: ${mdV2Msg.text}`)
  }
  if (mdV2Msg.text.includes('**') || mdV2Msg.text.includes('##') || mdV2Msg.text.includes('%%DSHMD')) {
    throw new Error('raw markdown or unresolved token leaked: ' + mdV2Msg.text)
  }
  mdAdapter.dispose()

  console.log('✓ Test 7: interactive:false disables polling')
  adapter.dispose() // stop the first adapter so getUpdates counts isolate Test 5
  await sleep(150)
  const callsBefore = calls.filter((c) => c.method === 'getUpdates').length
  const ctx2 = makeCtx()
  const passive = new TelegramNotificationAdapter(ctx2, {
    enabled: true, botToken: 't', chatId: '1', interactive: false,
  }, { apiBase })
  if (passive.isInteractive()) throw new Error('should not be interactive')
  if (await passive.sendPrompt({ kind: 'approval', rpcId: 'x', sessionId: 's', approvalId: 'a', toolName: 't', createdAt: Date.now() })) {
    throw new Error('passive adapter must not claim prompts')
  }
  await sleep(150)
  if (calls.filter((c) => c.method === 'getUpdates').length !== callsBefore) throw new Error('passive adapter should not poll')
  passive.dispose()
  await ctx2.fiber.dispose()

  server.close()
  await ctx.fiber.dispose()
  console.log('\n✅ All Telegram adapter tests passed!')
}

main().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
