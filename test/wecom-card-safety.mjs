import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { InteractionBridge } from '../lib/interaction.js'
let sink
const entries = []
const continuations = []
const bridge = new InteractionBridge(new Context(), {
  attach(s) { sink = s; return () => {} },
  async prompt(...args) { continuations.push(args); return { ok: true } },
}, {
  canInteract: id => id === 'allowed',
  async pushText() {},
  async sendPrompt(entry) { entries.push(entry); return true },
})
bridge.start()
const a = sink.approval({ sessionId: 'a', toolName: 'first' })
const b = sink.approval({ sessionId: 'b', toolName: 'second' })
assert.equal(typeof bridge.handlePromptReply, 'function', 'cards need exact-request routing')
assert.equal(await bridge.handlePromptReply('denied', 'Y', entries[0]), false)
assert.equal(await bridge.handlePromptReply('allowed', 'Y', entries[0]), true)
assert.equal(await a, 'allowed-once')
assert.equal(bridge.pendingCount, 1)
assert.equal(await bridge.handlePromptReply('allowed', 'Y', entries[0]), false, 'replay rejected')
assert.equal(continuations.length, 0)
assert.equal(await bridge.handlePromptReply('allowed', 'N', entries[1]), true)
assert.equal(await b, 'rejected')
bridge.dispose()
console.log('PASS exact card routing, permission and replay safety')
