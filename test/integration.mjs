/**
 * Integration test: load the notify plugin on a host-like context and verify
 * the /dsh-notify RPC channel serves the configuration — the primary surface
 * for the Web "通知" settings page.
 *
 * The plugin declares `connection` + `webServer` as host services; provide
 * stubs that capture the RPC handler so we can exercise config.get/config.set
 * exactly as the browser would.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import notifyPlugin, { NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS } from '../lib/index.js'

async function run() {
  console.log('🔍 Integration test: notify plugin RPC config channel\n')

  // Isolate the plugin's config persistence into a throwaway DSH_HOME.
  const home = mkdtempSync(join(tmpdir(), 'dsh-notify-integration-'))
  process.env.DSH_HOME = home

  let handler = null
  const ctx = new Context()
  // capture the handler installNotifyRpc registers on the connection.rpc face
  ctx.provide('connection', {
    rpc: {
      handle: (_channel, fn) => { handler = fn; return () => {} },
    },
  })
  ctx.provide('webServer', {})

  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: true, sound: true },
      wecom: { enabled: false, webhookUrl: '' },
    },
    titlePrefix: '[DSH]',
  })
  console.log('✓ Notify plugin mounted')
  if (!handler) {
    console.error('✗ /dsh-notify RPC channel was NOT registered')
    process.exitCode = 1
    return
  }
  console.log(`✓ RPC channel registered: ${NOTIFY_RPC_CHANNEL}`)

  // config.get returns the effective config.
  const getRes = await handler(NOTIFY_ENDPOINTS.configGet, {})
  console.log('  configGet ok:', getRes.ok)
  console.log('  titlePrefix:', getRes.value?.titlePrefix)
  if (!getRes.ok || getRes.value?.titlePrefix !== '[DSH]') {
    console.error('✗ configGet returned unexpected config')
    process.exitCode = 1
    return
  }
  console.log('✓ configGet works')

  // config.set applies and returns the updated config.
  const setRes = await handler(NOTIFY_ENDPOINTS.configSet, { titlePrefix: '[WEB]' })
  console.log('  configSet titlePrefix:', setRes.value?.titlePrefix)
  if (!setRes.ok || setRes.value?.titlePrefix !== '[WEB]') {
    console.error('✗ configSet did not apply')
    process.exitCode = 1
    return
  }
  const config = ctx.notify.getConfig()
  console.log('  service titlePrefix after update:', config.titlePrefix)
  if (config.titlePrefix !== '[WEB]') {
    console.error('✗ Plugin did not apply config from RPC write')
    process.exitCode = 1
    return
  }
  console.log('✓ configSet reconfigures the running service')

  await ctx.fiber.dispose()
  rmSync(home, { recursive: true, force: true })
  console.log('\n✅ Integration test passed')
}

run().catch((error) => {
  console.error('❌ Integration test failed:', error)
  process.exit(1)
})
