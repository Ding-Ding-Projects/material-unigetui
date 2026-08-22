# Package bundles

The design's `<sc-if value="{{ rBundles }}">` section — export what is
installed, import a bundle, and a card grid of saved bundles — is ported as
`PackageBundlesRoute` in `app/src/ui/package-routes.tsx`.

It is fully functional against the real bridge: export runs
`window.materialUniGetUi.bundles.export(entries, format)` with the six
formats the design lists (JSON, YAML, CSV, TSV, Markdown table, plain text),
warns before a lossy export exactly as the design's provenance line does,
and import runs `window.materialUniGetUi.bundles.import()` and lists what
came back, including a skipped-entry count when the bridge reports one. The
card grid renders whatever `bundles` prop it is given, with install/export/
remove callbacks the caller supplies.

## Why this is not the screen you see running today

A functionally equivalent `BundlesRoute` already exists in
`app/src/ui/tool-routes.tsx`, and `app/src/ui/app.tsx` imports and renders
that one. Both files are outside this lane's allowed paths (`tool-routes.tsx`
and `app.tsx` are owned by a sibling lane), so this lane could not repoint
the import or delete the duplicate without violating its file boundary.

`PackageBundlesRoute` is therefore a complete, design-matched, ready-to-wire
replacement, exported and documented, but not yet the one the running app
renders. Swapping the import in `app.tsx` from `./tool-routes` to
`./package-routes` (and deleting the old implementation from
`tool-routes.tsx`) is the remaining integration step, left for whichever
lane owns those two files. See the port pig's final report for the same
note.
