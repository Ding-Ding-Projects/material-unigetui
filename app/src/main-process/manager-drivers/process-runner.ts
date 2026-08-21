import { spawn } from 'child_process'
import { OperationHandle, OperationCallbacks } from './manager-driver'
import { ParsedProgress } from '../../models/operation'

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

/** Collects full stdout for a command expected to finish and be parsed whole. */
export async function runCapturing(
  options: RunOptions,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, [...options.args], {
      windowsHide: true,
      signal,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))

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

  const completed = new Promise<number>((resolve, reject) => {
    const child = spawn(options.executable, [...options.args], {
      windowsHide: true,
      signal: controller.signal,
    })

    let pending = ''
    const consume = (chunk: string) => {
      pending += chunk
      // Split on either line ending. A CRLF-only split drops every line on a
      // manager that emits bare LF, and the reverse loses nothing but looks
      // identical while reporting no progress at all.
      const lines = pending.split(/\r\n|\n|\r/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.length > 0) {
          callbacks.onProgress(parse(line))
        }
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', consume)
    child.stderr.on('data', consume)

    child.on('error', reject)
    child.on('close', code => {
      if (pending.length > 0) {
        callbacks.onProgress(parse(pending))
      }
      resolve(code ?? -1)
    })
  })

  return { completed, cancel: () => controller.abort() }
}
