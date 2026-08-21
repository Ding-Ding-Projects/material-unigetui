import { ManagerAvailability, ManagerId } from '../models/manager'
import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../models/package'
import { Operation, OperationAction } from '../models/operation'

/**
 * The one contract both sides of the preload bridge compile against.
 *
 * Declared once so a channel name cannot drift between the process that
 * registers a handler and the process that calls it — a mismatch there fails
 * at runtime with a rejected promise and nothing to read in the source.
 */
export const IpcChannels = {
  packagesSearch: 'packages:search',
  packagesInstalled: 'packages:installed',
  packagesUpdates: 'packages:updates',
  managersList: 'managers:list',
  operationsList: 'operations:list',
  operationsEnqueue: 'operations:enqueue',
  operationsCancel: 'operations:cancel',
  operationsForget: 'operations:forget',
  operationsOutput: 'operations:output',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
} as const

/** Main → renderer pushes. These carry the real completion the design faked. */
export const IpcEvents = {
  operationsChanged: 'operations:changed',
  operationsOutputLine: 'operations:output-line',
} as const

export interface MaterialUniGetUiBridge {
  readonly packages: {
    search(query: string, manager?: ManagerId): Promise<readonly DiscoveredPackage[]>
    installed(): Promise<readonly InstalledPackage[]>
    updates(): Promise<readonly UpdateCandidate[]>
  }
  readonly managers: {
    list(): Promise<readonly ManagerAvailability[]>
  }
  readonly operations: {
    list(): Promise<readonly Operation[]>
    enqueue(
      action: OperationAction,
      pkg: PackageRef,
      options: InstallOptions
    ): Promise<Operation>
    cancel(id: string): Promise<void>
    forget(id: string): Promise<boolean>
    output(id: string): Promise<readonly string[]>
    onChanged(listener: (operations: readonly Operation[]) => void): () => void
    onOutputLine(listener: (id: string, line: string) => void): () => void
  }
  readonly window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
}

declare global {
  interface Window {
    readonly materialUniGetUi: MaterialUniGetUiBridge
  }
}
