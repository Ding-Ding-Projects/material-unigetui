#!/usr/bin/env node
/**
 * Compiles the testable TypeScript, then runs the node:test suite against the
 * compiled output.
 *
 * Output is CommonJS on purpose. The sources use extensionless relative imports
 * because webpack resolves them, and raw Node ESM does not — compiling to CJS
 * lets the tests exercise the real source without rewriting every import for
 * the benefit of the test runner alone.
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
  'app/src/main-process/manager-drivers/winget-driver.ts',
  'app/src/main-process/manager-drivers/winget-table-parser.ts',
  'app/src/ui/md3/md3-style-contract.ts',
  '--outDir', 'app/build-test',
  '--rootDir', 'app/src',
  '--module', 'commonjs',
  '--moduleResolution', 'node10',
  '--target', 'es2022',
  '--types', 'node',
  '--esModuleInterop',
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
