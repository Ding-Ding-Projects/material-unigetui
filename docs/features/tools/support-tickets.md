# Support Tickets

`app/src/ui/tools/tickets-route.tsx`

## Behaviour

The toy-lock recovery desk from the shared instructions' unlock-ladder
contract. A user files a ticket (category, severity, description) through
`window.materialUniGetUi.tickets.create(...)`, which is stored locally and
never leaves the machine. Every response the desk gives eventually points at
the one thing that actually works — deleting the application-data folder —
and the surface opens that exact folder with one click, then stops: the
deleting itself is left to the user's own file manager, exactly as the
contract requires.

A single, unstyled plain-text line states the whole joke explicitly: nothing
here is sent anywhere, no network request is made, and nobody is reading the
ticket. It is intentionally never affected by the funny-level sliders, so a
user is never left waiting for a reply that was never coming.

Existing tickets are listed with their status and any canned replies, filtered
by a search field. **Ask for an update** advances the ticket's canned state
machine via `tickets.advance(id)`.

## Localization

Category and severity option labels are translation keys stored on the ticket
via their *translated* text — matching the design and the existing
`tickets.create(category, severity, description)` bridge signature, which
takes display strings rather than machine ids.

## Verification

`npm run build:renderer` compiles the route against the real tickets IPC
contract and `shell.appDataPath()`/`shell.openAppData()`.
