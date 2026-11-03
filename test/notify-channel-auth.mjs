import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from '../lib/service.js'
const service = new NotifyService(new Context(), { channels: { system: { enabled: false } } })
const wx = { name: 'wechat', canInteract: id => id === 'boss', async pushText() {} }
const ai = { name: 'wecom-aibot', canInteract: () => true, async pushText() {} }
service.getWechatAdapter = () => wx
service.getWecomAibotAdapter = () => ai
service.wechatInteractiveEnabled = () => true
service.wecomAibotInteractiveEnabled = () => true
service.attachHost()
const allowed = service.bridge.hooks.canInteract
assert.equal(allowed('wechat:intruder'), false)
assert.equal(allowed('wechat:boss'), true)
assert.equal(allowed('aibot:intruder'), true)
assert.equal(allowed('intruder'), false)
const received = []
service.bridge.handleReply = async (id, text) => received.push([id, text])
service.syncInteraction()
await wx.onUserMessage('boss', 'Y')
await ai.onUserMessage('user', 'N')
assert.deepEqual(received, [['wechat:boss', 'Y'], ['aibot:user', 'N']])
await service.dispose()
console.log('PASS source-scoped channel authorization')
