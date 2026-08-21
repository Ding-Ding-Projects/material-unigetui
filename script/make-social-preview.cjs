/**
 * Renders social-preview.png with Electron and captures it.
 *
 * Run through the Electron binary, not plain node:
 *   npx electron script/make-social-preview.cjs
 *
 * The image is generated from the same MD3 tokens the application and the site
 * use, so the embed cannot drift away from the product's actual look. GitHub
 * recommends 1280x640 for a repository social preview and 1200x630 is the
 * widely-safe Open Graph size; this renders 1200x630 and both surfaces use it.
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const WIDTH = 1200
const HEIGHT = 630
const repoRoot = join(__dirname, '..')

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    font-family: 'Segoe UI', Roboto, sans-serif;
    background: #F6F8FC;
    color: #1F1F1F;
    display: flex; flex-direction: column;
    padding: 68px 76px;
    position: relative; overflow: hidden;
  }
  .accent {
    position: absolute; inset: 0 0 auto 0; height: 10px; background: #0B57D0;
  }
  .kicker {
    font-size: 22px; letter-spacing: .14em; text-transform: uppercase;
    color: #0B57D0; font-weight: 600; margin-bottom: 22px;
  }
  h1 { font-size: 88px; line-height: 1.02; font-weight: 400; letter-spacing: -2px; }
  h1 b { font-weight: 700; color: #0B57D0; }
  p { font-size: 30px; color: #5E6368; margin-top: 26px; max-width: 22ch; line-height: 1.35; }
  .chips { position: absolute; right: 76px; bottom: 68px; display: flex; flex-direction: column; gap: 14px; align-items: flex-end; }
  .chip {
    background: #EAF1FB; color: #041E49; border-radius: 22px;
    padding: 11px 22px; font-size: 23px; white-space: nowrap;
  }
  .chip--solid { background: #0B57D0; color: #FFFFFF; }
  footer { margin-top: auto; font-size: 23px; color: #747775; }
</style></head>
<body>
  <div class="accent"></div>
  <div class="kicker">Material Design 3</div>
  <h1>Material<br><b>UniGetUI</b></h1>
  <p>The interface for your package managers.</p>
  <div class="chips">
    <div class="chip chip--solid">winget</div>
    <div class="chip">scoop &middot; chocolatey</div>
    <div class="chip">pip &middot; npm &middot; cargo</div>
  </div>
  <footer>Ding&nbsp;Ding&nbsp;Projects &middot; Windows desktop</footer>
</body></html>`

app.commandLine.appendSwitch('force-device-scale-factor', '1')

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })

  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))

  // Give the compositor a frame to paint. Capturing immediately after load
  // reliably yields a blank or half-painted image.
  await new Promise(resolve => setTimeout(resolve, 900))

  const image = await window.webContents.capturePage()
  const png = image.toPNG()

  if (png.length < 5000) {
    console.error('✖ captured image is implausibly small; refusing to write it')
    app.exit(1)
    return
  }

  const targets = [
    join(repoRoot, 'social-preview.png'),
    join(repoRoot, 'site', 'assets', 'social-preview.png'),
  ]

  mkdirSync(join(repoRoot, 'site', 'assets'), { recursive: true })
  for (const target of targets) {
    writeFileSync(target, png)
    console.log(`· wrote ${target} (${png.length} bytes, ${image.getSize().width}x${image.getSize().height})`)
  }

  app.exit(0)
})
