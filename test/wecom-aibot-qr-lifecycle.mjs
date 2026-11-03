import assert from 'node:assert/strict'
import axios from 'axios'
import { Context } from '@deepseek-ai/cordis'
import { NotifyService } from '../lib/service.js'

const original = { get: axios.get, setTimeout, clearTimeout, setInterval, clearInterval, now: Date.now }
const timers = new Map()
let nextId = 0, now = 0
const schedule = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id }
globalThis.setTimeout = schedule
globalThis.setInterval = schedule
globalThis.clearTimeout = globalThis.clearInterval = (id) => timers.delete(id)
Date.now = () => now
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const tick = async () => { const entry = [...timers.entries()].find(([, t]) => t.ms <= 3000); assert.ok(entry, 'a poll is scheduled'); timers.delete(entry[0]); entry[1].fn(); await flush() }
const payload = (code) => ({ data: { data: { scode: code, auth_url: `https://qr/${code}` } } })
const result = (status, botid = 'bot') => ({ data: { data: { status, bot_info: { botid, secret: 'secret' } } } })
const service = () => new NotifyService(new Context(), { enabled: false })

try {
  // A newer generation wins even when the older HTTP response arrives last.
  const s = service(), old = deferred(), fresh = deferred()
  let calls = 0
  const signals = []
  axios.get = (_url, options) => { signals.push(options.signal); return ++calls === 1 ? old.promise : fresh.promise }
  const first = s.startWecomAibotQr(); const firstOutcome = first.catch((e) => e)
  const second = s.startWecomAibotQr()
  assert.equal(signals[0]?.aborted, true, 'restart aborts prior generation HTTP request')
  fresh.resolve(payload('new')); await second
  old.resolve(payload('old')); await firstOutcome
  assert.equal(s.getWecomAibotStatus().qr.authUrl, 'https://qr/new', 'stale generation must not replace latest QR')
  await s.dispose(); assert.equal(timers.size, 0, 'restart/dispose leave no orphan timers')

  // Slow polls never overlap; a restart invalidates success already in flight.
  const p = service(), slow = deferred()
  let polls = 0, updates = 0
  p.updateConfig = () => { updates++ }
  axios.get = (url) => url.includes('generate') ? Promise.resolve(payload('one')) : (polls++, slow.promise)
  await p.startWecomAibotQr(); await tick()
  assert.equal([...timers.values()].filter((t) => t.ms <= 3000).length, 0, 'no next poll before current settles')
  await p.startWecomAibotQr()
  slow.resolve(result('success')); await flush()
  assert.equal(updates, 0, 'old poll must not persist credentials')
  assert.equal(polls, 1)
  await p.dispose(); assert.equal(timers.size, 0)

  // Disposal during generation cannot resurrect the service.
  const d = service(), generation = deferred()
  axios.get = () => generation.promise
  const starting = d.startWecomAibotQr().catch((e) => e)
  await d.dispose(); generation.resolve(payload('disposed')); await starting
  assert.equal(d.getWecomAibotStatus().qr.phase, 'idle')
  assert.equal(timers.size, 0)
  await assert.rejects(d.startWecomAibotQr(), /disposed/i)

  // Generation errors are visible, and persistence rejection is contained.
  const e = service()
  axios.get = () => Promise.reject(new Error('generation failed'))
  await assert.rejects(e.startWecomAibotQr(), /generation failed/)
  assert.equal(e.getWecomAibotStatus().qr.phase, 'error')
  e.updateConfig = () => {}
  e.onConfigChanged = async () => { throw new Error('disk full') }
  axios.get = (url) => Promise.resolve(url.includes('generate') ? payload('persist') : result('success'))
  await e.startWecomAibotQr(); await tick(); await flush()
  assert.equal(e.getWecomAibotStatus().qr.phase, 'error')
  assert.match(e.getWecomAibotStatus().qr.error, /disk full/)
  assert.equal(timers.size, 0)
  await e.dispose()

  // Pending retries serialize, expiry stops, and synchronous persistence throws are contained.
  const r = service()
  let response = 'pending'
  r.updateConfig = () => {}
  axios.get = (url) => Promise.resolve(url.includes('generate') ? payload('retry') : result(response))
  await r.startWecomAibotQr(); await tick()
  assert.equal(timers.size, 2, 'pending retains one retry and one deadline')
  response = 'expired'; await tick()
  assert.equal(r.getWecomAibotStatus().qr.phase, 'error')
  assert.equal(timers.size, 0)
  response = 'success'
  r.onConfigChanged = () => { throw new Error('sync persistence failure') }
  await r.startWecomAibotQr(); await tick()
  assert.match(r.getWecomAibotStatus().qr.error, /sync persistence failure/)
  assert.equal(timers.size, 0)
  await r.dispose()

  // Disposal also invalidates a success response already in flight.
  const q = service(), late = deferred()
  let disposedWrites = 0
  q.updateConfig = () => { disposedWrites++ }
  axios.get = (url) => url.includes('generate') ? Promise.resolve(payload('late')) : late.promise
  await q.startWecomAibotQr(); await tick(); await q.dispose()
  late.resolve(result('success')); await flush()
  assert.equal(disposedWrites, 0)
  assert.equal(timers.size, 0)

  // A deadline stops a hung poll and ignores its late success.
  const h = service(), hung = deferred()
  let writes = 0
  h.updateConfig = () => { writes++ }
  axios.get = (url) => url.includes('generate') ? Promise.resolve(payload('hung')) : hung.promise
  await h.startWecomAibotQr(); await tick()
  now = 300_000
  const deadline = [...timers.entries()].find(([, t]) => t.ms > 3000)
  assert.ok(deadline, 'a separate deadline bounds a hung poll')
  timers.delete(deadline[0]); deadline[1].fn(); await flush()
  hung.resolve(result('success')); await flush()
  assert.equal(writes, 0)
  assert.equal(h.getWecomAibotStatus().qr.phase, 'error')
  assert.equal(timers.size, 0)
  await h.dispose()
  console.log('✓ WeCom QR lifecycle: generations, serialized polls, stale results, disposal, persistence, deadlines')
} finally {
  axios.get = original.get
  Object.assign(globalThis, { setTimeout: original.setTimeout, clearTimeout: original.clearTimeout, setInterval: original.setInterval, clearInterval: original.clearInterval })
  Date.now = original.now
}
