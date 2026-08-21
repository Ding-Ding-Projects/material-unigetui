# The completeness inventory

## Behaviour

Two files and a guard:

- `app/test/fixtures/feature-completeness/canonical-features.json` — the
  hand-written list of every contract this project has adopted. 62 rows.
- `app/test/fixtures/feature-completeness/evidence-paths.json` — one row per
  contract, each carrying seven evidence dimensions: `implementation`,
  `documentation`, `localization`, `persistence`, `focusedTest`,
  `builtArtifactInteraction`, `realCapture`. Every record is `present`,
  `pending` or `blocked`.
- `app/test/unit/feature-completeness-test.mjs` — the guard.

**The canonical list is hand-written on purpose.** A registry that only
enumerates what it discovered cannot notice a feature that was never built,
which is the exact failure the inventory exists to prevent. A row is added when
a contract is adopted, not when its code lands.

A `pending` row is not a failure. A **missing** row is.

## Configuration

`node script/sync-evidence-manifest.mjs` adds rows for new contracts, drops rows
for removed ones, and reorders to match. It never overwrites an existing
evidence record, because those carry hand-written reasons and regenerating them
would replace an honest "not built yet, because…" with a default that says
nothing.

## Failure modes

The guard fails when:

- the canonical digest no longer matches the list (a rename or reorder);
- manifest ids differ from canonical ids in content **or order**;
- a row is missing a dimension, or a dimension has no records;
- a `present` record names a file that does not exist;
- a `pending` or `blocked` record has no reason;
- an anchored declaration has disappeared;
- the renderer's isolation flags have changed;
- the preload bridge grows a generic channel forwarder;
- the chrome stylesheet names a raw colour.

## Security considerations

Two of the assertions are security properties rather than housekeeping:
`contextIsolation: true` with node integration off, and the absence of an
`invoke(channel, …)` forwarder in the preload bridge. A bridge that forwards an
arbitrary channel name hands the renderer the entire main process and undoes the
isolation the flags appear to provide.

## Verification

`npm run test:negative` runs `script/negative-regression.mjs`, which breaks one
asserted thing at a time and requires the guard to go red, then restores it and
requires green. Nine sabotages, all caught, including the two that normally walk
straight past a checklist:

- a symbol renamed so that it still **contains** the old name;
- a wiring line **commented out** rather than deleted.

Assertions are anchored to line starts and every file is read with line endings
normalised first, because on a CRLF checkout an un-normalised multi-line pattern
fails for a line that is genuinely there — and that failure looks exactly like
the deletion the guard exists to catch.
