import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Reads the PE certificate table out of an executable.
 *
 * A copy of the check in script/package.mjs, deliberately kept here as an
 * independent reader: this test is about the produced artifact, and it should
 * still be able to judge one if the packaging script is the thing that broke.
 */
function certificateTable(path) {
  const bytes = readFileSync(path)
  assert.equal(bytes.readUInt16LE(0), 0x5a4d, `${path} is not a PE file`)
  const peOffset = bytes.readUInt32LE(0x3c)
  assert.equal(bytes.readUInt32LE(peOffset), 0x00004550, `${path} has no PE header`)
  const optionalHeaderOffset = peOffset + 24
  const magic = bytes.readUInt16LE(optionalHeaderOffset)
  const dataDirectoryOffset = optionalHeaderOffset + (magic === 0x20b ? 112 : 96)
  const entry = dataDirectoryOffset + 4 * 8
  return {
    address: bytes.readUInt32LE(entry),
    size: bytes.readUInt32LE(entry + 4),
  }
}

const installerDir = join(repoRoot, 'out', 'installer')
const packagedExe = join(
  repoRoot,
  'out',
  'MaterialUniGetUI-win32-x64',
  'MaterialUniGetUI.exe'
)

test('the packaging script never configures a signer', () => {
  // The policy is enforced by absence, so absence is what is asserted.
  const source = readFileSync(join(repoRoot, 'script', 'package.mjs'), 'utf8')
  for (const forbidden of [
    'certificateFile',
    'certificatePassword',
    'signWithParams',
    'signtool',
  ]) {
    // Allowed in a comment explaining why it is absent; never as a real key.
    const asKey = new RegExp('^\\s*' + forbidden + '\\s*:', 'm')
    assert.doesNotMatch(
      source,
      asKey,
      `package.mjs configures ${forbidden}; signing is prohibited for this project`
    )
  }
})

test('the build scripts never invoke a signer', () => {
  const script = readFileSync(
    join(repoRoot, 'script', 'build-windows.ps1'),
    'utf8'
  ).replace(/\r\n/g, '\n')
  assert.doesNotMatch(script, /^\s*&\s*signtool/m)
  assert.doesNotMatch(script, /Set-AuthenticodeSignature/)
})

// Artifact-dependent. Skipped rather than failed when nothing has been built:
// a developer who has not run the packaging step has not done anything wrong.
const builtPackage = existsSync(packagedExe)
const builtInstaller =
  existsSync(installerDir) &&
  readdirSync(installerDir).some(name => name.endsWith('Setup.exe'))

test('the packaged executable carries no certificate', { skip: !builtPackage }, () => {
  const table = certificateTable(packagedExe)
  assert.equal(table.address, 0, 'a certificate table address is present')
  assert.equal(table.size, 0, 'a certificate table size is present')
})

test('the installer carries no certificate', { skip: !builtInstaller }, () => {
  const setup = readdirSync(installerDir).find(name => name.endsWith('Setup.exe'))
  assert.ok(setup, 'no Setup.exe in the installer output')
  const table = certificateTable(join(installerDir, setup))
  assert.equal(table.address, 0)
  assert.equal(table.size, 0)
})

test('the installer output carries every Squirrel artifact', { skip: !builtInstaller }, () => {
  const produced = readdirSync(installerDir)
  assert.ok(
    produced.some(name => name.endsWith('Setup.exe')),
    `no Setup.exe among: ${produced.join(', ')}`
  )
  assert.ok(produced.includes('RELEASES'), 'RELEASES is missing')
  assert.ok(
    produced.some(name => name.endsWith('.nupkg')),
    'no .nupkg was produced'
  )
})

test('the installer name is pinned and has no space in it', { skip: !builtInstaller }, () => {
  // Left to itself electron-winstaller derives the name from the product title,
  // which produced "Material UniGetUISetup.exe" — a space in a download
  // filename, and a name the release step could not predict.
  const produced = readdirSync(installerDir)
  const setup = produced.find(name => name.endsWith('Setup.exe'))
  assert.equal(setup, 'MaterialUniGetUISetup.exe')
  assert.ok(!setup.includes(' '), 'the installer filename contains a space')
})
