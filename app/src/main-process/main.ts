import { app, BrowserWindow } from 'electron'
import { createAppWindow } from './app-window'
import { registerAllIpc } from './ipc/register-ipc'

// One instance owns the package operations. A second launch focuses the first
// rather than racing it over the same manager processes.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow === null) {
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    registerAllIpc()
    mainWindow = createAppWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createAppWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
