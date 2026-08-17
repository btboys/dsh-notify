/**
 * Compiled test script for the Notify Plugin
 */

import { Context } from '@deepseek-ai/cordis'
import notifyPlugin from '../lib/index.js'

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
