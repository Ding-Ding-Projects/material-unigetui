# File converter

`app/src/ui/tools/converter-route.tsx`

## Behaviour

**No conversion backend exists in this build.** `window.materialUniGetUi` has
no `converter` namespace — no bounded local adapter registry, no sandboxed
decoder, no byte-signature detection. This route ports the design's chrome
(the drop zone, the recent-conversions list) and widens it into the
categorized adapter catalog the universal file-converter contract describes
(Documents/PDF, Images, Audio, Video, Archives, Structured Data/Spreadsheets,
Code/Text, Binary Encodings), and is honest at every point that none of it
converts anything yet:

- The drop zone renders as a real `<button disabled>`, not a clickable
  control that silently does nothing — its own `title` and visible hint text
  say why.
- Every format listed in every category carries a `converterNoAdapter` status
  chip rather than an "Install" or "Convert" affordance that would have
  nowhere to go.
- "Recent conversions" reads "Nothing has been converted yet." — nothing is
  fabricated to fill the space.

Each of the eight categories carries its **own** `SearchField` instance with
its own independent query/regex/flags state, matching the "never one shared
builder applying to whichever field was last touched" requirement — switching
category tabs does not lose or cross-apply a search that was typed elsewhere.

## Why a static catalog rather than a stub bridge call

Wiring the drop zone or a format's "Convert" action to a bridge method that
does not exist would either throw at runtime or require inventing a fake
backend response — both are exactly the decorative-control failure this
project's rules exist to prevent. The catalog is real data (the format list
matches what the design's own recent-conversions row names), and the search
over it genuinely filters; only the *conversion* itself is honestly absent.

## Localization

Routes through the `converter*` keys (category titles, search labels, empty
states) plus the shared `converter`/`converterSub`/`recent`/`unsupported`
keys already in the base resources.

## Verification

`npm run build:renderer` compiles. There is no real conversion path to test.
