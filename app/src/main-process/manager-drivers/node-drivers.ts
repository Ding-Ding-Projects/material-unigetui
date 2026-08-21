import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { CliDriverBase, outputLines, parseLooseJson } from './cli-driver-base'

/**
 * npm and Bun — the two managers here that speak JSON properly, so neither
 * needs a column parser and neither is at the mercy of a formatting change.
 *
 * Both operate on GLOBAL packages. A project's local dependencies belong to the
 * project, not to a system package manager, and installing into whatever
 * directory the application happened to start in would be surprising and wrong.
 */

interface NpmSearchEntry {
  readonly name?: unknown
  readonly version?: unknown
  readonly description?: unknown
}

export class NpmDriver extends CliDriverBase {
  public readonly id = 'npm' as const
  protected readonly executable = 'npm'

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout, code } = await this.capture(['search', query, '--json'])
    if (code !== 0) {
      return []
    }
    const parsed = parseLooseJson(stdout)
    if (!Array.isArray(parsed)) {
      return []
    }
    const results: DiscoveredPackage[] = []
    for (const entry of parsed as NpmSearchEntry[]) {
      if (typeof entry?.name !== 'string') {
        continue
      }
      results.push({
        ...this.ref(entry.name, entry.name, 'npm'),
        version: typeof entry.version === 'string' ? entry.version : undefined,
      })
    }
    return results
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout } = await this.capture(['list', '--global', '--depth=0', '--json'])
    const parsed = parseLooseJson(stdout)
    const dependencies = readDependencies(parsed)
    return Object.entries(dependencies)
      .filter(([, info]) => typeof info.version === 'string')
      .map(([name, info]) => ({
        ...this.ref(name, name, 'npm'),
        version: info.version as string,
      }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    // `npm outdated` exits 1 when anything is outdated. That is the normal
    // answer to this question, not an error.
    const { stdout } = await this.capture(['outdated', '--global', '--json'])
    const parsed = parseLooseJson(stdout)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return []
    }
    const results: UpdateCandidate[] = []
    for (const [name, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) {
        continue
      }
      const info = raw as Record<string, unknown>
      const current = typeof info['current'] === 'string' ? info['current'] : ''
      const latest = typeof info['latest'] === 'string' ? info['latest'] : ''
      if (latest.length === 0 || latest === current) {
        continue
      }
      results.push({
        ...this.ref(name, name, 'npm'),
        version: current,
        availableVersion: latest,
      })
    }
    return results
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const spec = options.version !== undefined ? `${pkg.id}@${options.version}` : pkg.id
    return ['install', '--global', spec]
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    return ['install', '--global', `${pkg.id}@latest`]
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['uninstall', '--global', pkg.id]
  }
}

export class BunDriver extends CliDriverBase {
  public readonly id = 'bun' as const
  protected readonly executable = 'bun'

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    // Bun has no search subcommand of its own; it resolves from the npm
    // registry, so `bun info` answers for an exact name. Saying "no results"
    // for a partial word is honest — inventing a fuzzy search is not.
    const { stdout, code } = await this.capture(['info', query, '--json'])
    if (code !== 0) {
      return []
    }
    const parsed = parseLooseJson(stdout)
    if (typeof parsed !== 'object' || parsed === null) {
      return []
    }
    const info = parsed as Record<string, unknown>
    const name = typeof info['name'] === 'string' ? info['name'] : query
    const version = typeof info['version'] === 'string' ? info['version'] : undefined
    return [{ ...this.ref(name, name, 'bun'), version }]
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture(['pm', 'ls', '--global'])
    if (code !== 0) {
      return []
    }
    return parseBunList(stdout).map(row => ({
      ...this.ref(row.name, row.name, 'bun'),
      version: row.version,
    }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    const { stdout, code } = await this.capture(['outdated', '--global'])
    if (code !== 0) {
      return []
    }
    return parseBunOutdated(stdout).map(row => ({
      ...this.ref(row.name, row.name, 'bun'),
      version: row.current,
      availableVersion: row.latest,
    }))
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const spec = options.version !== undefined ? `${pkg.id}@${options.version}` : pkg.id
    return ['add', '--global', spec]
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    return ['add', '--global', `${pkg.id}@latest`]
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['remove', '--global', pkg.id]
  }
}

function readDependencies(parsed: unknown): Record<string, { version?: unknown }> {
  if (typeof parsed !== 'object' || parsed === null) {
    return {}
  }
  const dependencies = (parsed as Record<string, unknown>)['dependencies']
  if (typeof dependencies !== 'object' || dependencies === null) {
    return {}
  }
  return dependencies as Record<string, { version?: unknown }>
}

export interface BunRow {
  readonly name: string
  readonly version: string
}

/** `bun pm ls` prints a tree; each leaf reads `name@version`. */
export function parseBunList(output: string): readonly BunRow[] {
  const rows: BunRow[] = []
  for (const line of outputLines(output)) {
    // Strip the box-drawing tree prefix before matching.
    const cleaned = line.replace(/^[\s│├└─`|+-]+/, '').trim()
    const at = cleaned.lastIndexOf('@')
    if (at <= 0) {
      continue
    }
    const name = cleaned.slice(0, at)
    const version = cleaned.slice(at + 1).trim()
    // A scoped package starts with @, so the FIRST @ is part of the name and
    // only the last one separates the version.
    if (name.length === 0 || !/^\d/.test(version)) {
      continue
    }
    rows.push({ name, version })
  }
  return rows
}

export interface BunOutdatedRow {
  readonly name: string
  readonly current: string
  readonly latest: string
}

/** `bun outdated` prints an aligned table with a Package/Current/Latest header. */
export function parseBunOutdated(output: string): readonly BunOutdatedRow[] {
  const rows: BunOutdatedRow[] = []
  for (const line of outputLines(output)) {
    const cells = line
      .split('│')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0)
    if (cells.length < 3) {
      continue
    }
    const [name, current, latest] = cells
    if (
      name === undefined ||
      current === undefined ||
      latest === undefined ||
      /^package$/i.test(name) ||
      !/^\d/.test(current)
    ) {
      continue
    }
    if (current === latest) {
      continue
    }
    rows.push({ name, current, latest })
  }
  return rows
}
