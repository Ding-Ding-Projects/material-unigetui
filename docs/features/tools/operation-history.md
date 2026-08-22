# Operation history

`app/src/ui/tools/history-route.tsx`

## Behaviour

Lists every operation that has reached a terminal state
(`succeeded`/`failed`/`cancelled`) this session, from the same `operations`
list the operations dock reads. A search field filters on package name, id,
action and status.

**Re-run** re-enqueues the exact same action, package and install options
through `window.materialUniGetUi.operations.enqueue(...)` — the same call the
row action buttons on Discover/Updates/Installed use. There is no separate
"history re-run" channel; reusing the real enqueue call means a re-run behaves
identically to installing it fresh, including landing in the operations dock
and (once it finishes) back in this same history list.

Each row shows a Material Symbols icon for the action (`download` for
install, `upgrade` for update, `delete` for uninstall) and, for a failed
operation, the recorded failure reason inline.

## Empty states

- Nothing has finished yet: "Nothing has finished yet. History is kept for
  this session only."
- Filtered to nothing: "No operation matched that search."

## Localization

All strings route through `t()`/`a()` against the `history*` keys in
`i18n-resources.ts`.

## Verification

`npm run build:renderer` compiles the route against the real `Operation` and
`operations.enqueue` types from `app/src/models/operation.ts` and the IPC
contract.
