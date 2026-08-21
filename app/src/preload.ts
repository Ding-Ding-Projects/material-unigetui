import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IpcChannels, IpcEvents, MaterialUniGetUiBridge } from './shared/ipc-contract'
import { ManagerId } from './models/manager'
import { InstallOptions, PackageRef } from './models/package'
import { Operation, OperationAction } from './models/operation'

/**
 * The whole surface the renderer can reach.
 *
 * Nothing here forwards an arbitrary channel name. A bridge that exposes
 * `invoke(channel, ...args)` has handed the renderer the entire main process
 * and undone the isolation it appears to provide.
 */
const bridge: MaterialUniGetUiBridge = {
  packages: {
    search: (query: string, manager?: ManagerId) =>
      ipcRenderer.invoke(IpcChannels.packagesSearch, query, manager),
    installed: () => ipcRenderer.invoke(IpcChannels.packagesInstalled),
    updates: () => ipcRenderer.invoke(IpcChannels.packagesUpdates),
  },
  managers: {
    list: () => ipcRenderer.invoke(IpcChannels.managersList),
  },
  operations: {
    list: () => ipcRenderer.invoke(IpcChannels.operationsList),
    enqueue: (action: OperationAction, pkg: PackageRef, options: InstallOptions) =>
      ipcRenderer.invoke(IpcChannels.operationsEnqueue, action, pkg, options),
    cancel: (id: string) => ipcRenderer.invoke(IpcChannels.operationsCancel, id),
    forget: (id: string) => ipcRenderer.invoke(IpcChannels.operationsForget, id),
    output: (id: string) => ipcRenderer.invoke(IpcChannels.operationsOutput, id),

    // Subscriptions return their own unsubscribe. Without one, every remount
    // stacks another listener and the renderer slowly leaks handlers.
    onChanged: listener => {
      const wrapped = (_event: IpcRendererEvent, operations: readonly Operation[]) =>
        listener(operations)
      ipcRenderer.on(IpcEvents.operationsChanged, wrapped)
      return () => {
        ipcRenderer.removeListener(IpcEvents.operationsChanged, wrapped)
      }
    },
    onOutputLine: listener => {
      const wrapped = (_event: IpcRendererEvent, id: string, line: string) =>
        listener(id, line)
      ipcRenderer.on(IpcEvents.operationsOutputLine, wrapped)
      return () => {
        ipcRenderer.removeListener(IpcEvents.operationsOutputLine, wrapped)
      }
    },
  },
  settings: {
    all: () => ipcRenderer.invoke(IpcChannels.settingsAll),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke(IpcChannels.settingsSet, key, value),
    setMany: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke(IpcChannels.settingsSetMany, patch),
    clear: (key: string) => ipcRenderer.invoke(IpcChannels.settingsClear, key),
    reset: () => ipcRenderer.invoke(IpcChannels.settingsReset),
  },
  vocabulary: {
    load: () => ipcRenderer.invoke(IpcChannels.vocabularyLoad),
    clear: () => ipcRenderer.invoke(IpcChannels.vocabularyClear),
    entries: () => ipcRenderer.invoke(IpcChannels.vocabularyEntries),
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke(IpcChannels.openExternal, url),
    openAppData: () => ipcRenderer.invoke(IpcChannels.openPath),
    appDataPath: () => ipcRenderer.invoke(IpcChannels.appDataPath),
  },
  window: {
    minimize: () => ipcRenderer.send(IpcChannels.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IpcChannels.windowMaximize),
    close: () => ipcRenderer.send(IpcChannels.windowClose),
  },
}

contextBridge.exposeInMainWorld('materialUniGetUi', bridge)
