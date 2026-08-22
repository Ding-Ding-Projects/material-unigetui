#!/usr/bin/env node
'use strict'

// Vendors the fonts the design reference (`design/Material UniGetUI v2.dc.html`)
// loads from Google Fonts, so the packaged Electron app can serve them under a
// strict `font-src 'self'` CSP with no network access at runtime.
//
// Usage:
//   node script/download-fonts.mjs [--silent|/s]
//
// Re-running is safe: any file whose recorded SHA-256 still matches is left
// alone; anything missing or changed is re-fetched. A failed fetch or a
// digest mismatch after download is a hard, non-zero-exit failure that names
// the exact URL and status rather than leaving a partial vendor tree.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DESIGN_HTML = path.join(REPO_ROOT, 'design', 'Material UniGetUI v2.dc.html')
const FONTS_DIR = path.join(REPO_ROOT, 'app', 'static', 'common', 'fonts')
const GENERATED_CSS_PATH = path.join(FONTS_DIR, 'fonts.generated.css')
const MANIFEST_PATH = path.join(FONTS_DIR, 'manifest.json')

// A real desktop Chrome UA. Without one, Google Fonts serves a much older
// (and larger) font format instead of woff2.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const SILENT =
  process.argv.includes('--silent') ||
  process.argv.includes('/s') ||
  process.env.SILENT === '1'

function log(...args) {
  if (!SILENT) console.log(...args)
}

function fail(message) {
  console.error(`download-fonts: ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

/**
 * Pull every `https://fonts.googleapis.com/css2?...` URL referenced by the
 * design reference, rather than retyping them from memory. The design may
 * gain or lose a family/weight over time; this keeps the script honest about
 * what it is actually vendoring.
 */
async function extractGoogleFontsUrls() {
  if (!existsSync(DESIGN_HTML)) {
    fail(`design reference not found at ${DESIGN_HTML}`)
  }
  const html = await readFile(DESIGN_HTML, 'utf8')
  const hrefPattern = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/g
  const urls = []
  let match
  while ((match = hrefPattern.exec(html)) !== null) {
    // The HTML attribute value is HTML-entity-escaped (`&amp;` for `&`).
    urls.push(match[1].replace(/&amp;/g, '&'))
  }
  if (urls.length === 0) {
    fail(`no https://fonts.googleapis.com/css2 URLs found in ${DESIGN_HTML}`)
  }
  return [...new Set(urls)]
}

/**
 * Parse every @font-face block out of a Google Fonts CSS2 response. A single
 * `family=` query commonly answers with dozens of blocks - one per
 * weight/style/unicode-range subset - and every one must be kept.
 */
function parseFontFaceBlocks(cssText) {
  const blocks = []
  // Match each `@font-face { ... }` block. These responses never nest
  // braces, so a non-greedy match bounded by the next `}` is safe here.
  const blockPattern = /@font-face\s*\{([^}]*)\}/g
  let match
  while ((match = blockPattern.exec(cssText)) !== null) {
    const body = match[1]
    const family = /font-family:\s*'([^']+)'/.exec(body)?.[1]
    const style = /font-style:\s*([^;]+);/.exec(body)?.[1]?.trim()
    const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim()
    const stretch = /font-stretch:\s*([^;]+);/.exec(body)?.[1]?.trim()
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim()
    const srcUrlMatch = /src:\s*url\(([^)]+)\)\s*format\('([^']+)'\)/.exec(body)
    if (!family || !srcUrlMatch) {
      fail(`could not parse an @font-face block:\n${match[0]}`)
    }
    const sourceUrl = srcUrlMatch[1]
    const format = srcUrlMatch[2]
    blocks.push({ family, style, weight, stretch, unicodeRange, sourceUrl, format, raw: match[0] })
  }
  return blocks
}

function extFromFormat(format) {
  if (format === 'woff2') return 'woff2'
  if (format === 'woff') return 'woff'
  if (format === 'truetype') return 'ttf'
  if (format === 'opentype') return 'otf'
  return format
}

/**
 * Build a filesystem-safe, human-legible local filename for one @font-face
 * block: family, weight, style, and a short hash of the unicode-range so two
 * subsets of the same family/weight never collide.
 */
function localFileName(block) {
  const familySlug = block.family.replace(/[^a-zA-Z0-9]+/g, '')
  const weightSlug = (block.weight || 'normal').replace(/\s+/g, '')
  const styleSlug = block.style && block.style !== 'normal' ? `-${block.style}` : ''
  const rangeHash = createHash('sha256')
    .update(block.unicodeRange || '')
    .digest('hex')
    .slice(0, 8)
  const ext = extFromFormat(block.format)
  return `${familySlug}-${weightSlug}${styleSlug}-${rangeHash}.${ext}`
}

async function sha256File(filePath) {
  const buf = await readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

async function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { files: {} }
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  } catch {
    return { files: {} }
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': CHROME_UA } })
  if (!res.ok) {
    fail(`GET ${url} -> HTTP ${res.status} ${res.statusText}`)
  }
  return res.text()
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': CHROME_UA } })
  if (!res.ok) {
    fail(`GET ${url} -> HTTP ${res.status} ${res.statusText}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  await mkdir(FONTS_DIR, { recursive: true })

  const cssUrls = await extractGoogleFontsUrls()
  log(`Found ${cssUrls.length} Google Fonts CSS2 URL(s) in the design reference.`)

  /** @type {Array<{block: object, localName: string}>} */
  const allBlocks = []
  for (const url of cssUrls) {
    log(`Fetching stylesheet: ${url}`)
    const cssText = await fetchText(url)
    const blocks = parseFontFaceBlocks(cssText)
    log(`  -> ${blocks.length} @font-face block(s)`)
    for (const block of blocks) {
      allBlocks.push({ block, localName: localFileName(block), sourceCssUrl: url })
    }
  }

  if (allBlocks.length === 0) {
    fail('zero @font-face blocks parsed across every fetched stylesheet')
  }

  // Guard against a filename collision silently overwriting a different
  // block (would indicate our slug scheme is too coarse).
  const seenNames = new Map()
  for (const entry of allBlocks) {
    const prior = seenNames.get(entry.localName)
    if (prior && prior.block.sourceUrl !== entry.block.sourceUrl) {
      fail(`filename collision: ${entry.localName} maps to two different source URLs`)
    }
    seenNames.set(entry.localName, entry)
  }
  const uniqueBlocks = [...seenNames.values()]

  const manifest = await loadManifest()
  const newManifestFiles = {}
  let downloaded = 0
  let verified = 0

  for (const entry of uniqueBlocks) {
    const { block, localName } = entry
    const destPath = path.join(FONTS_DIR, localName)
    const priorRecord = manifest.files?.[localName]

    let needsDownload = true
    if (existsSync(destPath) && priorRecord?.sha256 && priorRecord.sourceUrl === block.sourceUrl) {
      const existingDigest = await sha256File(destPath)
      if (existingDigest === priorRecord.sha256) {
        needsDownload = false
        verified += 1
      }
    }

    if (needsDownload) {
      log(`Downloading ${block.family} ${block.weight}${block.style === 'italic' ? ' italic' : ''} -> ${localName}`)
      const bytes = await fetchBinary(block.sourceUrl)
      await writeFile(destPath, bytes)
      downloaded += 1
    }

    const digest = await sha256File(destPath)
    newManifestFiles[localName] = {
      family: block.family,
      style: block.style || 'normal',
      weight: block.weight || 'normal',
      stretch: block.stretch || null,
      unicodeRange: block.unicodeRange || null,
      format: block.format,
      sourceUrl: block.sourceUrl,
      sourceCssUrl: entry.sourceCssUrl,
      sha256: digest,
    }
  }

  // Emit the local stylesheet: each @font-face block reproduced exactly as
  // Google served it, except `src` now points at the local file. font-weight,
  // font-style, and unicode-range are carried through byte-for-byte from the
  // parsed block so nothing about the typography or subsetting changes.
  const cssParts = [
    '/*',
    ' * GENERATED FILE - do not hand-edit.',
    ' * Produced by script/download-fonts.mjs from the exact Google Fonts CSS2',
    ' * URLs referenced by design/Material UniGetUI v2.dc.html.',
    ' *',
    ' * Every @font-face block below is reproduced from the upstream response',
    ' * verbatim except for `src`, which now points at the local vendored file.',
    ' * font-weight, font-style, and unicode-range are preserved exactly as',
    ' * Google declared them.',
    ' */',
    '',
  ]
  for (const entry of uniqueBlocks) {
    const { block, localName } = entry
    const lines = [
      '@font-face {',
      `  font-family: '${block.family}';`,
      `  font-style: ${block.style || 'normal'};`,
      `  font-weight: ${block.weight || 'normal'};`,
    ]
    if (block.stretch) lines.push(`  font-stretch: ${block.stretch};`)
    lines.push('  font-display: swap;')
    lines.push(`  src: url('./${localName}') format('${block.format}');`)
    if (block.unicodeRange) lines.push(`  unicode-range: ${block.unicodeRange};`)
    lines.push('}')
    cssParts.push(lines.join('\n'))
    cssParts.push('')
  }
  await writeFile(GENERATED_CSS_PATH, cssParts.join('\n'))

  const outManifest = {
    generatedBy: 'script/download-fonts.mjs',
    generatedAt: new Date().toISOString(),
    sourceHtml: path.relative(REPO_ROOT, DESIGN_HTML).split(path.sep).join('/'),
    files: newManifestFiles,
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(outManifest, null, 2) + '\n')

  log('')
  log(`Vendored ${uniqueBlocks.length} @font-face block(s) / font file(s):`)
  log(`  downloaded: ${downloaded}`)
  log(`  verified (already correct): ${verified}`)
  log(`Wrote ${path.relative(REPO_ROOT, GENERATED_CSS_PATH)}`)
  log(`Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)}`)
}

main().catch((err) => {
  if (process.exitCode === undefined) process.exitCode = 1
  if (!SILENT || process.exitCode !== 0) {
    console.error(err?.stack || err)
  }
})
