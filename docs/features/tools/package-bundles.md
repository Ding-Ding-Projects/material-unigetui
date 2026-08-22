# Package bundles

`app/src/ui/tools/bundles-route.tsx`

This route belongs to the `bundles` primary destination, not to this lane's
assigned tool sections — it simply already lived in the one file
(`tool-routes.tsx`) this lane owns exclusively, so it stayed working and was
ported (Material Symbols icon, MD3 classes, full localization) rather than
left as the one un-ported surface in the file.

## Behaviour

**Export**: sends the currently loaded `installed` package list to
`window.materialUniGetUi.bundles.export(entries, format)` in one of six
formats — JSON, YAML, CSV, TSV lossless; Markdown table and plain text lossy.
Before a lossy export runs, the surface states plainly what is dropped
(the source, which this app needs to read a bundle back in) rather than after.

**Import**: opens a file picker via `bundles.import()`, lists what the bundle
actually contained, and states how many entries were skipped and why
(malformed, or an unrecognised package manager) — never silently dropped.
Nothing is installed automatically from an import; it is read-and-list only.

## Failure modes

Both actions report `{ ok: false, reason }` results as a warning notification
naming the reason, rather than failing silently.

## Localization

Routes through the `bundles*` and shared `exportBundle`/`importBundle` keys.

## Verification

`npm run build:renderer` compiles the route against the real `PackageRow` type
and bundle IPC contract.
