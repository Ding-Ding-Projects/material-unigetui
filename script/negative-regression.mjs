#!/usr/bin/env node
/**
 * Proves the completeness guard is a guard and not a decoration.
 *
 * For each sabotage below: break exactly one asserted thing, run the guard,
 * require it to FAIL, restore the file, and require it to pass again. A guard
 * nobody has watched fail proves nothing — and this repository has already been
 * bitten once by a fixture whose protection was assumed rather than tested.
 *
 * Every file is restored in a finally block, so an interrupted run cannot leave
 * sabotage on disk.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const GUARD = 'app/test/unit/feature-completeness-test.mjs'

/** Each sabotage names what it is meant to simulate, in the words of the risk. */
const SABOTAGES = [
  {
    name: 'a canonical feature is quietly deleted from the inventory',
    file: 'app/test/fixtures/feature-completeness/canonical-features.json',
    apply: text => {
      const parsed = JSON.parse(text)
      parsed.features.splice(3, 1)
      return JSON.stringify(parsed, null, 2) + '\n'
    },
  },
  {
    name: 'a canonical feature is renamed without regenerating the manifest',
    file: 'app/test/fixtures/feature-completeness/canonical-features.json',
    apply: text => text.replace('"id": "toy-locks"', '"id": "toy-locks-v2"'),
  },
  {
    name: 'an evidence row loses a dimension',
    file: 'app/test/fixtures/feature-completeness/evidence-paths.json',
    apply: text => {
      const parsed = JSON.parse(text)
      delete parsed.features[0].evidence.realCapture
      return JSON.stringify(parsed, null, 2) + '\n'
    },
  },
  {
    name: 'a present record points at a file that does not exist',
    file: 'app/test/fixtures/feature-completeness/evidence-paths.json',
    apply: text =>
      text.replace(
        'app/src/main-process/manager-drivers/winget-driver.ts',
        'app/src/main-process/manager-drivers/does-not-exist.ts'
      ),
  },
  {
    name: 'a pending record drops its explanation',
    file: 'app/test/fixtures/feature-completeness/evidence-paths.json',
    apply: text => {
      const parsed = JSON.parse(text)
      parsed.features[0].evidence.documentation = [{ status: 'pending' }]
      return JSON.stringify(parsed, null, 2) + '\n'
    },
  },
  {
    name: 'an exported declaration is renamed so a substring check would miss it',
    file: 'app/src/main-process/manager-drivers/winget-table-parser.ts',
    apply: text =>
      text.replace(
        'export function parseWinGetTable(',
        'export function parseWinGetTableV2('
      ),
  },
  {
    name: 'a wiring line is commented out rather than deleted',
    file: 'app/src/preload.ts',
    apply: text =>
      text.replace(
        "contextBridge.exposeInMainWorld('materialUniGetUi', bridge)",
        "// contextBridge.exposeInMainWorld('materialUniGetUi', bridge)"
      ),
  },
  {
    name: 'renderer isolation is turned off',
    file: 'app/src/main-process/app-window.ts',
    apply: text => text.replace('contextIsolation: true,', 'contextIsolation: false,'),
  },
  {
    name: 'a raw colour is introduced into the chrome stylesheet',
    file: 'app/src/ui/app.css',
    apply: text => text.replace('background: var(--sfc);', 'background: #ff00ff;'),
  },
]

function runGuard() {
  const result = spawnSync('node', ['--test', GUARD], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
  })
  return result.status === 0
}

function main() {
  if (!runGuard()) {
    console.error('✖ the guard is already failing; fix that before probing it')
    process.exit(1)
  }
  console.log(`· baseline: guard passes (${SABOTAGES.length} sabotages to try)\n`)

  let failures = 0

  for (const sabotage of SABOTAGES) {
    const full = join(repoRoot, sabotage.file)
    const original = readFileSync(full, 'utf8')
    let caught = false

    try {
      const broken = sabotage.apply(original)
      if (broken === original) {
        console.log(`✖ ${sabotage.name}\n    sabotage did not apply — the probe is stale`)
        failures += 1
        continue
      }
      writeFileSync(full, broken)
      caught = !runGuard()
    } finally {
      writeFileSync(full, original)
    }

    if (caught) {
      console.log(`✔ caught: ${sabotage.name}`)
    } else {
      console.log(`✖ NOT CAUGHT: ${sabotage.name}\n    (${sabotage.file})`)
      failures += 1
    }
  }

  if (!runGuard()) {
    console.error('\n✖ guard does not pass after restore; a file was left sabotaged')
    process.exit(1)
  }

  console.log(
    `\n· restored, guard green again — ${SABOTAGES.length - failures}/${SABOTAGES.length} sabotages caught`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
