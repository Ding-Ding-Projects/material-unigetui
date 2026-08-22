#!/usr/bin/env node
/**
 * Fails the build when a feature contract the published Day Teet Hui has
 * adopted is absent from the site it actually generates.
 *
 * This is a HAND-WRITTEN enumeration, not a discovery scan. A guard that only
 * validates the markers it happened to find in the HTML would pass cleanly on
 * a site missing every one of them — it could catch a contract implemented
 * wrongly, but never a contract that was never implemented at all. The list
 * below is the whole point of this file: every row states which contract the
 * site must carry and exactly how to prove it is really there, and adding a
 * contract to the site means adding its row here in the same change.
 *
 * `script/verify-site.cjs` is the sibling check that drives the real page in
 * Electron and proves the controls behave (a tab click actually switches
 * panels, a regex token actually reaches the search). This script is cheaper
 * and structural: it proves the markup and metadata for each adopted contract
 * exist in the generated output at all, so a contract cannot silently vanish
 * from the page without either check noticing.
 *
 *   npm run site:coverage
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteDir = join(repoRoot, 'site')
const indexPath = join(siteDir, 'index.html')
const cssPath = join(siteDir, 'assets', 'site.css')
const jsPath = join(siteDir, 'assets', 'site.js')

// Regenerate before checking, so this proves the contract holds for the site
// that would actually be published, not a stale copy left over from an
// earlier run.
console.log('· regenerating the site before checking its contracts')
execFileSync(process.execPath, [join('script', 'build-site.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
})

if (!existsSync(indexPath)) {
  console.error(`site-contract-coverage: ${indexPath} was not produced`)
  process.exitCode = 1
  process.exit()
}

const html = readFileSync(indexPath, 'utf8')
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : ''
const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : ''

const canonical = JSON.parse(
  readFileSync(
    join(repoRoot, 'app', 'test', 'fixtures', 'feature-completeness', 'canonical-features.json'),
    'utf8'
  )
)

/**
 * The hand-written inventory. Each entry names the contract and a `check`
 * that inspects the real generated output. A contract with no row here is a
 * contract this guard cannot protect — that is a gap in the list, and the
 * list is meant to be extended, never patched around.
 */
const CONTRACTS = [
  {
    id: 'language-modes',
    description: 'A language-mode control offering English, Cantonese, and bilingual.',
    check: () =>
      /<select[^>]*id="language-mode"[^>]*>/.test(html) &&
      /<option value="en">/.test(html) &&
      /<option value="yue">/.test(html) &&
      /<option value="bilingual">/.test(html),
  },
  {
    id: 'theme-toggle',
    description: 'A theme toggle that flips a data-theme attribute the stylesheet reads.',
    check: () =>
      /id="theme-toggle"/.test(html) &&
      /data-theme="light"/.test(html) &&
      /\[data-theme=/.test(css),
  },
  {
    id: 'browser-style-tabs',
    description: 'A real tablist with three tabs, each owning aria-controls and aria-selected.',
    check: () => {
      const hasTablist = /role="tablist"/.test(html)
      const tabMatches = [...html.matchAll(/role="tab"/g)]
      const controlsMatches = [...html.matchAll(/aria-controls="[^"]+"/g)]
      const panels = [...html.matchAll(/role="tabpanel"/g)]
      return hasTablist && tabMatches.length === 3 && controlsMatches.length >= 3 && panels.length === 3
    },
  },
  {
    id: 'feature-search-bar',
    description: 'A real search field over the feature contract table.',
    check: () =>
      /id="feature-search"[^>]*type="search"/.test(html) &&
      /id="search-status"[^>]*role="status"/.test(html),
  },
  {
    id: 'anchored-regex-builder',
    description:
      'A regex builder anchored to the feature search: a toggle, a token palette, and the regex-mode checkbox.',
    check: () => {
      const hasToggle = /id="regex-toggle"[^>]*aria-controls="regex-builder"/.test(html)
      const hasBuilder = /id="regex-builder"/.test(html)
      const tokenChips = [...html.matchAll(/class="chip" type="button" data-token="[^"]*"/g)]
      const hasUseRegex = /id="use-regex"/.test(html)
      // Tokens are decoration only if the page never wires them anywhere —
      // confirm the script actually reads data-token off the chips.
      const scriptReadsTokens = /data-token/.test(js)
      return hasToggle && hasBuilder && tokenChips.length >= 8 && hasUseRegex && scriptReadsTokens
    },
  },
  {
    id: 'feature-contract-table',
    description:
      'A generated feature-contract table whose row count matches the canonical inventory exactly, so the site cannot silently drop or fabricate rows.',
    check: () => {
      const rows = [...html.matchAll(/data-feature-row/g)]
      return rows.length === canonical.features.length
    },
  },
  {
    id: 'honest-status',
    description:
      'The site states plainly that no installer exists yet, rather than reading as a finished product.',
    check: () => /Not released yet/.test(html) && /There is no installer to download/.test(html),
  },
  {
    id: 'shared-link-embed',
    description:
      'A real, absolute-https, product-specific Open Graph image, sized, alt-texted, and paired with the large-image Twitter card so a pasted link renders a picture rather than a blank card.',
    check: () => {
      const ogImage = html.match(/property="og:image" content="([^"]+)"/)
      if (!ogImage) return false
      const url = ogImage[1]
      const absoluteHttps = /^https:\/\//.test(url)
      const hasSize =
        /property="og:image:width" content="\d+"/.test(html) &&
        /property="og:image:height" content="\d+"/.test(html)
      const hasAlt = /property="og:image:alt" content="[^"]+"/.test(html)
      const largeCard = /name="twitter:card" content="summary_large_image"/.test(html)
      const themeColor = /name="theme-color" content="#[0-9A-Fa-f]{6}"/.test(html)
      return absoluteHttps && hasSize && hasAlt && largeCard && themeColor
    },
  },
  {
    id: 'no-cdn-assets',
    description:
      'Every stylesheet, script, and font the page loads is relative to this origin — no CDN, no remote font.',
    check: () => {
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
      const external = hrefs.filter(
        u => /^https?:\/\//.test(u) && !u.startsWith('https://ding-ding-projects.github.io/material-unigetui/')
      )
      // The repository "Source" link is allowed to point off-origin; every
      // asset load (stylesheet/script) must not.
      const assetExternal = external.filter(u => /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(u))
      return assetExternal.length === 0
    },
  },
  {
    id: 'per-visitor-privacy-statement',
    description: 'The page states plainly that settings are local and nothing is tracked.',
    check: () => /no CDN, no remote|no analytics/.test(html) && /stored in this browser only/.test(html),
  },
  {
    id: 'responsive-viewport',
    description: 'A real responsive viewport meta tag, not a fixed desktop layout.',
    check: () => /name="viewport" content="width=device-width, initial-scale=1"/.test(html),
  },
  {
    id: 'source-link',
    description: 'A link back to the repository, so the page is not a dead end for anyone who wants the code.',
    check: () => /class="btn btn--filled" href="https:\/\/github\.com\//.test(html),
  },
]

// ---------------------------------------------------------------------------
// Run every check, report every one (not just the first failure), and fail
// the build on any miss.
// ---------------------------------------------------------------------------
let failures = 0
for (const contract of CONTRACTS) {
  let ok = false
  let error = null
  try {
    ok = Boolean(contract.check())
  } catch (err) {
    error = err
  }
  if (ok) {
    console.log(`✔ ${contract.id} — ${contract.description}`)
  } else {
    failures += 1
    console.error(`✖ ${contract.id} — ${contract.description}`)
    if (error) console.error(`  threw: ${error.message}`)
  }
}

console.log(`\n${CONTRACTS.length - failures}/${CONTRACTS.length} site contracts covered`)

if (failures > 0) {
  console.error(
    `\nsite-contract-coverage: ${failures} adopted contract(s) are missing from the published site.`
  )
  process.exitCode = 1
}
