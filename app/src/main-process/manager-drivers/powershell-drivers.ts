import { ManagerId } from '../../models/manager'
import {
  DiscoveredPackage,
  InstalledPackage,
  InstallOptions,
  PackageRef,
  UpdateCandidate,
} from '../../models/package'
import { CliDriverBase, parseLooseJson } from './cli-driver-base'

/**
 * PowerShell module galleries — Windows PowerShell 5.1 and PowerShell 7.
 *
 * Two managers rather than one, deliberately: they have separate module paths
 * and a module installed for one is not available to the other, so merging them
 * would report modules the user cannot actually use.
 *
 * Every call goes through `-NoProfile` and `ConvertTo-Json`, so the profile
 * cannot inject output and nothing has to be parsed out of formatted tables.
 */
abstract class PowerShellGalleryDriver extends CliDriverBase {
  protected override readonly versionArgs = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$PSVersionTable.PSVersion.ToString()',
  ] as const

  /** Runs one expression and parses its JSON. */
  private async json(expression: string): Promise<unknown> {
    const { stdout, code } = await this.capture([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      // Depth 3 keeps the document small; -AsArray so a single result is still
      // an array and callers never have to special-case one item.
      `${expression} | ConvertTo-Json -Depth 3 -AsArray`,
    ])
    if (code !== 0) {
      return null
    }
    return parseLooseJson(stdout)
  }

  public async search(query: string): Promise<readonly DiscoveredPackage[]> {
    const escaped = escapeForPowerShell(query)
    const parsed = await this.json(
      `Find-Module -Name '*${escaped}*' -ErrorAction SilentlyContinue | ` +
        `Select-Object -First 25 Name,Version,Repository`
    )
    return readModules(parsed).map(module => ({
      ...this.ref(module.name, module.name, module.repository),
      version: module.version,
    }))
  }

  public async listInstalled(): Promise<readonly InstalledPackage[]> {
    const parsed = await this.json(
      `Get-InstalledModule -ErrorAction SilentlyContinue | Select-Object Name,Version,Repository`
    )
    return readModules(parsed)
      .filter(module => module.version.length > 0)
      .map(module => ({
        ...this.ref(module.name, module.name, module.repository),
        version: module.version,
      }))
  }

  public async listUpdates(): Promise<readonly UpdateCandidate[]> {
    // Compares each installed module against the gallery in one pass rather
    // than one process per module.
    const parsed = await this.json(
      `Get-InstalledModule -ErrorAction SilentlyContinue | ForEach-Object { ` +
        `$latest = (Find-Module -Name $_.Name -ErrorAction SilentlyContinue).Version; ` +
        `if ($latest -and $latest -ne $_.Version) { ` +
        `[pscustomobject]@{ Name = $_.Name; Version = $_.Version.ToString(); ` +
        `Latest = $latest.ToString(); Repository = $_.Repository } } }`
    )
    const results: UpdateCandidate[] = []
    for (const raw of asArray(parsed)) {
      const record = raw as Record<string, unknown>
      const name = typeof record['Name'] === 'string' ? record['Name'] : ''
      const version = stringifyVersion(record['Version'])
      const latest = stringifyVersion(record['Latest'])
      if (name.length === 0 || latest.length === 0 || latest === version) {
        continue
      }
      results.push({
        ...this.ref(
          name,
          name,
          typeof record['Repository'] === 'string' ? record['Repository'] : undefined
        ),
        version,
        availableVersion: latest,
      })
    }
    return results
  }

  protected installArgs(pkg: PackageRef, options: InstallOptions): readonly string[] {
    const scope = options.scope === 'machine' ? 'AllUsers' : 'CurrentUser'
    let command =
      `Install-Module -Name '${escapeForPowerShell(pkg.id)}' -Scope ${scope} -Force`
    if (options.version !== undefined) {
      command += ` -RequiredVersion '${escapeForPowerShell(options.version)}'`
    }
    if (options.preRelease === true) {
      command += ' -AllowPrerelease'
    }
    return ['-NoProfile', '-NonInteractive', '-Command', command]
  }

  protected updateArgs(pkg: PackageRef): readonly string[] {
    return [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Update-Module -Name '${escapeForPowerShell(pkg.id)}' -Force`,
    ]
  }

  protected uninstallArgs(pkg: PackageRef): readonly string[] {
    return [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Uninstall-Module -Name '${escapeForPowerShell(pkg.id)}' -Force`,
    ]
  }
}

export class PowerShellDriver extends PowerShellGalleryDriver {
  public readonly id: ManagerId = 'powershell'
  protected readonly executable = 'powershell'
}

export class PowerShell7Driver extends PowerShellGalleryDriver {
  public readonly id: ManagerId = 'powershell7'
  protected readonly executable = 'pwsh'
}

/**
 * Escapes a value for a single-quoted PowerShell string.
 *
 * PowerShell escapes a single quote by doubling it. The arguments are already
 * passed as an argv array rather than through a shell, so this guards the
 * PowerShell parser specifically — a module name containing a quote must not be
 * able to end the string and start an expression.
 */
export function escapeForPowerShell(value: string): string {
  return value.replace(/'/g, "''")
}

function asArray(parsed: unknown): readonly unknown[] {
  if (Array.isArray(parsed)) {
    return parsed
  }
  if (parsed === null || parsed === undefined) {
    return []
  }
  return [parsed]
}

interface ModuleRow {
  readonly name: string
  readonly version: string
  readonly repository: string | undefined
}

function readModules(parsed: unknown): readonly ModuleRow[] {
  const rows: ModuleRow[] = []
  for (const raw of asArray(parsed)) {
    if (typeof raw !== 'object' || raw === null) {
      continue
    }
    const record = raw as Record<string, unknown>
    const name = typeof record['Name'] === 'string' ? record['Name'] : ''
    if (name.length === 0) {
      continue
    }
    rows.push({
      name,
      version: stringifyVersion(record['Version']),
      repository:
        typeof record['Repository'] === 'string' ? record['Repository'] : undefined,
    })
  }
  return rows
}

/**
 * A PowerShell version serializes as an object, not a string.
 *
 * `ConvertTo-Json` turns [System.Version] into `{Major,Minor,Build,Revision}`,
 * so reading it as a string yields nothing and the version silently disappears.
 */
export function stringifyVersion(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const parts = ['Major', 'Minor', 'Build', 'Revision']
      .map(part => record[part])
      .filter((part): part is number => typeof part === 'number' && part >= 0)
    if (parts.length > 0) {
      return parts.join('.')
    }
  }
  return ''
}
