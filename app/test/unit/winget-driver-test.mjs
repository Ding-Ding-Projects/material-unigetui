import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const { WinGetDriver, buildInstallArgs } = loadCompiled(
  'main-process/manager-drivers/winget-driver.ts'
)

const pkg = { key: 'winget:7zip.7zip', id: '7zip.7zip', name: '7-Zip', manager: 'winget' }

test('install args carry the id exactly and never guess a flag name', () => {
  const args = buildInstallArgs(pkg, {})
  assert.ok(args.includes('--id'))
  assert.equal(args[args.indexOf('--id') + 1], '7zip.7zip')
  assert.ok(args.includes('--exact'), 'without --exact winget can install a different package')
})

test('silent by default, interactive only when asked', () => {
  assert.ok(buildInstallArgs(pkg, {}).includes('--silent'))
  assert.ok(buildInstallArgs(pkg, { interactive: true }).includes('--interactive'))
})

test('never asks for silent and interactive at once', () => {
  // winget rejects the whole command when both are present, so this is a
  // correctness bug rather than a cosmetic one.
  for (const options of [{}, { interactive: true }, { interactive: false }]) {
    const args = buildInstallArgs(pkg, options)
    const both = args.includes('--silent') && args.includes('--interactive')
    assert.ok(!both, `both flags present for ${JSON.stringify(options)}`)
  }
})

test('maps every install option the dialog can set', () => {
  const args = buildInstallArgs(pkg, {
    version: '26.02',
    scope: 'machine',
    architecture: 'x64',
    location: 'C:/Tools/7zip',
    skipHashCheck: true,
    customArgs: '/NORESTART',
  })
  const pairs = {
    '--version': '26.02',
    '--scope': 'machine',
    '--architecture': 'x64',
    '--location': 'C:/Tools/7zip',
    '--override': '/NORESTART',
  }
  for (const [flag, value] of Object.entries(pairs)) {
    assert.ok(args.includes(flag), `missing ${flag}`)
    assert.equal(args[args.indexOf(flag) + 1], value, `wrong value for ${flag}`)
  }
  assert.ok(args.includes('--ignore-security-hash'))
})

test('omits flags that were not asked for', () => {
  const args = buildInstallArgs(pkg, {})
  for (const flag of ['--version', '--scope', '--architecture', '--location', '--override']) {
    assert.ok(!args.includes(flag), `${flag} appeared unasked`)
  }
})

test('reports progress only when a real percentage is present', () => {
  const driver = new WinGetDriver()
  assert.equal(driver.parseOutput('Downloading  42%').progress, 42)
  assert.equal(driver.parseOutput('Found 7-Zip [7zip.7zip]').progress, undefined)
  // An out-of-range number is not progress; inventing one would be worse than
  // reporting none.
  assert.equal(driver.parseOutput('error 999%').progress, undefined)
})

// Spawns the real CLI. A driver whose only tests stub the process proves
// nothing about the seam it exists to cross.
test('really runs winget and parses what it returns', async t => {
  const driver = new WinGetDriver()
  const availability = await driver.isAvailable()

  if (!availability.available) {
    t.skip(`winget unavailable: ${availability.unavailableReason}`)
    return
  }

  assert.match(availability.version ?? '', /v?\d+\.\d+/)

  const results = await driver.search('7zip')
  assert.ok(results.length > 0, 'real winget search returned nothing')
  assert.ok(
    results.some(p => p.id === '7zip.7zip'),
    'expected 7zip.7zip in real search results'
  )
  for (const p of results) {
    assert.equal(p.manager, 'winget')
    assert.ok(p.id.length > 0, 'parsed a package with no id')
    assert.ok(!p.name.includes('\r'), 'a carriage return reached a package name')
  }
})
