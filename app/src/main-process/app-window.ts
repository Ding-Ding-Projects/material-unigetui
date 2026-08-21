import { BrowserWindow, shell } from 'electron'
import * as path from 'path'

/**
 * The single renderer window.
 *
 * Deliberate divergence from the sibling repository, which runs with
 * `nodeIntegration: true` and `contextIsolation: false`: this application ships
 * an isolated renderer behind a narrow preload bridge, exactly as the design's
 * own handoff specifies. Do not "align" these flags with the sibling.
 */
export function createAppWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1450,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    // The design supplies its own chrome-free layout, so the operating system
    // title bar is never exposed as product chrome.
    frame: false,
    backgroundColor: '#F6F8FC',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Never let a link navigate the application window or open an unmanaged
  // window; hand external URLs to the user's own browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  void window.loadFile(path.join(__dirname, 'index.html'))

  // Show only once the first frame is painted, so the window never appears as
  // an empty white rectangle while the renderer boots.
  window.once('ready-to-show', () => window.show())

  return window
}
