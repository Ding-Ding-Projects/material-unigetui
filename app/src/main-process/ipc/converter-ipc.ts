import { BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { IpcChannels } from '../../shared/ipc-contract'
import { ConverterDialogs, ConverterService } from '../converter/converter-service'

/** Register only the bundled JSON-to-CSV lane, with no renderer-supplied paths. */
export function registerConverterIpc(): void {
  const service = new ConverterService()
  const watched = new WeakSet<Electron.WebContents>()
  const expectedUrl = pathToFileURL(path.join(__dirname, 'index.html')).href
  const owner = (event: IpcMainInvokeEvent): BrowserWindow | null => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== expectedUrl) return null
    if (!watched.has(event.sender)) {
      watched.add(event.sender)
      const id = event.sender.id
      event.sender.once('destroyed', () => service.cancel(id))
      event.sender.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
        if (mainFrame) service.cancel(id)
      })
    }
    return window
  }
  const dialogs = (window: BrowserWindow): ConverterDialogs => ({
    pickInput: async () => {
      const result = await dialog.showOpenDialog(window, {
        filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'],
      })
      return result.canceled ? undefined : result.filePaths[0]
    },
    pickOutput: async defaultPath => {
      const result = await dialog.showSaveDialog(window, {
        defaultPath, filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      return result.canceled ? undefined : result.filePath
    },
  })
  ipcMain.handle(IpcChannels.converterPrepareJsonCsv, (event, ...args: unknown[]) => {
    const window = owner(event)
    if (!window || args.length !== 0) return { status: 'error', code: 'unavailable' }
    return service.prepare(event.sender.id, dialogs(window))
  })
  ipcMain.handle(IpcChannels.converterSaveJsonCsv, (event, token: unknown, ...args: unknown[]) => {
    const window = owner(event)
    if (!window || args.length !== 0) return { status: 'error', code: 'unavailable' }
    return service.save(event.sender.id, token, dialogs(window))
  })
  ipcMain.handle(IpcChannels.converterCancel, (event, ...args: unknown[]) => {
    if (!owner(event) || args.length !== 0) return false
    return service.cancel(event.sender.id)
  })
}
