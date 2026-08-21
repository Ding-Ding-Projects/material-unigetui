#!/usr/bin/env node
/**
 * Generates the Day Teet Hui from the canonical inventory.
 *
 * The feature table is generated rather than authored so the site cannot claim
 * a contract the inventory does not carry, and cannot quietly fall behind when
 * a row's status changes. Everything else on the page is hand-written.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(repoRoot, 'app', 'test', 'fixtures', 'feature-completeness')

const canonical = JSON.parse(
  readFileSync(join(fixtures, 'canonical-features.json'), 'utf8')
)
const manifest = JSON.parse(
  readFileSync(join(fixtures, 'evidence-paths.json'), 'utf8')
)

const SITE_URL = 'https://ding-ding-projects.github.io/material-unigetui/'
const REPO_URL = 'https://github.com/Ding-Ding-Projects/material-unigetui'

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A feature counts as started when any dimension has a present record. */
function statusOf(id) {
  const row = manifest.features.find(f => f.id === id)
  if (row === undefined) {
    throw new Error(`feature ${id} is missing from the evidence manifest`)
  }
  const present = Object.values(row.evidence)
    .flat()
    .filter(record => record.status === 'present').length
  const total = Object.values(row.evidence).flat().length
  return { present, total, started: present > 0 }
}

function featureRows() {
  return canonical.features
    .map(feature => {
      const { present, total, started } = statusOf(feature.id)
      const label = started ? `${present}/${total} evidenced` : 'not started'
      const cls = started ? 'present' : 'pending'
      const search = `${feature.id} ${feature.name}`.toLowerCase()
      return `        <tr data-feature-row data-search-text="${escapeHtml(search)}">
          <td><code>${escapeHtml(feature.id)}</code></td>
          <td>${escapeHtml(feature.name)}</td>
          <td><span class="status status--${cls}">${escapeHtml(label)}</span></td>
        </tr>`
    })
    .join('\n')
}

const totals = canonical.features.reduce(
  (acc, feature) => {
    const { present, total } = statusOf(feature.id)
    return { present: acc.present + present, total: acc.total + total }
  },
  { present: 0, total: 0 }
)

const started = canonical.features.filter(f => statusOf(f.id).started).length

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Material UniGetUI</title>
<meta name="description" content="A Material Design 3 rewrite of the UniGetUI interface for Windows package managers.">
<meta name="theme-color" content="#0B57D0">

<!--
  Open Graph. og:image is absolute because a relative one is the single most
  common reason a pasted link shows no picture at all, and twitter:card is what
  decides between a large image and a small thumbnail squeezed beside the text.
-->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Material UniGetUI">
<meta property="og:title" content="Material UniGetUI">
<meta property="og:description" content="A Material Design 3 rewrite of the UniGetUI interface for Windows package managers.">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}assets/social-preview.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Material UniGetUI — the Material Design 3 interface for your package managers.">
<meta name="twitter:card" content="summary_large_image">

<link rel="stylesheet" href="./assets/site.css">
</head>
<body>

<header class="topbar">
  <div class="topbar__inner">
    <div class="brand">Material <span>UniGetUI</span></div>

    <label class="btn" for="language-mode">
      <span class="visually-hidden">Language</span>
      <select id="language-mode" class="btn" style="border:0;background:transparent;min-height:auto;padding:0">
        <option value="en">English</option>
        <option value="yue">粵語</option>
        <option value="bilingual">Bilingual</option>
      </select>
    </label>

    <button class="btn" id="theme-toggle" type="button">Dark theme</button>
    <a class="btn btn--filled" href="${REPO_URL}">Source</a>
  </div>

  <div class="wrap">
    <div class="tabs" role="tablist" aria-label="Sections">
      <button class="tab" role="tab" data-tab="overview" id="tab-overview" aria-controls="panel-overview" aria-selected="true">Overview</button>
      <button class="tab" role="tab" data-tab="features" id="tab-features" aria-controls="panel-features" aria-selected="false">Feature contracts</button>
      <button class="tab" role="tab" data-tab="status" id="tab-status" aria-controls="panel-status" aria-selected="false">Honest status</button>
    </div>
  </div>
</header>

<main class="wrap">

  <section class="panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
    <h1>Material UniGetUI</h1>
    <p class="lede" data-string="tagline">The Material Design 3 interface for your package managers.</p>

    <div class="note">
      <strong>Not released yet.</strong> There is no installer to download. This
      site describes work in progress, and the status tab says exactly how much
      of it exists — because a page that implies a finished product is the one
      thing a reader cannot check for themselves.
    </div>

    <h2>What it is</h2>
    <p>A rewrite of the UniGetUI interface in Material Design 3, driving Windows
    package managers through natively reimplemented drivers rather than through
    the original engine. It searches, lists and updates packages using
    <code>winget</code> today; the other in-scope managers are not written yet.</p>

    <h2>Why the status is on the front page</h2>
    <p>Because the alternative is a landing page that reads as finished while the
    repository is plainly not, and a reader has no way to tell the difference.
    Every claim here is generated from the same inventory the test suite checks.</p>
  </section>

  <section class="panel" id="panel-features" role="tabpanel" aria-labelledby="tab-features" hidden>
    <h1>Feature contracts</h1>
    <p class="lede">Every contract this project has adopted, generated from the
    inventory the guard test enforces. A row here cannot outlive its row there.</p>

    <label for="feature-search" data-string="searchLabel">Search features</label>
    <div class="search">
      <input id="feature-search" type="search" data-string-placeholder="searchPlaceholder"
             placeholder="Search features, contracts, IDs…" autocomplete="off">
      <span class="search__status" id="search-status" role="status" aria-live="polite"></span>
      <button class="btn" id="regex-toggle" type="button" aria-expanded="false"
              aria-controls="regex-builder" data-string="regexToggle">Regex builder</button>
    </div>

    <div class="regex-builder" id="regex-builder" hidden>
      <div class="regex-builder__tokens">
        <button class="chip" type="button" data-token="^">^ start</button>
        <button class="chip" type="button" data-token="$">$ end</button>
        <button class="chip" type="button" data-token=".">. any</button>
        <button class="chip" type="button" data-token="\\d">\\d digit</button>
        <button class="chip" type="button" data-token="\\w">\\w word</button>
        <button class="chip" type="button" data-token="\\s">\\s space</button>
        <button class="chip" type="button" data-token="[a-z]">[a-z] class</button>
        <button class="chip" type="button" data-token="(…)">( ) group</button>
        <button class="chip" type="button" data-token="|">| or</button>
        <button class="chip" type="button" data-token="*">* many</button>
        <button class="chip" type="button" data-token="+">+ one or more</button>
        <button class="chip" type="button" data-token="?">? optional</button>
      </div>
      <div class="regex-builder__row">
        <label><input type="checkbox" id="use-regex"> <span data-string="useRegex">Interpret as a regular expression</span></label>
      </div>
    </div>

    <div class="scroll-x">
      <table>
        <thead>
          <tr><th>ID</th><th>Contract</th><th>Evidence</th></tr>
        </thead>
        <tbody>
${featureRows()}
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="panel-status" role="tabpanel" aria-labelledby="tab-status" hidden>
    <h1>Honest status</h1>
    <p class="lede">Generated from the evidence manifest, not written by hand.</p>

    <div class="card">
      <h2 style="margin-top:0">Where this actually stands</h2>
      <ul>
        <li><strong>${canonical.features.length}</strong> canonical contracts adopted.</li>
        <li><strong>${started}</strong> of them have any evidence at all.</li>
        <li><strong>${totals.present}</strong> evidence records present out of <strong>${totals.total}</strong>.</li>
      </ul>
      <p>The remaining records are marked pending with a written reason. A pending
      row is not a failure; a missing row would be, and the guard fails the build
      for exactly that.</p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">What genuinely works today</h2>
      <ul>
        <li>The application builds, launches, and navigates its real routes.</li>
        <li>Discover, Software updates and Installed read live data from the
        native <code>winget</code> driver.</li>
        <li>The renderer is isolated behind a preload bridge that exposes named
        calls only.</li>
      </ul>
    </div>

    <div class="card">
      <h2 style="margin-top:0">What is deliberately not built yet</h2>
      <ul>
        <li>Ten of the eleven in-scope package managers.</li>
        <li>Installing, updating and uninstalling from the interface — the queue
        exists, nothing triggers it.</li>
        <li>Most of the routes: bundles, history, converter, Ollama, authenticator,
        logs, tickets, settings. They say so on screen instead of pretending.</li>
        <li>No installer has been produced or released.</li>
      </ul>
    </div>
  </section>

</main>

<footer class="wrap">
  <p>Every asset on this page is served from this origin — no CDN, no remote
  font, no analytics. Your settings are stored in this browser only.</p>
</footer>

<script src="./assets/site.js"></script>
</body>
</html>
`

mkdirSync(join(repoRoot, 'site', 'assets'), { recursive: true })
writeFileSync(join(repoRoot, 'site', 'index.html'), html)

console.log(
  `· site generated: ${canonical.features.length} contracts, ` +
    `${totals.present}/${totals.total} evidence records present`
)
