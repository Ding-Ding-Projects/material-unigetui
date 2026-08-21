#!/usr/bin/env node
/**
 * Makes sure the Electron binary actually exists before anything tries to run it.
 *
 * npm's install-script gate can leave the electron package present with no
 * binary underneath it. The failure reads as "electron is not installed" when
 * the package is right there, so this checks and repairs rather than leaving
 * the next person to rediscover it.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = join(repoRoot, 'node_modules', 'electron')
const binary = join(electronDir, 'dist', 'electron.exe')

if (existsSync(binary)) {
  process.exit(0)
}

if (!existsSync(electronDir)) {
  console.error('✖ the electron package is not installed at all; run npm install')
  process.exit(1)
}

console.log('· electron binary missing; running its installer directly')
const result = spawnSync(process.execPath, [join(electronDir, 'install.js')], {
  cwd: repoRoot,
  stdio: 'inherit',
})

// Judge it by the binary existing, never by the exit code: the installer can
// report a cache hit, exit 0 in under a second, and extract nothing at all.
if (!existsSync(binary)) {
  console.error(
    '✖ electron installer finished (status ' +
      String(result.status) +
      ') but no binary appeared at:\n  ' +
      binary +
      '\n  Extract the cached electron zip manually; re-running this will not help.'
  )
  process.exit(1)
}

console.log('· electron binary restored')
