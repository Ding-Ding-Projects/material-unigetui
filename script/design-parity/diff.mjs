#!/usr/bin/env node
/**
 * Pixel-diff and side-by-side composer for the design-parity inventory.
 *
 * v3: anchor-based alignment. Diffing both captures from their raw (0,0)
 * origin produced a ~96% "different" figure on every screen, because the
 * reference is captured through a real Edge window (its own minimal
 * app-mode chrome: a thin title/URL row) while the real application is a
 * frameless Electron window with its own custom Material title bar -- two
 * different chrome heights that shift every row of real content out of
 * alignment before a single true pixel is compared.
 *
 * A first attempt at fixing this used global row/column brightness
 * cross-correlation to find the shift. It did not work: large expanses of
 * both captures are flat, near-uniform background at two DIFFERENT absolute
 * brightness levels (the reference's app-mode chrome renders as mid-grey,
 * the app's custom title bar as near-white), so a brightness-signature
 * correlation has almost no real signal to lock onto and the search
 * degenerated to its boundary on every screen.
 *
 * This version anchors on the one landmark guaranteed to be identical,
 * identically coloured, and near-identically positioned relative to the
 * page content on both sides: the application's own brand mark, a small
 * saturated dark-blue square logo that both the reference and the real app
 * render in their top app bar. Its first-appearing pixel (scanning
 * top-to-bottom, then left-to-right, within a bounded search box) gives a
 * direct, structural (dx, dy) offset -- not a statistical guess. Measured
 * against all three currently-captured screens this anchor produces the
 * *same* offset on every one (dx=-26, dy=-31), which is exactly the
 * signature of a genuine, constant chrome-height difference rather than
 * noise: the algorithm is not curve-fitting per screen, it is finding one
 * real, physical offset that should hold for any screen captured under the
 * same tuple.
 *
 * If the anchor cannot be found on either side (a screen whose top app bar
 * does not render the logo, or a capture that failed to render), the diff
 * falls back to bounded global brightness correlation and marks
 * `alignment.anchorFound: false` so a reader knows the offset is a weaker
 * statistical guess for that specific row rather than the same trusted
 * physical measurement used everywhere else.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SIDE_BY_SIDE_DIR = path.join(REPO_ROOT, 'docs', 'design-parity', 'side-by-side')
const DIFFS_DIR = path.join(REPO_ROOT, 'docs', 'design-parity', 'diffs')
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs', 'design-parity', 'inventory.json')

const DIFF_THRESHOLD = 40 // Euclidean RGB distance above which a pixel counts as "different"
const MAX_VERTICAL_SHIFT = 60 // px -- fallback-only bound, past the largest plausible chrome gap
const MAX_HORIZONTAL_SHIFT = 20 // px -- fallback-only bound

// The brand logo is a small saturated dark-blue square. This threshold was
// derived from real sampled pixels of the rendered logo (~RGB(11,33,85))
// and is deliberately loose enough to survive anti-aliased edge pixels
// while staying tight enough that it does not fire on ordinary page
// content (which this app's palette keeps far lighter and far less
// saturated than the brand blue).
function isLogoBluePixel(r, g, b) {
  return b > 55 && b - r > 35 && b - g > 25
}

const LOGO_SEARCH = { xMin: 0, xMax: 200, yMax: 200 }

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath))
}

/** First (row, col) at which the brand-logo blue appears, scanning top-to-bottom. */
function findLogoAnchor(png) {
  for (let y = 0; y < Math.min(png.height, LOGO_SEARCH.yMax); y++) {
    for (let x = LOGO_SEARCH.xMin; x < Math.min(png.width, LOGO_SEARCH.xMax); x++) {
      const i = (png.width * y + x) << 2
      if (isLogoBluePixel(png.data[i], png.data[i + 1], png.data[i + 2])) {
        return { row: y, col: x }
      }
    }
  }
  return null
}

function luminance(png, x, y) {
  const i = (png.width * y + x) << 2
  return 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]
}

/**
 * The reference is captured through a real Edge window on an off-screen
 * Win32 desktop. Confirmed by direct pixel sampling: the reference's
 * background renders at a flat, exact RGB(102,102,102) on every screen
 * captured so far -- which is precisely white (255) scaled by 0.4, i.e. a
 * uniform 60%-opacity black scrim laid over the whole canvas. A freshly
 * relaunched, never-interacted-with capture shows the identical scrim, so
 * this is not a stale-capture or focus artifact; it reproduces every time.
 * The real application, captured through the identical PrintWindow method
 * on the identical off-screen desktop, shows no such scrim (background near
 * pure white). The most likely cause is the reference canvas runtime
 * (design/support.js) dimming its own content in response to the Page
 * Visibility API reporting the window as backgrounded/inactive on a
 * non-interactive desktop station -- a property of the reference *capture
 * environment*, not of the design itself or of the ported application.
 *
 * Rather than silently discount this in the diff-percent figure, or ignore
 * it and let it dominate every screen's score, this computes each image's
 * own 95th-percentile brightness ("white point") from a coarse pixel
 * sample and rescales that image so its own white point maps to 255 before
 * diffing. This is a standard auto-levels correction: it removes a uniform
 * exposure/brightness offset while leaving hue, saturation and relative
 * contrast intact, so a real colour or layout difference is not washed out
 * by it. Both white points are recorded in the diff report so the
 * correction itself is inspectable rather than hidden.
 */
function computeWhitePoint(png) {
  const samples = []
  for (let y = 0; y < png.height; y += 3) {
    for (let x = 0; x < png.width; x += 3) {
      const i = (png.width * y + x) << 2
      samples.push((png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3)
    }
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length * 0.95)] || 255
}

function normalizeLevels(png, whitePoint) {
  const scale = whitePoint > 0 ? 255 / whitePoint : 1
  const out = new PNG({ width: png.width, height: png.height })
  for (let i = 0; i < png.data.length; i += 4) {
    out.data[i] = Math.min(255, Math.round(png.data[i] * scale))
    out.data[i + 1] = Math.min(255, Math.round(png.data[i + 1] * scale))
    out.data[i + 2] = Math.min(255, Math.round(png.data[i + 2] * scale))
    out.data[i + 3] = png.data[i + 3]
  }
  return out
}

function rowSignature(png) {
  const sig = new Float64Array(png.height)
  for (let y = 0; y < png.height; y++) {
    let sum = 0
    for (let x = 0; x < png.width; x += 4) sum += luminance(png, x, y)
    sig[y] = sum
  }
  return sig
}

/** Best integer shift `s` such that ref[y] ~= app[y + s], searched over [-max, max]. */
function bestCorrelationShift(refSig, appSig, max) {
  let best = 0
  let bestScore = Infinity
  for (let s = -max; s <= max; s++) {
    let score = 0
    let count = 0
    for (let i = 0; i < refSig.length; i++) {
      const j = i + s
      if (j < 0 || j >= appSig.length) continue
      const d = refSig[i] - appSig[j]
      score += d * d
      count++
    }
    if (count < refSig.length * 0.85) continue // refuse a shift that only "works" by shrinking the overlap
    const normalized = score / count
    if (normalized < bestScore) {
      bestScore = normalized
      best = s
    }
  }
  return best
}

function computeAlignment(ref, app) {
  const refAnchor = findLogoAnchor(ref)
  const appAnchor = findLogoAnchor(app)
  if (refAnchor && appAnchor) {
    return {
      dx: appAnchor.col - refAnchor.col,
      dy: appAnchor.row - refAnchor.row,
      method: 'logo-anchor',
      anchorFound: true,
      refAnchor,
      appAnchor,
    }
  }
  const dy = bestCorrelationShift(rowSignature(ref), rowSignature(app), MAX_VERTICAL_SHIFT)
  return {
    dx: 0,
    dy,
    method: 'brightness-correlation-fallback',
    anchorFound: false,
    refAnchor,
    appAnchor,
  }
}

function diffPair(refPath, appPath, screenId) {
  const ref = readPng(refPath)
  const app = readPng(appPath)

  const alignment = computeAlignment(ref, app)
  const { dx, dy } = alignment

  // Level-normalize a *copy* of each image for the diff pass only -- the
  // alignment anchor above and the side-by-side image both use the raw,
  // unmodified captures, so nothing about what a human sees or what the
  // alignment measured is altered by this correction.
  const refWhitePoint = computeWhitePoint(ref)
  const appWhitePoint = computeWhitePoint(app)
  const refNorm = normalizeLevels(ref, refWhitePoint)
  const appNorm = normalizeLevels(app, appWhitePoint)

  const overlapW = Math.min(ref.width, app.width - dx) - Math.max(0, -dx)
  const overlapH = Math.min(ref.height, app.height - dy) - Math.max(0, -dy)
  const refStartX = Math.max(0, -dx)
  const refStartY = Math.max(0, -dy)

  let diffPixels = 0
  const totalPixels = Math.max(0, overlapW) * Math.max(0, overlapH)

  for (let oy = 0; oy < overlapH; oy++) {
    const ry = refStartY + oy
    const ay = ry + dy
    for (let ox = 0; ox < overlapW; ox++) {
      const rx = refStartX + ox
      const ax = rx + dx
      const ri = (refNorm.width * ry + rx) << 2
      const ai = (appNorm.width * ay + ax) << 2
      const dr = refNorm.data[ri] - appNorm.data[ai]
      const dg = refNorm.data[ri + 1] - appNorm.data[ai + 1]
      const db = refNorm.data[ri + 2] - appNorm.data[ai + 2]
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      if (dist > DIFF_THRESHOLD) diffPixels++
    }
  }

  // Side-by-side is still the full, unaligned raw captures -- the point of
  // this image is to show a human exactly what was captured, not the
  // internal alignment the diff used.
  const sideBySide = new PNG({ width: ref.width + app.width + 4, height: Math.max(ref.height, app.height) })
  sideBySide.data.fill(255)
  PNG.bitblt(ref, sideBySide, 0, 0, ref.width, ref.height, 0, 0)
  PNG.bitblt(app, sideBySide, 0, 0, app.width, app.height, ref.width + 4, 0)
  for (let y = 0; y < sideBySide.height; y++) {
    for (let dxpx = 0; dxpx < 4; dxpx++) {
      const idx = (sideBySide.width * y + (ref.width + dxpx)) << 2
      sideBySide.data[idx] = 220
      sideBySide.data[idx + 1] = 38
      sideBySide.data[idx + 2] = 38
      sideBySide.data[idx + 3] = 255
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
    alignment,
    levelNormalization: {
      referenceWhitePoint: refWhitePoint,
      appWhitePoint: appWhitePoint,
      note:
        'each image auto-levelled to its own 95th-percentile brightness before diffing, to correct the reference capture\'s uniform backgrounded-window scrim (see the comment on computeWhitePoint in this file); diffPercent below is computed on the normalized copies, comparedPixels/diffPixels count normalized pixels',
    },
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
        method:
          'brand-logo anchor alignment (falls back to bounded row-brightness correlation when the logo cannot be located on either side), then RGB Euclidean diff over the aligned overlap region',
        results,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`wrote ${reportPath}`)
  for (const r of results) {
    if (r.skipped) console.log(`  ${r.screenId}: SKIPPED (${r.reason})`)
    else
      console.log(
        `  ${r.screenId}: ${r.diffPercent}% different (${r.diffPixels}/${r.comparedPixels} px, aligned dx=${r.alignment.dx} dy=${r.alignment.dy}, method=${r.alignment.method})`,
      )
  }
}

main()
