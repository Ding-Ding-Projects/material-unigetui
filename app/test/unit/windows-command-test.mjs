import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { loadCompiled } from '../helpers/compiled.mjs'

const {
  escapeArgument,
  escapeForCmd,
  buildBatchInvocation,
  windowsCandidates,
  looksLikeBatchFile,
} = loadCompiled('main-process/manager-drivers/windows-command.ts')

test('a plain argument is left alone', () => {
  assert.equal(escapeArgument('7zip.7zip'), '7zip.7zip')
})

test('an argument with a space is quoted', () => {
  assert.equal(escapeArgument('two words'), '"two words"')
})

test('an empty argument survives as an empty quoted string', () => {
  // Dropping it would silently shift every later argument by one position.
  assert.equal(escapeArgument(''), '""')
})

test('a trailing backslash does not escape the closing quote', () => {
  // The classic Windows quoting bug: "C:\dir\" swallows the next argument.
  const escaped = escapeArgument('C:\\Program Files\\')
  assert.ok(escaped.endsWith('\\\\"'), escaped)
  assert.ok(!escaped.endsWith('\\"') || escaped.endsWith('\\\\"'), escaped)
})

test('an embedded quote is escaped rather than ending the argument', () => {
  const escaped = escapeArgument('say "hello"')
  assert.ok(escaped.includes('\\"'), escaped)
})

test('cmd metacharacters are caret-escaped', () => {
  for (const character of ['&', '|', '<', '>', '(', ')', '%', '!', '^']) {
    assert.ok(
      escapeForCmd(character).startsWith('^'),
      `${character} was not escaped`
    )
  }
})

test('batch files are recognised by extension, case-insensitively', () => {
  assert.equal(looksLikeBatchFile('npm.cmd'), true)
  assert.equal(looksLikeBatchFile('NPM.CMD'), true)
  assert.equal(looksLikeBatchFile('thing.BAT'), true)
  assert.equal(looksLikeBatchFile('winget.exe'), false)
  assert.equal(looksLikeBatchFile('winget'), false)
})

test('a bare name gets batch candidates on Windows only', () => {
  const candidates = windowsCandidates('npm')
  if (process.platform === 'win32') {
    assert.deepEqual(candidates, ['npm', 'npm.cmd', 'npm.bat'])
  } else {
    assert.deepEqual(candidates, ['npm'])
  }
})

test('a name that already has an extension is not expanded', () => {
  assert.deepEqual(windowsCandidates('python.exe'), ['python.exe'])
})

test('the batch invocation disables AutoRun', () => {
  // Without /d a machine with a configured AutoRun command runs it before
  // every single package operation.
  const invocation = buildBatchInvocation('npm.cmd', ['install'])
  assert.ok(invocation.args.includes('/d'), invocation.args.join(' '))
  assert.ok(invocation.args.includes('/c'))
  assert.equal(invocation.windowsVerbatimArguments, true)
})

// The assertion that matters: a shell metacharacter in a package name must
// reach the program as data, never be executed by cmd. This runs the real
// cmd.exe rather than reasoning about the escaping.
test('a package name containing & cannot execute a second command', {
  skip: process.platform !== 'win32' ? 'Windows only' : false,
}, () => {
  const hostile = 'harmless & echo INJECTED'
  const invocation = buildBatchInvocation('echo', [hostile])

  const result = spawnSync(invocation.executable, [...invocation.args], {
    encoding: 'utf8',
    windowsVerbatimArguments: true,
    windowsHide: true,
  })

  const output = `${result.stdout}${result.stderr}`
  // echo prints the whole string back; if cmd had split on &, "INJECTED"
  // would appear on its own line as the output of a second command.
  assert.ok(output.includes('harmless'), output)
  assert.ok(
    !/^INJECTED\s*$/m.test(output),
    `cmd executed the injected command:\n${output}`
  )
})

test('a package name containing | cannot pipe into another command', {
  skip: process.platform !== 'win32' ? 'Windows only' : false,
}, () => {
  const hostile = 'harmless | echo PIPED'
  const invocation = buildBatchInvocation('echo', [hostile])

  const result = spawnSync(invocation.executable, [...invocation.args], {
    encoding: 'utf8',
    windowsVerbatimArguments: true,
    windowsHide: true,
  })

  const output = `${result.stdout}${result.stderr}`
  assert.ok(!/^PIPED\s*$/m.test(output), `cmd honoured the pipe:\n${output}`)
})
