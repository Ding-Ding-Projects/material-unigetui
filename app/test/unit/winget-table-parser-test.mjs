import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { importCompiled } from '../helpers/compiled.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')

// The parser is TypeScript; the test exercises the compiled behaviour by
// importing the source through the same tsc the build uses. Kept as a plain
// re-implementation-free import so a rename in the source breaks this test.
const { parseWinGetTable, parseHeaderSpans } = await importCompiled(
  'main-process/manager-drivers/winget-table-parser.ts'
)

const SEARCH_COLUMNS = ['Name', 'Id', 'Version', 'Match', 'Source']

const fixture = readFileSync(
  join(repoRoot, 'app/test/fixtures/manager-output/winget-search-7zip.txt'),
  'utf8'
)

test('fixture still contains the CRLF endings winget really emits', () => {
  assert.ok(
    fixture.includes('\r\n'),
    'fixture lost its CRLF endings — recapture it; a normalised fixture stops testing the thing it exists to test'
  )
})

test('parses every package row from real winget output', () => {
  const rows = parseWinGetTable(fixture, SEARCH_COLUMNS)
  assert.ok(rows.length > 0, 'derived row list must not be empty')
  assert.equal(rows.length, 9)
})

test('keeps package names that contain spaces intact', () => {
  const rows = parseWinGetTable(fixture, SEARCH_COLUMNS)
  const found = rows.find(r => r.Id === 'Elcomsoft.ArchivePassword')
  assert.ok(found, 'expected the Elcomsoft row')
  // This is the assertion that whitespace-splitting fails.
  assert.equal(found.Name, 'Advanced Archive Password Recovery')
})

test('no field carries a stray carriage return', () => {
  const rows = parseWinGetTable(fixture, SEARCH_COLUMNS)
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      assert.ok(
        !value.includes('\r'),
        `column ${column} kept a CR: ${JSON.stringify(value)}`
      )
    }
  }
})

test('handles a row whose trailing column is empty', () => {
  const rows = parseWinGetTable(fixture, SEARCH_COLUMNS)
  const bare = rows.find(r => r.Id === '7zip.7zr')
  assert.ok(bare, 'expected the 7zr row')
  assert.equal(bare.Match, '')
  assert.equal(bare.Source, 'winget')
})

test('reports a changed format rather than silently returning nothing', () => {
  assert.equal(parseHeaderSpans('total nonsense', SEARCH_COLUMNS), null)
})
