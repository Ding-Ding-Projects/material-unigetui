# Logs

`app/src/ui/tools/logs-route.tsx`

## Behaviour

Shows every log entry the application has produced this session, read from
`window.materialUniGetUi.logs.all()`. Entries carry a timestamp, a level
(`debug`/`info`/`warn`/`error`), a scope, and a message.

- A search field (with its own anchored regex builder) filters on the scope,
  message and level text together.
- Per-level chips toggle visibility; each chip shows the entry count for that
  level so an empty level reads as empty rather than absent.
- **Refresh** re-reads the in-memory log. **Clear the in-memory log** clears
  what the renderer holds and confirms with a non-blocking notification — it
  does not touch the file on disk, and the copy on screen says so.
- When the backend reports a log file path, it is shown as
  `Also appended to <path>`.

## Empty states

- No entries logged yet this session: "Nothing has been logged yet this
  session."
- Entries exist but none match the active filters: "No log line matched that
  filter."

## Accessibility

Level chips are real toggle buttons (`aria-pressed`), reachable and operable
by keyboard, with visible focus. The log list is plain readable text, not a
canvas or virtualised grid, so it works with a screen reader without special
casing.

## Localization

Every string routes through `t()`/`a()` from `useI18n()` against keys in
`app/src/lib/i18n-resources.ts` (the `logs*` and `logLevel*` keys). No literal
user-facing text is hard-coded in the component.

## Verification

`npm run build:renderer` compiles the route. Behavioural and screenshot
verification are out of scope for this lane; see the completeness inventory
for the pending rows.
