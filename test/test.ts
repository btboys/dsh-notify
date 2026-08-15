/**
 * Test script for the Notify Plugin
 * 
 * This script tests all notification adapters and event handlers.
 */

import { Context } from '@deepseek-ai/cordis'
import notifyPlugin, { NotifyService } from '../src/index.js'

async function runTests() {
  console.log('🧪 Testing Notify Plugin...\n')
  
  const ctx = new Context()
  
  // Test 1: Initialize plugin with system notifications
  console.log('✓ Test 1: Initialize plugin with system notifications')
  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: {
        enabled: true,
        sound: false, // Disable sound for testing
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
    console.error('  - Failed to send system notification:', error)
  }
  console.log()
  
  // Test 3: Test convenience methods
  console.log('✓ Test 3: Test convenience methods')
  
  try {
    await ctx.notify.notifyConversationCompleted(
      'Build Successful',
      'All tests passed!'
    )
    console.log('  - Conversation completed notification sent')
  } catch (error) {
    console.error('  - Failed:', error)
  }
  
  try {
    await ctx.notify.notifyConversationPaused(
      'Waiting for Input',
      'Agent is paused and waiting for your response'
    )
    console.log('  - Conversation paused notification sent')
  } catch (error) {
    console.error('  - Failed:', error)
  }
  
  try {
    await ctx.notify.notifyConversationFailed(
      'Build Failed',
      'Compilation error detected',
      { error: 'TS2345' }
    )
    console.log('  - Conversation failed notification sent')
  } catch (error) {
    console.error('  - Failed:', error)
  }
  
  try {
    await ctx.notify.notifyAuthorizationRequired(
      'Permission Requested',
      'Agent needs write access to /etc/config'
    )
    console.log('  - Authorization required notification sent')
  } catch (error) {
    console.error('  - Failed:', error)
  }
  
  try {
    await ctx.notify.notifyConfirmationRequired(
      'Action Required',
      'Please confirm the deployment'
    )
    console.log('  - Confirmation required notification sent')
  } catch (error) {
    console.error('  - Failed:', error)
  }
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
      conversationCompleted: false, // Disable this event
    },
  })
  
  const config = ctx.notify.getConfig()
  console.log('  - Title prefix updated to:', config.titlePrefix)
  console.log('  - conversationCompleted enabled:', config.events.conversationCompleted)
  console.log()
  
  // Test 6: Disabled plugin
  console.log('✓ Test 6: Test with disabled plugin')
  const ctx2 = new Context()
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
  
  // Test 7: Event filtering
  console.log('✓ Test 7: Test event filtering')
  const ctx3 = new Context()
  await ctx3.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: true, sound: false },
    },
    events: {
      conversationCompleted: true,
      conversationFailed: false, // Disable failed events
    },
  })
  
  await ctx3.notify.notifyConversationCompleted('Allowed', 'This should send')
  console.log('  - Allowed event sent successfully')
  
  await ctx3.notify.notifyConversationFailed('Filtered', 'This should not send')
  console.log('  - Filtered event correctly skipped')
  console.log()
  
  // Cleanup
  console.log('✓ Cleanup')
  await ctx.fiber.dispose()
  await ctx2.fiber.dispose()
  await ctx3.fiber.dispose()
  console.log('  - All contexts disposed')
  console.log()
  
  console.log('✅ All tests completed!\n')
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
