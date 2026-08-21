import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { CliDriverBase, outputLines, parseLooseJson } from './cli-driver-base'

/**
 * Pip, Cargo and the .NET tool manager — the three language toolchains in scope.
 *
 * Each installs into a user-scoped location by default, which is what this
 * application wants: a package manager that needs administrator rights to add a
 * developer tool is a package manager the user will stop using.
 */

/* ------------------------------------------------------------------ pip -- */

export class PipDriver extends CliDriverBase {
  public readonly id = 'pip' as const
  // Invoked through the interpreter, as the reference does: a bare `pip` on
  // PATH frequently belongs to a different interpreter than the one in use.
  protected readonly executable = 'python'
  protected override readonly prefixArgs = ['-m', 'pip'] as const

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    // `pip search` was withdrawn by PyPI and now always fails. Rather than
    // showing an error for a normal action, resolve the exact name through
    // `pip index versions`, and say plainly that partial matching is not
    // available rather than pretending to search.
    const { stdout, code } = await this.capture(['index', 'versions', query])
    if (code !== 0) {
      return []
    }
    const match = /^([\w.-]+)\s*\(([^)]+)\)/m.exec(stdout.replace(/\r\n/g, '\n'))
    if (match === null) {
      return []
    }
    const name = match[1] ?? query
    return [{ ...this.ref(name, name, 'PyPI'), version: match[2] }]
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture(['list', '--format=json'])
    if (code !== 0) {
      return []
    }
    return readPipJson(stdout).map(entry => ({
      ...this.ref(entry.name, entry.name, 'PyPI'),
      version: entry.version,
    }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    const { stdout, code } = await this.capture([
      'list',
      '--outdated',
      '--format=json',
    ])
    if (code !== 0) {
      return []
    }
    return readPipJson(stdout)
      .filter(entry => entry.latest.length > 0 && entry.latest !== entry.version)
      .map(entry => ({
        ...this.ref(entry.name, entry.name, 'PyPI'),
        version: entry.version,
        availableVersion: entry.latest,
      }))
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const spec = options.version !== undefined ? `${pkg.id}==${options.version}` : pkg.id
    const args = ['install', spec]
    if (options.preRelease === true) {
      args.push('--pre')
    }
    if (options.scope !== 'machine') {
      args.push('--user')
    }
    return args
  }

  protected updateArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['install', '--upgrade', pkg.id]
    if (options.scope !== 'machine') {
      args.push('--user')
    }
    return args
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['uninstall', '--yes', pkg.id]
  }
}

interface PipEntry {
  readonly name: string
  readonly version: string
  readonly latest: string
}

function readPipJson(output: string): readonly PipEntry[] {
  const parsed = parseLooseJson(output)
  if (!Array.isArray(parsed)) {
    return []
  }
  const entries: PipEntry[] = []
  for (const raw of parsed as Array<Record<string, unknown>>) {
    const name = typeof raw['name'] === 'string' ? raw['name'] : ''
    if (name.length === 0) {
      continue
    }
    entries.push({
      name,
      version: typeof raw['version'] === 'string' ? raw['version'] : '',
      latest: typeof raw['latest_version'] === 'string' ? raw['latest_version'] : '',
    })
  }
  return entries
}

/* ---------------------------------------------------------------- cargo -- */

export class CargoDriver extends CliDriverBase {
  public readonly id = 'cargo' as const
  protected readonly executable = 'cargo'

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout, code } = await this.capture(['search', query, '--limit', '25'])
    if (code !== 0) {
      return []
    }
    return parseCargoSearch(stdout).map(row => ({
      ...this.ref(row.name, row.name, 'crates.io'),
      version: row.version,
    }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture(['install', '--list'])
    if (code !== 0) {
      return []
    }
    return parseCargoInstallList(stdout).map(row => ({
      ...this.ref(row.name, row.name, 'crates.io'),
      version: row.version,
    }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    // Cargo itself cannot answer this; `cargo install-update` is a separate
    // crate that may not be present. Reporting nothing is honest; guessing by
    // querying crates.io behind the user's back is not.
    return []
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['install', pkg.id]
    if (options.version !== undefined) {
      args.push('--version', options.version)
    }
    return args
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    // Reinstalling is how cargo updates a binary crate.
    return ['install', pkg.id, '--force']
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['uninstall', pkg.id]
  }
}

export interface CargoRow {
  readonly name: string
  readonly version: string
}

/** `cargo search` prints `name = "version"    # description`. */
export function parseCargoSearch(output: string): readonly CargoRow[] {
  const rows: CargoRow[] = []
  for (const line of outputLines(output)) {
    const match = /^([\w.-]+)\s*=\s*"([^"]+)"/.exec(line.trim())
    if (match === null) {
      continue
    }
    rows.push({ name: match[1] ?? '', version: match[2] ?? '' })
  }
  return rows
}

/** `cargo install --list` prints `name vX.Y.Z:` then indented binary names. */
export function parseCargoInstallList(output: string): readonly CargoRow[] {
  const rows: CargoRow[] = []
  for (const raw of output.replace(/\r\n/g, '\n').split('\n')) {
    // Indented lines are the installed binaries of the crate above, not crates.
    if (raw.startsWith(' ') || raw.startsWith('\t') || raw.trim().length === 0) {
      continue
    }
    const match = /^([\w.-]+)\s+v([^\s:]+)/.exec(raw.trim())
    if (match === null) {
      continue
    }
    rows.push({ name: match[1] ?? '', version: match[2] ?? '' })
  }
  return rows
}

/* --------------------------------------------------------------- dotnet -- */

export class DotnetDriver extends CliDriverBase {
  public readonly id = 'dotnet' as const
  protected readonly executable = 'dotnet'
  protected override readonly prefixArgs = ['tool'] as const
  protected override readonly versionArgs = ['--version'] as const

  /** `dotnet --version`, not `dotnet tool --version`, which is not a command. */
  protected override availabilityArgs(): readonly string[] {
    return [...this.versionArgs]
  }

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const { stdout, code } = await this.capture(['search', query])
    if (code !== 0) {
      return []
    }
    return parseDotnetTable(stdout).map(row => ({
      ...this.ref(row.id, row.id, 'NuGet'),
      version: row.version,
    }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const { stdout, code } = await this.capture(['list', '--global'])
    if (code !== 0) {
      return []
    }
    return parseDotnetTable(stdout)
      .filter(row => row.version.length > 0)
      .map(row => ({
        ...this.ref(row.id, row.id, 'NuGet'),
        version: row.version,
      }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    // The SDK has no "which of my tools are outdated" command. Saying nothing
    // is honest; querying NuGet for every installed tool is a network sweep the
    // user did not ask for.
    return []
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const args = ['install', '--global', pkg.id]
    if (options.version !== undefined) {
      args.push('--version', options.version)
    }
    if (options.preRelease === true) {
      args.push('--prerelease')
    }
    return args
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    return ['update', '--global', pkg.id]
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return ['uninstall', '--global', pkg.id]
  }
}

export interface DotnetRow {
  readonly id: string
  readonly version: string
}

/** `dotnet tool list` prints `Package Id  Version  Commands` with a rule. */
export function parseDotnetTable(output: string): readonly DotnetRow[] {
  const lines = outputLines(output)
  const rows: DotnetRow[] = []
  let started = false
  for (const line of lines) {
    if (/^[-\s]+$/.test(line)) {
      started = true
      continue
    }
    if (!started) {
      continue
    }
    const cells = line.trim().split(/\s{2,}/)
    const id = (cells[0] ?? '').trim()
    if (id.length === 0) {
      continue
    }
    rows.push({ id, version: (cells[1] ?? '').trim() })
  }
  return rows
}
