import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const { parseScoopTable } = loadCompiled('main-process/manager-drivers/scoop-driver.ts')
const { parseChocolateyList, parseChocolateyOutdated } = loadCompiled(
  'main-process/manager-drivers/chocolatey-driver.ts'
)
const { parseBunList, parseBunOutdated } = loadCompiled(
  'main-process/manager-drivers/node-drivers.ts'
)
const { parseCargoSearch, parseCargoInstallList, parseDotnetTable } = loadCompiled(
  'main-process/manager-drivers/language-toolchain-drivers.ts'
)
const { parseVcpkgList, parseVcpkgSearch, parseVcpkgUpdate } = loadCompiled(
  'main-process/manager-drivers/vcpkg-driver.ts'
)
const { stringifyVersion, escapeForPowerShell } = loadCompiled(
  'main-process/manager-drivers/powershell-drivers.ts'
)
const { parseLooseJson, describeFailure, extractVersion } = loadCompiled(
  'main-process/manager-drivers/cli-driver-base.ts'
)

/* ------------------------------------------------------------- scoop --- */

test('scoop list parses name, version and source', () => {
  const output = [
    'Installed apps:',
    '',
    'Name    Version   Source Updated',
    '----    -------   ------ -------',
    'git     2.47.1    main   2026-01-01',
    'nodejs  22.11.0   main   2026-01-02',
  ].join('\r\n')

  const rows = parseScoopTable(output)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'git')
  assert.equal(rows[0].version, '2.47.1')
})

test('scoop output with no header yields nothing rather than garbage', () => {
  assert.deepEqual(parseScoopTable('nothing useful here'), [])
})

/* -------------------------------------------------------- chocolatey --- */

test('chocolatey --limit-output rows split on the pipe', () => {
  const rows = parseChocolateyList('git|2.47.1\nnodejs|22.11.0\n2 packages installed.')
  assert.equal(rows.length, 2)
  assert.equal(rows[1].id, 'nodejs')
  assert.equal(rows[1].version, '22.11.0')
})

test('a pinned chocolatey package is not reported as an update', () => {
  // Same version on both sides means pinned. Listing it would promise an
  // update that cannot happen.
  const rows = parseChocolateyOutdated(
    ['git|2.47.1|2.48.0|false', 'pinned-thing|1.0.0|1.0.0|true'].join('\n')
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'git')
  assert.equal(rows[0].available, '2.48.0')
})

/* ----------------------------------------------------------------- bun -- */

test('bun pm ls keeps a scoped package name intact', () => {
  // The FIRST @ belongs to the scope; only the last separates the version.
  const rows = parseBunList(['├── @scope/tool@1.2.3', '└── plain@4.5.6'].join('\n'))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, '@scope/tool')
  assert.equal(rows[0].version, '1.2.3')
  assert.equal(rows[1].name, 'plain')
})

test('bun outdated skips the header and equal versions', () => {
  const rows = parseBunOutdated(
    [
      '│ Package │ Current │ Latest │',
      '│ tool    │ 1.0.0   │ 1.2.0  │',
      '│ same    │ 2.0.0   │ 2.0.0  │',
    ].join('\n')
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'tool')
})

/* --------------------------------------------------------------- cargo -- */

test('cargo search parses the name = "version" form', () => {
  const rows = parseCargoSearch('ripgrep = "14.1.0"    # fast search\nfd-find = "10.2.0"')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'ripgrep')
  assert.equal(rows[0].version, '14.1.0')
})

test('cargo install --list ignores the indented binary names', () => {
  // Indented lines are the crate's binaries, not separate crates.
  const rows = parseCargoInstallList(['ripgrep v14.1.0:', '    rg', 'fd-find v10.2.0:', '    fd'].join('\n'))
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.name), ['ripgrep', 'fd-find'])
})

/* -------------------------------------------------------------- dotnet -- */

test('dotnet tool list starts after the rule', () => {
  const rows = parseDotnetTable(
    ['Package Id      Version   Commands', '--------------------------------', 'dotnet-ef       9.0.0     dotnet-ef'].join('\n')
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'dotnet-ef')
  assert.equal(rows[0].version, '9.0.0')
})

/* --------------------------------------------------------------- vcpkg -- */

test('vcpkg list keeps the triplet in the id', () => {
  // zlib:x64-windows and zlib:x86-windows are different artifacts; stripping
  // the triplet would make two distinct installs collide.
  const rows = parseVcpkgList('zlib:x64-windows    1.3.1    A compression library')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'zlib:x64-windows')
})

test('vcpkg search skips feature rows', () => {
  const rows = parseVcpkgSearch(['zlib    1.3.1   A library', 'zlib[feature]   thing'].join('\n'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'zlib')
})

test('vcpkg update parses the arrow form', () => {
  const rows = parseVcpkgUpdate('    zlib:x64-windows    1.3.0 -> 1.3.1')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].current, '1.3.0')
  assert.equal(rows[0].available, '1.3.1')
})

/* ---------------------------------------------------------- powershell -- */

test('a PowerShell version object stringifies rather than vanishing', () => {
  // ConvertTo-Json turns [System.Version] into an object; reading it as a
  // string yields nothing and the version silently disappears.
  assert.equal(stringifyVersion({ Major: 7, Minor: 6, Build: 5, Revision: -1 }), '7.6.5')
  assert.equal(stringifyVersion('1.2.3'), '1.2.3')
  assert.equal(stringifyVersion(undefined), '')
})

test('a single quote cannot end a PowerShell string', () => {
  assert.equal(escapeForPowerShell("it's"), "it''s")
})

/* --------------------------------------------------------------- shared -- */

test('JSON is recovered from output with a banner in front of it', () => {
  assert.deepEqual(parseLooseJson('warning: something\n[{"a":1}]'), [{ a: 1 }])
})

test('unparseable output returns null rather than throwing', () => {
  assert.equal(parseLooseJson('not json at all'), null)
})

test('a missing batch wrapper is reported as not on PATH', () => {
  // cmd answers "'x.cmd' is not recognized" and exits 1 rather than ENOENT.
  // Reporting that verbatim tells the user about a .cmd they never asked about.
  const message = describeFailure(
    'scoop',
    1,
    "'scoop.cmd' is not recognized as an internal or external command,"
  )
  assert.equal(message, 'scoop was not found on PATH')
})

test('a version is extracted without the path a tool printed beside it', () => {
  // pip reports the interpreter directory, which is a private location and has
  // no business in a status line or a capture.
  const version = extractVersion('pip 25.0.1 from C:\\Users\\someone\\site-packages')
  assert.equal(version, '25.0.1')
  assert.ok(!version.includes('Users'))
})
