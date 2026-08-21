import { ManagerAvailability } from '../../models/manager'
import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { ParsedProgress } from '../../models/operation'
import {
  ManagerDriver,
  OperationCallbacks,
  OperationHandle,
} from './manager-driver'
import { runCapturing, runStreaming } from './process-runner'
import { parseWinGetTable } from './winget-table-parser'

const EXECUTABLE = 'winget'

/** Flags every non-interactive invocation needs. */
const NON_INTERACTIVE = [
  '--disable-interactivity',
  '--accept-source-agreements',
] as const

const SEARCH_COLUMNS = ['Name', 'Id', 'Version', 'Match', 'Source'] as const
const LIST_COLUMNS = ['Name', 'Id', 'Version', 'Available', 'Source'] as const
const UPGRADE_COLUMNS = [
  'Name',
  'Id',
  'Version',
  'Available',
  'Source',
] as const

/**
 * Turns the design's install-options dialog into winget flags.
 *
 * The flag names are taken from the pinned reference, which is the reason this
 * submodule exists: guessing them produces plausible arguments winget rejects.
 */
export function buildInstallArgs(
  pkg: PackageRef,
  options: InstallOptions
): readonly string[] {
  const args = [
    '--id', pkg.id,
    '--exact',
    '--accept-package-agreements',
    ...NON_INTERACTIVE,
  ]

  if (pkg.source !== undefined) {
    args.push('--source', pkg.source)
  }
  if (options.version !== undefined) {
    args.push('--version', options.version)
  }
  if (options.scope !== undefined) {
    args.push('--scope', options.scope)
  }
  if (options.architecture !== undefined) {
    args.push('--architecture', options.architecture)
  }
  if (options.location !== undefined) {
    args.push('--location', options.location)
  }
  if (options.skipHashCheck === true) {
    args.push('--ignore-security-hash')
  }
  if (options.customArgs !== undefined && options.customArgs.length > 0) {
    args.push('--override', options.customArgs)
  }

  // Interactive and silent are mutually exclusive; asking for both makes winget
  // reject the whole command rather than pick one.
  args.push(options.interactive === true ? '--interactive' : '--silent')

  return args
}

export class WinGetDriver implements ManagerDriver {
  public readonly id = 'winget' as const

  public async isAvailable(): Promise<ManagerAvailability> {
    try {
      const { stdout, code } = await runCapturing({
        executable: EXECUTABLE,
        args: ['--version'],
      })
      if (code !== 0) {
        return {
          id: this.id,
          available: false,
          unavailableReason: `winget --version exited ${code}`,
        }
      }
      return { id: this.id, available: true, version: stdout.trim() }
    } catch (error) {
      return {
        id: this.id,
        available: false,
        unavailableReason:
          error instanceof Error ? error.message : 'winget could not be started',
      }
    }
  }

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout } = await runCapturing({
      executable: EXECUTABLE,
      args: ['search', '--query', query, ...NON_INTERACTIVE],
    })

    return parseWinGetTable(stdout, SEARCH_COLUMNS).map(row => ({
      key: `winget:${row['Id'] ?? ''}`,
      id: row['Id'] ?? '',
      name: row['Name'] ?? '',
      manager: this.id,
      source: row['Source'] === '' ? undefined : row['Source'],
      version: row['Version'] === '' ? undefined : row['Version'],
    }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout } = await runCapturing({
      executable: EXECUTABLE,
      args: ['list', ...NON_INTERACTIVE],
    })

    return parseWinGetTable(stdout, LIST_COLUMNS)
      .filter(row => (row['Version'] ?? '').length > 0)
      .map(row => ({
        key: `winget:${row['Id'] ?? ''}`,
        id: row['Id'] ?? '',
        name: row['Name'] ?? '',
        manager: this.id,
        source: row['Source'] === '' ? undefined : row['Source'],
        version: row['Version'] ?? '',
      }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    const { stdout } = await runCapturing({
      executable: EXECUTABLE,
      args: ['upgrade', '--include-unknown', ...NON_INTERACTIVE],
    })

    return parseWinGetTable(stdout, UPGRADE_COLUMNS)
      .filter(row => (row['Available'] ?? '').length > 0)
      .map(row => ({
        key: `winget:${row['Id'] ?? ''}`,
        id: row['Id'] ?? '',
        name: row['Name'] ?? '',
        manager: this.id,
        source: row['Source'] === '' ? undefined : row['Source'],
        version: row['Version'] ?? '',
        availableVersion: row['Available'] ?? '',
      }))
  }

  public install(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    return runStreaming(
      {
        executable: EXECUTABLE,
        args: ['install', ...buildInstallArgs(pkg, options)],
        elevated: options.elevated,
      },
      line => this.parseOutput(line),
      callbacks
    )
  }

  public update(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    return runStreaming(
      {
        executable: EXECUTABLE,
        args: ['upgrade', ...buildInstallArgs(pkg, options)],
        elevated: options.elevated,
      },
      line => this.parseOutput(line),
      callbacks
    )
  }

  public uninstall(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    const args = ['uninstall', '--id', pkg.id, '--exact', ...NON_INTERACTIVE]
    if (options.interactive !== true) {
      args.push('--silent')
    }
    return runStreaming(
      { executable: EXECUTABLE, args, elevated: options.elevated },
      line => this.parseOutput(line),
      callbacks
    )
  }

  /**
   * winget draws a progress bar with box-drawing characters and a trailing
   * percentage. Where no percentage is present the line is still surfaced as
   * output — reporting no progress is honest, inventing a number is not.
   */
  public parseOutput(line: string): ParsedProgress {
    const percent = /(\d{1,3})%/.exec(line)
    if (percent === null) {
      return { line }
    }
    const value = Number.parseInt(percent[1] ?? '', 10)
    if (Number.isNaN(value) || value < 0 || value > 100) {
      return { line }
    }
    return { progress: value, line }
  }
}
