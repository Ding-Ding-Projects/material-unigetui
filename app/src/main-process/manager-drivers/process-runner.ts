import { spawn, SpawnOptions } from 'child_process'
import { OperationHandle, OperationCallbacks } from './manager-driver'
import { ParsedProgress } from '../../models/operation'
import {
  buildBatchInvocation,
  isWindows,
  looksLikeBatchFile,
  windowsCandidates,
} from './windows-command'

export interface RunOptions {
  readonly executable: string
  readonly args: readonly string[]
  /**
   * Elevation is an explicit, visible act. A driver asks for it; it is never
   * inferred, and a failure to elevate surfaces as an operation error rather
   * than a silent downgrade to an unelevated run.
   */
  readonly elevated?: boolean
}

export interface CaptureResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
}

/** Resolved spawn arguments for one candidate command name. */
function spawnArgsFor(
  command: string,
  args: readonly string[]
): { executable: string; args: readonly string[]; options: SpawnOptions } {
  if (isWindows() && looksLikeBatchFile(command)) {
    const invocation = buildBatchInvocation(command, args)
    return {
      executable: invocation.executable,
      args: invocation.args,
      options: {
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      },
    }
  }
  return { executable: command, args, options: { windowsHide: true } }
}

function isMissingExecutable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  // EINVAL is what Node returns for a .cmd it refuses to execute directly,
  // which is the same situation as "not found" from the caller's point of view.
  return code === 'ENOENT' || code === 'EINVAL'
}

/**
 * Collects full stdout for a command expected to finish and be parsed whole.
 *
 * On Windows the bare name is tried first and then the batch wrappers, because
 * spawn performs no PATHEXT resolution: `npm` is `npm.cmd`, and without this
 * the manager reports itself uninstalled while sitting plainly on PATH.
 */
export async function runCapturing(
  options: RunOptions,
  signal?: AbortSignal
): Promise<CaptureResult> {
  const candidates = windowsCandidates(options.executable)
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      return await runOnce(candidate, options.args, signal)
    } catch (error) {
      if (!isMissingExecutable(error)) {
        throw error
      }
      lastError = error
    }
  }

  throw lastError ?? new Error(`${options.executable} could not be started`)
}

function runOnce(
  command: string,
  args: readonly string[],
  signal?: AbortSignal
): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const resolved = spawnArgsFor(command, args)
    const child = spawn(resolved.executable, [...resolved.args], {
      ...resolved.options,
      signal,
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => (stdout += chunk))
    child.stderr?.on('data', chunk => (stderr += chunk))

    child.on('error', reject)
    child.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }))
  })
}

/**
 * Runs a long operation, streaming output line by line to a parser.
 *
 * stdout and stderr are both piped explicitly. Letting a child inherit pipes is
 * how an elevated install hangs forever with nothing to show for it.
 */
export function runStreaming(
  options: RunOptions,
  parse: (line: string) => ParsedProgress,
  callbacks: OperationCallbacks
): OperationHandle {
  const controller = new AbortController()
  const candidates = windowsCandidates(options.executable)

  const completed = (async (): Promise<number> => {
    let lastError: unknown = null

    for (const candidate of candidates) {
      try {
        return await streamOnce(candidate, options.args, parse, callbacks, controller)
      } catch (error) {
        // A cancelled run must not fall through to the next candidate and start
        // the operation again under a different name.
        if (controller.signal.aborted || !isMissingExecutable(error)) {
          throw error
        }
        lastError = error
      }
    }

    throw lastError ?? new Error(`${options.executable} could not be started`)
  })()

  return { completed, cancel: () => controller.abort() }
}

function streamOnce(
  command: string,
  args: readonly string[],
  parse: (line: string) => ParsedProgress,
  callbacks: OperationCallbacks,
  controller: AbortController
): Promise<number> {
  return new Promise((resolve, reject) => {
    const resolved = spawnArgsFor(command, args)
    const child = spawn(resolved.executable, [...resolved.args], {
      ...resolved.options,
      signal: controller.signal,
    })

    let pending = ''
    const consume = (chunk: string) => {
      pending += chunk
      // Split on either line ending. A CRLF-only split drops every line from a
      // manager that emits bare LF, and the reverse leaves a stray carriage
      // return on every field while looking identical.
      const lines = pending.split(/\r\n|\n|\r/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.length > 0) {
          callbacks.onProgress(parse(line))
        }
      }
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', consume)
    child.stderr?.on('data', consume)

    child.on('error', reject)
    child.on('close', code => {
      if (pending.length > 0) {
        callbacks.onProgress(parse(pending))
      }
      resolve(code ?? -1)
    })
  })
}
