# Package screens: Discover, Software updates, Installed

The three package list screens (`app/src/ui/package-routes.tsx`, rendered by
`app/src/ui/app.tsx`'s `DiscoverRoute`, `UpdatesRoute` and `InstalledRoute`)
share one `PackageTable` component, ported from the checked-in design
reference's `<sc-if value="{{ rPkgs }}">` section
(`design/Material UniGetUI v2.dc.html`).

## What the row shows

Each row carries, left to right:

- a checkbox for bulk selection,
- on the Software updates screen only, a star toggle that ignores future
  updates for that package (see below),
- a letter avatar in a colour derived from the package name,
- the name, its manager-scoped ID, and the reporting manager,
- the source, as a small chip, when the manager reported one,
- the installed version, or `installed → available` when an update exists,
- an install-options icon button (`tune`),
- an installer link (`download_2`) that opens the package's reported source
  URL in the system browser when it is an `http`/`https` URL, and is
  disabled with an honest reason otherwise,
- the row's primary action as a filled icon button (`download` for Discover,
  `upgrade` for Updates, `sync` for Installed's row action).

## Install options

Clicking the `tune` icon opens `InstallOptionsDialog`, a design-matched
modal covering version, scope (user/machine), architecture, a custom install
location, custom arguments, and five toggles (pre-release, skip hash check,
interactive, elevated, uninstall previous first). Saving calls the existing
`window.materialUniGetUi.operations.enqueue` bridge with the chosen
`InstallOptions` — no new IPC channel was added; this reuses the contract
that already existed in `app/src/models/package.ts`.

## Ignored updates

Ignoring a package (or reopening the manager and choosing "Watch again")
persists through the existing generic `settings` bridge under the key
`ignoredUpdatePackages`, because this lane's allowed paths do not include the
preload/IPC contract files that would be needed to add a dedicated channel.
`useIgnoredUpdates()` and `IgnoredUpdatesManager` (both exported from
`package-routes.tsx`) implement the design's `igOpen` modal: a searchable
list of every ignored package with a one-click "Watch again."

## Empty, loading and error states

Unchanged in shape from before the port, but the empty state now carries the
design's `inbox` icon above the message, and every state remains distinct so
a genuinely empty list can never be mistaken for a stuck loading spinner.

## Accessibility

Every icon button has an explicit `aria-label` (and, on toggles, a title so
sighted mouse users see the same fact); icon spans stay `aria-hidden`
because their ligature name is real text content. Checkboxes keep their
existing visually-hidden labels. The disabled installer link is marked
`aria-disabled` rather than rendered as a dead-looking control with no
explanation. All new strings render through the shared `t()`/`a()`
translators, so English, Cantonese and bilingual modes, and both funny-level
sliders, apply exactly as they do everywhere else.

## Known gap: the search bar and bulk toolbar wiring

`SearchField` (with its anchored regex builder) and the bulk-action bar are
composed in `DiscoverRoute` / `UpdatesRoute` / `InstalledRoute` inside
`app/src/ui/app.tsx`, a file outside this lane's allowed paths. Those routes
already pass every row through the newly design-matched `PackageTable`, so
the port's visual and functional changes are live; the toolbar-level design
details specific to `app.tsx` (the `sort`/density/desktop-shortcuts icon
buttons in the design's header row) were left for the lane that owns that
file.
