import { ManagerAvailability } from '../../models/manager'
import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { ParsedProgress } from '../../models/operation'
import { CliDriverBase } from './cli-driver-base'
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

export class WinGetDriver extends CliDriverBase {
  public readonly id = 'winget' as const
  protected readonly executable = EXECUTABLE

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout } = await this.capture(['search', '--query', query, ...NON_INTERACTIVE])

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
    const { stdout } = await this.capture(['list', ...NON_INTERACTIVE])

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
    const { stdout } = await this.capture(['upgrade', '--include-unknown', ...NON_INTERACTIVE])

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

  protected installArgs(
    pkg: PackageRef,
    options: InstallOptions
  ): readonly string[] {
    return ['install', ...buildInstallArgs(pkg, options)]
  }

  protected updateArgs(
    pkg: PackageRef,
    options: InstallOptions
  ): readonly string[] {
    return ['upgrade', ...buildInstallArgs(pkg, options)]
  }

  protected uninstallArgs(
    pkg: PackageRef,
    options: InstallOptions
  ): readonly string[] {
    const args = ['uninstall', '--id', pkg.id, '--exact', ...NON_INTERACTIVE]
    if (options.interactive !== true) {
      args.push('--silent')
    }
    return args
  }

  /**
   * winget draws a progress bar with box-drawing characters and a trailing
   * percentage. Where no percentage is present the line is still surfaced as
   * output — reporting no progress is honest, inventing a number is not.
   */
  public override parseOutput(line: string): ParsedProgress {
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
