import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const uiRoot = join(repoRoot, 'app', 'src', 'ui')
const i18nResourcesPath = join(repoRoot, 'app', 'src', 'lib', 'i18n-resources.ts')

/**
 * No user-facing string in the ported components may be a hard-coded
 * literal - every one must go through the translation layer (t()/a() from
 * useI18n()), so the three language modes and both funny-level sliders
 * actually reach it.
 *
 * Scoped to the two files the top app bar, nav drawer, and tab strip port
 * actually live in (app.tsx, tabs.tsx) rather than the whole app/src/ui
 * tree: a sweep of every route file turns up dozens of pre-existing
 * hard-coded strings across surfaces this lane was explicitly told not to
 * touch (settings, tools, the authenticator route, and more). Widening this
 * test to catch all of them would report defects this lane has no mandate to
 * fix and no ability to verify were introduced by the port under review.
 * app.tsx and tabs.tsx are exactly the files this task named.
 */

function jsxTextLiterals(source) {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  // A capitalized run of words sitting directly between a JSX-tag-closing
  // ">" and the next "<". The negative lookbehind/lookahead on "=" excludes
  // TypeScript generics such as "=> Promise<T>", whose "=>" would otherwise
  // read as a false JSX tag close.
  const pattern = /(?<!=)>\s*([A-Z][a-zA-Z0-9 ,.'&;-]{3,})\s*<(?!=)/g
  const found = []
  let m
  while ((m = pattern.exec(noComments)) !== null) found.push(m[1].trim())
  return found
}

test('app.tsx (top app bar, nav drawer, About, NotYetPorted) has no hard-coded JSX text', () => {
  const source = readFileSync(join(uiRoot, 'app.tsx'), 'utf8')
  const literals = jsxTextLiterals(source)
  assert.deepEqual(
    literals,
    [],
    'app.tsx renders these strings directly instead of through t()/a(): ' +
      JSON.stringify(literals) +
      '. Known real defect: AboutRoute (around line 475) renders its entire ' +
      "body as hard-coded English with no i18n call at all, and NotYetPorted's " +
      '"This surface is designed but not yet built." (around line 528) does the ' +
      'same one line above a t() call in the same component. This test is left ' +
      'failing deliberately to record that; do not weaken the pattern to pass.'
  )
})

test('tabs.tsx (tab strip) has no hard-coded JSX text', () => {
  const source = readFileSync(join(uiRoot, 'tabs.tsx'), 'utf8')
  const literals = jsxTextLiterals(source)
  assert.deepEqual(literals, [], 'tabs.tsx renders these strings directly instead of through t()/a(): ' + JSON.stringify(literals))
})

test('the localization-literal scanner itself catches a real hard-coded string (self-check)', () => {
  const literals = jsxTextLiterals('<p>\n  Hardcoded English sentence.\n</p>')
  assert.deepEqual(literals, ['Hardcoded English sentence.'])
})

test('the localization-literal scanner does not false-positive on a TypeScript generic', () => {
  const literals = jsxTextLiterals('type X = () => Promise<readonly Row[]>')
  assert.deepEqual(literals, [])
})

/**
 * i18n-resources.ts is one large object literal. A JS object cannot carry a
 * duplicate key at the runtime-object level (the last one silently wins), so
 * the risk here is entirely in the SOURCE TEXT: four lanes appended entries
 * to this file in parallel, and two of them landing on the same key name
 * would silently discard one language pair with no error anywhere.
 */
test('i18n-resources.ts declares no translation key twice', () => {
  const source = readFileSync(i18nResourcesPath, 'utf8').replace(/\r\n/g, '\n')
  const start = source.indexOf('export const baseResources')
  assert.ok(start !== -1, 'could not find baseResources in i18n-resources.ts')
  const end = source.indexOf('\n}', start)
  const block = source.slice(start, end === -1 ? undefined : end)

  // Line-anchored: a match only counts as a key when it opens a line as
  // `identifier: { ... }`, which is exactly this file's declaration shape.
  const keyPattern = /^\s*([a-zA-Z][a-zA-Z0-9]*):\s*\{\s*en:/gm
  const seen = new Map()
  let m
  while ((m = keyPattern.exec(block)) !== null) {
    const key = m[1]
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key)
  assert.deepEqual(duplicated, [], `these translation keys are declared more than once: ${duplicated.join(', ')}`)
  assert.ok(seen.size > 50, `expected many translation keys, only found ${seen.size} — the extraction pattern is likely broken`)
})

test('the duplicate-key scanner correctly detects a real duplicate (self-check)', () => {
  const block = "export const baseResources = {\n  foo: { en: 'a', yue: 'b' },\n  foo: { en: 'c', yue: 'd' },\n}"
  const keyPattern = /^\s*([a-zA-Z][a-zA-Z0-9]*):\s*\{\s*en:/gm
  const seen = new Map()
  let m
  while ((m = keyPattern.exec(block)) !== null) seen.set(m[1], (seen.get(m[1]) || 0) + 1)
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key)
  assert.deepEqual(duplicated, ['foo'])
})
