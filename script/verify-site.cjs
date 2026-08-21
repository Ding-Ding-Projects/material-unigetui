/**
 * Verifies the generated Day Teet Hui by loading and driving the real page.
 *
 *   npx electron script/verify-site.cjs
 *
 * Checks behaviour, not markup: that the tabs actually switch panels, that the
 * search actually filters rows, that the regex builder's tokens actually reach
 * the search, and that nothing on the page requests an off-origin asset. A
 * control that looks right and does nothing is the exact defect the contracts
 * forbid, and it is invisible to a source read.
 */
const { app, BrowserWindow } = require('electron')
const { join } = require('path')

const repoRoot = join(__dirname, '..')
const results = []

function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail })
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true },
  })

  const requested = []
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    requested.push(details.url)
    callback({ cancel: false })
  })

  await window.loadFile(join(repoRoot, 'site', 'index.html'))
  await new Promise(resolve => setTimeout(resolve, 400))

  // Start as a fresh visitor. Persisted state from a previous run made an
  // earlier version of this script fail the theme check for the wrong reason:
  // the toggle worked perfectly and the assertion was simply stale.
  await window.webContents.executeJavaScript('localStorage.clear()', true)
  await window.webContents.reload()
  await new Promise(resolve => setTimeout(resolve, 700))

  const run = js => window.webContents.executeJavaScript(js, true)

  // --- the page rendered at all ---
  check(
    'feature rows were generated',
    (await run(`document.querySelectorAll('[data-feature-row]').length`)) === 62,
    '62 canonical contracts'
  )

  // --- tabs really switch ---
  await run(`document.querySelector('[data-tab="features"]').click()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  check(
    'clicking a tab reveals its panel and hides the others',
    (await run(
      `!document.getElementById('panel-features').hidden &&
       document.getElementById('panel-overview').hidden &&
       document.getElementById('tab-features').getAttribute('aria-selected') === 'true'`
    )) === true
  )

  // --- plain-text search really filters ---
  await run(`(() => {
    const i = document.getElementById('feature-search')
    i.value = 'tab'
    i.dispatchEvent(new Event('input'))
  })()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  const plainVisible = await run(
    `Array.from(document.querySelectorAll('[data-feature-row]')).filter(r => !r.hidden).length`
  )
  check(
    'plain-text search filters the table',
    plainVisible > 0 && plainVisible < 62,
    `${plainVisible} of 62 rows shown for "tab"`
  )

  // --- the regex builder token reaches the search and turns regex on ---
  await run(`(() => {
    const i = document.getElementById('feature-search')
    i.value = ''
    i.dispatchEvent(new Event('input'))
    document.getElementById('regex-toggle').click()
    document.querySelector('#regex-builder .chip[data-token="^"]').click()
  })()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  check(
    'a builder token is inserted and switches the field into regex mode',
    (await run(
      `document.getElementById('feature-search').value.includes('^') &&
       document.getElementById('use-regex').checked === true`
    )) === true
  )

  // --- a real regex filters ---
  await run(`(() => {
    const i = document.getElementById('feature-search')
    i.value = '^tab-'
    i.dispatchEvent(new Event('input'))
  })()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  const regexVisible = await run(
    `Array.from(document.querySelectorAll('[data-feature-row]')).filter(r => !r.hidden).length`
  )
  check(
    'an anchored regex filters to just the tab contracts',
    regexVisible === 4,
    `${regexVisible} rows matched /^tab-/`
  )

  // --- an unfinished expression says so instead of blanking the page ---
  await run(`(() => {
    const i = document.getElementById('feature-search')
    i.value = '('
    i.dispatchEvent(new Event('input'))
  })()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  check(
    'an invalid expression reports itself rather than showing nothing',
    (await run(
      `document.getElementById('search-status').getAttribute('data-invalid') === 'true' &&
       Array.from(document.querySelectorAll('[data-feature-row]')).filter(r => !r.hidden).length === 62`
    )) === true
  )

  // --- theme toggle really changes the document ---
  const themeBefore = await run(`document.documentElement.getAttribute('data-theme')`)
  await run(`document.getElementById('theme-toggle').click()`)
  await new Promise(resolve => setTimeout(resolve, 120))
  const themeAfter = await run(`document.documentElement.getAttribute('data-theme')`)
  check(
    'the theme toggle switches the document theme',
    themeBefore !== themeAfter,
    themeBefore + ' -> ' + themeAfter
  )

  // --- language mode really re-renders copy ---
  await run(`(() => {
    const s = document.getElementById('language-mode')
    s.value = 'bilingual'
    s.dispatchEvent(new Event('change'))
  })()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  check(
    'bilingual mode renders both languages',
    (await run(`document.querySelector('[data-string="tagline"]').textContent.includes('·')`)) === true
  )

  // --- no page body sideways scroll at a phone width ---
  window.setContentSize(360, 800)
  await new Promise(resolve => setTimeout(resolve, 250))
  check(
    'the page body does not scroll sideways at 360px',
    (await run(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`)) === true
  )

  // --- everything is served from this origin ---
  const offOrigin = requested.filter(url => !url.startsWith('file://'))
  check(
    'no off-origin asset was requested',
    offOrigin.length === 0,
    offOrigin.length === 0 ? 'all assets local' : offOrigin.join(', ')
  )

  const failed = results.filter(r => !r.ok)
  for (const result of results) {
    console.log(
      `${result.ok ? '✔' : '✖'} ${result.name}${result.detail ? ' — ' + result.detail : ''}`
    )
  }
  console.log(`\n${results.length - failed.length}/${results.length} site checks passed`)
  app.exit(failed.length === 0 ? 0 : 1)
})
