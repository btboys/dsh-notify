/**
 * Example: Using the Notify Plugin Programmatically
 * 
 * This demonstrates how to use the notify plugin in your own DSH plugins or scripts.
 */

import { Context } from '@deepseek-ai/cordis'
import notifyPlugin, { NotifyService } from '../src/index.js'

async function example() {
  // Create a Cordis context
  const ctx = new Context()
  
  // Initialize the notify plugin with custom configuration
  const config = {
    enabled: true,
    channels: {
      system: {
        enabled: true,
        sound: true,
      },
      webhook: {
        enabled: false,
        url: 'https://example.com/webhook',
      },
      wecom: {
        enabled: false,
        webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY',
        msgType: 'markdown' as const,
        mentions: ['@all'],
      },
    },
    events: {
      conversationCompleted: true,
      conversationPaused: true,
      conversationFailed: true,
      authorizationRequired: true,
      confirmationRequired: true,
    },
    titlePrefix: '[MyApp]',
  }
  
  // Register the plugin
  await ctx.plugin(notifyPlugin, config)
  
  // Now you can use ctx.notify anywhere in this context
  
  // Example 1: Send a custom notification
  await ctx.notify.send({
    type: 'conversationCompleted',
    title: 'Task Finished',
    message: 'Your code generation task has been completed successfully.',
    metadata: {
      taskId: '12345',
      duration: '5m 30s',
      filesModified: 3,
    },
  })
  
  // Example 2: Use convenience methods
  await ctx.notify.notifyConversationCompleted(
    'Build Successful',
    'All tests passed and build completed.'
  )
  
  await ctx.notify.notifyConversationFailed(
    'Build Failed',
    'Compilation error in src/main.ts',
    { error: 'TS2345: Argument of type ...' }
  )
  
  await ctx.notify.notifyAuthorizationRequired(
    'Permission Needed',
    'The agent needs permission to write to /etc/config'
  )
  
  // Example 3: Listen for notification events
  ctx.on('notify/send', (event) => {
    console.log('Notification sent:', event.type, event.title)
  })
  
  ctx.on('notify/conversationCompleted', (event) => {
    console.log('Conversation completed!', event.message)
  })
  
  // Example 4: Update configuration at runtime
  ctx.notify.updateConfig({
    channels: {
      webhook: {
        enabled: true,
        url: 'https://new-webhook-url.com/notify',
      },
    },
  })
  
  // Cleanup when done
  await ctx.fiber.dispose()
}

// Run the example
example().catch(console.error)
