#!/usr/bin/env node
/**
 * Keeps the evidence manifest in step with the canonical feature list.
 *
 * Adds a row for any canonical feature that has none, removes rows for
 * features that no longer exist, and reorders to match. It NEVER overwrites an
 * existing evidence record: those carry hand-written reasons, and regenerating
 * them would quietly replace an honest "not built yet, because…" with a
 * default that says nothing.
 *
 * Run it after adopting a contract; the guard test is what enforces the result.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(repoRoot, 'app', 'test', 'fixtures', 'feature-completeness')
const canonicalPath = join(fixtures, 'canonical-features.json')
const manifestPath = join(fixtures, 'evidence-paths.json')

export const EVIDENCE_DIMENSIONS = [
  'implementation',
  'documentation',
  'localization',
  'persistence',
  'focusedTest',
  'builtArtifactInteraction',
  'realCapture',
]

/** Digest of the canonical list, so a rename or reorder cannot pass unnoticed. */
export function canonicalDigest(features) {
  return createHash('sha256').update(JSON.stringify(features)).digest('hex')
}

function emptyEvidence() {
  const evidence = {}
  for (const dimension of EVIDENCE_DIMENSIONS) {
    evidence[dimension] = [
      { status: 'pending', reason: 'Not started; this contract has been adopted but nothing has been built for it yet.' },
    ]
  }
  return evidence
}

function main() {
  const canonical = JSON.parse(readFileSync(canonicalPath, 'utf8'))

  let existing = { features: [] }
  try {
    existing = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    // First run; there is nothing to preserve.
  }

  const byId = new Map((existing.features ?? []).map(row => [row.id, row]))

  const features = canonical.features.map(feature => {
    const previous = byId.get(feature.id)
    return previous ?? { id: feature.id, evidence: emptyEvidence() }
  })

  const dropped = [...byId.keys()].filter(
    id => !canonical.features.some(f => f.id === id)
  )

  const manifest = {
    schemaVersion: 2,
    canonicalFeatureDigest: canonicalDigest(canonical.features),
    dimensions: EVIDENCE_DIMENSIONS,
    features,
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  const added = features.filter(f => !byId.has(f.id)).length
  console.log(
    `· evidence manifest: ${features.length} rows (${added} added, ${dropped.length} dropped)`
  )
  if (dropped.length > 0) {
    console.log(`  dropped: ${dropped.join(', ')}`)
  }
}

if (process.argv[1] && process.argv[1].endsWith('sync-evidence-manifest.mjs')) {
  main()
}
