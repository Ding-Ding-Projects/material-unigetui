import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { CliDriverBase, outputLines } from './cli-driver-base'

/**
 * Chocolatey.
 *
 * `choco list`, `choco outdated`, `choco search` — the reference confirms all
 * three. Output is `name|version` for outdated and `name version` per line for
 * the others, with a trailing summary line that is not a package.
 *
 * `--limit-output` makes choco emit machine-readable pipe-delimited rows
 * instead of decorated text, which removes an entire class of parsing guesswork.
 */
export class ChocolateyDriver extends CliDriverBase {
  public readonly id = 'chocolatey' as const
  protected readonly executable = 'choco'

  /** Non-interactive and machine-readable on every read. */
  private static readonly QUIET = ['--limit-output', '--no-progress'] as const

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout, code } = await this.capture([
      'search',
      query,
      ...ChocolateyDriver.QUIET,
    ])
    if (code !== 0) {
      return []
    }
    return parseChocolateyList(stdout).map(row => ({
      ...this.ref(row.id, row.id, 'chocolatey'),
      version: row.version,
    }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture([
      'list',
      ...ChocolateyDriver.QUIET,
    ])
    if (code !== 0) {
      return []
    }
    return parseChocolateyList(stdout)
      .filter(row => row.version.length > 0)
      .map(row => ({
        ...this.ref(row.id, row.id, 'chocolatey'),
        version: row.version,
      }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    const { stdout, code } = await this.capture([
      'outdated',
      ...ChocolateyDriver.QUIET,
    ])
    // `choco outdated` exits 2 when updates exist, which is not a failure.
    if (code !== 0 && code !== 2) {
      return []
    }
    return parseChocolateyOutdated(stdout).map(row => ({
      ...this.ref(row.id, row.id, 'chocolatey'),
      version: row.current,
      availableVersion: row.available,
    }))
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['install', pkg.id, '--yes', '--no-progress']
    if (options.version !== undefined) {
      args.push('--version', options.version)
    }
    if (options.preRelease === true) {
      args.push('--pre')
    }
    if (options.skipHashCheck === true) {
      args.push('--ignore-checksums')
    }
    if (options.customArgs !== undefined && options.customArgs.length > 0) {
      args.push('--install-arguments', options.customArgs)
    }
    if (options.interactive !== true) {
      args.push('--limit-output')
    }
    return args
  }

  protected updateArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['upgrade', pkg.id, '--yes', '--no-progress']
    if (options.version !== undefined) {
      args.push('--version', options.version)
    }
    return args
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['uninstall', pkg.id, '--yes', '--no-progress']
  }
}

export interface ChocolateyRow {
  readonly id: string
  readonly version: string
}

export interface ChocolateyOutdatedRow {
  readonly id: string
  readonly current: string
  readonly available: string
}

/** `id|version` under --limit-output; `id version` without it. */
export function parseChocolateyList(output: string): readonly ChocolateyRow[] {
  const rows: ChocolateyRow[] = []
  for (const line of outputLines(output)) {
    // "12 packages installed." and similar summaries are not packages.
    if (/packages? (installed|found)/i.test(line)) {
      continue
    }
    const parts = line.includes('|') ? line.split('|') : line.split(/\s+/)
    const id = (parts[0] ?? '').trim()
    const version = (parts[1] ?? '').trim()
    if (id.length === 0 || id.startsWith('Chocolatey v')) {
      continue
    }
    rows.push({ id, version })
  }
  return rows
}

/** `id|current|available|pinned` under --limit-output. */
export function parseChocolateyOutdated(
  output: string
): readonly ChocolateyOutdatedRow[] {
  const rows: ChocolateyOutdatedRow[] = []
  for (const line of outputLines(output)) {
    if (!line.includes('|')) {
      continue
    }
    const parts = line.split('|')
    const id = (parts[0] ?? '').trim()
    const current = (parts[1] ?? '').trim()
    const available = (parts[2] ?? '').trim()
    if (id.length === 0 || available.length === 0) {
      continue
    }
    // A pinned package reports the same version on both sides; it is not an
    // available update and listing it would be a lie about what will happen.
    if (current === available) {
      continue
    }
    rows.push({ id, current, available })
  }
  return rows
}
