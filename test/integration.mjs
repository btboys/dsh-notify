/**
 * Integration test: load the notify plugin on a host-like context and verify
 * the /dsh-notify RPC channel serves the configuration — the primary surface
 * for the Web "通知" settings page.
 *
 * The channel is a `webServer` prefix route (NOT `connection.rpc.handle()`,
 * which a third-party plugin cannot use: its registry captures the Connection
 * service's own context as owner, and that fiber does not inject `webServer`).
 * This test therefore provides the same two services a live host does —
 * `connection.requestRejection` + `webServer.register` — captures the route,
 * and drives it with a real request/response pair to exercise the whole wire
 * path: path parsing → JSON envelope → endpoint dispatch → response envelope.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import notifyPlugin, { NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS } from '../lib/index.js'

/** One buffered node:http request built from a JSON envelope. */
function makeRequest(endpoint, message) {
  const body = Buffer.from(JSON.stringify(message))
  return {
    method: 'POST',
    url: `${NOTIFY_RPC_CHANNEL}/${endpoint}`,
    headers: { 'content-type': 'application/json', 'content-length': String(body.byteLength) },
    async *[Symbol.asyncIterator]() { yield body },
    destroy() {},
  }
}

/** Capture status/headers/body written by the route handler. */
function makeResponse() {
  const res = {
    statusCode: null,
    headers: null,
    body: '',
    writableEnded: false,
    writeHead(code, headers) {
      res.statusCode = code
      res.headers = headers ?? null
      return res
    },
    end(chunk) {
      res.writableEnded = true
      if (chunk !== undefined) res.body += String(chunk)
      return res
    },
    on() { return res },
  }
  return res
}

/** Call the captured route the way the host web server does. */
async function callRoute(route, endpoint, message, request = makeRequest(endpoint, message)) {
  const res = makeResponse()
  await route.handler(request, res)
  return res
}

async function run() {
  console.log('🔍 Integration test: notify plugin RPC config channel\n')

  // Isolate the plugin's config persistence into a throwaway DSH_HOME.
  const home = mkdtempSync(join(tmpdir(), 'dsh-notify-integration-'))
  process.env.DSH_HOME = home

  let route = null
  const fenced = []
  const ctx = new Context()
  ctx.provide('connection', {
    requestRejection: (req) => { fenced.push(req); return undefined },
  })
  ctx.provide('webServer', {
    register: (registered) => { route = registered; return () => { route = null } },
  })

  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: true, sound: true },
      wecom: { enabled: false, webhookUrl: '' },
    },
    titlePrefix: '[DSH]',
  })
  console.log('✓ Notify plugin mounted')
  if (route === null) {
    console.error('✗ /dsh-notify route was NOT registered')
    process.exitCode = 1
    return
  }
  if (route.kind !== 'prefix' || route.path !== NOTIFY_RPC_CHANNEL) {
    console.error(`✗ route shape wrong: ${route.kind} ${route.path}`)
    process.exitCode = 1
    return
  }
  console.log(`✓ route registered: prefix ${route.path}`)

  // An unauthenticated request is fenced before dispatch.
  const fenceCtx = new Context()
  let fencedRoute = null
  fenceCtx.provide('connection', { requestRejection: () => 401 })
  fenceCtx.provide('webServer', { register: (registered) => { fencedRoute = registered; return () => {} } })
  await fenceCtx.plugin(notifyPlugin, { enabled: true })
  const fenceRes = makeResponse()
  await fencedRoute.handler(
    makeRequest(NOTIFY_ENDPOINTS.configGet, { type: 'client-request', rpcId: 'x', method: NOTIFY_ENDPOINTS.configGet, payload: {} }),
    fenceRes,
  )
  if (fenceRes.statusCode !== 401 || fenceRes.body !== 'unauthorized') {
    console.error(`✗ fence not applied: ${fenceRes.statusCode} ${JSON.stringify(fenceRes.body)}`)
    process.exitCode = 1
    return
  }
  console.log('✓ requestRejection fence answers 401 before dispatch')
  await fenceCtx.fiber.dispose()

  // config.get returns the effective config through the wire envelope.
  const getRes = await callRoute(route, NOTIFY_ENDPOINTS.configGet, {
    type: 'client-request', rpcId: 'rpc-1', method: NOTIFY_ENDPOINTS.configGet, payload: {},
  })
  if (getRes.statusCode !== 200 || getRes.headers?.['content-type'] !== 'application/json') {
    console.error(`✗ configGet response not JSON: ${getRes.statusCode}`)
    process.exitCode = 1
    return
  }
  const getBody = JSON.parse(getRes.body)
  console.log('  configGet ok:', getBody.result.ok, '| titlePrefix:', getBody.result.value?.titlePrefix)
  if (getBody.type !== 'server-response' || getBody.rpcId !== 'rpc-1') {
    console.error('✗ response envelope malformed')
    process.exitCode = 1
    return
  }
  if (!getBody.result.ok || getBody.result.value?.titlePrefix !== '[DSH]') {
    console.error('✗ configGet returned unexpected config')
    process.exitCode = 1
    return
  }
  if (fenced.length !== 1) {
    console.error('✗ the route must consult connection.requestRejection')
    process.exitCode = 1
    return
  }
  console.log('✓ configGet works')

  // config.set applies and returns the updated config.
  const setRes = await callRoute(route, NOTIFY_ENDPOINTS.configSet, {
    type: 'client-request', rpcId: 'rpc-2', method: NOTIFY_ENDPOINTS.configSet, payload: { titlePrefix: '[WEB]' },
  })
  const setBody = JSON.parse(setRes.body)
  console.log('  configSet titlePrefix:', setBody.result.value?.titlePrefix)
  if (!setBody.result.ok || setBody.result.value?.titlePrefix !== '[WEB]') {
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

  // A method/endpoint mismatch is refused without touching the service.
  const mismatch = await callRoute(route, NOTIFY_ENDPOINTS.configGet, {
    type: 'client-request', rpcId: 'rpc-3', method: 'notify.other', payload: {},
  })
  const mismatchBody = JSON.parse(mismatch.body)
  if (mismatchBody.result.ok || mismatchBody.result.error?.code !== 'gateway/bad-request') {
    console.error('✗ mismatched method was not refused')
    process.exitCode = 1
    return
  }
  console.log('✓ method/endpoint mismatch refused')

  // A non-POST method on the channel path is a 404, like the built-in channels.
  const wrongMethod = await callRoute(route, NOTIFY_ENDPOINTS.configGet, {}, {
    ...makeRequest(NOTIFY_ENDPOINTS.configGet, {}), method: 'GET',
  })
  if (wrongMethod.statusCode !== 404) {
    console.error(`✗ non-POST should 404, got ${wrongMethod.statusCode}`)
    process.exitCode = 1
    return
  }
  console.log('✓ non-POST requests 404')

  await ctx.fiber.dispose()
  if (route !== null) {
    console.error('✗ disposing the plugin must remove the route')
    process.exitCode = 1
    return
  }
  console.log('✓ route removed with the plugin fiber')
  rmSync(home, { recursive: true, force: true })
  console.log('\n✅ Integration test passed')
}

run().catch((error) => {
  console.error('❌ Integration test failed:', error)
  process.exit(1)
})
