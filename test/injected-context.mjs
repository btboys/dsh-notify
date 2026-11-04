/**
 * Regression test: host-injected user/message events must never become the
 * notification's 💬 prompt line.
 *
 * dsh-time-context appends a `source.kind === 'time-context'` user message
 * ("Time sampled while preparing turn N, step M: …") before EVERY step, so it
 * is the LAST user/message of the turn and used to overwrite the human's real
 * prompt in the "对话完成" push.
 */
import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from '../lib/index.js'

const settle = () => new Promise((r) => setTimeout(r, 150))

const ctx = new Context()
const sent = []
const log = { info() {}, debug() {}, warn() {}, error() {} }
const service = new NotifyService(ctx, {
  enabled: true,
  channels: { system: { enabled: false } }, // no adapters — capture notify/send instead
})
service.ctx.logger = log
ctx.on('notify/send', (e) => { sent.push(e) })

const injected = 'Time sampled while preparing turn 8, step 34: 2026-11-03T16:41:01+08:00[Asia/Shanghai]\n' +
  'Browser time zone for this request: Asia/Shanghai. Interpret otherwise-unqualified dates and times in this zone.\n' +
  'Elapsed since the preceding step context: 12s.'

const session = {
  id: 'session-injected',
  header: { cwd: '/Users/x/OrderRelay' },
  firstLiveSeq: 0,
  log: [
    { seq: 0, type: 'turn/start', time: 1000, data: { turn: 8 } },
    { seq: 1, type: 'user/message', time: 1100, data: { turn: 8, source: { kind: 'user', rpcId: 'r1' }, content: [{ type: 'text', text: '把扩展端那组提交掉' }] } },
    { seq: 2, type: 'assistant/message', time: 2000, data: { turn: 8, message: { content: [{ type: 'text', text: '已完成。' }] } } },
    // injected every step, no data.turn, therefore last in turnEvents
    { seq: 3, type: 'user/message', time: 3000, data: { source: { kind: 'time-context', form: 'snapshot', sections: [{ name: 'time-context', text: injected }] }, content: [{ type: 'text', text: injected }] } },
  ],
}

ctx.emit('session/event', session, { type: 'turn/end', data: { turn: 8, reason: { kind: 'completed' } } })
await settle()

if (sent.length !== 1) throw new Error('turn/end should notify once, got ' + sent.length)
const msg = sent[0].message
if (!msg.includes('💬 把扩展端那组提交掉')) throw new Error('💬 line must be the real prompt: ' + JSON.stringify(msg))
if (msg.includes('Time sampled while preparing turn')) throw new Error('time-context injection leaked into the push: ' + JSON.stringify(msg))
if (!msg.includes('🤖 已完成。')) throw new Error('🤖 reply line missing: ' + JSON.stringify(msg))
console.log('  ✓ time-context injection filtered out of 💬 line')

await service.dispose()
await ctx.fiber.dispose()
console.log('\n✅ injected-context tests passed')
process.exit(0)
