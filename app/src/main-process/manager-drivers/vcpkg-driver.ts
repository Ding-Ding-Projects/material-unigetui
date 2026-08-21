import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { CliDriverBase, outputLines } from './cli-driver-base'

/**
 * vcpkg.
 *
 * Ports are identified as `name:triplet` (`zlib:x64-windows`), and the triplet
 * is not decoration — the same port built for a different triplet is a
 * different artifact. It is preserved in the package id rather than stripped
 * for tidiness, because stripping it would make two distinct installs collide.
 */
export class VcpkgDriver extends CliDriverBase {
  public readonly id = 'vcpkg' as const
  protected readonly executable = 'vcpkg'
  protected override readonly versionArgs = ['version'] as const

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout, code } = await this.capture(['search', query])
    if (code !== 0) {
      return []
    }
    return parseVcpkgSearch(stdout)
      .slice(0, 50)
      .map(row => ({
        ...this.ref(row.name, row.name, 'vcpkg'),
        version: row.version,
      }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture(['list'])
    if (code !== 0) {
      return []
    }
    return parseVcpkgList(stdout).map(row => ({
      ...this.ref(row.name, row.name, 'vcpkg'),
      version: row.version,
    }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    const { stdout, code } = await this.capture(['update'])
    if (code !== 0) {
      return []
    }
    return parseVcpkgUpdate(stdout).map(row => ({
      ...this.ref(row.name, row.name, 'vcpkg'),
      version: row.current,
      availableVersion: row.available,
    }))
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['install', pkg.id]
    if (options.architecture !== undefined && !pkg.id.includes(':')) {
      // Only supply a triplet when the id does not already carry one; passing
      // both makes vcpkg reject the command.
      args.push(`--triplet=${options.architecture}-windows`)
    }
    return args
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    // vcpkg upgrades by rebuilding; --no-dry-run is required or it only reports.
    return ['upgrade', pkg.id, '--no-dry-run']
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['remove', pkg.id]
  }
}

export interface VcpkgRow {
  readonly name: string
  readonly version: string
}

/** `vcpkg list` prints `name:triplet   version   description`. */
export function parseVcpkgList(output: string): readonly VcpkgRow[] {
  const rows: VcpkgRow[] = []
  for (const line of outputLines(output)) {
    const cells = line.trim().split(/\s{2,}/)
    const name = (cells[0] ?? '').trim()
    if (name.length === 0 || !name.includes(':')) {
      continue
    }
    rows.push({ name, version: (cells[1] ?? '').trim() })
  }
  return rows
}

/** `vcpkg search` prints `name    version    description`. */
export function parseVcpkgSearch(output: string): readonly VcpkgRow[] {
  const rows: VcpkgRow[] = []
  for (const line of outputLines(output)) {
    if (/^If your library/i.test(line) || /^The result may/i.test(line)) {
      continue
    }
    const cells = line.trim().split(/\s{2,}/)
    const name = (cells[0] ?? '').trim()
    // Feature rows read `port[feature]` and are not separately installable.
    if (name.length === 0 || name.includes('[')) {
      continue
    }
    rows.push({ name, version: (cells[1] ?? '').trim() })
  }
  return rows
}

export interface VcpkgUpdateRow {
  readonly name: string
  readonly current: string
  readonly available: string
}

/** `vcpkg update` prints `name:triplet   current -> available`. */
export function parseVcpkgUpdate(output: string): readonly VcpkgUpdateRow[] {
  const rows: VcpkgUpdateRow[] = []
  for (const line of outputLines(output)) {
    const match = /^\s*([\w.+-]+:[\w-]+)\s+(\S+)\s*->\s*(\S+)/.exec(line)
    if (match === null) {
      continue
    }
    rows.push({
      name: match[1] ?? '',
      current: match[2] ?? '',
      available: match[3] ?? '',
    })
  }
  return rows
}
