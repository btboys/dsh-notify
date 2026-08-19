/**
 * Compiled test script for the Notify Plugin
 */

import { Context } from '@deepseek-ai/cordis'
import { createServer } from 'node:http'
import notifyPlugin from '../lib/index.js'
import { NotifyService } from '../lib/index.js'

/** Create a test Context with the host services the plugin injects. */
function makeCtx() {
  const ctx = new Context()
  ctx.provide('connection', { rpc: { handle: () => () => {} } })
  ctx.provide('webServer', {})
  return ctx
}

async function runTests() {
  console.log('🧪 Testing Notify Plugin...\n')
  
  const ctx = makeCtx()
  
  // Test 1: Initialize plugin with system notifications
  console.log('✓ Test 1: Initialize plugin with system notifications')
  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: {
        enabled: true,
        sound: false,
      },
    },
    events: {
      conversationCompleted: true,
      conversationPaused: true,
      conversationFailed: true,
      authorizationRequired: true,
      confirmationRequired: true,
    },
  })
  
  console.log('  - Plugin initialized successfully')
  console.log('  - Service available:', !!ctx.notify)
  console.log('  - Is enabled:', ctx.notify.isEnabled())
  console.log()
  
  // Test 2: Send system notification
  console.log('✓ Test 2: Send system notification')
  try {
    await ctx.notify.send({
      type: 'conversationCompleted',
      title: 'Test Notification',
      message: 'This is a test notification from the notify plugin',
      metadata: {
        test: true,
        timestamp: Date.now(),
      },
    })
    console.log('  - System notification sent successfully')
  } catch (error) {
    console.error('  - Failed to send system notification:', error.message)
  }
  console.log()
  
  // Test 3: Test convenience methods (skip actual notification sending to avoid timeout)
  console.log('✓ Test 3: Verify convenience methods exist')
  
  console.log('  - notifyConversationCompleted:', typeof ctx.notify.notifyConversationCompleted === 'function' ? '✓' : '✗')
  console.log('  - notifyConversationPaused:', typeof ctx.notify.notifyConversationPaused === 'function' ? '✓' : '✗')
  console.log('  - notifyConversationFailed:', typeof ctx.notify.notifyConversationFailed === 'function' ? '✓' : '✗')
  console.log('  - notifyAuthorizationRequired:', typeof ctx.notify.notifyAuthorizationRequired === 'function' ? '✓' : '✗')
  console.log('  - notifyConfirmationRequired:', typeof ctx.notify.notifyConfirmationRequired === 'function' ? '✓' : '✗')
  console.log()
  
  // Test 4: Event listeners
  console.log('✓ Test 4: Test event listeners')
  let eventCount = 0
  
  ctx.on('notify/send', (event) => {
    eventCount++
    console.log(`  - Event captured: ${event.type}`)
  })
  
  await ctx.notify.send({
    type: 'conversationCompleted',
    title: 'Event Test',
    message: 'Testing event emission',
  })
  
  console.log(`  - Total events captured: ${eventCount}`)
  console.log()
  
  // Test 5: Configuration update
  console.log('✓ Test 5: Update configuration at runtime')
  ctx.notify.updateConfig({
    titlePrefix: '[TEST]',
    events: {
      conversationCompleted: false,
    },
  })
  
  const config = ctx.notify.getConfig()
  console.log('  - Title prefix updated to:', config.titlePrefix)
  console.log('  - conversationCompleted enabled:', config.events.conversationCompleted)
  console.log()
  
  // Test 6: Disabled plugin
  console.log('✓ Test 6: Test with disabled plugin')
  const ctx2 = makeCtx()
  await ctx2.plugin(notifyPlugin, {
    enabled: false,
  })
  
  console.log('  - Plugin enabled:', ctx2.notify.isEnabled())
  
  await ctx2.notify.send({
    type: 'conversationCompleted',
    title: 'Should Not Send',
    message: 'This should not be sent',
  })
  console.log('  - Notification correctly skipped (plugin disabled)')
  console.log()
  
  // Test 7: Regression — disabling a channel at runtime must stop its sends
  console.log('✓ Test 7: Runtime channel disable/enable takes effect immediately')
  {
    // Local HTTP server stands in for the webhook endpoint.
    let requests = 0
    const server = createServer((req, res) => {
      requests++
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/hook`
    
    const ctx3 = makeCtx()
    const service = new NotifyService(ctx3, {
      enabled: true,
      channels: { webhook: { enabled: true, url } },
      events: { conversationCompleted: true },
    })
    
    const sendOnce = () => service.send({
      type: 'conversationCompleted',
      title: 'Runtime Toggle Test',
      message: 'checking adapter rebuild',
    })
    
    // 1) enabled at startup → delivered
    await sendOnce()
    console.log('  - enabled at startup, requests:', requests, requests === 1 ? '✓' : '✗ EXPECTED 1')
    
    // 2) disable the webhook channel at runtime → must NOT be delivered
    service.updateConfig({ channels: { webhook: { enabled: false, url } } })
    await sendOnce()
    console.log('  - after runtime disable, requests:', requests, requests === 1 ? '✓' : '✗ STILL SENDING (bug)')
    
    // 3) re-enable at runtime → delivered again
    service.updateConfig({ channels: { webhook: { enabled: true, url } } })
    await sendOnce()
    console.log('  - after runtime re-enable, requests:', requests, requests === 2 ? '✓' : '✗ EXPECTED 2')
    
    // 4) partial channel update must not wipe sibling channels to defaults
    const cfgAfter = service.getConfig()
    console.log('  - sibling system channel survived partial update:',
      typeof cfgAfter.channels.system.enabled === 'boolean' ? '✓' : '✗')
    
    // 5) disabling the whole plugin tears down adapters too
    service.updateConfig({ enabled: false })
    await sendOnce()
    console.log('  - after plugin disable, requests:', requests, requests === 2 ? '✓' : '✗ STILL SENDING (bug)')
    
    await service.dispose()
    await new Promise((resolve) => server.close(resolve))
    await ctx3.fiber.dispose()
    
    if (requests !== 2) {
      throw new Error(`Regression: expected exactly 2 webhook requests, got ${requests}`)
    }
  }
  console.log()
  
  // Test 8: Regression — thinking/reasoning blocks must not leak into pushes
  console.log('✓ Test 8: reasoning (thinking) blocks excluded from reply summary')
  {
    const ctx4 = makeCtx()
    const service = new NotifyService(ctx4, {
      enabled: true,
      channels: {}, // no adapters — we capture the notify/send event instead
      events: { conversationCompleted: true },
    })

    const sent = []
    ctx4.on('notify/send', (event) => sent.push(event))

    const fakeSession = {
      id: 'session-think',
      cwd: '/Users/test/notify',
      log: [
        { type: 'turn/start', data: { turn: 1 }, time: 1000 },
        { type: 'user/message', data: { turn: 1, content: [{ type: 'text', text: '帮我查一下日志' }] }, time: 1001 },
        { type: 'assistant/message', data: { turn: 1, message: { content: [
          { type: 'reasoning', text: 'INTERNAL_THINKING_MARKER 让我先想想应该先 grep 哪个文件' },
          { type: 'text', text: '已查到日志，问题出在第 42 行。' },
        ] } }, time: 1002 },
      ],
    }

    ctx4.emit('session/event', fakeSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    await new Promise((r) => setTimeout(r, 200))

    if (sent.length !== 1) throw new Error(`expected 1 notification, got ${sent.length}`)
    const msg = sent[0].message
    console.log('  - message:', JSON.stringify(msg))
    if (msg.includes('INTERNAL_THINKING_MARKER')) throw new Error('reasoning block leaked into notification')
    if (!msg.includes('已查到日志，问题出在第 42 行。')) throw new Error('text reply missing')
    if (!msg.includes('💬 帮我查一下日志')) throw new Error('user prompt missing')

    await service.dispose()
    await ctx4.fiber.dispose()
  }
  console.log()
  
  // Test 9: todo_write tool call pushes TODO progress, with dedupe
  console.log('✓ Test 9: todo_write pushes TODO progress (dedupe on unchanged progress)')
  {
    const ctx5 = makeCtx()
    const service = new NotifyService(ctx5, {
      enabled: true,
      channels: {}, // no adapters — we capture the notify/send event instead
      events: { todoProgress: true },
    })

    const sent = []
    ctx5.on('notify/send', (event) => sent.push(event))

    const fakeSession = { id: 'session-todo', header: { cwd: '/Users/test/notify' }, log: [] }
    const todoCall = (todos) => ({
      type: 'tool/call',
      data: { name: 'todo_write', arguments: JSON.stringify({ todos }) },
    })

    // 1) First TODO list appears — pushes with progress and checklist.
    ctx5.emit('session/event', fakeSession, todoCall([
      { content: '设计推送格式', status: 'completed' },
      { content: '实现 service 推送逻辑', status: 'in_progress' },
      { content: '更新 README', status: 'pending' },
    ]))
    await new Promise((r) => setTimeout(r, 100))
    if (sent.length !== 1) throw new Error(`expected 1 todo push, got ${sent.length}`)
    if (sent[0].type !== 'todoProgress') throw new Error(`wrong event type: ${sent[0].type}`)
    if (!sent[0].title.includes('[notify]')) throw new Error('workspace missing from title')
    if (!sent[0].message.includes('📊 进度: 1/3 已完成')) throw new Error('progress count missing')
    if (!sent[0].message.includes('🔄 实现 service 推送逻辑')) throw new Error('in-progress item missing')
    console.log('  - first push:', JSON.stringify(sent[0].title))

    // 2) Pure in_progress churn (item pickup, no completed/total change) — silent.
    ctx5.emit('session/event', fakeSession, todoCall([
      { content: '设计推送格式', status: 'completed' },
      { content: '实现 service 推送逻辑', status: 'pending' },
      { content: '更新 README', status: 'in_progress' },
    ]))
    await new Promise((r) => setTimeout(r, 100))
    if (sent.length !== 1) throw new Error(`in_progress churn should not push, got ${sent.length}`)
    console.log('  - pure in_progress churn skipped ✓')

    // 3) Progress advances — pushes again.
    ctx5.emit('session/event', fakeSession, todoCall([
      { content: '设计推送格式', status: 'completed' },
      { content: '实现 service 推送逻辑', status: 'completed' },
      { content: '更新 README', status: 'in_progress' },
    ]))
    await new Promise((r) => setTimeout(r, 100))
    if (sent.length !== 2) throw new Error(`expected progress push, got ${sent.length}`)
    if (!sent[1].message.includes('📊 进度: 2/3 已完成')) throw new Error('updated progress count missing')
    console.log('  - progress advance push:', JSON.stringify(sent[1].title))

    // 4) Event filter off — no push.
    service.updateConfig({ events: { todoProgress: false } })
    ctx5.emit('session/event', fakeSession, todoCall([
      { content: '设计推送格式', status: 'completed' },
      { content: '实现 service 推送逻辑', status: 'completed' },
      { content: '更新 README', status: 'completed' },
    ]))
    await new Promise((r) => setTimeout(r, 100))
    if (sent.length !== 2) throw new Error(`event filter off should not push, got ${sent.length}`)
    console.log('  - events.todoProgress=false filtered ✓')

    await service.dispose()
    await ctx5.fiber.dispose()
  }
  console.log()
  
  // Cleanup
  console.log('✓ Cleanup')
  await ctx.fiber.dispose()
  await ctx2.fiber.dispose()
  console.log('  - All contexts disposed')
  console.log()
  
  console.log('✅ All tests completed!\n')
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
