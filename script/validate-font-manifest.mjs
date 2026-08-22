#!/usr/bin/env node
'use strict'

// Verifies that every file recorded in app/static/common/fonts/manifest.json
// exists on disk and its bytes still hash to the recorded SHA-256. This is a
// supply-chain check: it is the one guard standing between "a font file sits
// in the repository" and "a font file that was tampered with, truncated, or
// swapped sits in the repository and nobody would know".
//
// Exit 0: every recorded file exists and matches. Exit non-zero: prints the
// exact offending file(s) and stops.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FONTS_DIR = path.join(REPO_ROOT, 'app', 'static', 'common', 'fonts')
const MANIFEST_PATH = path.join(FONTS_DIR, 'manifest.json')

async function sha256File(filePath) {
  const buf = await readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`validate-font-manifest: manifest not found at ${MANIFEST_PATH}`)
    process.exitCode = 1
    return
  }

  let manifest
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  } catch (err) {
    console.error(`validate-font-manifest: manifest is not valid JSON: ${err.message}`)
    process.exitCode = 1
    return
  }

  const files = manifest.files || {}
  const names = Object.keys(files)
  if (names.length === 0) {
    console.error('validate-font-manifest: manifest lists zero files - nothing to verify, treating as failure')
    process.exitCode = 1
    return
  }

  const problems = []
  for (const name of names) {
    const record = files[name]
    const filePath = path.join(FONTS_DIR, name)
    if (!existsSync(filePath)) {
      problems.push(`MISSING: ${name} (recorded for ${record?.family ?? 'unknown family'})`)
      continue
    }
    if (!record?.sha256 || typeof record.sha256 !== 'string') {
      problems.push(`NO DIGEST RECORDED: ${name}`)
      continue
    }
    const actual = await sha256File(filePath)
    if (actual !== record.sha256) {
      problems.push(
        `DIGEST MISMATCH: ${name}\n  expected sha256 ${record.sha256}\n  actual   sha256 ${actual}`,
      )
    }
  }

  if (problems.length > 0) {
    console.error(`validate-font-manifest: ${problems.length} problem(s) found:\n`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }

  console.log(`validate-font-manifest: OK - ${names.length} font file(s) match their recorded SHA-256 digest.`)
}

main()
