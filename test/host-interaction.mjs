/**
 * Unit test for the host adapter (src/host-interaction.ts) — the part that
 * composes with the 0.2.0 seams instead of the removed `ctx.apiProxy`.
 *
 * It drives the REAL cordis waterfall the approval/question services use
 * (`ctx.waterfall('approval/request', request, fallback)`), with a fake
 * "browser" answerer registered BEFORE the adapter to prove the adapter's
 * `{ prepend: true }` registration is what keeps the chat in front of it, and
 * verifies:
 *   1. ordering — the adapter answers first even though the browser listener
 *      was registered earlier (an unprepended listener would never run),
 *   2. the browser wins → its outcome is returned and the chat prompt is
 *      dropped instead of lingering,
 *   3. the chat wins → its outcome is returned while the browser branch is
 *      still pending (first answer wins),
 *   4. an aborted question rejects the seam with the wait's own reason, so a
 *      timed `ask_user_question` never hangs,
 *   5. a request without an agent session is delegated untouched,
 *   6. the outbound host calls (prompt / list / create / workspaces) map onto
 *      the real service shapes and degrade clearly when a service is absent.
 */

import { Context } from '@deepseek-ai/cordis'
import { DshInteractionHost } from '../lib/host-interaction.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A sink whose answers this test controls. */
function makeSink() {
  const calls = { approvals: [], questions: [], drops: [] }
  const answers = []
  return {
    calls,
    approvals: calls.approvals,
    questions: calls.questions,
    drops: calls.drops,
    /** Resolve the oldest unanswered approval with `outcome`. */
    answerApproval(outcome) {
      const entry = answers.find((a) => a.kind === 'approval' && !a.settled)
      if (!entry) throw new Error('no pending approval to answer')
      entry.settled = true
      entry.resolve(outcome)
    },
    /** Resolve the oldest unanswered question with `answer`. */
    answerQuestion(answer) {
      const entry = answers.find((a) => a.kind === 'question' && !a.settled)
      if (!entry) throw new Error('no pending question to answer')
      entry.settled = true
      entry.resolve(answer)
    },
    sink: {
      approval(view) {
        calls.approvals.push(view)
        return new Promise((resolve) => { answers.push({ kind: 'approval', view, resolve, settled: false }) })
      },
      question(view) {
        calls.questions.push(view)
        return new Promise((resolve) => { answers.push({ kind: 'question', view, resolve, settled: false }) })
      },
      drop(kind, sessionId, callId) {
        calls.drops.push({ kind, sessionId, callId })
        for (const entry of answers) {
          if (entry.kind === kind && !entry.settled) {
            entry.settled = true
            entry.resolve(null)
          }
        }
      },
    },
  }
}

/** Run the approval waterfall the way the approval service does. */
function askApproval(ctx, request) {
  return ctx.waterfall('approval/request', request, () => Promise.resolve('unavailable'))
}

/** Run the question waterfall the way the user-questions service does. */
function askQuestion(ctx, request) {
  return ctx.waterfall('user-questions/request', request, () => Promise.reject(new Error('NO_PROVIDER')))
}

async function main() {
  console.log('🧪 Testing DshInteractionHost...\n')

  const controllerCalls = { prompt: [], list: [], create: [] }
  const sessions = [
    {
      sessionId: 'session-42', updatedAt: 7, running: true, blank: false, cwd: '/work/notify',
      projections: { values: { title: '旧对话' } },
    },
    { sessionId: 'session-cold', updatedAt: 3, running: false, blank: false, cwd: '/work/app', origin: undefined },
  ]
  const workspaces = [
    { id: 'ws-1', path: '/work/notify', title: 'notify', sessionIds: ['session-42'] },
  ]

  const ctx = new Context()
  ctx.provide('sessionController', {
    prompt: async (request) => { controllerCalls.prompt.push(request); return { accepted: true } },
    list: async () => ({ items: sessions }),
    create: async (request) => { controllerCalls.create.push(request); return { sessionId: 'session-new' } },
  })
  ctx.provide('workspaceRegistry', { list: () => workspaces, get: (id) => workspaces.find((w) => w.id === id) })

  const host = new DshInteractionHost(ctx)
  const sink = makeSink()
  const order = []
  /**
   * The fake "browser" answerer: registered BEFORE attach, so only prepend
   * saves us. 'hold' parks the decision (a connected Web client waiting for
   * input), 'delegate' passes the request straight through to the fallback.
   */
  let browserMode = 'hold'
  let browserAnswer = null
  ctx.on('approval/request', async (request, next) => {
    order.push('browser')
    return browserMode === 'delegate' ? next() : new Promise((resolve) => { browserAnswer = resolve })
  })
  ctx.on('user-questions/request', async (request, next) => {
    order.push('browser-question')
    return browserMode === 'delegate' ? next() : new Promise((resolve) => { browserAnswer = resolve })
  })
  const detach = host.attach(sink.sink)

  // Test 1: prepend ordering + browser wins → browser outcome, chat prompt dropped
  console.log('✓ Test 1: adapter runs before a pre-registered browser answerer')
  const a1 = askApproval(ctx, { agent: { id: 'session-1', session: { id: 'session-1', header: { cwd: '/work/notify' } } }, toolName: 'bash', callId: 'call-1', reason: '需要提升沙箱权限' })
  await sleep(20)
  if (order[0] !== 'browser') throw new Error('downstream answerer never ran: ' + JSON.stringify(order))
  if (sink.approvals.length !== 1) throw new Error('chat prompt was not pushed')
  console.log('  - pushed approval:', JSON.stringify({ sessionId: sink.approvals[0].sessionId, toolName: sink.approvals[0].toolName, callId: sink.approvals[0].callId }))

  browserAnswer('rejected')
  const o1 = await a1
  if (o1 !== 'rejected') throw new Error('browser outcome must win, got ' + JSON.stringify(o1))
  await sleep(5)
  if (sink.drops.length !== 1 || sink.drops[0].callId !== 'call-1') {
    throw new Error('chat prompt was not dropped after the browser won: ' + JSON.stringify(sink.drops))
  }
  console.log('  - winner: browser (rejected); chat prompt dropped')

  // Test 2: chat wins while the browser branch stays pending
  console.log('✓ Test 2: chat answer wins against a pending browser answerer')
  order.length = 0
  const a2 = askApproval(ctx, { agent: { id: 'session-1', session: { id: 'session-1' } }, toolName: 'write', callId: 'call-2' })
  await sleep(20)
  if (order[0] !== 'browser') throw new Error('downstream answerer never ran')
  sink.answerApproval('allowed-once')
  const o2 = await a2
  if (o2 !== 'allowed-once') throw new Error('chat outcome must win, got ' + JSON.stringify(o2))
  console.log('  - winner: chat (allowed-once)')

  // Test 3: an aborted question rejects with the wait's own reason
  console.log('✓ Test 3: aborted question rejects with the signal reason')
  const wait = new AbortController()
  const reason = new Error('ask_user_question timed out before the user answered')
  const q1 = askQuestion(ctx, {
    agent: { id: 'session-9', session: { id: 'session-9' } },
    questions: [{ id: 'q1', question: '选哪个方案？', options: [{ label: '方案 A' }, { label: '方案 B' }] }],
    wait: { callId: 'call-q1', timed: true },
    signal: wait.signal,
  })
  await sleep(20)
  if (sink.questions.length !== 1) throw new Error('question prompt was not pushed')
  if (sink.questions[0].callId !== 'call-q1') throw new Error('question callId not forwarded')
  wait.abort(reason)
  let rejected = null
  try {
    await q1
  } catch (error) {
    rejected = error
  }
  if (rejected !== reason) throw new Error('question seam must reject with the wait reason, got ' + String(rejected))
  console.log('  - rejected with the wait reason')

  // Test 4: a request with no agent session is delegated untouched
  console.log('✓ Test 4: request without a session delegates')
  browserMode = 'delegate'
  const before = sink.approvals.length
  const delegated = await askApproval(ctx, { toolName: 'bash' })
  if (delegated !== 'unavailable') throw new Error('expected the fallback to answer, got ' + JSON.stringify(delegated))
  if (sink.approvals.length !== before) throw new Error('agent-less request must not be pushed to chat')
  console.log('  - delegated to the chain')
  browserMode = 'hold'

  // Test 5: outbound calls map onto the host services
  console.log('✓ Test 5: prompt / list / create / workspaces call the host')
  const prompted = await host.prompt('session-42', '顺便把 README 更新一下')
  if (!prompted.ok) throw new Error('prompt failed: ' + prompted.error)
  const request = controllerCalls.prompt[0]
  if (request.sessionId !== 'session-42' || request.mode !== 'queue') throw new Error('prompt request malformed: ' + JSON.stringify(request))
  if (request.content[0].text !== '顺便把 README 更新一下') throw new Error('prompt content malformed')
  if (typeof request.requestId !== 'string' || request.requestId.length === 0) throw new Error('prompt requestId missing')
  if (request.clientTimeZone !== 'Asia/Shanghai') throw new Error('client time zone missing')
  console.log('  - prompt:', JSON.stringify({ sessionId: request.sessionId, mode: request.mode }))

  const listed = await host.listSessions()
  if (listed?.length !== 2) throw new Error('session list malformed: ' + JSON.stringify(listed))
  if (listed[0].projections?.values?.title !== '旧对话') throw new Error('title projection lost')
  if (listed[0].running !== true || listed[0].blank !== false) throw new Error('live flags lost')
  console.log('  - sessions:', listed.map((s) => `${s.sessionId}${s.running ? ' (running)' : ''}`).join(', '))

  const spaces = await host.listWorkspaces()
  if (spaces?.length !== 1 || spaces[0].workspaceId !== 'ws-1' || spaces[0].title !== 'notify') {
    throw new Error('workspace list malformed: ' + JSON.stringify(spaces))
  }
  console.log('  - workspaces:', spaces.map((w) => w.title).join(', '))

  const created = await host.createSession('ws-1')
  if (!created.ok || created.sessionId !== 'session-new') throw new Error('create failed: ' + JSON.stringify(created))
  if (controllerCalls.create[0].workspaceId !== 'ws-1') throw new Error('create request malformed')
  console.log('  - created session:', created.sessionId)

  // Test 6: degrade clearly without a session controller
  console.log('✓ Test 6: missing services degrade with a clear message')
  const bare = new DshInteractionHost(new Context())
  const barePrompt = await bare.prompt('session-1', 'hi')
  if (barePrompt.ok || !barePrompt.error) throw new Error('prompt should fail without a host')
  const bareList = await bare.listSessions()
  if (bareList !== null) throw new Error('listSessions should return null without a host')
  const bareCreate = await bare.createSession('ws-1')
  if (bareCreate.ok || !bareCreate.error) throw new Error('create should fail without a host')
  console.log('  - prompt:', barePrompt.error)

  detach()
  await ctx.fiber.dispose()
  clearTimeout(watchdog)
  console.log('\n✅ All host adapter tests passed!')
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
