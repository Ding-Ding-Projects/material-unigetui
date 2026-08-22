#!/usr/bin/env node
/**
 * Generates the offline documentation bundle the in-app documentation browser
 * reads.
 *
 * Every feature article under `docs/features/**\/*.md` is compiled at build
 * time into one JSON file the app ships inside its own package — no network
 * fetch, so the browser works with no connection at all. A category's
 * `README.md` is bundled too, as the index article for that category, and the
 * top-level `docs/features/README.md` becomes the bundle's own front page.
 *
 * The completeness check at the bottom is the point of this script existing
 * separately from a one-line "concat some files" job: bundling drops a file
 * exactly as easily as it includes one, and a docs browser quietly missing
 * whatever article was added most recently is worse than no bundle at all.
 * Every markdown file present on disk under docs/features must appear in the
 * written bundle by its exact id, or the build fails.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const featuresRoot = join(repoRoot, 'docs', 'features')
const outDir = join(repoRoot, 'app', 'static', 'common', 'docs')
const outFile = join(outDir, 'docs-bundle.json')

/** Every `.md` file under `docs/features`, walked recursively, sorted for a stable diff. */
function findMarkdownFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      found.push(...findMarkdownFiles(full))
    } else if (entry.toLowerCase().endsWith('.md')) {
      found.push(full)
    }
  }
  return found.sort()
}

function idFor(absolutePath) {
  return relative(featuresRoot, absolutePath).split(sep).join('/').replace(/\.md$/, '')
}

function titleFor(markdown, fallbackId) {
  const headingLine = markdown.split(/\r\n|\n|\r/).find(line => /^#\s+\S/.test(line))
  if (headingLine === undefined) return fallbackId
  return headingLine.replace(/^#\s+/, '').trim()
}

function categoryFor(id) {
  const slash = id.indexOf('/')
  return slash === -1 ? null : id.slice(0, slash)
}

const files = findMarkdownFiles(featuresRoot)
if (files.length === 0) {
  console.error('generate-docs-browser-bundle: no markdown files found under docs/features')
  process.exitCode = 1
  process.exit()
}

const articles = files.map(absolutePath => {
  const id = idFor(absolutePath)
  const body = readFileSync(absolutePath, 'utf8')
  const isIndex = /\/README$/.test(`/${id}`) || id === 'README'
  return {
    id,
    title: titleFor(body, id),
    category: categoryFor(id),
    isIndex,
    body,
  }
})

const bundle = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  articleCount: articles.length,
  articles,
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, JSON.stringify(bundle, null, 2))

// ---------------------------------------------------------------------------
// Completeness check: every markdown file on disk made it into the bundle
// under its exact id. This is what stops the bundle from silently shrinking
// when a source file is renamed, moved, or simply forgotten by a future
// change to this generator.
// ---------------------------------------------------------------------------
const bundledIds = new Set(articles.map(a => a.id))
const expectedIds = files.map(idFor)
const missing = expectedIds.filter(id => !bundledIds.has(id))

if (missing.length > 0) {
  console.error(
    `generate-docs-browser-bundle: ${missing.length} article(s) on disk are missing from the bundle:`
  )
  for (const id of missing) console.error(`  - ${id}`)
  process.exitCode = 1
  process.exit()
}

if (bundledIds.size !== expectedIds.length) {
  console.error(
    'generate-docs-browser-bundle: duplicate article id(s) in the bundle — ids collided.'
  )
  process.exitCode = 1
  process.exit()
}

console.log(
  `· docs bundle generated: ${articles.length} article(s) from docs/features -> ` +
    relative(repoRoot, outFile)
)
