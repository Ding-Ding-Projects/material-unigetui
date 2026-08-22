import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

/**
 * Every `<Icon name="...">` used anywhere under app/src/ui must be a real
 * ligature the vendored Material Symbols Rounded font carries.
 *
 * This is the highest-value test in this file: Material Symbols is a
 * ligature icon font, so a glyph is rendered by writing its English name as
 * the element's text content. An unknown name does NOT fall back to a box or
 * a blank glyph - it falls back to rendering the literal word, silently, with
 * no error anywhere. A typo here ships as visible English text sitting where
 * an icon should be.
 *
 * The WOFF2/GSUB parsing below is adapted from
 * `script/validate-material-symbols.mjs`, which already does exactly this
 * check against the design reference file. That script has no exports (it
 * runs its own `main()` unconditionally on import) and this lane is not
 * permitted to edit it, so the minimal parser is reproduced here rather than
 * imported. If the two ever diverge, both should be checked against the
 * font's own GSUB table - which is precisely what both do.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const uiRoot = join(repoRoot, 'app', 'src', 'ui')
const fontsDir = join(repoRoot, 'app', 'static', 'common', 'fonts')
const manifestPath = join(fontsDir, 'manifest.json')

// ---------------------------------------------------------------------------
// 1. Every glyph name the ported UI actually uses.
// ---------------------------------------------------------------------------

function findFiles(dir, suffix) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) found.push(...findFiles(full, suffix))
    else if (entry.endsWith(suffix)) found.push(full)
  }
  return found
}

function extractIconNamesFromSource() {
  const names = new Set()
  // Literal usage: <Icon name="settings" ... />. Bounded lookahead (not an
  // unbounded [\s\S]*?): a JSX tag's own attributes sit well within 300
  // characters of the tag opening, so this cannot cross into an unrelated
  // later element the way an unbounded scan could.
  const literalPattern = /<Icon\b[\s\S]{0,300}?\bname="([a-zA-Z0-9_]+)"/g
  // Dynamic usage: <Icon name={cond ? 'dark_mode' : 'light_mode'} ... />.
  // Bounded to the name={...} expression itself (up to its closing "}"),
  // then every single-quoted string literal inside it is a candidate — this
  // catches a ternary's both branches, not just whichever one is "first".
  const dynamicPattern = /<Icon\b[\s\S]{0,300}?\bname=\{([^}]*)\}/g

  for (const file of findFiles(uiRoot, '.tsx')) {
    const src = readFileSync(file, 'utf8')
    let m
    while ((m = literalPattern.exec(src)) !== null) names.add(m[1])
    while ((m = dynamicPattern.exec(src)) !== null) {
      // Only the ternary's RESULT branches name an icon. The condition can
      // compare against an unrelated string -- `name={x === 'totp' ? 'qr_code_2'
      // : 'password'}` -- and reading every literal in the expression reported
      // 'totp' as a missing glyph when nothing had ever tried to draw it.
      // Split on the first `?` that is not part of `?.` or `??`.
      const expr = m[1]
      const branchStart = expr.search(/\?(?![.?])/)
      const branches = branchStart === -1 ? expr : expr.slice(branchStart + 1)
      const stringLiteral = /'([a-zA-Z0-9_]+)'/g
      let s
      while ((s = stringLiteral.exec(branches)) !== null) names.add(s[1])
    }
  }
  return [...names].sort()
}

// ---------------------------------------------------------------------------
// 2. Minimal WOFF2 -> sfnt table extraction (GSUB + cmap only).
// ---------------------------------------------------------------------------

const KNOWN_WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
]

function unpackWoff2Tables(buf, wantedTags) {
  let p = 0
  const need = n => {
    if (p + n > buf.length) throw new Error('unexpected end of WOFF2 file')
  }
  const u8 = () => { need(1); return buf.readUInt8(p++) }
  const u16 = () => { need(2); const v = buf.readUInt16BE(p); p += 2; return v }
  const u32 = () => { need(4); const v = buf.readUInt32BE(p); p += 4; return v }
  const tag4 = () => { need(4); const v = buf.toString('ascii', p, p + 4); p += 4; return v }
  const uintBase128 = () => {
    let accum = 0
    for (let i = 0; i < 5; i++) {
      const b = u8()
      if (i === 0 && b === 0x80) throw new Error('invalid UIntBase128 leading byte')
      accum = accum * 128 + (b & 0x7f)
      if ((b & 0x80) === 0) return accum >>> 0
    }
    throw new Error('UIntBase128 value too long')
  }

  const signature = tag4()
  if (signature !== 'wOF2') throw new Error(`not a WOFF2 font (signature was "${signature}")`)
  u32(); u32() // flavor, length
  const numTables = u16()
  u16(); u32() // reserved, totalSfntSize
  const totalCompressedSize = u32()
  u16(); u16() // major/minor version
  u32(); u32(); u32() // meta offset/length/origLength
  u32(); u32() // priv offset/length

  const tables = []
  for (let i = 0; i < numTables; i++) {
    const flags = u8()
    const tagIndex = flags & 0x3f
    const transformVersion = (flags >> 6) & 0x3
    const tag = tagIndex === 63 ? tag4() : KNOWN_WOFF2_TAGS[tagIndex]
    if (tag === undefined) throw new Error(`unknown WOFF2 table tag index ${tagIndex}`)
    const origLength = uintBase128()
    let transformLength = null
    const isGlyfOrLoca = tag === 'glyf' || tag === 'loca'
    if (isGlyfOrLoca) {
      if (transformVersion === 0) transformLength = uintBase128()
    } else if (transformVersion !== 0) {
      throw new Error(`unsupported transform on table "${tag}"`)
    }
    tables.push({ tag, origLength, transformLength })
  }

  const compressed = buf.subarray(p, p + totalCompressedSize)
  const decompressed = zlib.brotliDecompressSync(compressed)

  const result = {}
  let offset = 0
  for (const t of tables) {
    const len = t.transformLength != null ? t.transformLength : t.origLength
    if (wantedTags.has(t.tag)) result[t.tag] = decompressed.subarray(offset, offset + len)
    offset += len
  }
  return result
}

function parseCmapUnicode(cmapBuf) {
  const numTables = cmapBuf.readUInt16BE(2)
  let best = null
  let p = 4
  for (let i = 0; i < numTables; i++) {
    const platformID = cmapBuf.readUInt16BE(p)
    const encodingID = cmapBuf.readUInt16BE(p + 2)
    const offset = cmapBuf.readUInt32BE(p + 4)
    p += 8
    const isUnicodeFull = (platformID === 3 && encodingID === 10) || platformID === 0
    const isUnicodeBmp = platformID === 3 && encodingID === 1
    if (isUnicodeFull) best = { offset, priority: 2 }
    else if (isUnicodeBmp && (!best || best.priority < 1)) best = { offset, priority: 1 }
  }
  if (!best) throw new Error('font cmap table has no Unicode subtable')

  const sub = cmapBuf.subarray(best.offset)
  const format = sub.readUInt16BE(0)
  const map = new Map()

  if (format === 4) {
    const segCountX2 = sub.readUInt16BE(6)
    const segCount = segCountX2 / 2
    const endCodesOff = 14
    const startCodesOff = endCodesOff + segCountX2 + 2
    const idDeltaOff = startCodesOff + segCountX2
    const idRangeOff = idDeltaOff + segCountX2
    for (let s = 0; s < segCount; s++) {
      const endCode = sub.readUInt16BE(endCodesOff + s * 2)
      const startCode = sub.readUInt16BE(startCodesOff + s * 2)
      const idDelta = sub.readInt16BE(idDeltaOff + s * 2)
      const idRangeOffset = sub.readUInt16BE(idRangeOff + s * 2)
      if (startCode === 0xffff && endCode === 0xffff) continue
      for (let c = startCode; c <= endCode && c !== 0xffff; c++) {
        let gid
        if (idRangeOffset === 0) {
          gid = (c + idDelta) & 0xffff
        } else {
          const glyphIndexAddr = idRangeOff + s * 2 + idRangeOffset + (c - startCode) * 2
          gid = sub.readUInt16BE(glyphIndexAddr)
          if (gid !== 0) gid = (gid + idDelta) & 0xffff
        }
        if (gid !== 0) map.set(c, gid)
      }
    }
  } else if (format === 12) {
    const numGroups = sub.readUInt32BE(12)
    let gp = 16
    for (let g = 0; g < numGroups; g++) {
      const startChar = sub.readUInt32BE(gp)
      const endChar = sub.readUInt32BE(gp + 4)
      const startGlyph = sub.readUInt32BE(gp + 8)
      gp += 12
      for (let c = startChar; c <= endChar; c++) map.set(c, startGlyph + (c - startChar))
    }
  } else {
    throw new Error(`unsupported cmap subtable format ${format}`)
  }
  return map
}

function parseCoverage(buf, offset) {
  const format = buf.readUInt16BE(offset)
  const glyphs = []
  if (format === 1) {
    const count = buf.readUInt16BE(offset + 2)
    for (let i = 0; i < count; i++) glyphs.push(buf.readUInt16BE(offset + 4 + i * 2))
  } else if (format === 2) {
    const count = buf.readUInt16BE(offset + 2)
    let p = offset + 4
    for (let i = 0; i < count; i++) {
      const start = buf.readUInt16BE(p)
      const end = buf.readUInt16BE(p + 2)
      const startIndex = buf.readUInt16BE(p + 4)
      p += 6
      for (let g = start; g <= end; g++) glyphs[startIndex + (g - start)] = g
    }
  } else {
    throw new Error(`unsupported Coverage table format ${format}`)
  }
  return glyphs
}

function parseLigatureSubst(buf, subtableStart, out) {
  const substFormat = buf.readUInt16BE(subtableStart)
  if (substFormat !== 1) throw new Error(`unsupported LigatureSubstFormat ${substFormat}`)
  const coverageOffset = buf.readUInt16BE(subtableStart + 2)
  const ligSetCount = buf.readUInt16BE(subtableStart + 4)
  const coverageGlyphs = parseCoverage(buf, subtableStart + coverageOffset)

  for (let i = 0; i < ligSetCount; i++) {
    const ligSetOffset = buf.readUInt16BE(subtableStart + 6 + i * 2)
    const ligSetStart = subtableStart + ligSetOffset
    const firstGlyph = coverageGlyphs[i]
    const ligatureCount = buf.readUInt16BE(ligSetStart)
    for (let l = 0; l < ligatureCount; l++) {
      const ligOffset = buf.readUInt16BE(ligSetStart + 2 + l * 2)
      const ligStart = ligSetStart + ligOffset
      const ligatureGlyph = buf.readUInt16BE(ligStart)
      const componentCount = buf.readUInt16BE(ligStart + 2)
      const seq = [firstGlyph]
      for (let c = 0; c < componentCount - 1; c++) seq.push(buf.readUInt16BE(ligStart + 4 + c * 2))
      out.set(seq.join(','), ligatureGlyph)
    }
  }
}

function walkLookup(buf, lookupListStart, lookupIndex, out) {
  const lookupOffset = buf.readUInt16BE(lookupListStart + 2 + lookupIndex * 2)
  const lookupStart = lookupListStart + lookupOffset
  const lookupType = buf.readUInt16BE(lookupStart)
  const subTableCount = buf.readUInt16BE(lookupStart + 4)
  for (let s = 0; s < subTableCount; s++) {
    const subOffset = buf.readUInt16BE(lookupStart + 6 + s * 2)
    let subtableStart = lookupStart + subOffset
    let effectiveType = lookupType
    if (lookupType === 7) {
      const extFormat = buf.readUInt16BE(subtableStart)
      if (extFormat !== 1) throw new Error('unsupported ExtensionSubstFormat')
      effectiveType = buf.readUInt16BE(subtableStart + 2)
      const extOffset = buf.readUInt32BE(subtableStart + 4)
      subtableStart = subtableStart + extOffset
    }
    if (effectiveType === 4) parseLigatureSubst(buf, subtableStart, out)
  }
}

function parseGsubLigatures(gsubBuf) {
  const featureListOffset = gsubBuf.readUInt16BE(6)
  const lookupListOffset = gsubBuf.readUInt16BE(8)
  const featureCount = gsubBuf.readUInt16BE(featureListOffset)

  const ligatureLookupIndices = new Set()
  const LIGATURE_FEATURE_TAGS = new Set(['liga', 'dlig', 'ccmp', 'rlig'])
  for (let i = 0; i < featureCount; i++) {
    const recordOffset = featureListOffset + 2 + i * 6
    const tag = gsubBuf.toString('ascii', recordOffset, recordOffset + 4)
    if (!LIGATURE_FEATURE_TAGS.has(tag)) continue
    const featureOffset = gsubBuf.readUInt16BE(recordOffset + 4)
    const featureStart = featureListOffset + featureOffset
    const lookupIndexCount = gsubBuf.readUInt16BE(featureStart + 2)
    for (let l = 0; l < lookupIndexCount; l++) {
      ligatureLookupIndices.add(gsubBuf.readUInt16BE(featureStart + 4 + l * 2))
    }
  }
  if (ligatureLookupIndices.size === 0) {
    throw new Error("font's GSUB table has no liga/dlig/ccmp/rlig feature")
  }

  const sequenceToLigature = new Map()
  for (const idx of ligatureLookupIndices) walkLookup(gsubBuf, lookupListOffset, idx, sequenceToLigature)
  return sequenceToLigature
}

function buildLigatureChecker(fontBuf) {
  const tables = unpackWoff2Tables(fontBuf, new Set(['GSUB', 'cmap']))
  if (!tables.cmap) throw new Error('font is missing its cmap table')
  if (!tables.GSUB) throw new Error('font is missing its GSUB table')
  const cmap = parseCmapUnicode(tables.cmap)
  const ligatures = parseGsubLigatures(tables.GSUB)

  return function isKnownGlyphName(name) {
    const seq = []
    for (const ch of name) {
      const codePoint = ch.codePointAt(0)
      const gid = cmap.get(codePoint)
      if (gid === undefined) return false
      seq.push(gid)
    }
    return ligatures.has(seq.join(','))
  }
}

function findMaterialSymbolsFontFile() {
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const [fileName, record] of Object.entries(manifest.files || {})) {
    if (record.family === 'Material Symbols Rounded') return join(fontsDir, fileName)
  }
  return null
}

// ---------------------------------------------------------------------------
// The test.
// ---------------------------------------------------------------------------

test('every <Icon name> used in the ported UI is a real ligature in the vendored font', () => {
  const usedNames = extractIconNamesFromSource()
  assert.ok(usedNames.length > 0, 'no <Icon name="..."> usages were found under app/src/ui')

  const fontPath = findMaterialSymbolsFontFile()
  assert.ok(fontPath && existsSync(fontPath), `vendored Material Symbols Rounded font not found via ${manifestPath}`)

  const isKnownGlyphName = buildLigatureChecker(readFileSync(fontPath))

  const unknown = usedNames.filter(name => !isKnownGlyphName(name))
  assert.deepEqual(
    unknown,
    [],
    `these <Icon name> values are NOT real ligatures and would render as literal English words: ${unknown.join(', ')}`
  )
})

test('a name that is not a real ligature is detected (self-check, proves the checker is not a rubber stamp)', () => {
  const fontPath = findMaterialSymbolsFontFile()
  assert.ok(fontPath && existsSync(fontPath))
  const isKnownGlyphName = buildLigatureChecker(readFileSync(fontPath))
  assert.equal(isKnownGlyphName('this_is_definitely_not_a_real_material_symbol_name'), false)
})
