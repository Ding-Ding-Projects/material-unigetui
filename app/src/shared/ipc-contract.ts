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
  settingsAll: 'settings:all',
  settingsSet: 'settings:set',
  settingsSetMany: 'settings:set-many',
  settingsClear: 'settings:clear',
  settingsReset: 'settings:reset',
  vocabularyLoad: 'vocabulary:load',
  vocabularyClear: 'vocabulary:clear',
  vocabularyEntries: 'vocabulary:entries',
  logsAll: 'logs:all',
  logsClear: 'logs:clear',
  logsPath: 'logs:path',
  bundleExport: 'bundle:export',
  bundleImport: 'bundle:import',
  ticketsAll: 'tickets:all',
  ticketsCreate: 'tickets:create',
  ticketsAdvance: 'tickets:advance',
  openExternal: 'shell:open-external',
  openPath: 'shell:open-path',
  appDataPath: 'app:data-path',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
} as const

/** Main → renderer pushes. These carry the real completion the design faked. */
export const IpcEvents = {
  operationsChanged: 'operations:changed',
  operationsOutputLine: 'operations:output-line',
} as const

export interface BundleEntryDto {
  readonly id: string
  readonly name: string
  readonly manager: string
  readonly version?: string
  readonly source?: string
}

export interface SupportTicketDto {
  readonly id: string
  readonly number: string
  readonly category: string
  readonly severity: string
  readonly description: string
  readonly status: string
  readonly openedAt: string
  readonly replies: readonly string[]
}

export interface VocabularyLoadResult {
  readonly ok: boolean
  /** Number of entries applied, when accepted. */
  readonly count?: number
  /** Why it was refused, in words the user can act on. */
  readonly reason?: string
}

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
  readonly settings: {
    all(): Promise<Record<string, unknown>>
    set(key: string, value: unknown): Promise<Record<string, unknown>>
    setMany(patch: Record<string, unknown>): Promise<Record<string, unknown>>
    clear(key: string): Promise<Record<string, unknown>>
    reset(): Promise<Record<string, unknown>>
  }
  readonly vocabulary: {
    /** Reads and validates a user-chosen JSON file. Never ships with data. */
    load(): Promise<VocabularyLoadResult>
    clear(): Promise<void>
    entries(): Promise<ReadonlyArray<readonly [string, string]>>
  }
  readonly logs: {
    all(): Promise<ReadonlyArray<{ at: string; level: string; scope: string; message: string }>>
    clear(): Promise<void>
    path(): Promise<string>
  }
  readonly bundles: {
    export(
      entries: readonly BundleEntryDto[],
      format: string
    ): Promise<{ ok: boolean; path?: string; reason?: string }>
    import(): Promise<{
      ok: boolean
      entries?: readonly BundleEntryDto[]
      skipped?: number
      reason?: string
    }>
  }
  readonly tickets: {
    all(): Promise<readonly SupportTicketDto[]>
    create(category: string, severity: string, description: string): Promise<readonly SupportTicketDto[]>
    advance(id: string): Promise<readonly SupportTicketDto[]>
  }
  readonly shell: {
    openExternal(url: string): Promise<void>
    /** Opens the application-data folder — the documented lock recovery path. */
    openAppData(): Promise<void>
    appDataPath(): Promise<string>
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
