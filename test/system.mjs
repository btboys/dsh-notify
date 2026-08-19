/**
 * Cross-platform system notification adapter test (src/adapters/system.ts).
 *
 * Uses the internal { platform, execFile } injection seam to verify command
 * construction and escaping for macOS / Windows / Linux without executing
 * anything:
 *   1. macOS: osascript display notification + afplay sound,
 *   2. Windows: PowerShell WinRT toast with XML/PowerShell escaping, sound
 *      lines honor config.sound / config.soundFile,
 *   3. Linux: notify-send + best-effort sound (paplay → canberra fallback),
 *      missing libnotify warns once and rethrows.
 */

import { Context } from '@deepseek-ai/cordis'
import { SystemNotificationAdapter } from '../lib/adapters/system.js'

function makeCtx() {
  const ctx = new Context()
  ctx.provide('connection', { rpc: { handle: () => () => {} } })
  ctx.provide('webServer', {})
  return ctx
}

/** Fake execFile: records (cmd, args); failOn maps cmd prefix → error code. */
function makeExec(failOn = {}) {
  const calls = []
  const execFile = async (cmd, args) => {
    calls.push([cmd, ...args])
    for (const [prefix, code] of Object.entries(failOn)) {
      if (cmd === prefix || cmd.startsWith(prefix)) {
        const err = new Error(`spawn ${cmd} ENOENT`)
        err.code = code
        throw err
      }
    }
    return { stdout: '', stderr: '' }
  }
  return { calls, execFile }
}

const EVENT = { type: 'conversationCompleted', title: '✅ [DSH] 对话完成', message: '💬 你好\n🤖 完成' }

async function main() {
  console.log('🧪 Testing system notification adapter (cross-platform)...\n')

  // Test 1: macOS — osascript + afplay, AppleScript escaping
  console.log('✓ Test 1: macOS osascript + afplay')
  const mac = makeExec()
  const ctx1 = makeCtx()
  const macAdapter = new SystemNotificationAdapter(ctx1, { enabled: true, sound: true },
    { platform: 'darwin', execFile: mac.execFile })
  await macAdapter.send({ ...EVENT, title: '带"引号"的标题' })
  const osa = mac.calls.find((c) => c[0] === 'osascript')
  const afp = mac.calls.find((c) => c[0] === 'afplay')
  if (!osa || !afp) throw new Error('macOS should call osascript and afplay')
  if (!osa[2].includes('display notification')) throw new Error('osascript script malformed')
  if (!osa[2].includes('带\\"引号\\"的标题')) throw new Error('AppleScript quote escaping broken: ' + osa[2])
  if (!afp[1].includes('/System/Library/Sounds/Ping.aiff')) throw new Error('default sound not played')
  await ctx1.fiber.dispose()

  // Test 2: Windows — PowerShell toast, escaping, default sound
  console.log('✓ Test 2: Windows PowerShell toast')
  const win = makeExec()
  const ctx2 = makeCtx()
  const winAdapter = new SystemNotificationAdapter(ctx2, { enabled: true, sound: true },
    { platform: 'win32', execFile: win.execFile })
  await winAdapter.send({ ...EVENT, title: "O'Brien <tag> & 完成", message: '💬 it\'s <here>' })
  const ps = win.calls.find((c) => c[0] === 'powershell.exe')
  if (!ps) throw new Error('Windows should call powershell.exe')
  const script = ps[ps.length - 1]
  if (!script.includes('ToastNotificationManager') || !script.includes('ToastGeneric')) throw new Error('toast script malformed')
  if (!script.includes("O''Brien &lt;tag&gt; &amp; 完成")) throw new Error('XML/PS escaping broken: ' + script)
  if (!script.includes('SystemSounds')) throw new Error('sound line missing')
  await ctx2.fiber.dispose()

  // Test 3: Windows — sound disabled → no SystemSounds; custom wav → SoundPlayer
  console.log('✓ Test 3: Windows sound config honored')
  const winSilent = makeExec()
  const ctx3 = makeCtx()
  const silent = new SystemNotificationAdapter(ctx3, { enabled: true, sound: false },
    { platform: 'win32', execFile: winSilent.execFile })
  await silent.send(EVENT)
  const silentScript = winSilent.calls[0][winSilent.calls[0].length - 1]
  if (silentScript.includes('SystemSounds') || silentScript.includes('SoundPlayer')) throw new Error('sound:false still plays sound')
  const winWav = makeExec()
  const ctx3b = makeCtx()
  const wav = new SystemNotificationAdapter(ctx3b, { enabled: true, sound: true, soundFile: "C:\\sounds\\it's.wav" },
    { platform: 'win32', execFile: winWav.execFile })
  await wav.send(EVENT)
  const wavScript = winWav.calls[0][winWav.calls[0].length - 1]
  if (!wavScript.includes("SoundPlayer 'C:\\sounds\\it''s.wav'") || !wavScript.includes('PlaySync')) {
    throw new Error('custom wav not wired correctly: ' + wavScript)
  }
  await ctx3.fiber.dispose()
  await ctx3b.fiber.dispose()

  // Test 4: Linux — notify-send + paplay; paplay missing → canberra fallback cached
  console.log('✓ Test 4: Linux notify-send + sound fallback')
  const lin = makeExec({ paplay: 'ENOENT' })
  const ctx4 = makeCtx()
  const linAdapter = new SystemNotificationAdapter(ctx4, { enabled: true, sound: true },
    { platform: 'linux', execFile: lin.execFile })
  await linAdapter.send(EVENT)
  const ns = lin.calls.find((c) => c[0] === 'notify-send')
  if (!ns || ns[1] !== EVENT.title || ns[2] !== EVENT.message) throw new Error('notify-send args wrong: ' + JSON.stringify(ns))
  const canb = lin.calls.find((c) => c[0] === 'canberra-gtk-play')
  if (!canb) throw new Error('canberra fallback not attempted')
  lin.calls.length = 0
  await linAdapter.send(EVENT) // second send: cached fallback, no paplay retry
  if (lin.calls.some((c) => c[0] === 'paplay')) throw new Error('sound probe not cached')
  await ctx4.fiber.dispose()

  // Test 5: Linux without libnotify — send rethrows (warn once, still attempts)
  console.log('✓ Test 5: Linux missing notify-send rethrows')
  const bare = makeExec({ 'notify-send': 'ENOENT', paplay: 'ENOENT', 'canberra-gtk-play': 'ENOENT' })
  const ctx5 = makeCtx()
  const bareAdapter = new SystemNotificationAdapter(ctx5, { enabled: true }, { platform: 'linux', execFile: bare.execFile })
  let threw = null
  try { await bareAdapter.send(EVENT) } catch (e) { threw = e }
  if (!threw || threw.code !== 'ENOENT') throw new Error('missing notify-send should rethrow ENOENT')
  await ctx5.fiber.dispose()

  console.log('\n✅ All system adapter tests passed!')
}

main().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
