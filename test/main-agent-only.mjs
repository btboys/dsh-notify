/**
 * Regression test: mainAgentOnly gate + subagent summary content isolation.
 *
 * - With mainAgentOnly on (default), a subagent session's turn/end and
 *   todo_write events must NOT notify; the main agent's still do.
 * - With the switch off, a subagent notification must summarize the CHILD's
 *   own turn, never the parent conversation inherited through the seed.
 */
import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from '../lib/index.js'

const settle = () => new Promise((r) => setTimeout(r, 150))

const ctx = new Context()
const sent = []
const service = new NotifyService(ctx, {
  enabled: true,
  channels: { system: { enabled: false } }, // no adapters — capture notify/send instead
})
ctx.on('notify/send', (e) => { sent.push(e) })

// Fake MAIN session: no origin/depth, plain log.
const mainSession = {
  id: 'session-main',
  header: { cwd: '/Users/x/DewMind' },
  firstLiveSeq: 0,
  log: [
    { seq: 0, type: 'user/message', time: 1000, data: { content: '主 agent 的用户问题', turn: 1 } },
    { seq: 1, type: 'assistant/message', time: 2000, data: { message: { content: [{ type: 'text', text: '主 agent 的回复' }] }, turn: 1 } },
  ],
}

// Fake SUBAGENT session: origin=subagent, depth=1, log SEEDED with parent
// events plus its own work appended after firstLiveSeq.
const subSession = {
  id: 'session-sub',
  header: { cwd: '/Users/x/DewMind', origin: 'subagent', delegationDepth: 1, parentSession: 'session-main' },
  firstLiveSeq: 2,
  log: [
    { seq: 0, type: 'user/message', time: 1000, data: { content: '主 agent 的用户问题', turn: 1 } },
    { seq: 1, type: 'assistant/message', time: 2000, data: { message: { content: [{ type: 'text', text: '主 agent 的回复' }] }, turn: 1 } },
    { seq: 2, type: 'user/message', time: 3000, data: { content: '子 agent 自己的任务', turn: 1 } },
    { seq: 3, type: 'assistant/message', time: 4000, data: { message: { content: [{ type: 'text', text: '子 agent 自己的回复' }] }, turn: 1 } },
  ],
}

// 1. mainAgentOnly default on: subagent turn/end suppressed.
ctx.emit('session/event', subSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
await settle()
if (sent.length !== 0) throw new Error('subagent turn/end should be suppressed, got ' + sent.length)
console.log('  ✓ subagent turn/end suppressed by default')

// 2. subagent todo_write suppressed.
ctx.emit('session/event', subSession, { type: 'tool/call', data: { name: 'todo_write', arguments: JSON.stringify({ todos: [{ content: 'x', status: 'completed' }] }) } })
await settle()
if (sent.length !== 0) throw new Error('subagent todo_write should be suppressed')
console.log('  ✓ subagent todo_write suppressed by default')

// 2b. subagent todo/write snapshot suppressed.
ctx.emit('session/event', subSession, { type: 'todo/write', data: { todos: [{ content: 'x', status: 'completed' }] } })
await settle()
if (sent.length !== 0) throw new Error('subagent todo/write should be suppressed')
console.log('  ✓ subagent todo/write suppressed by default')

// 3. main session turn/end still notifies.
ctx.emit('session/event', mainSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
await settle()
if (sent.length !== 1) throw new Error('main turn/end should notify, got ' + sent.length)
console.log('  ✓ main agent turn/end notifies:', JSON.stringify(sent[0].title))

// 4. Switch off -> subagent notifies, and content is the SUBAGENT's own work.
service.updateConfig({ mainAgentOnly: false })
ctx.emit('session/event', subSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
await settle()
if (sent.length !== 2) throw new Error('subagent should notify when switch off, got ' + sent.length)
const msg = sent[1].message
if (!msg.includes('子 agent 自己的任务') || !msg.includes('子 agent 自己的回复')) {
  throw new Error('subagent summary should contain its own work: ' + msg)
}
if (msg.includes('主 agent 的用户问题') || msg.includes('主 agent 的回复')) {
  throw new Error('subagent summary must NOT repeat parent content: ' + msg)
}
console.log('  ✓ switch off: subagent notifies with its OWN content (no parent bleed)')

// 5. Config round-trips through updateConfig/getConfig.
service.updateConfig({ mainAgentOnly: true })
if (service.getConfig().mainAgentOnly !== true) throw new Error('mainAgentOnly should persist in config')
console.log('  ✓ mainAgentOnly config round-trip ok')

await service.dispose()
await ctx.fiber.dispose()
console.log('\n✅ main-agent-only tests passed')
process.exit(0)
