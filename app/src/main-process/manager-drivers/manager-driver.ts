import { ManagerAvailability, ManagerId } from '../../models/manager'
import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { ParsedProgress } from '../../models/operation'

/** A cancellable running operation owned by a driver. */
export interface OperationHandle {
  /** Resolves to the process exit code. */
  readonly completed: Promise<number>
  cancel(): void
}

export interface OperationCallbacks {
  onProgress(parsed: ParsedProgress): void
}

/**
 * One driver per package manager.
 *
 * Every implementation reimplements its manager's command line in TypeScript.
 * The pinned UniGetUI reference submodule is read for the exact argv and output
 * shape each manager expects; none of its C# is ever executed.
 */
export interface ManagerDriver {
  readonly id: ManagerId

  isAvailable(): Promise<ManagerAvailability>

  search(query: string): Promise<readonly DiscoveredPackage[]>
  listInstalled(): Promise<readonly InstalledPackage[]>
  listUpdates(): Promise<readonly UpdateCandidate[]>

  install(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle
  update(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle
  uninstall(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle

  /** Turns one line of manager output into progress. Pure and testable. */
  parseOutput(line: string): ParsedProgress
}
