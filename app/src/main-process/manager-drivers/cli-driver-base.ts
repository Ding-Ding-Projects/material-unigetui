import { ManagerAvailability, ManagerId } from '../../models/manager'
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

/**
 * Shared plumbing for the CLI-backed drivers.
 *
 * Every manager this application drives is a command-line tool, so availability
 * detection, argv assembly and the streaming lifecycle are identical across all
 * of them. What differs is the exact subcommands and how each one's output is
 * shaped — those stay in the concrete drivers, because that is the part the
 * pinned reference was consulted for and the part that breaks between versions.
 */
export abstract class CliDriverBase implements ManagerDriver {
  public abstract readonly id: ManagerId

  /** The executable name, resolved from PATH unless overridden. */
  protected abstract readonly executable: string

  /** Arguments that precede every subcommand (e.g. `-m pip` for python). */
  protected readonly prefixArgs: readonly string[] = []

  /** The argument that prints a version, for availability detection. */
  protected readonly versionArgs: readonly string[] = ['--version']

  /**
   * The full argv for the availability probe.
   *
   * Defaults to the prefix plus the version argument, which is right for most
   * managers and wrong for `dotnet`: its prefix is `tool`, and `dotnet tool
   * --version` is not a command, so that driver drops the prefix here.
   */
  protected availabilityArgs(): readonly string[] {
    return [...this.prefixArgs, ...this.versionArgs]
  }

  public async isAvailable(): Promise<ManagerAvailability> {
    try {
      const { stdout, stderr, code } = await runCapturing({
        executable: this.executable,
        args: this.availabilityArgs(),
      })
      if (code !== 0) {
        return {
          id: this.id,
          available: false,
          unavailableReason: describeFailure(this.executable, code, stderr),
        }
      }
      return {
        id: this.id,
        available: true,
        version: extractVersion(stdout),
      }
    } catch (error) {
      // A missing executable throws ENOENT rather than exiting non-zero, and
      // "not installed" is the answer a user can act on.
      const message = error instanceof Error ? error.message : String(error)
      return {
        id: this.id,
        available: false,
        unavailableReason: /ENOENT/.test(message)
          ? `${this.executable} was not found on PATH`
          : message,
      }
    }
  }

  protected async capture(
    args: readonly string[]
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return runCapturing({
      executable: this.executable,
      args: [...this.prefixArgs, ...args],
    })
  }

  protected stream(
    args: readonly string[],
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    return runStreaming(
      {
        executable: this.executable,
        args: [...this.prefixArgs, ...args],
        elevated: options.elevated,
      },
      line => this.parseOutput(line),
      callbacks
    )
  }

  protected key(id: string): string {
    return `${this.id}:${id}`
  }

  protected ref(id: string, name: string, source?: string): PackageRef {
    return { key: this.key(id), id, name, manager: this.id, source }
  }

  public abstract search(query: string): Promise<readonly DiscoveredPackage[]>
  public abstract listInstalled(): Promise<readonly InstalledPackage[]>
  public abstract listUpdates(): Promise<readonly UpdateCandidate[]>
  protected abstract installArgs(
    pkg: PackageRef,
    options: InstallOptions
  ): readonly string[]
  protected abstract updateArgs(
    pkg: PackageRef,
    options: InstallOptions
  ): readonly string[]
  protected abstract uninstallArgs(
    pkg: PackageRef,
    options: InstallOptions
  ): readonly string[]

  public install(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    return this.stream(this.installArgs(pkg, options), options, callbacks)
  }

  public update(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    return this.stream(this.updateArgs(pkg, options), options, callbacks)
  }

  public uninstall(
    pkg: PackageRef,
    options: InstallOptions,
    callbacks: OperationCallbacks
  ): OperationHandle {
    return this.stream(this.uninstallArgs(pkg, options), options, callbacks)
  }

  /**
   * Default progress extraction: a percentage where one is printed, nothing
   * where none is. A driver whose manager reports differently overrides this.
   * None of them invent a number — no progress is honest, a fake bar is not.
   */
  public parseOutput(line: string): ParsedProgress {
    const percent = /(\d{1,3})\s?%/.exec(line)
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

/** Splits captured output into trimmed, non-empty lines, CRLF or LF. */
export function outputLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
}

/**
 * Parses JSON that a CLI printed, tolerating the banner text several of them
 * emit before the document.
 *
 * Returns null rather than throwing: a manager that printed a warning instead
 * of JSON is a situation to report, not an exception to propagate into an
 * unrelated caller.
 */
export function parseLooseJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.search(/[[{]/)
    if (start === -1) {
      return null
    }
    const opener = trimmed[start]
    const closer = opener === '[' ? ']' : '}'
    const end = trimmed.lastIndexOf(closer)
    if (end <= start) {
      return null
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/**
 * Turns a failed availability probe into words a user can act on.
 *
 * When a bare name is resolved through a batch wrapper that does not exist,
 * cmd.exe answers "'x.cmd' is not recognized…" and exits 1 rather than
 * producing ENOENT. Reporting that verbatim tells the user about a .cmd file
 * they never asked about; the fact they need is that the manager is not
 * installed.
 */
export function describeFailure(
  executable: string,
  code: number,
  stderr: string
): string {
  const firstLine = stderr.replace(/\r\n/g, '\n').split('\n')[0]?.trim() ?? ''
  if (/is not recognized as an internal or external command/i.test(stderr)) {
    return `${executable} was not found on PATH`
  }
  if (/command not found/i.test(stderr)) {
    return `${executable} was not found on PATH`
  }
  return firstLine.length > 0
    ? `${executable} exited ${code}: ${firstLine}`
    : `${executable} exited ${code}`
}

/**
 * Pulls a version number out of whatever a CLI printed.
 *
 * Several print far more than a version — pip reports the interpreter path it
 * was loaded from, which is a user directory and has no business in a status
 * line, a log, or a capture. Only the version token is kept.
 */
export function extractVersion(stdout: string): string {
  const firstLine = stdout.replace(/\r\n/g, '\n').split('\n')[0]?.trim() ?? ''
  const match = /\bv?(\d+(?:\.\d+)+(?:[-+][\w.]+)?)/.exec(firstLine)
  return match?.[1] ?? firstLine
}
