/**
 * Live smoke test: push a markdown-table notification through the REAL
 * ClawBot channel using the persisted session, to verify table rendering
 * after the hardBreaks fix. Sends one message to every known user.
 *
 *   node test/live-wechat-table.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { WeChatClawBotAdapter } from '../lib/adapters/wechat.js'

const ctx = new Context()
ctx.provide('connection', { rpc: { handle: () => () => {} } })
ctx.provide('webServer', {})

const adapter = new WeChatClawBotAdapter(ctx, { enabled: true })

// Wait for the session resume + ready state (poll loop starts too, harmlessly).
for (let i = 0; i < 30; i += 1) {
  const s = adapter.getStatus()
  if (s.state === 'ready') break
  if (s.state === 'error') throw new Error('adapter error: ' + s.error)
  await new Promise((r) => setTimeout(r, 500))
}
const status = adapter.getStatus()
console.log('status:', status.state, '| users:', status.knownUsers)
if (status.state !== 'ready') throw new Error('not ready (login required?)')
if (status.knownUsers.length === 0) throw new Error('no reachable users')

await adapter.send({
  type: 'conversationCompleted',
  title: '✅ [notify] 表格渲染测试',
  message: [
    '🤖 表格渲染验证',
    '| 项目 | 状态 |',
    '|---|---|',
    '| 换行折叠修复 | ✅ 保留 |',
    '| 表格紧密排列 | ✅ 恢复 |',
    '如果你看到表格而不是竖线文本，说明修复生效。',
  ].join('\n'),
  timestamp: Date.now(),
})
console.log('✅ sent — check WeChat')

adapter.dispose()
process.exit(0)
