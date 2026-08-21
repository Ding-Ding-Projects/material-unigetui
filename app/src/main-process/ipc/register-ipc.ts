import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannels, IpcEvents } from '../../shared/ipc-contract'
import { ManagerId, managerIds } from '../../models/manager'
import { InstallOptions, PackageRef } from '../../models/package'
import { OperationAction } from '../../models/operation'
import { ManagerDriver } from '../manager-drivers/manager-driver'
import { WinGetDriver } from '../manager-drivers/winget-driver'
import { OperationsQueue } from '../operations-queue'

/**
 * Drivers this build actually ships.
 *
 * The remaining managers named in `managerIds` are genuinely not implemented
 * yet. They are absent from this map rather than present as stubs, so an
 * operation against one fails loudly with a named reason instead of silently
 * doing nothing.
 */
function createDrivers(): ReadonlyMap<ManagerId, ManagerDriver> {
  const drivers = new Map<ManagerId, ManagerDriver>()
  drivers.set('winget', new WinGetDriver())
  return drivers
}

function broadcast(channel: string, ...args: readonly unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, ...args)
  }
}

export function registerAllIpc(): void {
  const drivers = createDrivers()
  const queue = new OperationsQueue(drivers)

  queue.on('changed', operations =>
    broadcast(IpcEvents.operationsChanged, operations)
  )
  queue.on('output', (id: string, line: string) =>
    broadcast(IpcEvents.operationsOutputLine, id, line)
  )

  ipcMain.handle(
    IpcChannels.packagesSearch,
    async (_event, query: string, manager?: ManagerId) => {
      const targets =
        manager === undefined ? [...drivers.values()] : [drivers.get(manager)]
      const results = await Promise.all(
        targets.map(async driver => {
          if (driver === undefined) {
            return []
          }
          try {
            return await driver.search(query)
          } catch {
            // One unavailable manager must not empty the whole result set.
            return []
          }
        })
      )
      return results.flat()
    }
  )

  ipcMain.handle(IpcChannels.packagesInstalled, async () => {
    const results = await Promise.all(
      [...drivers.values()].map(async driver => {
        try {
          return await driver.listInstalled()
        } catch {
          return []
        }
      })
    )
    return results.flat()
  })

  ipcMain.handle(IpcChannels.packagesUpdates, async () => {
    const results = await Promise.all(
      [...drivers.values()].map(async driver => {
        try {
          return await driver.listUpdates()
        } catch {
          return []
        }
      })
    )
    return results.flat()
  })

  ipcMain.handle(IpcChannels.managersList, async () =>
    Promise.all(
      managerIds.map(async id => {
        const driver = drivers.get(id)
        if (driver === undefined) {
          return {
            id,
            available: false,
            unavailableReason: 'No driver is implemented for this manager yet',
          }
        }
        return driver.isAvailable()
      })
    )
  )

  ipcMain.handle(IpcChannels.operationsList, () => queue.list())
  ipcMain.handle(
    IpcChannels.operationsEnqueue,
    (_event, action: OperationAction, pkg: PackageRef, options: InstallOptions) =>
      queue.enqueue(action, pkg, options ?? {})
  )
  ipcMain.handle(IpcChannels.operationsCancel, (_event, id: string) =>
    queue.cancel(id)
  )
  ipcMain.handle(IpcChannels.operationsForget, (_event, id: string) =>
    queue.forget(id)
  )
  ipcMain.handle(IpcChannels.operationsOutput, (_event, id: string) =>
    queue.output(id)
  )

  ipcMain.on(IpcChannels.windowMinimize, event =>
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  )
  ipcMain.on(IpcChannels.windowMaximize, event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === null || window === undefined) {
      return
    }
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })
  ipcMain.on(IpcChannels.windowClose, event =>
    BrowserWindow.fromWebContents(event.sender)?.close()
  )
}
