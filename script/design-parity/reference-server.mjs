#!/usr/bin/env node
/**
 * Design-reference server.
 *
 * Serves the checked-in `design/` folder exactly as it sits on disk, with two
 * narrow, serve-time-only transformations applied to the reference HTML file
 * (never written back to `design/`):
 *
 *  1. Two `<script>` tags for the vendored React 18.3.1 UMD builds are
 *     injected immediately before the existing `<script src="./support.js">`
 *     tag, because `design/support.js` calls `window.React` on load and the
 *     `.dc.html` file never loads React itself. Without this the canvas
 *     runtime throws `dc-runtime: window.React is not available yet` and
 *     nothing renders.
 *  2. The reference's Google Fonts `<link>` tags (Roboto, Roboto Mono,
 *     Material Symbols Rounded) are rewritten to the same vendored local
 *     font files the real application ships, so both sides render with
 *     identical typography rather than the comparison measuring a font
 *     substitution.
 *
 * Everything else — every element, every script, every declared behaviour —
 * comes straight from the real file on disk. Nothing is copied, transcribed,
 * reimplemented or mocked.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const DESIGN_DIR = path.join(REPO_ROOT, 'design')
const FONTS_DIR = path.join(REPO_ROOT, 'app', 'static', 'common', 'fonts')

const REFERENCE_HTML = 'Material UniGetUI v2.dc.html'

const REACT_UMD = path.join(REPO_ROOT, 'node_modules', 'react', 'umd', 'react.production.min.js')
const REACT_DOM_UMD = path.join(
  REPO_ROOT,
  'node_modules',
  'react-dom',
  'umd',
  'react-dom.production.min.js',
)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/** Build the vendored-fonts `<style>` block from app/static/common/fonts/fonts.generated.css. */
function vendoredFontsCss() {
  const generated = path.join(FONTS_DIR, 'fonts.generated.css')
  if (!fs.existsSync(generated)) {
    throw new Error(`vendored font stylesheet not found at ${generated}`)
  }
  // Rewrite relative url(...) references so they resolve through /vendored-fonts/.
  const css = fs.readFileSync(generated, 'utf8')
  return css.replace(/url\((['"]?)(?!https?:)([^'")]+)\1\)/g, (_m, q, rel) => {
    const cleaned = rel.replace(/^\.\//, '')
    return `url(${q}/vendored-fonts/${cleaned}${q})`
  })
}

function injectReactAndFonts(html) {
  const reactTag = `<script src="/vendor/react.production.min.js"></script>`
  const reactDomTag = `<script src="/vendor/react-dom.production.min.js"></script>`
  const supportTag = '<script src="./support.js">'
  if (!html.includes(supportTag)) {
    throw new Error('reference HTML no longer contains the expected support.js script tag')
  }
  let out = html.replace(supportTag, `${reactTag}\n${reactDomTag}\n${supportTag}`)

  // Replace remote Google Fonts <link> tags with the vendored local stylesheet.
  const fontStyle = `<style id="dc-parity-vendored-fonts">\n${vendoredFontsCss()}\n</style>`
  out = out.replace(
    /<link[^>]+fonts\.googleapis\.com[^>]*>\s*/gi,
    '',
  )
  out = out.replace(/<\/head>/i, `${fontStyle}\n</head>`)
  return out
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)

    if (pathname === '/' || pathname === '') {
      pathname = `/${REFERENCE_HTML}`
    }

    if (pathname === `/${REFERENCE_HTML}`) {
      const raw = fs.readFileSync(path.join(DESIGN_DIR, REFERENCE_HTML), 'utf8')
      const transformed = injectReactAndFonts(raw)
      send(res, 200, transformed, { 'Content-Type': 'text/html; charset=utf-8' })
      return
    }

    if (pathname === '/vendor/react.production.min.js') {
      send(res, 200, fs.readFileSync(REACT_UMD), { 'Content-Type': 'text/javascript' })
      return
    }
    if (pathname === '/vendor/react-dom.production.min.js') {
      send(res, 200, fs.readFileSync(REACT_DOM_UMD), { 'Content-Type': 'text/javascript' })
      return
    }

    if (pathname.startsWith('/vendored-fonts/')) {
      const rel = pathname.slice('/vendored-fonts/'.length)
      const filePath = path.join(FONTS_DIR, rel)
      if (!filePath.startsWith(FONTS_DIR) || !fs.existsSync(filePath)) {
        send(res, 404, 'Not found')
        return
      }
      send(res, 200, fs.readFileSync(filePath), { 'Content-Type': mimeFor(filePath) })
      return
    }

    // Everything else (support.js, any relative asset) is served verbatim
    // straight out of the design/ directory.
    const filePath = path.join(DESIGN_DIR, pathname)
    if (!filePath.startsWith(DESIGN_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(res, 404, 'Not found')
      return
    }
    send(res, 200, fs.readFileSync(filePath), { 'Content-Type': mimeFor(filePath) })
  } catch (err) {
    send(res, 500, `Reference server error: ${err.message}`)
  }
})

const port = Number(process.env.DESIGN_PARITY_PORT ?? 4173)
server.listen(port, '127.0.0.1', () => {
  console.log(`design-reference server listening on http://127.0.0.1:${port}/`)
  console.log(`serving: ${DESIGN_DIR}`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
