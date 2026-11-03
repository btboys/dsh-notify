// Run: node --test src/client/NotifySettings.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function harness() {
  let active
  const intervals = []
  const react = {
    useState(initial) {
      const owner = active, i = owner.index++
      if (!(i in owner.slots)) owner.slots[i] = initial
      return [owner.slots[i], (value) => { owner.slots[i] = typeof value === 'function' ? value(owner.slots[i]) : value }]
    },
    useRef(initial) {
      const owner = active, i = owner.index++
      return owner.slots[i] ??= { current: initial }
    },
    useMemo(fn) { return fn() },
    useEffect(fn, deps) {
      const owner = active, i = owner.index++, old = owner.slots[i]
      if (!old || deps.some((value, j) => value !== old[j])) {
        owner.slots[i] = deps
        owner.effects.push(fn)
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const source = ts.transpileModule(readFileSync(new URL('./NotifySettings.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    Error,
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (id === 'qrcode') return { default: { toDataURL: async () => 'data:qr' } }
      if (id.endsWith('.css')) return { default: {} }
      if (id === './rpc.ts') return { NOTIFY_RPC_CHANNEL: '/dsh-notify', NOTIFY_ENDPOINTS: {
        configGet: 'get', configSet: 'set', wecomAibotStatus: 'status', wecomAibotQrStart: 'start',
      } }
      return require(id)
    },
    setInterval(fn) { intervals.push(fn); return intervals.length },
    clearInterval() {},
  })
  const mount = (component, props) => {
    const owner = { slots: [], effects: [], index: 0 }
    return {
      render(next = props) {
        active = owner; owner.index = 0
        const tree = component(next)
        owner.effects.splice(0).forEach((fn) => fn())
        return tree
      },
    }
  }
  return { mount, component: exports.NotifySettings, intervals }
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const base = { enabled: true, titlePrefix: 'saved', channels: { wecomAibot: {
  enabled: false, botId: 'old', secret: 'old', toChatIds: ['saved-chat'], interactive: true,
} } }

for (const failure of [{ ok: false, error: { message: 'start refused' } }, new Error('transport failed')]) {
  test(`QR start shows ${failure instanceof Error ? 'thrown' : 'RPC'} errors and allows retry`, async () => {
    const h = harness()
    const props = { t: (key) => key, rpcCall: async (_channel, endpoint) => {
      if (endpoint === 'get') return { ok: true, value: base }
      if (endpoint === 'start') {
        if (failure instanceof Error) throw failure
        return failure
      }
      return { ok: true, value: { state: 'disabled', knownChats: [], qr: { phase: 'idle' } } }
    } }
    const page = h.mount(h.component, props)
    page.render(); await flush()
    const panelNode = nodes(page.render()).find((n) => n.type?.name === 'WeComAiBotPanel')
    const panel = h.mount(panelNode.type, panelNode.props)
    panel.render(); await flush()
    const button = nodes(panel.render()).find((n) => n.type === 'button')
    button.props.onClick(); await flush()
    const tree = panel.render()
    assert.equal(nodes(tree).find((n) => n.type === 'button').props.disabled, false)
    assert.ok(nodes(tree).some((n) => n.props?.role === 'alert' && n.props.children === (failure instanceof Error ? failure.message : failure.error.message)))
  })
}

test('association updates credentials without replacing edits made during polling or config fetch', async () => {
  const h = harness()
  let resolveGet, gets = 0
  const props = { t: (key) => key, rpcCall: async (_channel, endpoint) => {
    if (endpoint === 'get') {
      if (++gets === 1) return { ok: true, value: structuredClone(base) }
      return new Promise((resolve) => { resolveGet = resolve })
    }
    if (endpoint === 'start') return { ok: true, value: { authUrl: 'https://qr' } }
    return { ok: true, value: { state: 'ready', knownChats: [], qr: { phase: 'idle' } } }
  } }
  const page = h.mount(h.component, props)
  page.render(); await flush()
  let tree = page.render()
  const panelNode = nodes(tree).find((n) => n.type?.name === 'WeComAiBotPanel')
  const panel = h.mount(panelNode.type, panelNode.props)
  panel.render(); await flush()
  const button = nodes(panel.render()).find((n) => n.type === 'button')
  // Start QR to establish pending, then let the idle poll signal association.
  button.props.onClick(); await flush()
  let usedLatestCallback = false
  panel.render({ ...panelNode.props, onAssociated: () => {
    usedLatestCallback = true
    panelNode.props.onAssociated()
  } })
  h.intervals[0](); await flush()
  assert.equal(usedLatestCallback, true)
  const change = (label, value) => {
    tree = page.render()
    nodes(tree).find((n) => n.props?.labelKey === label).props.onChange(value)
  }
  change('titlePrefix', 'unsaved')
  change('wecomAibotChatIds', 'draft-chat')
  change('wecomAibotInteractive', false)
  resolveGet({ ok: true, value: { ...base, channels: { wecomAibot: {
    ...base.channels.wecomAibot, enabled: true, botId: 'new', secret: 'new-secret',
  } } } }); await flush()
  tree = page.render()
  const value = (label) => nodes(tree).find((n) => n.props?.labelKey === label).props
  assert.equal(value('titlePrefix').value, 'unsaved')
  assert.equal(value('wecomAibotChatIds').value, 'draft-chat')
  assert.equal(value('wecomAibotInteractive').checked, false)
  assert.equal(value('wecomAibotBotId').value, 'new')
  assert.equal(value('wecomAibotSecret').value, 'new-secret')
  nodes(tree).find((n) => n.type === 'button' && n.props.children === 'discard').props.onClick()
  tree = page.render()
  assert.equal(value('titlePrefix').value, 'saved')
  assert.equal(value('wecomAibotChatIds').value, 'saved-chat')
  assert.equal(value('wecomAibotBotId').value, 'new')
})
