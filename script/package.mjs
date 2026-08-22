#!/usr/bin/env node
/**
 * Packages the application and builds an unsigned Squirrel.Windows installer.
 *
 * Two steps: electron-packager produces the app directory, then
 * electron-winstaller wraps it into Setup.exe plus RELEASES and a .nupkg.
 *
 * Code signing is permanently prohibited for this project. Nothing here
 * requests, discovers or invokes a signer, and the result is asserted unsigned
 * before it is reported — a build that quietly acquired a signature would be a
 * policy breach, not a bonus.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(repoRoot, 'out')
const appManifest = JSON.parse(
  readFileSync(join(repoRoot, 'app', 'package.json'), 'utf8')
)

const APP_NAME = 'MaterialUniGetUI'
const PRODUCT_NAME = appManifest.productName ?? 'Material UniGetUI'
const VERSION = appManifest.version

function phase(message) {
  console.log(`· ${message}`)
}

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Confirms a produced executable carries no digital signature.
 *
 * Read from the file itself: the PE optional header's certificate directory is
 * empty in an unsigned binary. Trusting the packaging configuration instead
 * would only prove what we asked for, not what we got.
 */
function assertNotSigned(path) {
  const bytes = readFileSync(path)
  if (bytes.length < 0x400 || bytes.readUInt16LE(0) !== 0x5a4d) {
    fail(`${path} is not a PE executable`)
  }
  const peOffset = bytes.readUInt32LE(0x3c)
  if (bytes.readUInt32LE(peOffset) !== 0x00004550) {
    fail(`${path} has no PE signature`)
  }
  const optionalHeaderOffset = peOffset + 24
  const magic = bytes.readUInt16LE(optionalHeaderOffset)
  // PE32+ puts the data directories 16 bytes further along than PE32.
  const dataDirectoryOffset = optionalHeaderOffset + (magic === 0x20b ? 112 : 96)
  // The certificate table is data directory index 4.
  const certificateEntry = dataDirectoryOffset + 4 * 8
  const address = bytes.readUInt32LE(certificateEntry)
  const size = bytes.readUInt32LE(certificateEntry + 4)

  if (address !== 0 || size !== 0) {
    fail(
      `${path} carries a certificate table (${size} bytes). Signing is prohibited ` +
        'for this project; the build must not have acquired one.'
    )
  }
  return 'NotSigned'
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited ${result.status}`)
  }
}

const startedAt = Date.now()

phase(`packaging ${PRODUCT_NAME} ${VERSION}`)

if (!existsSync(join(repoRoot, 'app', 'main.js'))) {
  fail('app/main.js is missing — run the build before packaging')
}
if (!existsSync(join(repoRoot, 'app', 'renderer.js'))) {
  fail('app/renderer.js is missing — run the build before packaging')
}

// Clear prior output, so a stale artifact can never be mistaken for a fresh one.
rmSync(outDir, { recursive: true, force: true })

phase('running electron-packager')
run('npx', [
  'electron-packager',
  'app',
  APP_NAME,
  '--platform=win32',
  '--arch=x64',
  '--out=out',
  '--overwrite',
  `--app-version=${VERSION}`,
  // Explicitly refuse any signing configuration.
  '--no-prune',
  '--ignore=^/build-test',
])

const packagedDir = join(outDir, `${APP_NAME}-win32-x64`)
if (!existsSync(packagedDir)) {
  fail(`electron-packager reported success but ${packagedDir} does not exist`)
}

const packagedExe = join(packagedDir, `${APP_NAME}.exe`)
if (!existsSync(packagedExe)) {
  fail(`packaged executable missing at ${packagedExe}`)
}

phase(`packaged app: ${packagedExe} (${statSync(packagedExe).size} bytes)`)
phase(`packaged executable signature: ${assertNotSigned(packagedExe)}`)

phase('building the unsigned Squirrel.Windows installer')

const installerDir = join(outDir, 'installer')
const { createWindowsInstaller } = await import('electron-winstaller')

await createWindowsInstaller({
  appDirectory: packagedDir,
  outputDirectory: installerDir,
  authors: 'Ding Ding Projects',
  exe: `${APP_NAME}.exe`,
  name: APP_NAME,
  title: PRODUCT_NAME,
  version: VERSION,
  description: appManifest.description,
  noMsi: true,
  // Named explicitly. Left to itself, electron-winstaller derives the setup
  // name from `title`, which produced "Material UniGetUISetup.exe" — a space
  // in a download filename, and a name no release step could predict.
  setupExe: `${APP_NAME}Setup.exe`,
  // No certificateFile, no certificatePassword, no signWithParams. Their
  // absence is the policy; adding any of them is the breach.
})

const produced = readdirSync(installerDir)
const setupName = `${APP_NAME}Setup.exe`
const setupExe = join(installerDir, setupName)
const releases = join(installerDir, 'RELEASES')
const nupkg = produced.find(name => name.endsWith('.nupkg'))

for (const [label, path] of [
  [setupName, setupExe],
  ['RELEASES', releases],
]) {
  if (!existsSync(path)) {
    fail(`${label} was not produced`)
  }
}
if (nupkg === undefined) {
  fail('no .nupkg was produced')
}

const setupSize = statSync(setupExe).size
// A plausible floor: an installer smaller than this cannot contain a runtime,
// and a silently empty package is the failure this catches.
if (setupSize < 40 * 1024 * 1024) {
  fail(
    `${setupName} is only ${setupSize} bytes, which is too small to contain the ` +
      'application — the payload did not make it in.'
  )
}

console.log('')
console.log('| Artifact | Size | SHA-256 |')
console.log('| --- | ---: | --- |')
for (const name of [setupName, 'RELEASES', nupkg]) {
  const path = join(installerDir, name)
  console.log(
    `| ${name} | ${statSync(path).size} | \`${sha256(path)}\` |`
  )
}

console.log('')
console.log(`${setupName} signature: ${assertNotSigned(setupExe)}`)
console.log(
  'These artifacts are unsigned and will trigger an unknown-publisher warning ' +
    'on Windows. That is expected and permanent for this project.'
)
console.log(`Packaging took ${Math.round((Date.now() - startedAt) / 1000)}s.`)
