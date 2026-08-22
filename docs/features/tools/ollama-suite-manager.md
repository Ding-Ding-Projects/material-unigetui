# Ollama suite manager

`app/src/ui/tools/ollama-route.tsx`

## Behaviour

**No Ollama integration exists in this build.** `window.materialUniGetUi` has
no `ollama` namespace: no runtime health check against a local HTTP API, no
model catalog, no hardware-fit detection, no batch pull, no chat, no harness
profiles. The design shows a live-looking model list with fit-verdict badges
and snapshot/rollback controls; none of it is backed by anything real here.

Rather than fabricate a model catalog or wire buttons that would call nothing,
this route renders only the honest parts of the design's chrome:

- The header, with a search field that participates in the same anchored
  regex-builder contract as every other list in the app, even though the list
  it searches is genuinely empty.
- A connection-status chip that always reads "not connected" — there is no
  detection to report otherwise.
- An explicit note that hardware-fit detection is not implemented, so no fit
  verdict (`fits`/`tight fit`/`too big`) can be shown honestly for any model.
- An empty-state message naming exactly what the design specifies and is
  missing: the model store, fit verdicts, batch-pull cart, chat, and harness
  profiles.

## Why no fake model list

Filling the list with sample models and disabled buttons would look like
"almost working" and would misrepresent the build to anyone reading it. The
whole point of the empty state is that it cannot be mistaken for a real,
temporarily-offline catalog.

## Localization

Routes through the `ollama*` keys plus the shared `ollama`/`pcFit` keys.

## Verification

`npm run build:renderer` compiles. There is no Ollama integration to test.
