# The README capture matrix

## What it is

A reproducible harness, `script/capture-matrix.mjs`, that photographs the real
built application and writes the results straight into
`docs/assets/screenshots/`, alongside a `manifest.json` recording the exact
commit, the capture method, and a note for every image (including the ones it
could not take, and why).

It exists because a screenshot is either current or actively misleading, and
there is no safe middle state. A stale capture is worse than none: it is
confidently wrong, and a reader has no way to tell the difference from a
current one just by looking. The only defence is a script cheap enough to
re-run every time the interface changes.

## How it captures

The harness does not use the low-level computer-use route. It builds nothing
itself — run `npm run build` first — then launches the real packaged renderer
(`app/main.js`, `app/index.html`, the same files Electron loads at runtime)
with `--remote-debugging-port`, and drives it purely over the Chrome
DevTools Protocol using Node's built-in `fetch` and `WebSocket` (Node 22+),
with no external dependencies. Every image is `Page.captureScreenshot`
against the one page target that is actually running.

Three checks make the result trustworthy rather than merely plausible:

- **Sole-target verification.** Before touching anything, the harness lists
  every CDP target and refuses to continue unless exactly one `page` target
  exists.
- **Checkout verification.** It compares that target's URL against the exact
  `app/index.html` path inside *this* checkout, and refuses to capture if
  they differ. This matters because Electron's single-instance lock silently
  forwards a second launch to whichever instance is already running
  elsewhere on the machine — the first version of this harness attached to a
  running instance in a sibling checkout and would have photographed the
  wrong build without any error. A per-run `--user-data-dir` under
  `.capture-user-data/` (git-ignored) now isolates each run, and the URL
  check catches the case even if isolation is ever removed.
- **Stable selectors, not text matching.** Navigation uses the real DOM ids
  the app renders (`#nav-<routeId>`, `#settings-tab-<tabId>`), not
  text-content matching — a nav item's visible text also contains its
  Material Symbols ligature name (e.g. `exploreDiscover packages`), which
  silently defeats a `textContent.startsWith(label)` check.

## What it covers

Every primary and tools route, three Settings tabs (General, Appearance,
Localization), the anchored regex builder on the Discover search field, the
tab strip's search panel, the command palette (`Ctrl+Shift+F`), dark theme,
and a 480px-wide viewport capture (via CDP device-metrics emulation, since the
window's real `minWidth` of 1280 cannot go narrower).

Two deliberate exclusions, both privacy-motivated and unchanged from the
original matrix: there is no screenshot of Installed or Software updates
screens populated with real package data, because that is the machine's real
software inventory and does not belong in a public repository. The captures
that do exist for those routes show the honest loading/empty state instead.

## What it found

Two real interaction defects in the ported UI surfaced only by driving the
built application rather than by reading source:

1. **The top-app-bar theme toggle does nothing.** `app/src/ui/app.tsx`
   (`onClick={toggleTheme}`, around line 106) fires its click event — verified
   with an added native listener and with a real CDP
   `Input.dispatchMouseEvent` at the button's coordinates — with no exception
   or console warning, and yet `document.documentElement`'s `data-theme`
   attribute and computed MD3 palette custom properties never change, even
   after a 3-second wait. Driving the same theme change through
   Settings → Appearance → Theme (a plain `<select>` wired through the real
   settings IPC bridge) works correctly and is what this harness uses for its
   dark-theme capture. Not fixed here — see the report in the worktree
   session that produced this matrix.
2. **The nav drawer has no responsive behaviour at narrow widths.**
   `app/src/ui/app.css` line 69-72 gives `.nav-drawer` a fixed
   `width: 256px` with no `@media` rule anywhere in the stylesheet to
   collapse or overlay it below that. At a 480px viewport this leaves under
   200px for actual content and clips the top app bar's title and
   right-hand icon cluster. Not fixed here.

## Reproducing it

```bash
npm install
node script/ensure-electron-binary.mjs
npm run build
node script/capture-matrix.mjs
```

Every capture is committed under `docs/assets/screenshots/`, and
`docs/assets/screenshots/manifest.json` records the exact commit, method, and
per-image note the run produced.
