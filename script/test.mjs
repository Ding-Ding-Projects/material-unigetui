#!/usr/bin/env node
/**
 * Compiles the testable TypeScript to plain JS, then runs the node:test suite
 * against the compiled output.
 *
 * Tests import the COMPILED source rather than re-declaring the logic they
 * check. A test that restates its subject proves only that the author can write
 * the same expression twice.
 */
import { spawnSync } from 'node:child_process'
import { rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(repoRoot, 'app', 'build-test')

const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', shell: true })

rmSync(outDir, { recursive: true, force: true })

console.log('· compiling testable sources')
const compile = run('npx', [
  'tsc',
  'app/src/main-process/manager-drivers/winget-table-parser.ts',
  'app/src/ui/md3/md3-style-contract.ts',
  '--outDir', 'app/build-test',
  '--module', 'esnext',
  '--target', 'es2022',
  '--moduleResolution', 'bundler',
  '--rootDir', 'app/src',
  '--strict',
])

if (compile.status !== 0) {
  console.error('✖ compile failed — not running tests against stale output')
  process.exit(compile.status ?? 1)
}

if (!existsSync(outDir) || readdirSync(outDir).length === 0) {
  console.error('✖ compile produced no output; refusing to report a green run')
  process.exit(1)
}

console.log('· running unit tests')
const tests = run('node', ['--test', 'app/test/unit/*.mjs'])
process.exit(tests.status ?? 1)
