/**
 * Running a Windows batch wrapper safely.
 *
 * Several managers ship as `.cmd` or `.bat` shims rather than real executables:
 * npm, bun on some installs, scoop, and others. Node cannot execute those
 * directly — CreateProcess refuses them — so the driver reports ENOENT and the
 * manager looks uninstalled while sitting plainly on PATH.
 *
 * The tempting fix is `shell: true`. It is also a command-injection hole: the
 * arguments here include package names and whatever the user typed into a
 * search box, so `foo & calc` would run `calc`. Instead the command line is
 * assembled explicitly and every argument is escaped twice — once for the
 * Windows argument parser and again for the cmd.exe parser — and handed over
 * with `windowsVerbatimArguments`, so nothing re-quotes it behind our backs.
 */

export const BATCH_EXTENSIONS = ['.cmd', '.bat'] as const

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function looksLikeBatchFile(command: string): boolean {
  const lowered = command.toLowerCase()
  return BATCH_EXTENSIONS.some(extension => lowered.endsWith(extension))
}

/**
 * Escapes one argument for the Windows argument parser (CommandLineToArgvW).
 *
 * Backslashes are only special immediately before a quote, so a run of them is
 * doubled there and left alone everywhere else. Getting this wrong turns a
 * trailing backslash in a path into an escaped closing quote, which swallows
 * the next argument.
 */
export function escapeArgument(argument: string): string {
  if (argument.length === 0) {
    return '""'
  }
  // Nothing to do when the argument has no whitespace, quote or metacharacter.
  if (!/[\s"^&|<>()%!]/.test(argument)) {
    return argument
  }

  let escaped = '"'
  let pendingBackslashes = 0

  for (const character of argument) {
    if (character === '\\') {
      pendingBackslashes += 1
      continue
    }
    if (character === '"') {
      // Double the run, then escape the quote itself.
      escaped += '\\'.repeat(pendingBackslashes * 2 + 1)
      escaped += '"'
      pendingBackslashes = 0
      continue
    }
    escaped += '\\'.repeat(pendingBackslashes)
    escaped += character
    pendingBackslashes = 0
  }

  escaped += '\\'.repeat(pendingBackslashes * 2)
  escaped += '"'
  return escaped
}

/** Characters cmd.exe acts on before the program ever sees them. */
const CMD_METACHARACTERS = /[()%!^"<>&|]/g

/**
 * Escapes an already-argument-escaped string for the cmd.exe parser.
 *
 * cmd.exe reads the line first and expands or acts on these characters before
 * handing anything to the program, so each is prefixed with a caret. This runs
 * after escapeArgument, never before: the two parsers are applied in that
 * order, so the escaping has to be too.
 */
export function escapeForCmd(text: string): string {
  return text.replace(CMD_METACHARACTERS, character => '^' + character)
}

export interface BatchInvocation {
  readonly executable: string
  readonly args: readonly string[]
  readonly windowsVerbatimArguments: true
}

/**
 * Builds a cmd.exe invocation for a batch-file command.
 *
 * `/d` skips AutoRun commands from the registry — otherwise a machine with a
 * configured AutoRun runs it before every single package operation. `/s` fixes
 * the quoting rules for the outer quoted string, and `/c` runs and exits.
 */
export function buildBatchInvocation(
  command: string,
  args: readonly string[]
): BatchInvocation {
  const parts = [command, ...args]
    .map(part => escapeForCmd(escapeArgument(part)))
    .join(' ')

  return {
    executable: process.env['ComSpec'] ?? 'cmd.exe',
    // The whole command line is one quoted argument to /c.
    args: ['/d', '/s', '/c', `"${parts}"`],
    windowsVerbatimArguments: true,
  }
}

/**
 * Candidate command names to try for a bare manager name on Windows.
 *
 * PATHEXT decides what `npm` means at a prompt; spawn does no such resolution,
 * so the driver tries the plain name first — which works for a real .exe — and
 * then the batch wrappers.
 */
export function windowsCandidates(command: string): readonly string[] {
  if (!isWindows() || looksLikeBatchFile(command) || command.includes('.')) {
    return [command]
  }
  return [command, `${command}.cmd`, `${command}.bat`]
}
