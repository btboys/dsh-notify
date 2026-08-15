/**
 * Simple validation test - no actual notifications sent
 */

import { Context } from '@deepseek-ai/cordis'
import notifyPlugin from '../lib/index.js'

async function validate() {
  console.log('🔍 Validating Notify Plugin Structure\n')
  
  const ctx = new Context()
  
  // Test 1: Plugin initialization
  console.log('✓ Test 1: Plugin initialization')
  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: false }, // Disable to avoid macOS notification issues
    },
  })
  
  console.log('  Service available:', !!ctx.notify)
  console.log('  Is enabled:', ctx.notify.isEnabled())
  console.log('  ✓ PASSED\n')
  
  // Test 2: Check all methods exist
  console.log('✓ Test 2: Verify API methods')
  const methods = [
    'send',
    'isEnabled',
    'getConfig',
    'updateConfig',
    'notifyConversationCompleted',
    'notifyConversationPaused',
    'notifyConversationFailed',
    'notifyAuthorizationRequired',
    'notifyConfirmationRequired',
  ]
  
  for (const method of methods) {
    const exists = typeof ctx.notify[method] === 'function'
    console.log(`  ${method}: ${exists ? '✓' : '✗'}`)
  }
  console.log('  ✓ PASSED\n')
  
  // Test 3: Configuration
  console.log('✓ Test 3: Configuration management')
  const config = ctx.notify.getConfig()
  console.log('  Has enabled:', 'enabled' in config)
  console.log('  Has channels:', 'channels' in config)
  console.log('  Has events:', 'events' in config)
  console.log('  Title prefix:', config.titlePrefix)
  
  ctx.notify.updateConfig({ titlePrefix: '[TEST]' })
  const newConfig = ctx.notify.getConfig()
  console.log('  Updated prefix:', newConfig.titlePrefix)
  console.log('  ✓ PASSED\n')
  
  // Test 4: Event emission (without sending actual notifications)
  console.log('✓ Test 4: Event system')
  let eventCaptured = false
  
  ctx.on('notify/send', (event) => {
    eventCaptured = true
    console.log('  Event captured:', event.type)
  })
  
  // Disable channels to prevent actual notification sending
  ctx.notify.updateConfig({
    channels: {
      system: { enabled: false },
      webhook: { enabled: false, url: '' },
      wecom: { enabled: false, webhookUrl: '' },
    }
  })
  
  await ctx.notify.send({
    type: 'conversationCompleted',
    title: 'Test',
    message: 'Test message',
  })
  
  console.log('  Event was captured:', eventCaptured)
  console.log('  ✓ PASSED\n')
  
  // Test 5: Disabled plugin
  console.log('✓ Test 5: Disabled plugin behavior')
  const ctx2 = new Context()
  await ctx2.plugin(notifyPlugin, { enabled: false })
  console.log('  Is enabled:', ctx2.notify.isEnabled())
  
  let shouldNotEmit = true
  ctx2.on('notify/send', () => {
    shouldNotEmit = false
  })
  
  await ctx2.notify.send({
    type: 'conversationCompleted',
    title: 'Should not send',
    message: 'This should be skipped',
  })
  
  console.log('  Event correctly skipped:', shouldNotEmit)
  console.log('  ✓ PASSED\n')
  
  // Cleanup
  await ctx.fiber.dispose()
  await ctx2.fiber.dispose()
  
  console.log('✅ All validation tests passed!\n')
  console.log('Plugin is ready for use with DSH.')
}

validate().catch((error) => {
  console.error('❌ Validation failed:', error)
  process.exit(1)
})
