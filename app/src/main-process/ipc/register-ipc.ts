import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { settingsStore } from '../settings-store'
import {
  parsePersonalVocabulary,
  describeRejection,
  VOCABULARY_LIMITS,
} from '../../lib/personal-vocabulary'
import { IpcChannels, IpcEvents } from '../../shared/ipc-contract'
import { ManagerId, managerIds } from '../../models/manager'
import { InstallOptions, PackageRef } from '../../models/package'
import { OperationAction } from '../../models/operation'
import { ManagerDriver } from '../manager-drivers/manager-driver'
import { WinGetDriver } from '../manager-drivers/winget-driver'
import { ScoopDriver } from '../manager-drivers/scoop-driver'
import { ChocolateyDriver } from '../manager-drivers/chocolatey-driver'
import { NpmDriver, BunDriver } from '../manager-drivers/node-drivers'
import {
  PipDriver,
  CargoDriver,
  DotnetDriver,
} from '../manager-drivers/language-toolchain-drivers'
import {
  PowerShellDriver,
  PowerShell7Driver,
} from '../manager-drivers/powershell-drivers'
import { VcpkgDriver } from '../manager-drivers/vcpkg-driver'
import { OperationsQueue } from '../operations-queue'

/**
 * Every driver this build ships.
 *
 * All eleven in-scope Windows managers are registered. A manager the machine
 * does not have reports itself unavailable with a reason, which is different
 * from — and much more useful than — being absent from the map entirely.
 */
function createDrivers(): ReadonlyMap<ManagerId, ManagerDriver> {
  const drivers = new Map<ManagerId, ManagerDriver>()
  for (const driver of [
    new WinGetDriver(),
    new ScoopDriver(),
    new ChocolateyDriver(),
    new PipDriver(),
    new NpmDriver(),
    new CargoDriver(),
    new DotnetDriver(),
    new PowerShellDriver(),
    new PowerShell7Driver(),
    new VcpkgDriver(),
    new BunDriver(),
  ]) {
    drivers.set(driver.id, driver)
  }
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

  /* ------------------------------------------------------------ settings -- */

  ipcMain.handle(IpcChannels.settingsAll, () => settingsStore.all())
  ipcMain.handle(IpcChannels.settingsSet, (_event, key: string, value: unknown) =>
    settingsStore.set(key, value)
  )
  ipcMain.handle(
    IpcChannels.settingsSetMany,
    (_event, patch: Record<string, unknown>) => settingsStore.setMany(patch)
  )
  ipcMain.handle(IpcChannels.settingsClear, (_event, key: string) =>
    settingsStore.clear(key)
  )
  ipcMain.handle(IpcChannels.settingsReset, () => settingsStore.reset())

  /* ---------------------------------------------------------- vocabulary -- */

  // Held in the main process only. It is never persisted to the settings file
  // and never travels to a log, an export or a capture.
  let vocabulary: ReadonlyMap<string, string> = new Map()

  ipcMain.handle(IpcChannels.vocabularyLoad, async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const picked = await (window === null
      ? dialog.showOpenDialog({
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        })
      : dialog.showOpenDialog(window, {
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        }))

    const chosen = picked.filePaths[0]
    if (picked.canceled || chosen === undefined) {
      return { ok: false, reason: 'No file was chosen.' }
    }

    // Size is checked before reading, so an enormous file is refused rather
    // than loaded into memory to discover it is too big.
    const stats = await fs.stat(chosen)
    if (stats.size > VOCABULARY_LIMITS.maxBytes) {
      return {
        ok: false,
        reason: `That file is ${stats.size} bytes; the limit is ${VOCABULARY_LIMITS.maxBytes}.`,
      }
    }

    const raw = await fs.readFile(chosen, 'utf8')
    const result = parsePersonalVocabulary(raw)
    if (!result.ok) {
      // The path is deliberately not echoed back: it is a private location.
      return { ok: false, reason: describeRejection(result.rejection) }
    }

    vocabulary = result.entries
    return { ok: true, count: result.count }
  })

  ipcMain.handle(IpcChannels.vocabularyClear, () => {
    vocabulary = new Map()
  })

  ipcMain.handle(IpcChannels.vocabularyEntries, () => [...vocabulary.entries()])

  /* --------------------------------------------------------------- shell -- */

  ipcMain.handle(IpcChannels.openExternal, async (_event, url: string) => {
    // Only ever a web address. Without this check the renderer could ask the
    // operating system to open a file: or a local executable.
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return
    }
    await shell.openExternal(parsed.toString())
  })

  ipcMain.handle(IpcChannels.openPath, async () => {
    await shell.openPath(app.getPath('userData'))
  })

  ipcMain.handle(IpcChannels.appDataPath, () => app.getPath('userData'))

  /* -------------------------------------------------------------- window -- */

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
