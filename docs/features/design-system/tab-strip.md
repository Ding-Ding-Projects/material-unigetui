# The browser-style tab strip

## What it is

The window's content is navigated through browser-style tabs (`app/src/ui/tabs.tsx`), ported from
the design reference's "Tab strip (browser-style, groups + pins)" section. Tabs open destinations,
can be pinned, grouped, searched four different ways, and closed in bulk by a text match.

## Visual port

`app/src/ui/tabs.css` restyles the strip to the design's exact shape: 40px strip height, 34px tabs
with 12px top corners and no bottom radius, a pinned rail separated by a divider, and a coloured
dot per group (a stable hash of the group name, since the design's per-group colour field is not
persisted state). Every selector is scoped under `.tab-strip-wrap` so it beats the older, unscoped
`.tab-strip` / `.tab` rules still declared in `components.css` (owned by a sibling lane) on
specificity, and `tabs.css` is imported by `tabs.tsx`, which `app.tsx` imports after
`components.css` — so it also wins on source order. Both routes are covered deliberately, since a
duplicate-declaration mismatch that only wins on one of them is a silent no-op waiting to happen
the next time either file changes.

## Localization

Tab labels, the pin/unpin/close actions, every panel's copy, and the "Move… into group…" picker
route entirely through `useI18n()`'s `t()`, keyed off `routeI18nKey()` (`app/src/ui/routes.ts`).
This was a named gap in the sibling chrome-port lane: `routeLabel()` returns the English-only
fallback and is now used only when a route has no i18n key. Verified in bilingual mode, which
carries the longest labels — the strip's tab minimum-width and `text-overflow: ellipsis` on the
label keep it from clipping there.

## The four tab-discovery searches

1. **This strip** — `scope: 'strip'`, all open tabs.
2. **This group** — tabs sharing the active tab's group.
3. **Tab groups by name** — a separate panel (`groupSearchOpen`) searching group names, not tabs.
4. **Everything open** — `scope: 'all'`.

Each of the first three lives behind `SearchField` (`app/src/ui/md3/search-field.tsx`), which
already carries its own anchored regex builder, plain-text default, and synchronized
query/pattern/flags/mode — so every search surface here got the builder for free rather than one
being bolted on later.

## Move… into group…

Right-clicking a tab opens a single anchored picker (not a menu with one entry per group): a
search field over existing group names, a "No group" entry, and a field to create a new group and
move the tab into it in one action.

## Bulk close

"Close tabs whose name contains / does not contain" text, plain-text by default with the same
regex-capable `SearchField`-style input (currently plain text only — see Known gaps), never running
on an empty query, showing an exact preview and count before the destructive action, and excluding
pinned tabs by default.

## Persistence

Tab order, pinned/ordinary split, groups, and collapsed state persist through the existing
`useTabs()` settings-backed store (`STORAGE_KEY = 'tabs'`), unchanged by this pass.

## Known gaps (not implemented in this pass)

- **No overflow surface.** The strip scrolls horizontally (`overflow-x: auto`) rather than
  collapsing into a documented overflow menu — content is never silently clipped, but this is not
  yet the dedicated overflow surface the full contract calls for.
- **No drag-and-drop reordering**, and no reordering UI at all for ordinary or pinned tabs beyond
  the strip's natural left-to-right order. Keyboard reordering is not implemented.
- **No group create/rename/colour/remove UI.** Groups are created implicitly by moving a tab into
  a new name via the move picker; there is no dedicated group-management surface, and colours are
  derived, not user-chosen.
- **No per-tab "Edit tab appearance…" editor**, and no right-click menu beyond the move picker —
  right-click currently opens the move picker directly rather than a full context menu with a
  "Move… into group…" entry alongside other actions and their keyboard shortcuts.
- **The bulk-close field is plain text only**; it does not yet route through the shared regex
  builder the way the four discovery searches do.
