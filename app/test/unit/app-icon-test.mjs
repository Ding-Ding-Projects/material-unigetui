import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const icoPath = join(repoRoot, 'build', 'icon.ico')
const masterPath = join(repoRoot, 'build', 'icon-master.png')

/** Reads the ICO directory out of the bytes, not out of the build config. */
function readIcoDirectory(bytes) {
  assert.equal(bytes.readUInt16LE(0), 0, 'reserved field is not zero')
  assert.equal(bytes.readUInt16LE(2), 1, 'type is not 1 (icon)')
  const count = bytes.readUInt16LE(4)
  const entries = []
  for (let index = 0; index < count; index++) {
    const at = 6 + index * 16
    entries.push({
      // 256 is stored as 0 in a single byte. Reading it literally is how the
      // largest entry silently disappears.
      width: bytes.readUInt8(at) || 256,
      height: bytes.readUInt8(at + 1) || 256,
      length: bytes.readUInt32LE(at + 8),
      offset: bytes.readUInt32LE(at + 12),
    })
  }
  return entries
}

test('the committed master source exists', () => {
  assert.ok(existsSync(masterPath), 'build/icon-master.png is missing')
  const bytes = readFileSync(masterPath)
  assert.equal(bytes.readUInt32BE(0), 0x89504e47, 'the master is not a PNG')
})

test('the icon is a real ICO container, not a renamed raster', () => {
  // A PNG renamed to .ico is the exact failure this asserts against.
  assert.ok(existsSync(icoPath), 'build/icon.ico is missing')
  const bytes = readFileSync(icoPath)
  assert.notEqual(bytes.readUInt32BE(0), 0x89504e47, 'the .ico is just a PNG')
  const entries = readIcoDirectory(bytes)
  assert.ok(entries.length > 0, 'the icon directory is empty')
})

test('every size Windows needs is present', () => {
  const entries = readIcoDirectory(readFileSync(icoPath))
  const sizes = entries.map(entry => entry.width).sort((a, b) => a - b)
  for (const required of [16, 32, 48, 256]) {
    assert.ok(sizes.includes(required), `no ${required}px entry (have ${sizes.join(', ')})`)
  }
})

test('every entry points at real bytes inside the file', () => {
  const bytes = readFileSync(icoPath)
  const entries = readIcoDirectory(bytes)
  for (const entry of entries) {
    assert.ok(entry.length > 100, `${entry.width}px entry is implausibly small`)
    assert.ok(
      entry.offset + entry.length <= bytes.length,
      `${entry.width}px entry runs past the end of the file`
    )
    const magic = bytes.readUInt32BE(entry.offset)
    assert.equal(magic, 0x89504e47, `${entry.width}px entry is not a PNG`)
  }
})

test('packaging wires the icon rather than leaving the framework default', () => {
  const source = readFileSync(join(repoRoot, 'script', 'package.mjs'), 'utf8')
  assert.match(source, /^\s*`--icon=\$\{ICON_ICO\}`,$/m, 'the packaged app has no icon')
  assert.match(source, /^\s*setupIcon: ICON_ICO,$/m, 'the installer has no icon')
  assert.match(source, /^\s*iconUrl: ICON_URL,$/m, 'no icon URL for Add/Remove Programs')
})
