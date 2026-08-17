#!/usr/bin/env node
/**
 * Post-build normalization of client/client.js, which is a COMMITTED and
 * PUBLISHED artifact — so it must be byte-identical no matter whose machine
 * built it:
 *
 * 1. Rolldown pretty-prints the tsdown banner into a three-line header, but
 *    the published contract (enforced by preflight.mjs, and relied on by
 *    hosts that sniff the loader id from the file head) requires the file to
 *    START with the exact one-line `window.__ModuleLoader__.load({ id: "…"`
 *    prefix. Collapse the header onto one line, leaving blank lines in place
 *    of the folded ones so the sourcemap's line numbers stay valid.
 * 2. tsdown names the CSS module's virtual chunk by ABSOLUTE path, so the
 *    builder's checkout path ends up committed in a region comment and shipped
 *    to npm. Rewrite it to a stable repo-relative form.
 */
import fs from 'node:fs'

const file = 'client/client.js'
const name = JSON.parse(fs.readFileSync('package.json', 'utf8')).name
const required = `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {`

let code = fs.readFileSync(file, 'utf8')

// --- 1. one-line loader banner -------------------------------------------
if (!code.startsWith(required)) {
  const lines = code.split('\n')
  // tsdown/rolldown folds the banner with a leading tab on folded lines; accept
  // both the tab-indented and plain forms and collapse to the single line.
  if (lines[0].trim() !== 'window.__ModuleLoader__.load({' || lines[2].trim() !== 'factory: (require) => {') {
    console.error(`normalize-client-banner: unexpected ${file} header:\n` + lines.slice(0, 3).join('\n'))
    process.exit(1)
  }
  lines[0] = required
  lines[1] = ''
  lines[2] = ''
  code = lines.join('\n')
}

// --- 2. machine-independent CSS virtual ids -------------------------------
// `\0dsh-css:<abs>/src/client/Card.module.css.mjs` → `\0dsh-css:src/client/…`
const root = process.cwd().replaceAll('\\', '/')
code = code.replace(/(dsh-css:)([^\n"]*?)(src[/\\][^\n"]*?\.css\.mjs)/g, (_all, prefix, _dir, rel) =>
  prefix + rel.replaceAll('\\', '/'))
// Guard: this builder's own checkout path must not survive anywhere.
const leaks = [
  ...code.matchAll(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
  ...code.matchAll(/dsh-css:(?:\/|[A-Za-z]:[/\\])[^\n"]*/g),
].map(match => match[0].slice(0, 60))
if (leaks.length > 0) {
  console.error(`normalize-client-banner: absolute path leaked into ${file}:\n` + [...new Set(leaks)].join('\n'))
  process.exit(1)
}
code = code.replace(/[ \t]+$/gm, '')
fs.writeFileSync(file, code)
console.log(`normalize-client-banner: pinned ${file} to one-line loader header`)
