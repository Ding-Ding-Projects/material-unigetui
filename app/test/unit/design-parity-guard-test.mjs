import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The design-parity fail-closed guard.
 *
 * Reads docs/design-parity/inventory.json (the hand-written per-screen
 * inventory) and fails when any row is missing the evidence the design-parity
 * contract requires: a reference route, a real-app route, a complete capture
 * tuple, an MD3 audit, both raw captures, the side-by-side comparison, and
 * the visual-diff record — or when a declared deviation has no recorded
 * reason.
 *
 * A screen legitimately still in progress is not hidden from this guard: it
 * is listed with `pendingReason` and everything else null, and this guard
 * FAILS it by design until real evidence lands. That is the whole point of a
 * fail-closed guard — "not done yet" must read as red, never as absent.
 *
 * Every assertion below anchors to a specific field on a specific row from
 * the hand-written inventory, never to a source-code substring scan, so a
 * renamed field or a commented-out line cannot satisfy it by accident.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const inventoryPath = join(repoRoot, 'docs', 'design-parity', 'inventory.json')
const diffReportPath = join(repoRoot, 'docs', 'design-parity', 'diffs', 'diff-report.json')

function readInventory() {
  assert.ok(existsSync(inventoryPath), `inventory missing at ${inventoryPath}`)
  return JSON.parse(readFileSync(inventoryPath, 'utf8'))
}

function readDiffReport() {
  if (!existsSync(diffReportPath)) return null
  return JSON.parse(readFileSync(diffReportPath, 'utf8'))
}

/**
 * Every checked-in reference screen this app's own route table declares.
 * Hand-written here too — deliberately NOT derived from routes.ts by an
 * import or a regex scan, because a guard that reads its own expectation
 * from the same file it is checking cannot detect that file losing a route.
 */
const EXPECTED_SCREEN_IDS = [
  'discover',
  'updates',
  'installed',
  'bundles',
  'history',
  'automation',
  'converter',
  'ollama',
  'auth',
  'logs',
  'tickets',
  'about',
  'settings',
]

test('the expected screen list is non-empty', () => {
  // Guard the guard: an empty EXPECTED_SCREEN_IDS makes every loop below a
  // silent no-op that reports clean without checking anything.
  assert.ok(EXPECTED_SCREEN_IDS.length > 0)
})

test('inventory.screens is a non-empty array', () => {
  const inventory = readInventory()
  assert.ok(Array.isArray(inventory.screens), 'inventory.screens must be an array')
  assert.ok(inventory.screens.length > 0, 'inventory.screens must not be empty')
})

test('every expected screen has exactly one inventory row', () => {
  const inventory = readInventory()
  const ids = inventory.screens.map(s => s.id)
  for (const expected of EXPECTED_SCREEN_IDS) {
    const matches = ids.filter(id => id === expected)
    assert.equal(
      matches.length,
      1,
      `expected exactly one inventory row for screen '${expected}', found ${matches.length}`,
    )
  }
})

test('no inventory row names a screen outside the expected list', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    assert.ok(
      EXPECTED_SCREEN_IDS.includes(screen.id),
      `inventory row '${screen.id}' is not in the expected screen list — update EXPECTED_SCREEN_IDS if this is a real new screen`,
    )
  }
})

test('every inventory row declares both routes, a full capture tuple, and an MD3 audit', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    assert.ok(typeof screen.referenceRoute === 'string' && screen.referenceRoute.length > 0, `${screen.id}.referenceRoute missing`)
    assert.ok(typeof screen.realAppRoute === 'string' && screen.realAppRoute.length > 0, `${screen.id}.realAppRoute missing`)
    assert.ok(typeof screen.state === 'string' && screen.state.length > 0, `${screen.id}.state missing`)
    assert.ok(typeof screen.theme === 'string' && screen.theme.length > 0, `${screen.id}.theme missing`)
    assert.ok(typeof screen.viewport === 'string' && screen.viewport.length > 0, `${screen.id}.viewport missing`)
    assert.ok(typeof screen.scale === 'string' && screen.scale.length > 0, `${screen.id}.scale missing`)
    assert.ok(screen.md3Audit && typeof screen.md3Audit === 'object', `${screen.id}.md3Audit missing`)
    assert.ok(typeof screen.md3Audit.status === 'string' && screen.md3Audit.status.length > 0, `${screen.id}.md3Audit.status missing`)
  }
})

test('every inventory row is either fully evidenced or explicitly pending — nothing in between', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    const complete =
      screen.md3Audit.status === 'reviewed' &&
      typeof screen.rawCaptureReference === 'string' &&
      typeof screen.rawCaptureApp === 'string' &&
      typeof screen.sideBySide === 'string' &&
      typeof screen.diffRecord === 'string'
    const pending = screen.md3Audit.status === 'pending' && typeof screen.pendingReason === 'string' && screen.pendingReason.length > 0
    assert.ok(
      complete || pending,
      `${screen.id} is neither fully evidenced (audit reviewed + all four evidence paths present) nor explicitly pending with a reason`,
    )
  }
})

test('every row marked "reviewed" has both raw captures actually present on disk', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    if (screen.md3Audit.status !== 'reviewed') continue
    const refPath = join(repoRoot, screen.rawCaptureReference)
    const appPath = join(repoRoot, screen.rawCaptureApp)
    assert.ok(existsSync(refPath), `${screen.id}: declared reference capture does not exist at ${screen.rawCaptureReference}`)
    assert.ok(existsSync(appPath), `${screen.id}: declared app capture does not exist at ${screen.rawCaptureApp}`)
  }
})

test('every row marked "reviewed" has its side-by-side image actually present on disk', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    if (screen.md3Audit.status !== 'reviewed') continue
    const sbsPath = join(repoRoot, screen.sideBySide)
    assert.ok(existsSync(sbsPath), `${screen.id}: declared side-by-side image does not exist at ${screen.sideBySide}`)
  }
})

test('every row marked "reviewed" has a corresponding diff-report.json result that is not skipped', () => {
  const inventory = readInventory()
  const report = readDiffReport()
  for (const screen of inventory.screens) {
    if (screen.md3Audit.status !== 'reviewed') continue
    assert.ok(report, 'diff-report.json is missing but a reviewed row exists — run `npm run design-parity:diff`')
    const result = report.results.find(r => r.screenId === screen.id)
    assert.ok(result, `${screen.id}: no matching entry in diff-report.json`)
    assert.ok(!result.skipped, `${screen.id}: diff-report.json entry is skipped (${result.reason ?? 'no reason recorded'})`)
    assert.ok(typeof result.diffPercent === 'number', `${screen.id}: diff-report.json entry has no diffPercent`)
  }
})

test('every declared deviation carries a recorded reason', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    for (const deviation of screen.deviations ?? []) {
      assert.ok(
        typeof deviation.reason === 'string' && deviation.reason.length > 0,
        `${screen.id}: a deviation is missing its recorded reason`,
      )
      assert.equal(deviation.reviewed, true, `${screen.id}: a deviation is not marked reviewed`)
    }
  }
})

test('every open defect on a reviewed row names a file', () => {
  const inventory = readInventory()
  for (const screen of inventory.screens) {
    if (screen.md3Audit.status !== 'reviewed') continue
    for (const defect of screen.md3Audit.openDefects ?? []) {
      assert.ok(typeof defect.description === 'string' && defect.description.length > 0, `${screen.id}: open defect missing description`)
      assert.ok(typeof defect.file === 'string' && defect.file.length > 0, `${screen.id}: open defect missing file`)
    }
  }
})
