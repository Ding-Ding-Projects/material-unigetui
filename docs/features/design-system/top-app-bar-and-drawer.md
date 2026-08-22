# The top app bar and nav drawer

## Behaviour

The application shell is ported from the checked-in design reference's
`<header>` and toggleable `<nav>` sections (`design/Material UniGetUI
v2.dc.html`), not approximated from memory of what it looked like.

`TopAppBar` (`app/src/ui/app.tsx`) is a 64px Gmail-style bar: a menu button
that toggles the drawer, the app's logo and name, a spacer, then an
icon-button cluster for language cycling, theme toggling, the command
palette, and settings, followed by an avatar. The design is a browser-canvas
mockup with no OS window frame to account for; this build still needs one
(the house rule against exposing the OS's default title bar), so a
window-controls cluster (minimise/maximise/close) is appended after the
avatar rather than invented in the design's place. The bar and its
icon-only buttons carry `-webkit-app-region: drag`/`no-drag` so the window
remains draggable from the empty space between controls.

`NavDrawer` is the toggleable 256px drawer: a pill-shaped primary action
("Install a package"), the primary destinations group, a live package-manager
list (drawn from `useOperations`'s manager availability, not the design's
static rows), a divider, and the tools group. Collapsing the drawer removes
it from the layout entirely — `{drawerOpen && <NavDrawer …>}` in `app.tsx` —
matching the design's `sc-if value="{{ drawerOpen }}"` rather than hiding it
with `display:none`.

Every icon in both surfaces renders through the shared `Icon` component
(`app/src/ui/md3/icon.tsx`), using the design's own Material Symbols Rounded
ligature names (its `pageIcons` map), never a similar-sounding guess.

## Configuration

The drawer's open/collapsed state is local component state (`drawerOpen` in
`AppContent`), defaulting to open. It is not yet persisted across restarts —
that is a `pending` row alongside the theme-persistence one in the
completeness inventory, since both are the same "appearance state should
survive a restart" gap.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| An unregistered Material Symbols ligature name | Renders the literal English word instead of a glyph — every name used here is checked against the design's own icon references |
| The IPC bridge's window controls are unavailable | The button still renders; the click is a no-op rather than a crash, since `window.materialUniGetUi.window.*` is asserted present by the bridge's own contract |

## Security considerations

None directly — no new IPC surface, no new remote content. The bar's search
affordances from the design (the omnibox and its inline regex builder) are
deliberately **not** duplicated here: the application already has a full,
regex-builder-compliant `SearchField` embedded in each package route
(Discover/Updates/Installed), and wiring a second, top-bar-level search box
into that existing state was judged out of scope for this pass — see the
renderer port handoff for the exact reasoning. Adding a second search field
that did not actually filter anything would itself have been the
decorative-control defect these house rules forbid.

## Accessibility

- The menu button carries `aria-expanded` reflecting drawer state, plus a
  localized accessible name (`menuToggle`); a hidden live region
  (`navExpanded`/`navCollapsed`) announces the state change to screen readers.
- Every icon span is `aria-hidden="true"`; the containing `<button>` carries
  its own `aria-label`/`title` from the i18n layer, so the glyph's ligature
  name (e.g. `"settings"`) never leaks into the control's accessible name.
- All chrome buttons are real `<button>` elements — keyboard-reachable by
  default, with `:focus-visible` outlines defined in `app.css` using the
  `--p` token so the ring is visible in both themes.
- Drawer items use `aria-current="page"` for the active destination, exactly
  as the previous nav rail did.
- Every string is read through `t()`/`a()` against `app/src/lib/i18n.ts`, so
  all three language modes (English, Cantonese, bilingual) and both
  per-language funny-level sliders reach the new chrome. Bilingual mode is
  the longest-label case; `top-app-bar__name` and `nav-drawer__item-label`
  both truncate with an ellipsis rather than wrapping or clipping the
  surrounding layout.

## Verification

- `npm run build:renderer` compiles the shell with no TypeScript errors.
- This pass did not run the test suite, linters, or capture tooling — that is
  a deliberate speed tradeoff for this task, owned by a separate verification
  lane. `docs/assets/screenshots/` does not yet contain a capture of the
  ported chrome; a real built-artifact screenshot is outstanding.
