#!/usr/bin/env node
'use strict'

// Validates that every Material Symbols glyph name the design reference uses
// is a real ligature the vendored Material Symbols Rounded font actually
// carries.
//
// Why this matters: Material Symbols is a ligature icon font. An icon is
// rendered by writing the glyph's English name as the element's text (e.g.
// `<span style="font-family:'Material Symbols Rounded'">home</span>`). A name
// the font does NOT recognise as a ligature does not fall back to a box or a
// blank glyph - it falls back to rendering the literal word, silently. A
// typo here ships as visible English text sitting where an icon should be.
//
// How this checks it: rather than trusting an external icon-name gallery
// (the shipped subset may not match one), this script reads the ligature
// table directly out of the vendored font binary - the GSUB 'liga' feature -
// and the font's own cmap, then asks: does the exact glyph-ID sequence that
// spells this name exist as a registered ligature? That is the same question
// the browser's text shaper asks at render time.
//
// The font is shipped as WOFF2. Node has no built-in WOFF2/OpenType parser
// and this project intentionally adds no new npm dependency for it, so this
// script contains a small self-contained parser: enough of the WOFF2
// container format (built on Node's built-in zlib Brotli support) plus enough
// of GSUB/cmap to answer this one question. It is not a general font toolkit.
//
// Exit 0: every name used by the design resolves to a real ligature.
// Exit non-zero: names the exact unknown glyph name(s) and fails the build.

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DESIGN_HTML = path.join(REPO_ROOT, 'design', 'Material UniGetUI v2.dc.html')
const FONTS_DIR = path.join(REPO_ROOT, 'app', 'static', 'common', 'fonts')
const MANIFEST_PATH = path.join(FONTS_DIR, 'manifest.json')

// ---------------------------------------------------------------------------
// 1. Extract every Material Symbols glyph name the design reference uses.
// ---------------------------------------------------------------------------

/**
 * Two extraction passes over the design HTML:
 *
 *  - Literal spans: `<span style="...font-family:'Material Symbols
 *    Rounded'...">iconName</span>` where the text content is a plain glyph
 *    name written directly in the markup (not a `{{ template }}` binding).
 *
 *  - Heuristic scan for icon-shaped variable assignments: several icons in
 *    this design are chosen dynamically (`{{ nv.icon }}`, `{{ fabIcon }}`,
 *    `{{ r.chk }}`, ...), and their possible values are quoted string
 *    literals assigned near an icon-ish identifier elsewhere in the file's
 *    embedded logic. This pass is deliberately named as a heuristic: it
 *    cannot prove it has found every dynamic assignment, only that whatever
 *    it *did* find is checked against the real font.
 *
 * The union of both is validated. Nothing here invents glyph names; every
 * candidate is a literal token read out of the design file.
 */
function extractUsedGlyphNames(html) {
  const names = new Set()

  const literalSpanPattern =
    /<span[^>]*font-family:'Material Symbols Rounded'[^>]*>([^<]*)<\/span>/g
  let m
  while ((m = literalSpanPattern.exec(html)) !== null) {
    const text = m[1].trim()
    if (text && !text.includes('{{')) names.add(text)
  }

  const dynamicAssignmentPattern =
    /\b(?:icon|fabIcon|allIcon|darkIcon|chk|primaryIcon)\s*[:=]\s*'([a-z][a-z0-9_]+)'/g
  while ((m = dynamicAssignmentPattern.exec(html)) !== null) {
    names.add(m[1])
  }

  return [...names].sort()
}

// ---------------------------------------------------------------------------
// 2. Minimal WOFF2 -> raw sfnt table extraction (GSUB + cmap only).
// ---------------------------------------------------------------------------

// WOFF2 spec Table 2: the 63 predefined "known" table tags. A table-directory
// flags byte's low 6 bits index into this array; 63 (0x3f) means "the real
// tag follows as 4 literal bytes" for a table not on this list.
const KNOWN_WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
]

class Woff2ParseError extends Error {}

/**
 * Unpacks a WOFF2 font down to its raw (decompressed) sfnt table bytes, for
 * whichever tables the caller asks for. Only tables the WOFF2 spec leaves
 * untransformed are supported (which is every table except glyf/loca) -
 * that covers GSUB and cmap, which is all this script needs.
 */
function unpackWoff2Tables(buf, wantedTags) {
  let p = 0
  const need = (n) => {
    if (p + n > buf.length) throw new Woff2ParseError('unexpected end of WOFF2 file')
  }
  const u8 = () => { need(1); return buf.readUInt8(p++) }
  const u16 = () => { need(2); const v = buf.readUInt16BE(p); p += 2; return v }
  const u32 = () => { need(4); const v = buf.readUInt32BE(p); p += 4; return v }
  const tag4 = () => { need(4); const v = buf.toString('ascii', p, p + 4); p += 4; return v }
  const uintBase128 = () => {
    let accum = 0
    for (let i = 0; i < 5; i++) {
      const b = u8()
      if (i === 0 && b === 0x80) throw new Woff2ParseError('invalid UIntBase128 leading byte')
      accum = accum * 128 + (b & 0x7f)
      if ((b & 0x80) === 0) return accum >>> 0
    }
    throw new Woff2ParseError('UIntBase128 value too long')
  }

  const signature = tag4()
  if (signature !== 'wOF2') throw new Woff2ParseError(`not a WOFF2 font (signature was "${signature}")`)
  u32() // flavor
  u32() // length
  const numTables = u16()
  u16() // reserved
  u32() // totalSfntSize
  const totalCompressedSize = u32()
  u16(); u16() // majorVersion, minorVersion
  u32(); u32(); u32() // metaOffset, metaLength, metaOrigLength
  u32(); u32() // privOffset, privLength

  const tables = []
  for (let i = 0; i < numTables; i++) {
    const flags = u8()
    const tagIndex = flags & 0x3f
    const transformVersion = (flags >> 6) & 0x3
    const tag = tagIndex === 63 ? tag4() : KNOWN_WOFF2_TAGS[tagIndex]
    if (tag === undefined) throw new Woff2ParseError(`unknown WOFF2 table tag index ${tagIndex}`)
    const origLength = uintBase128()
    let transformLength = null
    const isGlyfOrLoca = tag === 'glyf' || tag === 'loca'
    if (isGlyfOrLoca) {
      if (transformVersion === 0) transformLength = uintBase128()
    } else if (transformVersion !== 0) {
      // Only defined for glyf/loca in the current spec; any other table with
      // a non-zero transform version is something this minimal parser does
      // not understand.
      throw new Woff2ParseError(`unsupported transform on table "${tag}"`)
    }
    tables.push({ tag, origLength, transformLength })
  }

  const compressed = buf.subarray(p, p + totalCompressedSize)
  const decompressed = zlib.brotliDecompressSync(compressed)

  const result = {}
  let offset = 0
  for (const t of tables) {
    const len = t.transformLength != null ? t.transformLength : t.origLength
    if (wantedTags.has(t.tag)) {
      result[t.tag] = decompressed.subarray(offset, offset + len)
    }
    offset += len
  }
  return result
}

// ---------------------------------------------------------------------------
// 3. cmap: Unicode code point -> glyph ID.
// ---------------------------------------------------------------------------

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
  if (!best) throw new Woff2ParseError('font cmap table has no Unicode subtable')

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
    throw new Woff2ParseError(`unsupported cmap subtable format ${format}`)
  }
  return map
}

// ---------------------------------------------------------------------------
// 4. GSUB: every ligature the 'liga'/'dlig'/'ccmp'/'rlig' features define,
//    as a map from "glyphID,glyphID,..." component sequence -> ligature
//    glyph ID.
// ---------------------------------------------------------------------------

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
    throw new Woff2ParseError(`unsupported Coverage table format ${format}`)
  }
  return glyphs
}

function parseLigatureSubst(buf, subtableStart, out) {
  const substFormat = buf.readUInt16BE(subtableStart)
  if (substFormat !== 1) throw new Woff2ParseError(`unsupported LigatureSubstFormat ${substFormat}`)
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
      for (let c = 0; c < componentCount - 1; c++) {
        seq.push(buf.readUInt16BE(ligStart + 4 + c * 2))
      }
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
      // Extension Substitution: the real subtable lives elsewhere.
      const extFormat = buf.readUInt16BE(subtableStart)
      if (extFormat !== 1) throw new Woff2ParseError('unsupported ExtensionSubstFormat')
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
    throw new Woff2ParseError("font's GSUB table has no liga/dlig/ccmp/rlig feature")
  }

  const sequenceToLigature = new Map()
  for (const idx of ligatureLookupIndices) walkLookup(gsubBuf, lookupListOffset, idx, sequenceToLigature)
  return sequenceToLigature
}

// ---------------------------------------------------------------------------
// 5. Put it together: does "name" resolve to a real ligature in this font?
// ---------------------------------------------------------------------------

function buildLigatureChecker(fontBuf) {
  const tables = unpackWoff2Tables(fontBuf, new Set(['GSUB', 'cmap']))
  if (!tables.cmap) throw new Woff2ParseError('font is missing its cmap table')
  if (!tables.GSUB) throw new Woff2ParseError('font is missing its GSUB table')
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function findMaterialSymbolsFontFile() {
  if (!existsSync(MANIFEST_PATH)) return null
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  for (const [fileName, record] of Object.entries(manifest.files || {})) {
    if (record.family === 'Material Symbols Rounded') {
      return path.join(FONTS_DIR, fileName)
    }
  }
  return null
}

async function main() {
  if (!existsSync(DESIGN_HTML)) {
    console.error(`validate-material-symbols: design reference not found at ${DESIGN_HTML}`)
    process.exitCode = 1
    return
  }
  const html = await readFile(DESIGN_HTML, 'utf8')
  const usedNames = extractUsedGlyphNames(html)
  console.log(`validate-material-symbols: found ${usedNames.length} candidate glyph name(s) in the design reference.`)

  const fontPath = await findMaterialSymbolsFontFile()
  if (!fontPath || !existsSync(fontPath)) {
    console.error(
      'validate-material-symbols: no vendored Material Symbols Rounded font file found ' +
        `(checked ${MANIFEST_PATH}). Run "node script/download-fonts.mjs" first.`,
    )
    process.exitCode = 1
    return
  }

  let isKnownGlyphName
  try {
    const fontBuf = await readFile(fontPath)
    isKnownGlyphName = buildLigatureChecker(fontBuf)
  } catch (err) {
    // This is the honest "cannot verify" path: if the font's own tables
    // cannot be parsed with this script's minimal WOFF2/GSUB/cmap reader, do
    // NOT fall back to a check that trivially passes. Fail loudly and say
    // exactly why nothing was verified.
    console.error('validate-material-symbols: CANNOT VERIFY - could not read the ligature table out of the vendored font.')
    console.error(`  font: ${fontPath}`)
    console.error(`  reason: ${err instanceof Error ? err.message : err}`)
    console.error('  This is not a pass. Fix the parser or the font before trusting this check.')
    process.exitCode = 1
    return
  }

  const unknown = usedNames.filter((name) => !isKnownGlyphName(name))

  if (unknown.length > 0) {
    console.error(`validate-material-symbols: ${unknown.length} glyph name(s) used by the design are NOT real ligatures in the vendored font:`)
    for (const name of unknown) {
      console.error(`  - "${name}" (would render as the literal word "${name}", not an icon)`)
    }
    process.exitCode = 1
    return
  }

  console.log(`validate-material-symbols: OK - all ${usedNames.length} glyph name(s) resolve to a real ligature in the vendored font.`)
}

main()
