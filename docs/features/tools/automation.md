# Automation: CLI & IPC

`app/src/ui/tools/automation-route.tsx`

## Behaviour

No command-line interface or scriptable IPC surface is implemented in this
build — `preload.ts` exposes only the renderer bridge used by the interface
itself, and nothing in `main/` listens on a socket, a pipe, or a deep-link
protocol handler. This route exists so that gap is visible rather than
implied: it lists the verbs the design specifies, and honestly marks each one
either "in the interface only" (the underlying action exists, just not as a
scriptable verb) or "not implemented" (nothing behind it at all — currently
`manager enable/disable/set-executable` and the `unigetui://` deep link).

A search field (with its own anchored regex builder) filters the verb table
by surface name and command text.

## Why this is not a decorative table

Every row is a real, checkable claim about the current build rather than an
aspiration: "in the interface only" means the equivalent action is reachable
through a button elsewhere in the app today; "not implemented" means it is
not reachable through this application at all yet, by any route.

## Localization

Routes through the `automation*` keys plus the shared `notImplementedTitle`.

## Verification

`npm run build:renderer` compiles. No CLI exists to test end-to-end.
