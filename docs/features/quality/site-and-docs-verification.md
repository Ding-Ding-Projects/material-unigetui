# Site contract coverage and the offline docs bundle

## Behaviour

Two npm scripts were declared in `package.json` and pointed at files that did
not exist — `npm run generate:docs-bundle` and `npm run site:coverage` both
failed with `MODULE_NOT_FOUND`. This article covers the two scripts that now
back them, plus the unit tests added alongside them to close a second gap: a
newly ported layer of UI (the top app bar, the nav drawer, the tab strip, the
`Icon` component and the Material Design 3 token layer) had no test coverage
at all.

### `script/site-contract-coverage-test.mjs` (`npm run site:coverage`)

Regenerates the Day Teet Hui via `script/build-site.mjs`, then checks the
freshly generated `site/index.html`, `site/assets/site.css` and
`site/assets/site.js` against a **hand-written** list of the feature contracts
this project's site has adopted: the three-mode language selector, the theme
toggle, the real `role="tablist"` tab strip, the feature search field, the
anchored regex builder actually wired to the search (token chips read by the
page's own script, not decoration), the generated feature-contract table
(row count checked against the canonical inventory, not just "a table
exists"), the honest not-yet-released status copy, the shared-link Open Graph
embed (absolute HTTPS image, sized, alt-texted, paired with
`summary_large_image`), the no-CDN/no-remote-asset rule, the per-visitor
privacy statement, the responsive viewport tag, and the link back to the
source repository.

It is deliberately hand-written rather than a discovery scan. A guard that
only validates markers it already found in the HTML would pass cleanly on a
site carrying none of these contracts — it can catch a contract implemented
wrongly, but never a contract that was never implemented. Every row in the
list states which contract must exist and exactly how the check proves it is
there.

This is the structural sibling of `script/verify-site.cjs`, which drives the
real page in Electron and proves the controls behave (a tab click really
switches panels, a regex token really reaches the search). This script is
cheaper and proves the markup and metadata exist at all; `verify-site.cjs`
proves they work. A contract can only vanish from the page unnoticed if it
somehow slips past both.

### `script/generate-docs-browser-bundle.mjs` (`npm run generate:docs-bundle`)

Walks every `.md` file under `docs/features/`, and writes
`app/static/common/docs/docs-bundle.json` — one JSON file containing every
feature article's id, title, category and full body text, so the in-app
documentation browser can read every article with no network request. A
category's own `README.md` becomes that category's index article; the
top-level `docs/features/README.md` becomes the bundle's front page.

The completeness check at the end of the script is the reason it exists as a
generator rather than a one-line concatenation: it re-derives the expected
article id list straight from the files on disk and fails the build if any
id present on disk is missing from the written bundle. Bundling drops a file
exactly as easily as it includes one, and a docs browser quietly missing
whatever article was most recently added is worse than no bundle at all.

### The verification tests

Added under `app/test/unit/`, compiled and run by the existing
`node script/test.mjs`:

- `icon-component-test.mjs` — renders the `Icon` component
  (`app/src/ui/md3/icon.tsx`) with `react-dom/server` and asserts it renders
  its ligature name as literal text content, is always `aria-hidden`, sets
  the Material Symbols Rounded font family, honours `size` and `filled`.
- `icon-ligature-usage-test.mjs` — extracts every `<Icon name="...">` usage
  (both literal and dynamic, e.g. a ternary inside `name={...}`) from every
  `.tsx` file under `app/src/ui`, and proves each one resolves to a real
  ligature in the vendored Material Symbols Rounded font by parsing the
  font's own WOFF2/GSUB tables directly — the same technique
  `script/validate-material-symbols.mjs` uses against the design reference,
  reproduced here because that script has no exports and this lane could not
  edit it to add any.
- `md3-token-contract-test.mjs` — extracts every `var(--x)` reference under
  `app/src/ui` and proves each one is actually declared by
  `md3-style-contract.ts`'s palette and static-token output, plus a
  line-anchored scan proving no color role is declared twice with a
  different value in the same palette's source text.
- `top-app-bar-nav-drawer-tabs-structure-test.mjs` — `TopAppBar` and
  `NavDrawer` are private functions inside `app.tsx` and could not be
  rendered directly without exporting them (out of scope for this lane), so
  these are line-anchored source assertions: every icon-only top app bar
  button has an `aria-label`, the menu toggle reflects `drawerOpen`, the
  drawer is a real `<nav>` landmark, and the tab strip's `role="tab"` /
  `aria-selected` / roving `tabIndex` are present with `aria-controls`
  cross-checked against a real `role="tabpanel"` id in `app.tsx`.
- `ported-ui-localization-test.mjs` — scans `app.tsx` and `tabs.tsx` for JSX
  text that bypasses the translation layer, and separately proves
  `i18n-resources.ts` declares no translation key twice (a real risk when
  several lanes append entries to one object literal in parallel).

### A real defect this exposed

`app.tsx (top app bar, nav drawer, About, NotYetPorted) has no hard-coded JSX
text` **fails on purpose** and is left failing. `AboutRoute` (around line
475) renders its entire body — heading, three cards, the "Open that folder"
button — as literal English with no `t()`/`a()` call anywhere in the
component. `NotYetPorted`'s "This surface is designed but not yet built."
(around line 528) does the same one line above a working `t()` call in the
same component. Neither string reaches the Cantonese or bilingual modes, and
neither is styled by the funny-level sliders. This was not fixed here — it
sits outside this lane's allowed paths — and the test is not weakened or
skipped to hide it.

Every guard added here was proven red before green: each has either a
dedicated self-check test using a synthetic broken input, or was verified by
temporarily breaking the real file it inspects and confirming the failure,
then restoring it.

## Configuration

Both scripts take no arguments. `site-contract-coverage-test.mjs` always
regenerates the site first, so it can never pass against stale output.
`generate-docs-browser-bundle.mjs` writes to
`app/static/common/docs/docs-bundle.json`, creating the directory if needed.

## Failure modes

- `site:coverage` fails when the site fails to build, or when any contract
  in its hand-written list cannot be proven present in the regenerated
  output — it prints every contract's pass/fail, not just the first miss.
- `generate:docs-bundle` fails when no markdown files are found, when an
  article on disk does not appear in the written bundle under its exact id,
  or when two articles collide on the same id.

## Verification

`npm run site:coverage`, `npm run generate:docs-bundle`, and
`node script/test.mjs` all exit 0 on a clean checkout. The localization test
above is the one intentional exception, documenting a real gap rather than
hiding it.
