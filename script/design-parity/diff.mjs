#!/usr/bin/env node
/**
 * Pixel-diff and side-by-side composer for the design-parity inventory.
 *
 * For every inventory row with both a reference and an app raw capture on
 * disk, this:
 *   1. Crops both images to their shared top-left region (min width/height of
 *      the pair, since the reference and the real app chrome are not always
 *      pixel-identical in size — the diff still runs over the overlapping
 *      area and the size mismatch itself is recorded).
 *   2. Computes a per-pixel difference (Euclidean RGB distance against a
 *      threshold) and a percentage-of-pixels-different figure.
 *   3. Writes a labelled side-by-side PNG (reference | app, with a divider)
 *      into docs/design-parity/side-by-side/.
 *   4. Writes a machine-readable diff record into
 *      docs/design-parity/diffs/diff-report.json.
 *
 * This is deliberately dependency-light: only pngjs (vendored locally, pure
 * JS, no native bindings) is used. No pixelmatch, no sharp.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const CAPTURES_DIR = path.join(REPO_ROOT, 'docs', 'design-parity', 'captures')
const SIDE_BY_SIDE_DIR = path.join(REPO_ROOT, 'docs', 'design-parity', 'side-by-side')
const DIFFS_DIR = path.join(REPO_ROOT, 'docs', 'design-parity', 'diffs')
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs', 'design-parity', 'inventory.json')

const DIFF_THRESHOLD = 40 // Euclidean RGB distance above which a pixel counts as "different"

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath))
}

function diffPair(refPath, appPath, screenId) {
  const ref = readPng(refPath)
  const app = readPng(appPath)

  const w = Math.min(ref.width, app.width)
  const h = Math.min(ref.height, app.height)
  const sizeMismatch = ref.width !== app.width || ref.height !== app.height

  let diffPixels = 0
  const totalPixels = w * h

  const sideBySide = new PNG({ width: ref.width + app.width + 4, height: Math.max(ref.height, app.height) })
  sideBySide.data.fill(255)
  PNG.bitblt(ref, sideBySide, 0, 0, ref.width, ref.height, 0, 0)
  PNG.bitblt(app, sideBySide, 0, 0, app.width, app.height, ref.width + 4, 0)
  // 4px red divider
  for (let y = 0; y < sideBySide.height; y++) {
    for (let dx = 0; dx < 4; dx++) {
      const idx = (sideBySide.width * y + (ref.width + dx)) << 2
      sideBySide.data[idx] = 220
      sideBySide.data[idx + 1] = 38
      sideBySide.data[idx + 2] = 38
      sideBySide.data[idx + 3] = 255
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ri = (ref.width * y + x) << 2
      const ai = (app.width * y + x) << 2
      const dr = ref.data[ri] - app.data[ai]
      const dg = ref.data[ri + 1] - app.data[ai + 1]
      const db = ref.data[ri + 2] - app.data[ai + 2]
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      if (dist > DIFF_THRESHOLD) diffPixels++
    }
  }

  fs.mkdirSync(SIDE_BY_SIDE_DIR, { recursive: true })
  const sbsPath = path.join(SIDE_BY_SIDE_DIR, `${screenId}.side-by-side.png`)
  fs.writeFileSync(sbsPath, PNG.sync.write(sideBySide))

  return {
    screenId,
    referenceCapture: path.relative(REPO_ROOT, refPath).replace(/\\/g, '/'),
    appCapture: path.relative(REPO_ROOT, appPath).replace(/\\/g, '/'),
    sideBySide: path.relative(REPO_ROOT, sbsPath).replace(/\\/g, '/'),
    referenceSize: { width: ref.width, height: ref.height },
    appSize: { width: app.width, height: app.height },
    sizeMismatch,
    comparedPixels: totalPixels,
    diffPixels,
    diffPercent: totalPixels === 0 ? null : Number(((diffPixels / totalPixels) * 100).toFixed(3)),
    threshold: DIFF_THRESHOLD,
  }
}

function main() {
  if (!fs.existsSync(INVENTORY_PATH)) {
    console.error(`inventory not found at ${INVENTORY_PATH}`)
    process.exit(1)
  }
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'))
  const results = []

  for (const screen of inventory.screens) {
    const refPath = path.join(REPO_ROOT, screen.rawCaptureReference ?? '')
    const appPath = path.join(REPO_ROOT, screen.rawCaptureApp ?? '')
    if (!screen.rawCaptureReference || !screen.rawCaptureApp || !fs.existsSync(refPath) || !fs.existsSync(appPath)) {
      results.push({ screenId: screen.id, skipped: true, reason: 'missing raw capture(s) on disk' })
      continue
    }
    try {
      results.push(diffPair(refPath, appPath, screen.id))
    } catch (err) {
      results.push({ screenId: screen.id, skipped: true, reason: `diff failed: ${err.message}` })
    }
  }

  fs.mkdirSync(DIFFS_DIR, { recursive: true })
  const reportPath = path.join(DIFFS_DIR, 'diff-report.json')
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        threshold: DIFF_THRESHOLD,
        results,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`wrote ${reportPath}`)
  for (const r of results) {
    if (r.skipped) console.log(`  ${r.screenId}: SKIPPED (${r.reason})`)
    else console.log(`  ${r.screenId}: ${r.diffPercent}% different (${r.diffPixels}/${r.comparedPixels} px)`)
  }
}

main()
