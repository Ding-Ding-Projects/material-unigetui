#!/usr/bin/env node
/**
 * Reproducible capture harness for the README's screenshot matrix.
 *
 * Builds nothing itself — run `npm run build` first — and launches the real
 * packaged renderer (app/dist/index.html loaded into the real Electron main
 * process) with `--remote-debugging-port`, then drives it purely over the
 * Chrome DevTools Protocol using Node's built-in `http`/`WebSocket` (no
 * external dependencies, so this runs unmodified on any machine with Node
 * 22+). Every capture is `Page.captureScreenshot` against the one page
 * target that is actually running, verified before any screenshot is taken.
 *
 * Usage:
 *   npm run build
 *   node script/capture-matrix.mjs
 *
 * Writes PNGs to docs/assets/screenshots/ and a manifest.json describing
 * exactly what each one shows, the commit it was captured at, and the method.
 */

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'docs', 'assets', 'screenshots')
const PORT = 9333
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const out = []
    const child = spawn(cmd, args, { ...opts })
    child.stdout?.on('data', d => out.push(d))
    child.stderr?.on('data', d => out.push(d))
    child.on('exit', code => (code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(out)}`))))
  })
}

async function waitFor(predicate, { timeoutMs = 20000, intervalMs = 250 } = {}) {
  const start = Date.now()
  for (;;) {
    const result = await predicate().catch(() => null)
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting')
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return res.json()
}

/** Confirm exactly one page target exists before touching it. */
async function resolveSolePageTarget() {
  const targets = await listTargets()
  const pages = targets.filter(t => t.type === 'page')
  if (pages.length !== 1) {
    throw new Error(`expected exactly one page target, found ${pages.length}: ${JSON.stringify(targets)}`)
  }
  return pages[0]
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
  }

  async ready() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.ws.close()
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
  if (result.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails)}`)
  return result.result?.value
}

async function screenshot(cdp, filename, { fullPage = false } = {}) {
  const params = { format: 'png' }
  const { data } = await cdp.send('Page.captureScreenshot', params)
  const outPath = path.join(OUT_DIR, filename)
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'))
  return outPath
}

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
}

async function clearViewport(cdp) {
  await cdp.send('Emulation.clearDeviceMetricsOverride', {})
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const commit = (await sh('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).trim()
  const shortCommit = commit.slice(0, 12)

  if (!fs.existsSync(ELECTRON)) {
    throw new Error(`electron binary missing at ${ELECTRON} -- run "node script/ensure-electron-binary.mjs"`)
  }
  const mainJs = path.join(ROOT, 'app', 'main.js')
  if (!fs.existsSync(mainJs)) {
    throw new Error(`${mainJs} missing -- run "npm run build" first`)
  }

  // A stable per-checkout user-data directory keeps this launch from
  // colliding with Electron's single-instance lock in another checkout or
  // worktree of the same app (verified: without this, a second launch
  // silently forwards to an already-running instance elsewhere on the
  // machine and the CDP capture ends up photographing the WRONG checkout).
  const userDataDir = path.join(ROOT, '.capture-user-data')
  fs.rmSync(userDataDir, { recursive: true, force: true })

  console.log(`Launching Electron (commit ${shortCommit}) with remote debugging on port ${PORT}...`)
  const child = spawn(ELECTRON, [
    path.join(ROOT, 'app'),
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
  ], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: 'ignore',
  })

  const manifest = { commit, capturedAt: new Date().toISOString(), method: 'CDP Page.captureScreenshot against the real built Electron renderer, remote-debugging-port CDP route', images: [] }

  try {
    await waitFor(async () => {
      const targets = await listTargets()
      return targets.some(t => t.type === 'page')
    }, { timeoutMs: 30000 })

    const target = await resolveSolePageTarget()
    console.log(`Resolved sole page target: ${target.url}`)
    const expectedUrl = `file:///${path.join(ROOT, 'app', 'index.html').replace(/\\/g, '/')}`
    if (decodeURIComponent(target.url) !== decodeURIComponent(expectedUrl)) {
      throw new Error(`page target does not belong to this checkout. Expected ${expectedUrl}, got ${target.url}. Refusing to capture -- this would photograph the wrong build.`)
    }

    const cdp = new CdpClient(target.webSocketDebuggerUrl)
    await cdp.ready()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // Wait for the app shell to actually paint before capturing anything.
    await waitFor(() => evaluate(cdp, `document.querySelector('[data-app-shell], #root, body')?.textContent?.length > 0`), { timeoutMs: 20000 })
    await new Promise(r => setTimeout(r, 800))

    async function capture(filename, alt, note) {
      const p = await screenshot(cdp, filename)
      manifest.images.push({ file: filename, alt, note: note ?? null })
      console.log(`  captured ${filename}`)
      return p
    }

    // --- record which routes are tabs vs which are single-instance panels ---
    const routeIds = ['discover', 'updates', 'installed', 'bundles', 'history', 'automation', 'converter', 'ollama', 'auth', 'logs', 'tickets', 'about', 'settings']

    async function openRoute(id) {
      await evaluate(cdp, `window.__captureOpenRoute && window.__captureOpenRoute(${JSON.stringify(id)})`)
      await new Promise(r => setTimeout(r, 500))
    }

    // The app does not expose a capture-only hook by default; check for one,
    // otherwise fall back to clicking the drawer item by visible text.
    const hasHook = await evaluate(cdp, `typeof window.__captureOpenRoute === 'function'`)
    manifest.usedCaptureHook = !!hasHook

    async function clickDrawerItem(_label, routeId) {
      // Every nav-drawer item carries a stable id="nav-<routeId>" (app.tsx),
      // which is a far more reliable selector than matching visible text --
      // the button's textContent also includes the Material Symbols ligature
      // name from its icon span, so text-based matching silently fails.
      const clicked = await evaluate(cdp, `(() => {
        const target = document.getElementById(${JSON.stringify(`nav-${routeId}`)})
        if (!target) return false
        target.click()
        return true
      })()`)
      return clicked
    }

    manifest.routeLabels = {
      discover: 'Discover packages', updates: 'Software updates', installed: 'Installed packages',
      bundles: 'Package bundles', history: 'Operation history', automation: 'Automation',
      converter: 'File converter', ollama: 'Ollama suite manager', auth: 'Authenticator',
      logs: 'Logs', tickets: 'Support Tickets', about: 'Help & About', settings: 'Settings',
    }

    for (const id of routeIds) {
      const label = manifest.routeLabels[id]
      const ok = hasHook ? (await openRoute(id), true) : await clickDrawerItem(label, id)
      if (!ok) {
        manifest.images.push({ file: null, alt: null, note: `could not navigate to route "${id}" (${label}) -- no capture hook and drawer click failed` })
        continue
      }
      await new Promise(r => setTimeout(r, 600))
      await capture(`route-${id}.png`, `${label} screen in the built Material UniGetUI application, light theme`, `route ${id}`)
    }

    // Settings tabs -- each carries a stable id="settings-tab-<tabId>" (settings-route.tsx)
    for (const tabId of ['general', 'appearance', 'localization']) {
      const clicked = await evaluate(cdp, `(() => {
        const target = document.getElementById(${JSON.stringify(`settings-tab-${tabId}`)})
        if (!target) return false
        target.click()
        return true
      })()`)
      if (clicked) {
        await new Promise(r => setTimeout(r, 500))
        await capture(`settings-${tabId}.png`, `Settings surface with the ${tabId} tab open, in the built application`, `settings tab ${tabId}`)
      } else {
        manifest.images.push({ file: null, alt: null, note: `could not click settings tab "${tabId}"` })
      }
    }

    // Tab strip with its search action open (the strip already carries several
    // open tabs from the route navigation above).
    const tabSearchOpened = await evaluate(cdp, `(() => {
      const btn = document.querySelector('.tab-strip__actions .tab-strip__action')
      if (!btn) return false
      btn.click()
      return true
    })()`)
    if (tabSearchOpened) {
      await new Promise(r => setTimeout(r, 400))
      await capture('tab-strip-search.png', 'The tab strip with several open tabs and its search panel expanded, showing the tab-discovery search and regex-builder affordance', 'tab strip search')
      // close it again so it doesn't bleed into later, unrelated captures
      await evaluate(cdp, `document.querySelector('.tab-strip__actions .tab-strip__action')?.click()`)
      await new Promise(r => setTimeout(r, 300))
    } else {
      manifest.images.push({ file: null, alt: null, note: 'could not find the tab strip search action button' })
    }

    // Anchored regex builder, opened on the Discover screen's search field.
    await openRouteOrClick(cdp, hasHook, openRoute, clickDrawerItem, 'discover', 'Discover packages')
    await new Promise(r => setTimeout(r, 500))
    const builderOpened = await evaluate(cdp, `(() => {
      const btn = document.querySelector('.search-anchor button[aria-controls$="-builder"]')
      if (!btn) return false
      btn.click()
      return true
    })()`)
    if (builderOpened) {
      await new Promise(r => setTimeout(r, 400))
      await capture('regex-builder.png', 'The anchored regex builder popover open beside the Discover screen search field, with guided pattern construction controls', 'regex builder')
    } else {
      manifest.images.push({ file: null, alt: null, note: 'could not find a search-field regex builder toggle button on the Discover screen' })
    }

    // Command palette
    await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', {key:'F', code:'KeyF', ctrlKey:true, shiftKey:true, bubbles:true}))`)
    await new Promise(r => setTimeout(r, 500))
    await capture('command-palette.png', 'The command palette opened with Ctrl+Shift+F, showing searchable destinations and settings', 'palette')
    // A synthetic document-level Escape keydown does not reach the palette's
    // own React onKeyDown handler (it is scoped to the dialog element, not a
    // global listener), so close it the same way a real user would: click its
    // scrim overlay, which the component wires directly to onClose.
    const paletteClosed = await evaluate(cdp, `(() => {
      const scrim = document.querySelector('.scrim')
      if (!scrim) return false
      scrim.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      return true
    })()`)
    if (!paletteClosed) {
      manifest.images.push({ file: null, alt: null, note: 'could not find the command palette scrim to close it; later captures may show it still open' })
    }
    await new Promise(r => setTimeout(r, 300))

    // Dark theme.
    //
    // REAL DEFECT FOUND: the top-app-bar dark/light toggle button
    // (app/src/ui/app.tsx, onClick={toggleTheme} around line 106) does
    // nothing observable. Verified with three independent click mechanisms
    // (DOM .click(), a dispatched MouseEvent, and a real CDP
    // Input.dispatchMouseEvent at the button's on-screen coordinates): the
    // click event demonstrably fires (confirmed with an added native
    // listener), no exception or console warning is logged, and yet
    // document.documentElement's data-theme attribute and its computed MD3
    // palette custom properties (`--p` etc.) never change, even after a
    // 3-second wait. This capture harness therefore does NOT use that
    // button. It instead drives the theme through the Settings > Appearance
    // > Theme control, which is a plain <select> writing through the real
    // settings IPC bridge (settings-route.tsx) and DOES take effect --
    // proving the settings-driven path works and isolating the defect to
    // the top-app-bar button's wiring specifically.
    const themeSetViaSettings = await evaluate(cdp, `(() => {
      const nav = document.getElementById('nav-settings')
      if (nav) nav.click()
      return true
    })()`)
    await new Promise(r => setTimeout(r, 400))
    await evaluate(cdp, `(() => {
      const tab = document.getElementById('settings-tab-appearance')
      if (tab) tab.click()
    })()`)
    await new Promise(r => setTimeout(r, 400))
    const themeToggled = await evaluate(cdp, `(() => {
      const rows = Array.from(document.querySelectorAll('select'))
      const select = rows.find(s => Array.from(s.options).some(o => o.value === 'dark'))
      if (!select) return false
      select.value = 'dark'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
    if (themeToggled) {
      await new Promise(r => setTimeout(r, 500))
      await openRouteOrClick(cdp, hasHook, openRoute, clickDrawerItem, 'discover', 'Discover packages')
      await new Promise(r => setTimeout(r, 600))
      const dataTheme = await evaluate(cdp, `document.documentElement.getAttribute('data-theme')`)
      await capture('route-discover-dark.png', 'Discover packages screen rendered in dark theme', `dark theme, set via Settings > Appearance > Theme (verified data-theme="${dataTheme}" after change)`)
      // set back to light for the remaining light-theme captures below
      await evaluate(cdp, `(() => {
        const nav = document.getElementById('nav-settings')
        if (nav) nav.click()
      })()`)
      await new Promise(r => setTimeout(r, 300))
      await evaluate(cdp, `(() => {
        const rows = Array.from(document.querySelectorAll('select'))
        const select = rows.find(s => Array.from(s.options).some(o => o.value === 'light'))
        if (select) { select.value = 'light'; select.dispatchEvent(new Event('change', { bubbles: true })) }
      })()`)
      await new Promise(r => setTimeout(r, 400))
    } else {
      manifest.images.push({ file: null, alt: null, note: 'could not find the Theme select control under Settings > Appearance' })
    }

    // Narrow layout via CDP viewport emulation (window minWidth is 1280, so
    // this measures the real render at a narrow CSS viewport rather than the
    // real OS window, which the app's minWidth does not allow to go narrower).
    // Explicitly return to Discover first -- the theme reset above leaves
    // Settings > Appearance open, and capturing "as-is" here previously
    // produced a screenshot of the cramped Settings surface mislabelled as
    // Discover.
    await openRouteOrClick(cdp, hasHook, openRoute, clickDrawerItem, 'discover', 'Discover packages')
    await new Promise(r => setTimeout(r, 400))
    await setViewport(cdp, 480, 900)
    await new Promise(r => setTimeout(r, 500))
    await capture('route-discover-narrow.png', 'Discover packages screen emulated at a 480px-wide viewport via CDP device metrics, showing the narrow-layout behaviour', 'narrow viewport (480x900), NOT the real OS window (minWidth 1280)')
    await clearViewport(cdp)

    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    console.log(`Wrote manifest with ${manifest.images.length} entries.`)
    cdp.close()
  } finally {
    // On Windows, child.kill() often fails to bring down the whole Electron
    // process tree; taskkill /T /F against the exact pid is the verified way.
    if (process.platform === 'win32' && child.pid) {
      await sh('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {})
    } else {
      child.kill()
    }
  }
}

async function openRouteOrClick(cdp, hasHook, openRoute, clickDrawerItem, id, label) {
  if (hasHook) return openRoute(id)
  return clickDrawerItem(label, id)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
