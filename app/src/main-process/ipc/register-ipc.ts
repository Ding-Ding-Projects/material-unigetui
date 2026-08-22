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
import { appLog } from '../app-log'
import { resolveSurprise } from '../dim-sum'
import { lockStore } from '../lock-store'
import { authenticatorStore } from '../authenticator-store'
import { UnlockLadder, newLadderState } from '../unlock-ladder'
import { settingsStore as settings } from '../settings-store'
import { ticketStore } from '../support-tickets'
import {
  parseBundle,
  exportBundleToFile,
  BundleEntry,
} from '../bundle-store'

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

  queue.on('changed', operations => {
    broadcast(IpcEvents.operationsChanged, operations)
  })

  queue.on('output', (id: string, line: string) => {
    // One listener, two jobs: the renderer needs the line live and the log
    // needs it kept. Two separate listeners on one event is a subscription
    // somebody eventually removes half of.
    broadcast(IpcEvents.operationsOutputLine, id, line)
    appLog.write('debug', 'operation', `${id.slice(0, 8)}: ${line}`)
  })

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

  /* ---------------------------------------------------------------- logs -- */

  ipcMain.handle(IpcChannels.logsAll, () => appLog.all())
  ipcMain.handle(IpcChannels.logsClear, () => appLog.clear())
  ipcMain.handle(IpcChannels.logsPath, () => appLog.filePath())

  /* ------------------------------------------------------------- bundles -- */

  ipcMain.handle(
    IpcChannels.bundleExport,
    async (event, entries: readonly BundleEntry[], format: string) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await exportBundleToFile(
        window,
        entries,
        format as Parameters<typeof exportBundleToFile>[2]
      )
      appLog.write(
        result.ok ? 'info' : 'warn',
        'bundle',
        result.ok
          ? `exported ${entries.length} packages as ${format}`
          : `export refused: ${result.reason}`
      )
      return result
    }
  )

  ipcMain.handle(IpcChannels.bundleImport, async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const picked = await (window === null
      ? dialog.showOpenDialog({
          filters: [{ name: 'Bundle', extensions: ['json'] }],
          properties: ['openFile'],
        })
      : dialog.showOpenDialog(window, {
          filters: [{ name: 'Bundle', extensions: ['json'] }],
          properties: ['openFile'],
        }))

    const chosen = picked.filePaths[0]
    if (picked.canceled || chosen === undefined) {
      return { ok: false, reason: 'No file was chosen.' }
    }

    const raw = await fs.readFile(chosen, 'utf8')
    const result = parseBundle(raw)
    if (!result.ok) {
      appLog.write('warn', 'bundle', `import refused: ${result.reason}`)
      return { ok: false, reason: result.reason }
    }

    appLog.write(
      'info',
      'bundle',
      `imported ${result.bundle.entries.length} packages, skipped ${result.skipped}`
    )
    return { ok: true, entries: result.bundle.entries, skipped: result.skipped }
  })

  /* ------------------------------------------------------------- tickets -- */

  ipcMain.handle(IpcChannels.ticketsAll, () => ticketStore.all())
  ipcMain.handle(
    IpcChannels.ticketsCreate,
    (_event, category: string, severity: string, description: string) =>
      ticketStore.create(category, severity, description)
  )
  ipcMain.handle(IpcChannels.ticketsAdvance, (_event, id: string) =>
    ticketStore.advance(id)
  )

  /* --------------------------------------------------------------- locks -- */

  ipcMain.handle(IpcChannels.locksList, () => lockStore.list())
  ipcMain.handle(
    IpcChannels.locksCreatePassword,
    (_e, target: string, label: string, password: string, duration: string, minutes: number) =>
      lockStore.createPasswordLock(
        target,
        label,
        password,
        duration as 'surface' | 'minutes' | 'session',
        minutes
      )
  )
  ipcMain.handle(
    IpcChannels.locksCreateTotp,
    (_e, target: string, label: string, secret: string, duration: string, minutes: number) =>
      lockStore.createTotpLock(
        target,
        label,
        secret,
        duration as 'surface' | 'minutes' | 'session',
        minutes
      )
  )
  ipcMain.handle(IpcChannels.locksRemove, (_e, id: string) => lockStore.remove(id))
  ipcMain.handle(IpcChannels.locksIsLocked, (_e, target: string) =>
    lockStore.isLocked(target, Date.now())
  )
  ipcMain.handle(IpcChannels.locksAttempt, async (_e, target: string, value: string) => {
    const outcome = await lockStore.attempt(target, value, Date.now())
    // The value is never logged, only the outcome.
    appLog.write('info', 'lock', outcome.ok ? 'unlocked' : 'refused')
    return outcome
  })
  ipcMain.handle(IpcChannels.locksRelock, (_e, target: string) =>
    lockStore.relock(target)
  )

  /* -------------------------------------------------------------- ladder -- */

  const ladder = new UnlockLadder()
  const ladderState = newLadderState()

  ipcMain.handle(IpcChannels.ladderIssue, async () => {
    const stored = await settings.get('schoolMode')
    return ladder.issue(ladderState, stored === true, Date.now())
  })

  ipcMain.handle(
    IpcChannels.ladderGrade,
    (_e, nonce: string, submission: unknown) =>
      // The attempts the clock would have returned. The ladder returns exactly
      // this and never more, or solving it becomes cheaper than waiting.
      ladder.grade(ladderState, nonce, submission, Date.now(), 3)
  )

  /* ------------------------------------------------------- authenticator -- */

  ipcMain.handle(IpcChannels.authList, () => authenticatorStore.list())
  ipcMain.handle(
    IpcChannels.authAdd,
    (_e, uriOrSecret: string, issuer: string, account: string) =>
      authenticatorStore.add(uriOrSecret, issuer, account)
  )
  ipcMain.handle(IpcChannels.authRemove, async (_e, id: string) => {
    await authenticatorStore.remove(id)
    return authenticatorStore.list()
  })
  ipcMain.handle(IpcChannels.authCodes, () => authenticatorStore.codes(Date.now()))
  ipcMain.handle(IpcChannels.authGenerateSecret, () =>
    authenticatorStore.generateSecret()
  )

  /* -------------------------------------------------------------- dimsum -- */

  ipcMain.handle(IpcChannels.dimSumSurprise, async () => {
    const result = await resolveSurprise()
    if (result === null) {
      return null
    }
    return {
      english: result.dish.english,
      traditional: result.dish.traditional,
      jyutping: result.dish.jyutping,
      photoUrl: result.photoUrl,
      altEnglish: result.dish.altEnglish,
      altCantonese: result.dish.altCantonese,
    }
  })

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
