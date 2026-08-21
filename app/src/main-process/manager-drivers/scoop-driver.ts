import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { CliDriverBase, outputLines } from './cli-driver-base'

/**
 * Scoop.
 *
 * Commands follow the pinned reference: `scoop list`, `scoop status -l` for
 * updates, `scoop search`, and install/update/uninstall by name. Scoop is a
 * PowerShell application, so it is invoked through its shim rather than
 * directly.
 *
 * Scoop prints aligned columns with a header and a rule, like winget, but the
 * column set differs per subcommand, so each is parsed against its own header.
 */
export class ScoopDriver extends CliDriverBase {
  public readonly id = 'scoop' as const
  protected readonly executable = 'scoop'

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout, code } = await this.capture(['search', query])
    if (code !== 0) {
      return []
    }
    return parseScoopTable(stdout).map(row => ({
      ...this.ref(row.name, row.name, row.source),
      version: row.version,
    }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture(['list'])
    if (code !== 0) {
      return []
    }
    return parseScoopTable(stdout)
      .filter(row => row.version.length > 0)
      .map(row => ({
        ...this.ref(row.name, row.name, row.source),
        version: row.version,
      }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    // `status -l` lists only what is behind, which is exactly the question.
    const { stdout, code } = await this.capture(['status', '-l'])
    if (code !== 0) {
      return []
    }
    return parseScoopTable(stdout)
      .filter(row => row.latest.length > 0 && row.latest !== row.version)
      .map(row => ({
        ...this.ref(row.name, row.name, row.source),
        version: row.version,
        availableVersion: row.latest,
      }))
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['install', pkg.id]
    if (options.architecture !== undefined) {
      args.push('--arch', options.architecture)
    }
    return args
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    return ['update', pkg.id]
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['uninstall', pkg.id]
  }
}

export interface ScoopRow {
  readonly name: string
  readonly version: string
  readonly latest: string
  readonly source: string | undefined
}

/**
 * Parses scoop's column output.
 *
 * Scoop separates columns with runs of whitespace and its package names never
 * contain spaces, so a whitespace split is safe here — unlike winget, where it
 * corrupts names. The header row names which columns are present.
 */
export function parseScoopTable(output: string): readonly ScoopRow[] {
  const lines = outputLines(output)
  const headerIndex = lines.findIndex(line => /^\s*Name\s+Version/i.test(line))
  if (headerIndex === -1) {
    return []
  }

  const header = lines[headerIndex]!.trim().split(/\s{2,}|\s+/)
  const columnOf = (label: string) =>
    header.findIndex(name => name.toLowerCase() === label.toLowerCase())

  const nameAt = columnOf('Name')
  const versionAt = columnOf('Version')
  const latestAt = columnOf('Latest')
  const sourceAt = columnOf('Source') >= 0 ? columnOf('Source') : columnOf('Bucket')

  const rows: ScoopRow[] = []
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^[-\s]+$/.test(line)) {
      continue
    }
    const cells = line.trim().split(/\s{2,}|\s+/)
    const name = nameAt >= 0 ? cells[nameAt] ?? '' : ''
    if (name.length === 0 || /^Name$/i.test(name)) {
      continue
    }
    rows.push({
      name,
      version: versionAt >= 0 ? cells[versionAt] ?? '' : '',
      latest: latestAt >= 0 ? cells[latestAt] ?? '' : '',
      source: sourceAt >= 0 ? cells[sourceAt] : undefined,
    })
  }
  return rows
}
