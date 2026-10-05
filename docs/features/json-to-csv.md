# Local JSON → CSV: one bounded converter lane

The desktop File converter now has a bundled, local JSON → CSV adapter. Choose
one file, inspect the bounded output preview and loss disclosures, then choose a
new CSV destination. No external converter, executable, network request, package
manager or account is involved. Other catalog entries remain unavailable.

This is **not** completion of the universal converter contract or its website
surface. PDF operations, reverse CSV conversion, other formats, drag-and-drop,
batches, durable queue/history, and independent native built-app interaction and
capture evidence remain open.

## Accepted shape and limits

- UTF-8 `.json` regular file, optionally with a UTF-8 BOM; no symlink input.
- Nonempty top-level array of nonempty, flat objects. Every row must have exactly
  the same unique keys. Key order may differ; first-row order is used in CSV.
- Values: strings, booleans, null and safe integer literals, inclusive range
  −9007199254740991 through 9007199254740991. `-0` is preserved as text.
- Decimal and exponent syntax, larger numbers, nested values, duplicate keys
  (including escaped aliases), malformed JSON, invalid UTF-8, unsupported
  controls and lone UTF-16 surrogates are rejected. Quote numeric text to retain
  decimals, exponent spelling or large values without numeric parsing.
- At most 2 MiB input, 10,000 rows, 100 columns, 100,000 cells and 16,384 UTF-16
  code units per key or string; at most 4 MiB output.
- Reads use a bounded buffer on a verified regular-file handle. A growing file
  cannot cause an unbounded read. Parsing uses a small, nonrecursive grammar.

## Explicit changes and preview

CSV does not preserve JSON types. Null and empty strings both become empty
cells. Boolean and integer spelling becomes text. All cells, including headers,
are double-quoted; embedded quotes are doubled. Records use CRLF and output is
UTF-8 without BOM. Formula-like strings and column names receive a leading
apostrophe, including formula markers after whitespace and leading tab/CR/LF.
This changes their text. Spreadsheet applications can apply their own import
rules; review imported values rather than treating CSV as a typed JSON backup.

The preview shows the first three rows and five columns, with each cell limited
to 120 Unicode code points and an ellipsis when clipped. The saved CSV is not
clipped. The preview states complete row/column counts, output bytes and how many
formula-like cells/headers were escaped. The original file is never modified.

## File access, persistence and cancellation

Only three named calls cross the isolated preload: `prepareJsonCsv()`,
`saveJsonCsv(token)` and `cancel()`. No path, raw source, adapter name, executable
or arbitrary channel may be supplied by the renderer. The host accepts only its
own top-level app-file frame and binds one in-memory preview token to that
window. Basenames and bounded preview data are shown only in the app. Payloads,
full paths and preview data are not written to app logs or settings.

Choose and Save use native Electron dialogs. Input-picker cancellation produces
no preview. Save-picker cancellation retains a still-valid preview for retry.
Explicit Cancel or leaving the route invalidates the pending snapshot; host
navigation and window destruction also request cancellation. A native dialog
still needs its own Cancel button to close. Repeated requests while busy are
refused. Tokens expire after ten minutes, are not reusable after saving and are
not transferable between windows. No conversion history or durable queue is
stored. The latest saved-result message is local to the mounted route.

A private, exclusive temporary file in the chosen destination folder is written,
flushed and read back for byte verification. Atomic create-only hard-link
publication makes the complete CSV visible under the destination name, followed
by temporary-file cleanup. Existing files and symlinks are never overwritten,
including a destination created while Save was open. Filesystems without hard
links fail closed; pick a trusted local destination with hard-link support.
Cancellation is honored before publication starts. Once publication begins,
Cancel cannot turn an actual save into a false cancellation report.

Cleanup failures are explicitly reported; a successfully saved file still has a
saved outcome with a warning. A crash or external file lock can leave a private
`.material-unigetui-*.tmp` file in the output folder. Remove unwanted copies.
This is atomic visibility, not a promise of crash-proof durability or support
for adversarial processes concurrently changing the selected directory.

## Verification and remaining proof

- `npm test`: compiles source, runs unit/component and real-filesystem tests.
- `npm run test:negative`: existing completeness-guard sabotage checks.
- `npm run build && npm run verify:converter-built`: executes actual main and
  preload bundles with simulated Electron dialogs and real filesystem writes.
  It checks wiring, frame/argument allowlists, cancellation, stale-token refusal
  and exact CSV bytes. It checks renderer panel/CSS presence, not rendered UI.
- `docs/verification/json-to-csv.md` records the current run and its limits.

Native Windows dialog behavior, keyboard/screen-reader use, rendered light/dark
and Cantonese/bilingual layouts, Windows hard-link behavior, and current built
captures remain unverified. Component tests and a simulated Electron boundary do
not replace them. No populated software-inventory screen or private input is
used in tests or evidence.
