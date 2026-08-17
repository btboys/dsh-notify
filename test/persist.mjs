#!/usr/bin/env node
/**
 * Unit test for the notify plugin's config persistence (src/persist.ts) and
 * the /dsh-notify RPC channel (src/notify-rpc.ts).
 *
 * persist.ts has no DSH runtime dependency; notify-rpc.ts is pure ESM. Both run
 * under Node's transform-types (parameter properties aside, they are plain ESM).
 *
 * Usage: node --experimental-transform-types test/persist.mjs
 *   (set DSH_HOME_TEST to a temp dir; DSH_HOME is read at call time)
 */

import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPersistedConfig, mergePersisted, persistConfig, clearPersistedConfig } from '../src/persist.ts'
import { installNotifyRpc, NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS } from '../src/notify-rpc.ts'

let passed = 0
const asserts = []
function check(name, fn) {
  try { fn(); passed++; asserts.push(`  ✓ ${name}`) }
  catch (error) { asserts.push(`  ✗ ${name} — ${error.message}`); process.exitCode = 1 }
}

// Isolate persistence into a fresh DSH_HOME per run.
const home = mkdtempSync(join(tmpdir(), 'dsh-notify-test-'))
process.env.DSH_HOME = home

// ---- 1. Nothing persisted initially -------------------------------------
check('no persisted config when file absent', () => {
  if (loadPersistedConfig() !== null) throw new Error('expected null')
})

// ---- 2. persist + load round-trip ---------------------------------------
const sample = { enabled: true, channels: { system: { enabled: true, sound: true } }, titlePrefix: '[T]' }
persistConfig(sample)
const loaded = loadPersistedConfig()
check('persist/load round-trip', () => {
  if (loaded?.titlePrefix !== '[T]') throw new Error('titlePrefix lost')
  if (loaded?.channels?.system?.sound !== true) throw new Error('sound lost')
  const file = join(home, 'notify', 'config.json')
  if (!existsSync(file)) throw new Error('config.json not created')
})

// ---- 3. Merge: persisted wins over base, channel-wise --------------------
const base = {
  enabled: true,
  channels: { system: { enabled: false, sound: false }, webhook: { enabled: false, url: '' } },
  titlePrefix: '[BASE]',
}
const merged = mergePersisted(base, { channels: { system: { sound: true }, webhook: { enabled: true, url: 'https://x' } }, titlePrefix: '[NEW]' })
check('merge keeps base keys and applies persisted overrides', () => {
  if (merged.titlePrefix !== '[NEW]') throw new Error('persisted titlePrefix should win')
  if (merged.channels.system.enabled !== false) throw new Error('base channel enabled should be kept')
  if (merged.channels.system.sound !== true) throw new Error('persisted channel sound should win')
  if (merged.channels.webhook.url !== 'https://x') throw new Error('persisted webhook url should win')
})

// ---- 4. clear ------------------------------------------------------------
clearPersistedConfig()
check('clear empties persisted config (file remains, {})', () => {
  const file = join(home, 'notify', 'config.json')
  if (!existsSync(file)) throw new Error('clear should keep the file')
  if (loadPersistedConfig()?.enabled !== undefined) throw new Error('expected empty config')
})

// ---- 5. RPC channel get/set ----------------------------------------------
const log = { warn: () => {} }
let capturedHandler = null
const rpcFace = { handle: (channel, handler) => { capturedHandler = handler; return () => {} } }
const fakeService = { config: { titlePrefix: '[R]' } }
installNotifyRpc(rpcFace, {
  read: () => fakeService.config,
  write: (p) => { fakeService.config = { ...fakeService.config, ...p } },
}, log)
const getRes = await capturedHandler(NOTIFY_ENDPOINTS.configGet, {})
check('configGet returns current config', () => {
  if (!getRes.ok || getRes.value?.titlePrefix !== '[R]') throw new Error('configGet wrong')
})
const setRes = await capturedHandler(NOTIFY_ENDPOINTS.configSet, { titlePrefix: '[S]' })
check('configSet applies and returns new config', () => {
  if (!setRes.ok || setRes.value?.titlePrefix !== '[S]') throw new Error('configSet not applied')
  if (fakeService.config.titlePrefix !== '[S]') throw new Error('service not updated')
})
const badRes = await capturedHandler('unknown.endpoint', {})
check('unknown endpoint fails as bad-request', () => {
  if (badRes.ok || badRes.error?.code !== 'bad-request') throw new Error('expected bad-request')
})
const boomRes = await capturedHandler(NOTIFY_ENDPOINTS.configSet, null)
check('configSet with non-object payload fails', () => {
  if (boomRes.ok) throw new Error('expected failure')
})

// ---- summary -------------------------------------------------------------
rmSync(home, { recursive: true, force: true })
console.log(`notify persist + rpc: ${passed} passed`)
console.log(asserts.join('\n'))
if (process.exitCode === 1) console.log('✗ tests FAILED')
else console.log('✓ tests passed')
