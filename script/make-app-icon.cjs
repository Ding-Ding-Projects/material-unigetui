/**
 * Renders the application mark and assembles a multi-resolution Windows icon.
 *
 *   npx electron script/make-app-icon.cjs
 *
 * Produces:
 *   build/icon-master.png   the committed master source
 *   build/icon.ico          16/24/32/48/64/128/256, PNG-encoded entries
 *
 * The mark is drawn from the same Material Design 3 tokens the application and
 * the site use, so the icon cannot drift away from the product's actual look.
 *
 * A framework default icon, or a raster file merely renamed to .ico, does not
 * count as an application mark — so this builds a real ICO container and the
 * verifier reads the directory back out of the bytes.
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const repoRoot = join(__dirname, '..')
const buildDir = join(repoRoot, 'build')

/** Windows needs the small sizes; 256 is what modern shells actually show. */
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const MASTER = 512

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${MASTER}px; height: ${MASTER}px; background: transparent; }
  .mark {
    width: ${MASTER}px; height: ${MASTER}px;
    background: #0B57D0;
    /* A squircle, which is what Material marks read as at small sizes. */
    border-radius: 23%;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  /* Three stacked bars: a package list, legible down to 16px. */
  .bar {
    position: absolute; left: 21%; height: 9.4%; border-radius: 999px;
    background: #FFFFFF;
  }
  .bar--1 { top: 27%; width: 58%; }
  .bar--2 { top: 45.3%; width: 58%; opacity: .78; }
  .bar--3 { top: 63.6%; width: 34%; opacity: .56; }
  .dot {
    position: absolute; right: 20%; top: 60.5%;
    width: 15%; height: 15%; border-radius: 999px;
    background: #A8C7FA;
  }
</style></head>
<body>
  <div class="mark">
    <div class="bar bar--1"></div>
    <div class="bar bar--2"></div>
    <div class="bar bar--3"></div>
    <div class="dot"></div>
  </div>
</body></html>`

/**
 * Assembles an ICO from PNG buffers.
 *
 * ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per image + the PNG data.
 * PNG-encoded entries are read by every Windows version this project targets,
 * and avoid hand-rolling a BMP with its upside-down rows and AND mask.
 */
function buildIco(images) {
  const HEADER = 6
  const ENTRY = 16
  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type 1 = icon
  header.writeUInt16LE(images.length, 4)

  const entries = Buffer.alloc(ENTRY * images.length)
  let offset = HEADER + ENTRY * images.length

  images.forEach((image, index) => {
    const at = index * ENTRY
    // 256 is encoded as 0 in a single byte, which is the one field everybody
    // gets wrong and which makes the largest entry silently vanish.
    entries.writeUInt8(image.size >= 256 ? 0 : image.size, at + 0)
    entries.writeUInt8(image.size >= 256 ? 0 : image.size, at + 1)
    entries.writeUInt8(0, at + 2) // palette
    entries.writeUInt8(0, at + 3) // reserved
    entries.writeUInt16LE(1, at + 4) // colour planes
    entries.writeUInt16LE(32, at + 6) // bits per pixel
    entries.writeUInt32LE(image.data.length, at + 8)
    entries.writeUInt32LE(offset, at + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, entries, ...images.map(image => image.data)])
}

app.commandLine.appendSwitch('force-device-scale-factor', '1')

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: MASTER,
    height: MASTER,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })

  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))
  // Give the compositor a frame; capturing immediately yields a blank image.
  await new Promise(resolve => setTimeout(resolve, 900))

  const captured = await window.webContents.capturePage()
  if (captured.isEmpty()) {
    console.error('✖ the captured mark is empty')
    app.exit(1)
    return
  }

  mkdirSync(buildDir, { recursive: true })
  const masterPng = captured.toPNG()
  writeFileSync(join(buildDir, 'icon-master.png'), masterPng)

  const images = SIZES.map(size => {
    const resized = nativeImage
      .createFromBuffer(masterPng)
      .resize({ width: size, height: size, quality: 'best' })
    return { size, data: resized.toPNG() }
  })

  for (const image of images) {
    if (image.data.length < 100) {
      console.error(`✖ the ${image.size}px entry is implausibly small`)
      app.exit(1)
      return
    }
  }

  const ico = buildIco(images)
  writeFileSync(join(buildDir, 'icon.ico'), ico)

  console.log(`· master: build/icon-master.png (${masterPng.length} bytes)`)
  console.log(
    `· icon:   build/icon.ico (${ico.length} bytes, ${images.length} sizes: ${SIZES.join(', ')})`
  )
  app.exit(0)
})
