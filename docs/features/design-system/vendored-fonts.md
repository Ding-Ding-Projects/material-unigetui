# Vendored fonts

## Behaviour

The design reference at `design/Material UniGetUI v2.dc.html` loads three font
families from Google Fonts over the network: Roboto (weights 400/500/700),
Roboto Mono (weights 400/500), and the variable icon font Material Symbols
Rounded (axes `opsz,wght,FILL,GRAD@20..48,300..600,0..1,0`), used for every
icon glyph in the design — 138 icon spans across the file.

A packaged desktop application has to work with the network unplugged, and
`app/index.html` sets a strict Content-Security-Policy (`font-src 'self'`)
that refuses a remote font origin outright. `script/download-fonts.mjs`
vendors the fonts locally so both of those hold at once: the app never phones
Google, and every icon and text face still renders as designed.

The script:

1. Reads the exact `https://fonts.googleapis.com/css2?...` URLs out of the
   design reference (rather than retyping them from memory, so a future
   change to the design's font request is picked up automatically).
2. Fetches each URL with a modern desktop Chrome `User-Agent` header. Google
   Fonts serves `woff2` only to a browser-shaped request; without the header
   it serves an older, larger format instead.
3. Parses **every** `@font-face` block in the response — a single `family=`
   query typically answers with dozens of them, one per weight/style/
   `unicode-range` subset (this design's two requests currently return 40
   blocks: 39 across Roboto/Roboto Mono, 1 for the variable Material Symbols
   font) — and downloads every referenced font file into
   `app/static/common/fonts/`.
4. Emits `app/static/common/fonts/fonts.generated.css`: each `@font-face`
   block reproduced from the upstream response, with `src` rewritten to the
   local file and `font-weight` / `font-style` / `unicode-range` preserved
   **exactly** as Google declared them. Dropping `unicode-range` would make
   the browser download every subset for a single accented character;
   collapsing the weights would flatten the design's type scale.
5. Records the SHA-256 of every vendored file, alongside its source URL and
   font metadata, in `app/static/common/fonts/manifest.json`.

`app/src/ui/fonts.css` (`@import '../../static/common/fonts/fonts.generated.css';`)
is imported once, from `app/src/ui/index.tsx`, so style-loader/css-loader pull
it into the renderer bundle like any other stylesheet. `app/webpack.renderer.js`
has an `asset/resource` rule for `.woff2`/`.woff`/`.ttf`/`.otf` that emits each
font back to the same `static/common/fonts/` path it already lives at on disk —
its only job is making the webpack asset pipeline aware of the binaries so
css-loader can resolve the `url()`s inside the generated stylesheet.

## Configuration

Run `node script/download-fonts.mjs` (add `--silent` / `/s` for non-interactive
use) to (re-)vendor the fonts. It is idempotent: a file whose on-disk SHA-256
still matches the manifest is left alone; anything missing or changed is
re-fetched. A failed fetch is a hard, non-zero-exit failure naming the exact
URL and HTTP status — it never writes a partial vendor tree.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| A Google Fonts URL returns a non-2xx status | `download-fonts.mjs` exits non-zero, naming the URL and status; no files are written for that request |
| A vendored font file is missing or its bytes no longer match its recorded digest | `validate-font-manifest.mjs` exits non-zero, naming the exact file |
| The design uses a Material Symbols glyph name the vendored font has no ligature for | `validate-material-symbols.mjs` exits non-zero, naming the exact glyph name — that name would otherwise render as literal English text instead of an icon |
| The vendored Material Symbols font's tables cannot be parsed at all | `validate-material-symbols.mjs` exits non-zero with an explicit "CANNOT VERIFY" message; it never falls back to a check that trivially passes |

## Security considerations

`manifest.json` pins a SHA-256 digest for every vendored binary. This is a
supply-chain check as much as an integrity one: `validate-font-manifest.mjs`
(wired as `npm run validate:fonts`) fails the moment a font file's bytes
diverge from what was recorded when it was fetched, whether that is
corruption, a truncated download, or a swapped file.

Vendoring the fonts is also what lets the strict `font-src 'self'` CSP exist
at all — with a network font origin, the CSP would have to name
`fonts.gstatic.com` explicitly, widening the attack surface a strict CSP
exists to narrow.

## Verification

- `npm run validate:fonts` (`script/validate-font-manifest.mjs`) — every file
  named in the manifest exists and matches its recorded digest.
- `npm run validate:symbols` (`script/validate-material-symbols.mjs`) —
  every Material Symbols glyph name the design reference actually uses (both
  the literal ones written directly in markup and the ones assigned through a
  small set of known icon-ish JS variables) resolves to a real ligature
  inside the vendored font. This is not a name lookup against an external
  icon gallery: the script contains a small self-contained WOFF2 → GSUB/cmap
  reader (built on Node's built-in Brotli support in `node:zlib`, no new
  dependency) that reads the font's actual `liga`/`dlig`/`ccmp`/`rlig`
  ligature table and asks the same question the browser's text shaper asks
  at render time — does this exact sequence of glyph IDs resolve to a
  ligature? — rather than trusting a name list that the shipped subset might
  not match.
- Both guards were proven to actually fail before being trusted: one byte of
  a vendored font was flipped and `validate:fonts` correctly reported the
  exact file and digest mismatch; the design reference was temporarily edited
  to use a glyph name the font does not carry (`not_a_real_icon_name_xyz`)
  and `validate:symbols` correctly reported that exact name as unresolvable.
  Both files were restored afterward.
- `node script/download-fonts.mjs` was run twice in a row; the second run
  reported 40/40 files "verified (already correct)" and 0 downloaded,
  confirming idempotency.
- A production renderer build (`npm run build:renderer`) was run after the
  webpack wiring changed. The build succeeded, and `app/renderer.js` was
  confirmed to reference every vendored font's `static/common/fonts/...`
  path — the step most likely to silently fail, since a font that downloads
  correctly but that the built renderer cannot resolve is exactly as broken
  as no font at all.
