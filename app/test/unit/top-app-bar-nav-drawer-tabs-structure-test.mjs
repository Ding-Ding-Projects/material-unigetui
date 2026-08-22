import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const uiRoot = join(repoRoot, 'app', 'src', 'ui')

/**
 * TopAppBar and NavDrawer are private (unexported) functions inside app.tsx,
 * so they cannot be rendered directly through the compiled-output route the
 * other component tests here use, and this lane is not permitted to export
 * them by editing app/src/ui/app.tsx. These are therefore structural source
 * assertions rather than a rendered-DOM test: real, line-anchored checks
 * against the exact source text, proven to fail when the pattern they guard
 * is broken (see the self-check tests at the bottom of each group).
 *
 * The tab strip (tabs.tsx) IS exported, so its own coverage additionally
 * relies on real usage already exercised by app.tsx wiring `aria-controls`
 * at the tab strip to the one real tabpanel id in app.tsx — checked below by
 * cross-referencing both files rather than assuming either in isolation.
 */

const appSource = readFileSync(join(uiRoot, 'app.tsx'), 'utf8')
const tabsSource = readFileSync(join(uiRoot, 'tabs.tsx'), 'utf8')

// --------------------------------------------------------------- top app bar

test('TopAppBar: the menu toggle carries an accessible name and reflects drawer state', () => {
  assert.match(appSource, /aria-label=\{a\('menuToggle'\)\}/, 'menu toggle has no aria-label wired to a()')
  assert.match(appSource, /aria-expanded=\{props\.drawerOpen\}/, 'menu toggle does not reflect drawerOpen')
})

test('TopAppBar: every icon-only button in the bar has an accessible name', () => {
  // Split on each occurrence of the className so every button gets its own
  // slice up to (but not including) the NEXT occurrence -- this cannot ever
  // consume into a neighbouring button's attributes, unlike a fixed-size
  // lookahead window that can overrun a short JSX element.
  const marker = 'className="top-app-bar__icon-button"'
  const parts = appSource.split(marker)
  const buttonCount = parts.length - 1
  assert.ok(buttonCount >= 4, `expected several icon-only top app bar buttons, found ${buttonCount}`)
  for (let i = 1; i < parts.length; i += 1) {
    // Each button's own JSX attributes end at its ">" -- everything after
    // that belongs to the next element, not this button.
    const ownAttributes = parts[i].slice(0, parts[i].indexOf('>'))
    assert.match(ownAttributes, /aria-label=\{a\(/, `icon-only button #${i} has no aria-label: ${ownAttributes.slice(0, 120)}...`)
  }
})

test('self-check: the icon-button scan catches a real missing aria-label', () => {
  const broken =
    'className="top-app-bar__icon-button" onClick={x}>\n  <Icon name="menu" />\n</button>\n' +
    'className="top-app-bar__icon-button" onClick={y}>\n  <Icon name="settings" />\n</button>'
  const marker = 'className="top-app-bar__icon-button"'
  const parts = broken.split(marker)
  assert.equal(parts.length - 1, 2)
  const firstOwnAttributes = parts[1].slice(0, parts[1].indexOf('>'))
  assert.doesNotMatch(firstOwnAttributes, /aria-label=\{a\(/)
})

test('TopAppBar: the account avatar has role="img" and an accessible name', () => {
  assert.match(appSource, /className="top-app-bar__avatar" role="img" aria-label=\{a\('account'\)\}/)
})

// ----------------------------------------------------------------- nav drawer

test('NavDrawer: the drawer is a real <nav> landmark with an accessible name', () => {
  assert.match(appSource, /<nav className="nav-drawer" aria-label=\{a\('sectionsNav'\)\}>/)
})

test('NavDrawer: expanded/collapsed state is exposed on the surrounding app body', () => {
  assert.match(appSource, /data-drawer-open=\{drawerOpen\}/, 'no data-drawer-open state marker on app-body')
})

test('self-check: a nav element missing its accessible name is caught', () => {
  const broken = '<nav className="nav-drawer">'
  assert.doesNotMatch(broken, /<nav className="nav-drawer" aria-label=\{a\('sectionsNav'\)\}>/)
})

// -------------------------------------------------------------------- tabs

test('TabStrip: real tablist/tab roles with aria-selected and roving tabindex', () => {
  assert.match(tabsSource, /role="tablist"/)
  assert.match(tabsSource, /role="tab"/)
  assert.match(tabsSource, /aria-selected=\{tab\.id === controller\.activeId\}/)
  assert.match(tabsSource, /tabIndex=\{tab\.id === controller\.activeId \? 0 : -1\}/)
})

test('TabStrip: aria-controls points at an id that genuinely exists in app.tsx', () => {
  const controlsMatch = tabsSource.match(/aria-controls="([^"]+)"/)
  assert.ok(controlsMatch, 'no aria-controls found on the tab element')
  const targetId = controlsMatch[1]
  const idPattern = new RegExp(`id="${targetId}"`)
  assert.match(appSource, idPattern, `tabs.tsx points aria-controls at "${targetId}", but no element in app.tsx declares that id`)
  assert.match(appSource, new RegExp(`id="${targetId}"[\\s\\S]{0,80}?role="tabpanel"`), `the target of aria-controls is not itself a role="tabpanel"`)
})

test('self-check: a dangling aria-controls reference is caught', () => {
  const targetId = 'nonexistent-panel-id-xyz'
  const idPattern = new RegExp(`id="${targetId}"`)
  assert.doesNotMatch(appSource, idPattern)
})
