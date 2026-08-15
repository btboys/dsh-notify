/**
 * Integration test: load the notify plugin on a host-like context with a
 * settings provider, and verify the `notify` settings namespace registers.
 */

import { Context } from '@deepseek-ai/cordis'
import { FileSettingsProvider } from '/Users/gson/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-settings-file/lib/index.js'
import notifyPlugin, { NOTIFY_SETTINGS_NAMESPACE } from '../lib/index.js'

async function run() {
  console.log('🔍 Integration test: notify plugin settings registration\n')

  const ctx = new Context()

  // Mount a real file-backed settings provider (host plane).
  await ctx.plugin(FileSettingsProvider, {
    path: '/tmp/dsh-notify-settings-test.yaml',
    watch: false,
  })
  console.log('✓ Settings provider mounted')

  // Mount the notify plugin with a config.
  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: true, sound: true },
      wecom: { enabled: false, webhookUrl: '' },
    },
    titlePrefix: '[DSH]',
  })
  console.log('✓ Notify plugin mounted')

  // Check the settings namespace is registered and described.
  const described = ctx.settings.describe({ redactSecrets: true })
  const notifyDesc = described.find(d => String(d.ns) === String(NOTIFY_SETTINGS_NAMESPACE))
  if (!notifyDesc) {
    console.error('✗ "notify" namespace NOT registered')
    process.exitCode = 1
    return
  }
  console.log('✓ "notify" namespace registered:', String(notifyDesc.ns))
  const shape = notifyDesc.schema?.shape || {}
  console.log('  schema keys:', Object.keys(shape).length, Object.keys(shape).join(', '))
  console.log('  value.enabled:', notifyDesc.value?.enabled)
  console.log('  value.titlePrefix:', notifyDesc.value?.titlePrefix)

  // Update settings through the service and verify the plugin reconfigures.
  await ctx.settings.update(NOTIFY_SETTINGS_NAMESPACE, { titlePrefix: '[WEB]', systemSound: false })
  console.log('✓ settings.update succeeded')
  const config = ctx.notify.getConfig()
  console.log('  titlePrefix after update:', config.titlePrefix)
  if (config.titlePrefix !== '[WEB]') {
    console.error('✗ Plugin did not reconfigure from settings')
    process.exitCode = 1
  } else {
    console.log('✓ Plugin reconfigured from settings')
  }

  await ctx.fiber.dispose()
  console.log('\n✅ Integration test passed')
}

run().catch((error) => {
  console.error('❌ Integration test failed:', error)
  process.exit(1)
})
