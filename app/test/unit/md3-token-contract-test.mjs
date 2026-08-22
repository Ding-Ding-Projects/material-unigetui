import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCompiled } from '../helpers/compiled.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const uiRoot = join(repoRoot, 'app', 'src', 'ui')

const {
  md3ColorRoles,
  md3LightPalette,
  md3DarkPalette,
  md3PaletteToCssText,
  md3StaticTokensToCssText,
} = loadCompiled('ui/md3/md3-style-contract.ts')

function findFiles(dir, suffixes) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) found.push(...findFiles(full, suffixes))
    else if (suffixes.some(s => entry.endsWith(s))) found.push(full)
  }
  return found
}

/** Every custom-property NAME referenced anywhere in the ported UI, via var(--x). */
function everyReferencedToken() {
  const names = new Set()
  const pattern = /var\((--[a-zA-Z0-9-]+)/g
  for (const file of findFiles(uiRoot, ['.css', '.tsx', '.ts'])) {
    const src = readFileSync(file, 'utf8')
    let m
    while ((m = pattern.exec(src)) !== null) names.add(m[1])
  }
  return [...names].sort()
}

/** Every custom-property NAME the design's own runtime actually declares. */
function everyDeclaredToken() {
  const declared = new Set()
  const declPattern = /(--[a-zA-Z0-9-]+):/g
  const cssText = md3PaletteToCssText(md3LightPalette) + ';' + md3StaticTokensToCssText()
  let m
  while ((m = declPattern.exec(cssText)) !== null) declared.add(m[1])
  return declared
}

test('every token a stylesheet or component reads via var(--x) is actually declared', () => {
  const referenced = everyReferencedToken()
  assert.ok(referenced.length > 0, 'no var(--x) usages were found under app/src/ui — the extraction itself is broken')

  const declared = everyDeclaredToken()
  const undeclared = referenced.filter(name => !declared.has(name))

  assert.deepEqual(
    undeclared,
    [],
    `these tokens are read but never declared by md3-style-contract.ts, so they would resolve to nothing: ${undeclared.join(', ')}`
  )
})

test('no color role is declared twice with a different value in the same palette', () => {
  // Object literals cannot carry a duplicate key at the JS-object level (the
  // last one silently wins and the runtime object only ever has one value),
  // so the risk this guards against is a duplicate KEY in the SOURCE TEXT —
  // exactly the shape that is invisible once compiled and only visible on
  // disk. Line-anchored, not a bare substring: a key only counts if it opens
  // a line as `key:` inside the object literal.
  const source = readFileSync(join(uiRoot, 'md3', 'md3-style-contract.ts'), 'utf8')
  const normalized = source.replace(/\r\n/g, '\n')

  for (const [label, marker] of [
    ['md3LightPalette', 'export const md3LightPalette'],
    ['md3DarkPalette', 'export const md3DarkPalette'],
  ]) {
    const start = normalized.indexOf(marker)
    assert.ok(start !== -1, `could not find ${marker} in md3-style-contract.ts`)
    const end = normalized.indexOf('\n}', start)
    const block = normalized.slice(start, end === -1 ? undefined : end)

    const keyPattern = /(?:^|\s)([a-z]+):\s*'#[0-9A-Fa-f]{6}'/g
    const seen = new Map()
    let m
    while ((m = keyPattern.exec(block)) !== null) {
      const key = m[1]
      seen.set(key, (seen.get(key) || 0) + 1)
    }
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key)
    assert.deepEqual(duplicated, [], `${label} declares these roles more than once: ${duplicated.join(', ')}`)
  }
})

test('md3ColorRoles lists every role the light and dark palettes both carry', () => {
  for (const role of md3ColorRoles) {
    assert.ok(role in md3LightPalette, `${role} missing from md3LightPalette`)
    assert.ok(role in md3DarkPalette, `${role} missing from md3DarkPalette`)
  }
  assert.equal(md3ColorRoles.length, Object.keys(md3LightPalette).length)
  assert.equal(Object.keys(md3LightPalette).length, Object.keys(md3DarkPalette).length)
})

test('a token that no source file declares is correctly reported as undeclared (self-check)', () => {
  const declared = everyDeclaredToken()
  assert.equal(declared.has('--this-token-does-not-exist'), false)
})
