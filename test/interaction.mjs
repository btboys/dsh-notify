/**
 * Unit test for the chat InteractionBridge (src/interaction.ts).
 *
 * The bridge is transport-agnostic: it talks to an InteractionHost and hands
 * prompts to the chat. This test mocks that host, then verifies:
 *   1. an approval prompt is pushed with Y/N instructions and a "Y" reply
 *      resolves the seam with 'allowed-once',
 *   2. dropping a prompt settled elsewhere clears the pending entry and
 *      resolves its seam with null (the host then falls back to the chain),
 *   3. a question prompt pushes numbered options and a numeric reply maps to
 *      the option label,
 *   4. free text with nothing pending continues the last notified session
 *      through host.prompt(),
 *   5. non-allowlisted users are ignored,
 *   6. /sessions and /workspace push selection menus (structured sendMenu),
 *      /sel picks switch the continuation target — workspaces reuse their
 *      latest session or create one when empty,
 *   7. slash commands never consume a pending approval.
 */

import { Context } from '@deepseek-ai/cordis'
import { InteractionBridge } from '../lib/interaction.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('🧪 Testing InteractionBridge...\n')

  /** The host sink captured by attach(). */
  let sink = null
  const prompts = []
  const pushed = []
  const menus = []
  const promptEntries = []
  const createdSessions = []
  const sessionItems = [
    { sessionId: 'session-42', updatedAt: 3, running: false, blank: false, cwd: '/work/notify', projections: { values: { title: '旧对话' } } },
    { sessionId: 'session-app-1', updatedAt: 2, running: true, blank: false, cwd: '/work/app', projections: { values: { title: '修 bug' } } },
    { sessionId: 'session-blank', updatedAt: 1, running: false, blank: true, cwd: '/work/app' },
  ]
  const workspaceItems = [
    { workspaceId: 'ws-notify', path: '/work/notify', title: 'notify', sessionIds: ['session-42'] },
    { workspaceId: 'ws-empty', path: '/work/empty', title: 'empty', sessionIds: [] },
  ]

  const host = {
    attach(next) { sink = next; return () => { sink = null } },
    prompt: async (sessionId, text) => { prompts.push({ sessionId, text }); return { ok: true } },
    listSessions: async () => sessionItems,
    listWorkspaces: async () => workspaceItems,
    createSession: async (workspaceId) => {
      createdSessions.push(workspaceId)
      return { ok: true, sessionId: 'session-new-1' }
    },
  }

  const ctx = new Context()
  /** Flip to make the channel's prompt push fail (seam must stay open). */
  let boomPrompt = false
  const bridge = new InteractionBridge(ctx, host, {
    pushText: async (text) => { pushed.push(text) },
    // Capture the structured entry but decline it, so the pushText fallback
    // path (and its assertions) stays exercised too.
    sendPrompt: async (entry) => {
      if (boomPrompt) throw new Error('channel down')
      promptEntries.push(entry)
      return false
    },
    sendMenu: async (menu) => { menus.push(menu); return true },
    canInteract: (userId) => userId === 'boss@im.wechat',
  })
  bridge.start()
  if (!sink) throw new Error('attach() did not receive the sink')

  // Test 1: approval requested → pushed; "Y" reply resolves the seam
  console.log('✓ Test 1: approval request pushed and approved from chat')
  bridge.noteNotification('session-1', 'notify') // workspace label learned from a prior push
  const approval1 = sink.approval({ sessionId: 'session-1', toolName: 'bash', reason: '需要提升沙箱权限' })
  await sleep(20)
  const approvalPush = pushed[pushed.length - 1]
  console.log('  - pushed:', JSON.stringify(approvalPush.split('\n')[0]))
  if (!approvalPush.includes('bash') || !approvalPush.includes('Y 批准 / N 拒绝')) throw new Error('approval push malformed')
  if (promptEntries[0]?.workspace !== 'notify') throw new Error('workspace label not attached to prompt entry')
  if (bridge.pendingCount !== 1) throw new Error('expected 1 pending interaction')

  await bridge.handleReply('boss@im.wechat', 'Y')
  const outcome1 = await approval1
  if (outcome1 !== 'allowed-once') throw new Error('seam was not claimed with allowed-once: ' + JSON.stringify(outcome1))
  console.log('  - seam outcome:', outcome1)
  console.log('  - receipt:', pushed[pushed.length - 1])
  if (!pushed[pushed.length - 1].includes('已批准')) throw new Error('missing approval receipt')
  if (bridge.pendingCount !== 0) throw new Error('pending not cleared')

  // Test 2: settled elsewhere → whole-batch null + pending cleared
  console.log('✓ Test 2: settled-elsewhere drop releases the seam')
  const approval2 = sink.approval({ sessionId: 'session-1', toolName: 'write', callId: 'call-2' })
  await sleep(20)
  if (bridge.pendingCount !== 1) throw new Error('expected pending approval')
  sink.drop('approval', 'session-1', 'call-2')
  const outcome2 = await approval2
  if (outcome2 !== null) throw new Error('dropped approval must resolve null, got ' + JSON.stringify(outcome2))
  if (bridge.pendingCount !== 0) throw new Error('dropped approval not cleared')

  // Test 3: question with options → numeric reply maps to option label
  console.log('✓ Test 3: question answered with option number')
  const question1 = sink.question({
    sessionId: 'session-9',
    questions: [{ id: 'q1', question: '选哪个方案？', options: [{ label: '方案 A' }, { label: '方案 B' }] }],
  })
  await sleep(20)
  const questionPush = pushed[pushed.length - 1]
  console.log('  - pushed:', JSON.stringify(questionPush.split('\n').slice(0, 5).join(' | ')))
  if (!questionPush.includes('1. 方案 A') || !questionPush.includes('2. 方案 B')) throw new Error('question push malformed')

  await bridge.handleReply('boss@im.wechat', '2')
  const answer1 = await question1
  console.log('  - answer:', JSON.stringify(answer1))
  const ans = answer1?.answers?.[0]
  if (ans?.id !== 'q1' || ans.selected[0] !== '方案 B') throw new Error('numeric reply not mapped to option label')

  // Test 4: free text continues the last notified session
  console.log('✓ Test 4: free text continues the conversation')
  bridge.noteNotification('session-42', 'notify')
  await bridge.handleReply('boss@im.wechat', '顺便把 README 也更新一下')
  if (prompts.length !== 1) throw new Error('host.prompt not called')
  const p = prompts[0]
  console.log('  - prompt to:', p.sessionId)
  if (p.sessionId !== 'session-42' || p.text !== '顺便把 README 也更新一下') throw new Error('prompt routed wrong')
  if (!pushed[pushed.length - 1].includes('已发送到[notify] 会话')) throw new Error('missing continuation receipt: ' + pushed[pushed.length - 1])

  // Test 5: non-allowlisted user is ignored
  console.log('✓ Test 5: allowlist gate')
  const beforePrompts = prompts.length
  const approval3 = sink.approval({ sessionId: 'session-1', toolName: 'bash', callId: 'call-3' })
  await sleep(20)
  await bridge.handleReply('intruder@im.wechat', 'Y')
  if (prompts.length !== beforePrompts) throw new Error('non-allowlisted user drove a continuation')
  if (bridge.pendingCount !== 1) throw new Error('intruder reply consumed the pending approval')
  console.log('  - intruder reply ignored')

  // Test 6: /sessions pushes a menu; /sel s switches the continuation target
  console.log('✓ Test 6: /sessions menu + /sel s switches target')
  // Settle call-3 so free text reaches the continuation path again.
  await bridge.handleReply('boss@im.wechat', 'N')
  const outcome3 = await approval3
  if (outcome3 !== 'rejected') throw new Error('N must reject, got ' + JSON.stringify(outcome3))
  await bridge.handleReply('boss@im.wechat', '/sessions')
  const sessMenu = menus[menus.length - 1]
  console.log('  - menu text:', JSON.stringify(sessMenu.text.split('\n')[0]))
  if (!sessMenu.text.includes('1. [notify] 旧对话') || !sessMenu.text.includes('2. [app] 修 bug')) {
    throw new Error('session menu malformed: ' + sessMenu.text)
  }
  if (sessMenu.text.includes('session-blank')) throw new Error('blank session should be filtered out')
  if (sessMenu.buttons[1]?.[0]?.data !== '/sel s 2') throw new Error('menu button data malformed')

  await bridge.handleReply('boss@im.wechat', '/sel s 2')
  if (!pushed[pushed.length - 1].includes('已切换到对话')) throw new Error('missing switch receipt: ' + pushed[pushed.length - 1])
  await bridge.handleReply('boss@im.wechat', '继续')
  const p2 = prompts[prompts.length - 1]
  if (p2.sessionId !== 'session-app-1') throw new Error('continuation should go to the picked session: ' + p2.sessionId)

  await bridge.handleReply('boss@im.wechat', '/current')
  if (!pushed[pushed.length - 1].includes('📍 当前对话')) throw new Error('missing /current report')

  await bridge.handleReply('boss@im.wechat', '/sel s 99')
  if (!pushed[pushed.length - 1].includes('无效的序号')) throw new Error('stale index should be rejected')

  // Test 7: /workspace reuses the workspace's latest session, or creates one
  console.log('✓ Test 7: /workspace menu reuses or creates a conversation')
  await bridge.handleReply('boss@im.wechat', '/workspace')
  const wsMenu = menus[menus.length - 1]
  if (!wsMenu.text.includes('1. notify') || !wsMenu.text.includes('2. empty')) throw new Error('workspace menu malformed: ' + wsMenu.text)

  await bridge.handleReply('boss@im.wechat', '/sel w 1')
  if (!pushed[pushed.length - 1].includes('已切换到工作区「notify」的对话')) throw new Error('should reuse existing session: ' + pushed[pushed.length - 1])
  if (createdSessions.length !== 0) throw new Error('reuse path must not create a session')
  await bridge.handleReply('boss@im.wechat', '你好')
  if (prompts[prompts.length - 1].sessionId !== 'session-42') throw new Error('workspace reuse routed wrong')

  await bridge.handleReply('boss@im.wechat', '/sel w 2')
  if (createdSessions.length !== 1 || createdSessions[0] !== 'ws-empty') {
    throw new Error('empty workspace should create a session: ' + JSON.stringify(createdSessions))
  }
  if (!pushed[pushed.length - 1].includes('已新建一个')) throw new Error('missing create receipt: ' + pushed[pushed.length - 1])
  await bridge.handleReply('boss@im.wechat', '第一条消息')
  if (prompts[prompts.length - 1].sessionId !== 'session-new-1') throw new Error('created session should be the target')

  // Test 8: slash commands never consume a pending approval
  console.log('✓ Test 8: commands bypass pending-approval routing')
  const approval4 = sink.approval({ sessionId: 'session-1', toolName: 'bash', callId: 'call-4' })
  await sleep(20)
  if (bridge.pendingCount !== 1) throw new Error('expected call-4 pending')
  await bridge.handleReply('boss@im.wechat', '/help')
  if (bridge.pendingCount !== 1) throw new Error('command consumed a pending approval')
  if (!pushed[pushed.length - 1].includes('可用命令')) throw new Error('missing help text')
  await bridge.handleReply('boss@im.wechat', 'Y')
  if (await approval4 !== 'allowed-once') throw new Error('Y should settle the newest pending approval')

  // Test 9: a failing channel push must not fail the seam closed
  console.log('✓ Test 9: channel push failure keeps the seam open')
  boomPrompt = true
  const approval5 = sink.approval({ sessionId: 'session-1', toolName: 'bash', callId: 'call-5' })
  await sleep(20)
  if (bridge.pendingCount !== 1) throw new Error('failed push must still leave the prompt pending')
  boomPrompt = false
  await bridge.handleReply('boss@im.wechat', 'Y')
  if (await approval5 !== 'allowed-once') throw new Error('seam did not survive the push failure')
  console.log('  - push failure tolerated; later reply still claimed the request')

  // Test 10: dispose releases every unanswered seam
  console.log('✓ Test 10: dispose releases pending seams')
  const approval6 = sink.approval({ sessionId: 'session-1', toolName: 'bash', callId: 'call-6' })
  await sleep(20)
  bridge.dispose()
  if (await approval6 !== null) throw new Error('dispose must resolve pending seams with null')
  if (bridge.isActive) throw new Error('bridge still active after dispose')
  if (sink !== null) throw new Error('dispose must detach from the host')

  await ctx.fiber.dispose()
  clearTimeout(watchdog)
  console.log('\n✅ All interaction bridge tests passed!')
}

/** A hung seam would otherwise just drain the event loop and exit 0. */
const watchdog = setTimeout(() => {
  console.error('❌ Test timed out: a seam never settled')
  process.exit(1)
}, 20_000)

main().catch((error) => {
  clearTimeout(watchdog)
  console.error('❌ Test failed:', error)
  process.exit(1)
})
