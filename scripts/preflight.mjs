#!/usr/bin/env node
/**
 * Preflight assertion for the shipped client bundle: client/client.js must
 * start with the exact loader header the DSH runtime expects, and must not
 * reference an external the loader table cannot answer. Run in `prepack` so a
 * broken bundle can never be published.
 */
import fs from 'node:fs'

const file = 'client/client.js'
if (!fs.existsSync(file)) {
  console.error('preflight: client/client.js missing — run `npm run build:client`')
  process.exit(1)
}
const name = JSON.parse(fs.readFileSync('package.json', 'utf8')).name
const required = `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {`
const code = fs.readFileSync(file, 'utf8')
if (!code.startsWith(required)) {
  console.error(`preflight: ${file} does not start with the loader header:\n  expected: ${required}\n  got:      ${code.slice(0, 80)}…`)
  process.exit(1)
}
console.log(`preflight: ${file} OK (${code.length} bytes)`)
