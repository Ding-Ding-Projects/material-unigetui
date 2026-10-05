import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { hasHonestReleaseCopy, hasHonestConverterCopy, RELEASES_URL } from '../../../script/release-copy-contract.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
execFileSync(process.execPath, ['script/build-site.mjs'], { cwd: root, stdio: 'pipe' })
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const site = readFileSync(join(root, 'site/index.html'), 'utf8')

test('README links unsigned releases without claiming completion or native acceptance', () => {
  assert.equal(hasHonestReleaseCopy(readme), true)
})

test('the authoritative generator produces truthful release-availability copy', () => {
  assert.equal(hasHonestReleaseCopy(site), true)
})

for (const stale of [
  'Not released yet.',
  'Not released.',
  'There is no installer to download.',
  'No installer has been produced or released.',
  'No installer has been released.',
]) test(`release guard rejects the old false availability claim: ${stale}`, () => {
  assert.equal(hasHonestReleaseCopy(`${site}\n<p>${stale}</p>`), false)
})

test('release guard rejects the old claim split across markup and whitespace', () => {
  assert.equal(hasHonestReleaseCopy(`${site}\n<p>There is <b>no installer</b>\n to download.</p>`), false)
})

test('release guard requires a stable release-list link, not a pinned or latest release', () => {
  for (const suffix of ['/latest', '/tag/v0.1.0-build.22']) {
    assert.equal(hasHonestReleaseCopy(site.replaceAll(`href="${RELEASES_URL}"`, `href="${RELEASES_URL}${suffix}"`)), false)
  }
})

for (const disclosure of [
  'Work in progress', 'Unsigned Windows installers are available',
  'unknown-publisher warning', 'does not certify',
]) test(`release guard requires the disclosure: ${disclosure}`, () => {
  // Whitespace is normalized first because the generator wraps its prose.
  assert.equal(hasHonestReleaseCopy(site.replace(/\s+/g, ' ').replace(disclosure, '')), false)
})

test('status names the bounded converter and its remaining adapters and verification limits', () => {
  assert.equal(hasHonestConverterCopy(site), true)
  assert.equal(hasHonestConverterCopy(site.replace('history, Ollama', 'history, converter, Ollama')), false)
  assert.equal(hasHonestConverterCopy(site.replace('Other adapters remain unavailable.', 'All formats work.')), false)
  assert.equal(hasHonestConverterCopy(site.replace('verification remain pending.', 'verification is complete.')), false)
})

const NEW_KEYS = [
  'releaseStatusTitle', 'releaseAvailability', 'releaseLink', 'releaseWarning',
  'releaseLimits', 'releaseCheck', 'releaseIncomplete',
  'converterBounded', 'converterLink', 'converterVerification',
]

// Execute the shipped site script's real boot/change path against a small DOM
// adapter made from generated data-string elements. No browser/rendering claim.
function languageHarness(initialLanguage = 'en') {
  const nodes = [...site.matchAll(/<([a-z][\w-]*)\b([^>]*\bdata-string="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g)].map(match => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]]))
    return { textContent: match[4], getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value } }
  })
  const listeners = {}
  const select = { value: initialLanguage, addEventListener: (event, handler) => { listeners[event] = handler } }
  const attrs = {}
  let boot
  let stored = JSON.stringify({ language: initialLanguage })
  const context = {
    window: {},
    localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value } },
    document: {
      querySelectorAll: selector => selector === '[data-string]' ? nodes : [],
      getElementById: id => id === 'language-mode' ? select : null,
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') boot = handler },
      documentElement: { setAttribute: (key, value) => { attrs[key] = value }, getAttribute: key => attrs[key] },
    },
  }
  runInNewContext(readFileSync(join(root, 'site/assets/site.js'), 'utf8'), context)
  assert.equal(typeof boot, 'function')
  boot()
  return {
    nodes, context,
    change: language => { select.value = language; listeners.change() },
    stored: () => JSON.parse(stored),
  }
}

for (const mode of ['en', 'yue', 'bilingual']) test(`new release/converter disclosures use the existing ${mode} language path`, () => {
  const h = languageHarness()
  const selected = h.nodes.filter(node => NEW_KEYS.includes(node.getAttribute('data-string')))
  assert.deepEqual(selected.map(node => node.getAttribute('data-string')).sort(), [...NEW_KEYS].sort())
  const english = Object.fromEntries(selected.map(node => [node.getAttribute('data-string'), node.textContent]))
  h.change('yue')
  const cantonese = Object.fromEntries(selected.map(node => [node.getAttribute('data-string'), node.textContent]))
  for (const key of NEW_KEYS) {
    assert.notEqual(cantonese[key], english[key], `${key} did not translate`)
    assert.match(cantonese[key], /[\u3400-\u9fff]/)
  }
  h.change(mode)
  for (const node of selected) {
    const key = node.getAttribute('data-string')
    const expected = mode === 'en' ? english[key] : mode === 'yue' ? cantonese[key] : `${english[key]} · ${cantonese[key]}`
    assert.equal(node.textContent, expected, key)
  }
  if (mode === 'en' || mode === 'bilingual') {
    const rendered = selected.map(node => {
      const href = node.getAttribute('href')
      return href ? `<a href="${href}">${node.textContent}</a>` : `<span>${node.textContent}</span>`
    }).join(' ')
    assert.equal(hasHonestReleaseCopy(rendered), true)
    assert.equal(hasHonestConverterCopy(rendered), true)
  }
  assert.equal(h.stored().language, mode)
  assert.equal(selected.find(node => node.getAttribute('data-string') === 'releaseLink').getAttribute('href'), RELEASES_URL)
  assert.equal(selected.find(node => node.getAttribute('data-string') === 'converterLink').getAttribute('href'), RELEASES_URL.replace(/\/releases$/, '') + '/blob/main/docs/features/json-to-csv.md')
})

test('saved Cantonese mode translates new disclosures on first boot', () => {
  const h = languageHarness('yue')
  for (const key of NEW_KEYS) {
    const node = h.nodes.find(candidate => candidate.getAttribute('data-string') === key)
    assert.ok(node, key)
    assert.match(node.textContent, /[\u3400-\u9fff]/, key)
  }
})
