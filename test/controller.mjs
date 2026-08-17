#!/usr/bin/env node
/**
 * Unit test for the notify card controller (src/client/controller.ts).
 *
 * Exercises the staged-form model against a fake scope: seeding defaults,
 * writing a text field, toggling a boolean, enum picking, clearing back to the
 * base layer, override detection, and dirty/failed shell transitions.
 *
 * The controller is pure TS with no DSH runtime dependency, so this harness
 * runs it directly under Node's transform-types (parameter properties need the
 * transform; strip-only mode cannot parse them).
 *
 * Usage: node --experimental-transform-types test/controller.mjs
 */

import { NotifyCardController } from '../src/client/controller.ts'

/** A minimal in-memory SettingsScope exercising the surface the controller uses. */
function fakeScope(initial = {}, seedUser = {}) {
  let base = initial
  let user = seedUser
  let status = 'ready'
  const listeners = new Set()
  const emit = () => { for (const l of listeners) l() }
  return {
    _user: () => user,
    getSnapshot() {
      return { status, value: { ...base, ...user }, base, user, revision: 1, writable: true }
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async set(field, value) { user = { ...user, [field]: value }; status = 'ready'; emit() },
    async unset(field) { const { [field]: _drop, ...rest } = user; user = rest; emit() },
  }
}

let passed = 0
const asserts = []

function check(name, fn) {
  try {
    fn()
    passed++
    asserts.push(`  ✓ ${name}`)
  } catch (error) {
    asserts.push(`  ✗ ${name} — ${error.message}`)
    process.exitCode = 1
  }
}

// actions().save() is intentionally fire-and-forget (`void this.save()`), so
// let the underlying awaited save settle before asserting.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// ---- 1. Defaults seed the effective value -------------------------------
const c1 = new NotifyCardController(fakeScope({ enabled: true, titlePrefix: '[DSH]' }))
const st1 = c1.getSnapshot()
check('defaults seed effective values', () => {
  if (st1.enabled.value !== true) throw new Error('enabled should default true')
  if (st1.titlePrefix.text !== '[DSH]') throw new Error('titlePrefix should hold [DSH]')
  if (st1.available !== true || st1.dirty !== false || st1.saving !== false) {
    throw new Error('shell should be clean/available')
  }
})

// ---- 2. Text edit stages dirty ------------------------------------------
const c2 = new NotifyCardController(fakeScope({ titlePrefix: '' }))
c2.actions().editText('titlePrefix', '[App]')
const st2 = c2.getSnapshot()
check('text edit stages dirty + override', () => {
  if (st2.dirty !== true) throw new Error('expected dirty')
  if (st2.titlePrefix.text !== '[App]') throw new Error('text should show draft')
  if (st2.titlePrefix.overridden !== true) throw new Error('expected overridden')
})

// ---- 3. Save writes to the scope, then the form cleans ------------------
const s3 = fakeScope({ titlePrefix: '' })
const c3 = new NotifyCardController(s3)
c3.actions().editText('titlePrefix', 'Hi')
c3.actions().save()
await flush()
const st3 = c3.getSnapshot()
check('save writes staged text and clears the form', () => {
  if (s3._user().titlePrefix !== 'Hi') throw new Error('host should hold "Hi"')
  if (st3.dirty !== false) throw new Error('form should be clean after a landed save')
})

// ---- 4. Boolean toggle ---------------------------------------------------
const s4 = fakeScope({ systemSound: false })
const c4 = new NotifyCardController(s4)
c4.actions().toggle('systemSound', true)
c4.actions().save()
await flush()
check('boolean toggle writes', () => {
  if (c4.getSnapshot().systemSound.value !== true) throw new Error('systemSound should be true')
})

// ---- 5. Enum pick --------------------------------------------------------
const c5 = new NotifyCardController(fakeScope({ wecomMsgType: 'markdown' }))
c5.actions().pick('wecomMsgType', 'text')
c5.actions().save()
await flush()
check('enum pick writes', () => {
  if (c5.getSnapshot().wecomMsgType.value !== 'text') throw new Error('wecomMsgType should be text')
})

// ---- 6. Clear re-inherits base (no override remains) ---------------------
const s6 = fakeScope({ titlePrefix: '[BASE]' }, { titlePrefix: '[OVERRIDE]' })
const c6 = new NotifyCardController(s6)
if (c6.getSnapshot().titlePrefix.overridden !== true) throw new Error('precondition: base override should be detected')
c6.actions().editText('titlePrefix', '')   // empty draft = clear
c6.actions().save()
await flush()
const st6 = c6.getSnapshot()
check('empty text clears the user override', () => {
  if (Object.hasOwn(s6._user(), 'titlePrefix')) throw new Error('user layer should no longer carry titlePrefix')
  if (st6.titlePrefix.text !== '[BASE]') throw new Error('should re-inherit base value')
  if (st6.titlePrefix.overridden !== false) throw new Error('should not be overridden')
})

// ---- 7. Write a fresh text override, then reset it -----------------------
const s7 = fakeScope({ titlePrefix: '[BASE]' }, {})
const c7 = new NotifyCardController(s7)
c7.actions().editText('titlePrefix', '[MINE]')
c7.actions().save()
await flush()
if (s7._user().titlePrefix !== '[MINE]') throw new Error('precondition: override write failed')
c7.actions().resetField('titlePrefix')
c7.actions().save()
await flush()
check('resetField clears a staged override back to base', () => {
  const st = c7.getSnapshot()
  if (Object.hasOwn(s7._user(), 'titlePrefix')) throw new Error('reset should clear the override')
  if (st.titlePrefix.text !== '[BASE]') throw new Error('should show base after reset')
  if (st.titlePrefix.overridden !== false) throw new Error('should not be overridden after reset')
})

// ---- Summary -------------------------------------------------------------
console.log(`notify card controller: ${passed} passed`)
console.log(asserts.join('\n'))
if (process.exitCode === 1) {
  console.log('✗ controller tests FAILED')
} else {
  console.log('✓ controller tests passed')
}
