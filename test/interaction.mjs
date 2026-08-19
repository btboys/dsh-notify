/**
 * Unit test for the WeChat InteractionBridge (src/interaction.ts).
 *
 * Mocks the host apiProxy (mux stream + respond + sessions.prompt) and the
 * WeChat push hook, then verifies:
 *   1. approval/requested frames are pushed with Y/N instructions and a "Y"
 *      reply settles the approval with outcome 'allowed-once',
 *   2. approval/resolved (answered elsewhere) clears the pending entry,
 *   3. question/requested frames push numbered options and a numeric reply
 *      maps to the option label,
 *   4. free text with nothing pending continues the last notified session
 *      via sessions.prompt (queue mode),
 *   5. non-allowlisted users are ignored.
 */

import { Context } from '@deepseek-ai/cordis'
import { InteractionBridge } from '../lib/interaction.js'

function makeCtx() {
  const ctx = new Context()
  ctx.provide('connection', { rpc: { handle: () => () => {} } })
  ctx.provide('webServer', {})
  return ctx
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Controllable async-iterable mux stream. */
function makeMux() {
  const queue = []
  let waiter = null
  return {
    frames: queue,
    push(frame) {
      const item = { rpcId: frame._rpcId ?? `rpc-${Math.random().toString(36).slice(2)}`, payload: frame }
      if (waiter) { waiter(item); waiter = null } else queue.push(item)
    },
    stream() {
      return (async function* () {
        while (true) {
          if (queue.length > 0) yield queue.shift()
          else await new Promise((r) => { waiter = (item) => { waiter = null; r(); queue.push(item) } })
        }
      })()
    },
  }
}

async function main() {
  console.log('🧪 Testing InteractionBridge...\n')

  const mux = makeMux()
  const responses = []
  const prompts = []
  const pushed = []
  const apiProxy = {
    events: { mux: (_req, _signal) => mux.stream() },
    respond: async (message) => { responses.push(message); return { accepted: true } },
    sessions: {
      prompt: async (request) => {
        prompts.push(request)
        return { type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { accepted: true } } }
      },
    },
  }

  const ctx = makeCtx()
  const bridge = new InteractionBridge(ctx, apiProxy, {
    pushText: async (text) => { pushed.push(text) },
    canInteract: (userId) => userId === 'boss@im.wechat',
  })
  bridge.start()

  // Test 1: approval requested → pushed; "Y" reply settles it
  console.log('✓ Test 1: approval request pushed and approved via WeChat')
  mux.push({ _rpcId: 'ap-1', type: 'approval/requested', sessionId: 'session-1', approvalId: 'approval-1', toolName: 'bash', reason: '需要提升沙箱权限' })
  await sleep(50)
  const approvalPush = pushed[pushed.length - 1]
  console.log('  - pushed:', JSON.stringify(approvalPush.split('\n')[0]))
  if (!approvalPush.includes('bash') || !approvalPush.includes('Y 批准 / N 拒绝')) throw new Error('approval push malformed')
  if (bridge.pendingCount !== 1) throw new Error('expected 1 pending interaction')

  await bridge.handleReply('boss@im.wechat', 'Y')
  if (responses.length !== 1) throw new Error('respond not called')
  const r1 = responses[0]
  if (r1.rpcId !== 'ap-1' || r1.result.value.outcome !== 'allowed-once' || r1.result.value.approvalId !== 'approval-1') {
    throw new Error('approval response malformed: ' + JSON.stringify(r1))
  }
  console.log('  - respond outcome:', r1.result.value.outcome)
  console.log('  - receipt:', pushed[pushed.length - 1])
  if (!pushed[pushed.length - 1].includes('已批准')) throw new Error('missing approval receipt')
  if (bridge.pendingCount !== 0) throw new Error('pending not cleared')

  // Test 2: approval resolved elsewhere clears pending; next reply is a continuation
  console.log('✓ Test 2: approval/resolved elsewhere clears pending')
  mux.push({ _rpcId: 'ap-2', type: 'approval/requested', sessionId: 'session-1', approvalId: 'approval-2', toolName: 'write' })
  await sleep(50)
  if (bridge.pendingCount !== 1) throw new Error('expected pending approval')
  mux.push({ type: 'approval/resolved', sessionId: 'session-1', approvalId: 'approval-2', outcome: 'rejected' })
  await sleep(50)
  if (bridge.pendingCount !== 0) throw new Error('resolved approval not cleared')

  // Test 3: question with options → numeric reply maps to option label
  console.log('✓ Test 3: question answered with option number')
  mux.push({
    _rpcId: 'q-1',
    type: 'question/requested',
    sessionId: 'session-9',
    questions: [{ id: 'q1', question: '选哪个方案？', options: [{ label: '方案 A' }, { label: '方案 B' }] }],
  })
  await sleep(50)
  const questionPush = pushed[pushed.length - 1]
  console.log('  - pushed:', JSON.stringify(questionPush.split('\n').slice(0, 5).join(' | ')))
  if (!questionPush.includes('1. 方案 A') || !questionPush.includes('2. 方案 B')) throw new Error('question push malformed')

  await bridge.handleReply('boss@im.wechat', '2')
  const r2 = responses[responses.length - 1]
  if (r2.rpcId !== 'q-1') throw new Error('wrong question rpcId')
  const ans = r2.result.value.answer.answers[0]
  console.log('  - answer:', JSON.stringify(ans))
  if (ans.id !== 'q1' || ans.selected[0] !== '方案 B') throw new Error('numeric reply not mapped to option label')

  // Test 4: free text continues the last notified session
  console.log('✓ Test 4: free text continues the conversation')
  bridge.noteNotification('session-42', 'notify')
  await bridge.handleReply('boss@im.wechat', '顺便把 README 也更新一下')
  if (prompts.length !== 1) throw new Error('sessions.prompt not called')
  const p = prompts[0]
  console.log('  - prompt to:', p.payload.sessionId, '| mode:', p.payload.mode)
  if (p.payload.sessionId !== 'session-42' || p.payload.mode !== 'queue') throw new Error('prompt routed wrong')
  if (p.payload.content[0].text !== '顺便把 README 也更新一下') throw new Error('prompt content wrong')
  if (!pushed[pushed.length - 1].includes('已发送到[notify] 会话')) throw new Error('missing continuation receipt: ' + pushed[pushed.length - 1])

  // Test 5: non-allowlisted user is ignored
  console.log('✓ Test 5: allowlist gate')
  const beforeResponses = responses.length
  const beforePrompts = prompts.length
  mux.push({ _rpcId: 'ap-3', type: 'approval/requested', sessionId: 'session-1', approvalId: 'approval-3', toolName: 'bash' })
  await sleep(50)
  await bridge.handleReply('intruder@im.wechat', 'Y')
  if (responses.length !== beforeResponses || prompts.length !== beforePrompts) {
    throw new Error('non-allowlisted user drove an interaction')
  }
  console.log('  - intruder reply ignored')

  bridge.dispose()
  await ctx.fiber.dispose()
  console.log('\n✅ All interaction bridge tests passed!')
}

main().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
