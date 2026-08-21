import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const fixtures = join(repoRoot, 'app', 'test', 'fixtures', 'feature-completeness')

const canonical = JSON.parse(
  readFileSync(join(fixtures, 'canonical-features.json'), 'utf8')
)
const manifest = JSON.parse(
  readFileSync(join(fixtures, 'evidence-paths.json'), 'utf8')
)

const DIMENSIONS = [
  'implementation',
  'documentation',
  'localization',
  'persistence',
  'focusedTest',
  'builtArtifactInteraction',
  'realCapture',
]

const canonicalIds = canonical.features.map(f => f.id)
const manifestIds = manifest.features.map(f => f.id)

// Guard the guard. Every loop below iterates a derived list, and an empty list
// makes each of them pass by doing nothing at all — which reports green for a
// check that has stopped existing.
test('the canonical list is non-empty', () => {
  assert.ok(canonicalIds.length > 0, 'canonical feature list is empty')
  assert.ok(DIMENSIONS.length === 7, 'expected exactly seven evidence dimensions')
})

test('every canonical id is unique', () => {
  assert.equal(new Set(canonicalIds).size, canonicalIds.length)
})

test('the manifest digest still matches the canonical list', () => {
  // A digest over the whole array, not a count. A count cannot see a rename or
  // a reorder, and both change what the inventory means.
  const actual = createHash('sha256')
    .update(JSON.stringify(canonical.features))
    .digest('hex')
  assert.equal(
    manifest.canonicalFeatureDigest,
    actual,
    'canonical features changed without regenerating the manifest — run `node script/sync-evidence-manifest.mjs`'
  )
})

test('manifest rows match the canonical ids exactly and in order', () => {
  // Exact ordered equality rather than set membership: set comparison passes
  // while a row is silently duplicated or reordered.
  assert.deepEqual(manifestIds, canonicalIds)
})

test('every row declares every dimension', () => {
  for (const row of manifest.features) {
    assert.deepEqual(
      Object.keys(row.evidence),
      DIMENSIONS,
      `row ${row.id} has the wrong dimension set`
    )
    for (const dimension of DIMENSIONS) {
      const records = row.evidence[dimension]
      assert.ok(
        Array.isArray(records) && records.length > 0,
        `row ${row.id}.${dimension} has no evidence records`
      )
    }
  }
})

test('every record has a status this schema recognises', () => {
  const allowed = new Set(['present', 'pending', 'blocked'])
  let checked = 0
  for (const row of manifest.features) {
    for (const dimension of DIMENSIONS) {
      for (const record of row.evidence[dimension]) {
        assert.ok(
          allowed.has(record.status),
          `row ${row.id}.${dimension} has status ${JSON.stringify(record.status)}`
        )
        checked += 1
      }
    }
  }
  assert.ok(checked > 0, 'no evidence records were checked')
})

test('a present record names real files that exist', () => {
  let presentRecords = 0
  for (const row of manifest.features) {
    for (const dimension of DIMENSIONS) {
      for (const record of row.evidence[dimension]) {
        if (record.status !== 'present') {
          continue
        }
        presentRecords += 1
        assert.ok(
          Array.isArray(record.paths) && record.paths.length > 0,
          `row ${row.id}.${dimension} is present with no paths`
        )
        for (const relative of record.paths) {
          assert.ok(
            existsSync(join(repoRoot, relative)),
            `row ${row.id}.${dimension} claims ${relative}, which does not exist`
          )
        }
      }
    }
  }
  assert.ok(presentRecords > 0, 'no present records found; the guard checked nothing')
})

test('a pending or blocked record explains itself', () => {
  for (const row of manifest.features) {
    for (const dimension of DIMENSIONS) {
      for (const record of row.evidence[dimension]) {
        if (record.status === 'present') {
          continue
        }
        assert.ok(
          typeof record.reason === 'string' && record.reason.trim().length > 0,
          `row ${row.id}.${dimension} is ${record.status} with no reason`
        )
      }
    }
  }
})

/**
 * Anchored source assertions.
 *
 * Each entry names a declaration that must still exist, matched at the start of
 * a line against a real export. A bare substring would be satisfied by a
 * renamed symbol that merely contains the old name, and by a commented-out
 * line — which is how a wiring call usually dies.
 */
const ANCHORED_DECLARATIONS = [
  {
    file: 'app/src/main-process/manager-drivers/winget-table-parser.ts',
    pattern: /^export function parseWinGetTable\b/m,
  },
  {
    file: 'app/src/main-process/manager-drivers/winget-driver.ts',
    pattern: /^export class WinGetDriver\b/m,
  },
  {
    file: 'app/src/main-process/operations-queue.ts',
    pattern: /^export class OperationsQueue\b/m,
  },
  {
    file: 'app/src/ui/md3/md3-style-contract.ts',
    pattern: /^export const md3LightPalette\b/m,
  },
  {
    file: 'app/src/ui/md3/md3-style-contract.ts',
    pattern: /^export const md3DarkPalette\b/m,
  },
  {
    file: 'app/src/preload.ts',
    pattern: /^contextBridge\.exposeInMainWorld\(/m,
  },
]

test('anchored declarations are all still present', () => {
  assert.ok(ANCHORED_DECLARATIONS.length > 0, 'no anchors declared')
  for (const anchor of ANCHORED_DECLARATIONS) {
    const full = join(repoRoot, anchor.file)
    assert.ok(existsSync(full), `anchor file missing: ${anchor.file}`)
    // Normalise line endings before matching. On a CRLF checkout a /^…/m
    // pattern can fail for a line that is genuinely there, and the failure
    // looks exactly like the deletion this guard exists to catch.
    const source = readFileSync(full, 'utf8').replace(/\r\n/g, '\n')
    assert.match(
      source,
      anchor.pattern,
      `${anchor.file} no longer declares ${anchor.pattern}`
    )
  }
})

test('the renderer stays isolated', () => {
  const source = readFileSync(
    join(repoRoot, 'app/src/main-process/app-window.ts'),
    'utf8'
  ).replace(/\r\n/g, '\n')

  assert.match(source, /^\s*contextIsolation: true,$/m)
  assert.match(source, /^\s*nodeIntegration: false,$/m)
})

test('the preload bridge exposes no arbitrary channel forwarder', () => {
  const source = readFileSync(join(repoRoot, 'app/src/preload.ts'), 'utf8')
  // A bridge method taking a channel name would hand the renderer the whole
  // main process and undo the isolation the flags above appear to provide.
  assert.doesNotMatch(
    source,
    /invoke:\s*\(\s*channel/,
    'preload exposes a generic invoke(channel, …) forwarder'
  )
})

test('chrome styles name no raw colour', () => {
  const css = readFileSync(join(repoRoot, 'app/src/ui/app.css'), 'utf8')
  const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g)
  assert.equal(
    hex,
    null,
    `app.css declares raw colours instead of tokens: ${JSON.stringify(hex)}`
  )
})
