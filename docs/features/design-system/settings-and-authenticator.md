# Settings and the Authenticator

## Behaviour

Both surfaces are ported from the checked-in design reference's `rSettings`
and `rAuth` sections (`design/Material UniGetUI v2.dc.html`), including the
left-rail tabbed layout, the icon-led setting rows, the appearance/security/
vocabulary cards, and the two-factor pairing card.

### Settings (`app/src/ui/settings-route.tsx`)

Settings is a two-pane, genuinely tabbed surface — a left rail
(`.settings-rail`, `role="tablist"`) of icon-and-label buttons, one per
`SETTINGS_TABS` entry, and a content pane on the right. It is not a scrolling
column and not a bespoke section list; each rail button is a real `role="tab"`
with `aria-selected`, and the content pane is a `role="tabpanel"`.

The content pane carries its own `SearchField` — the same component every
other search surface in the application uses, wired to its own anchored regex
builder (`app/src/ui/md3/search-field.tsx`, `regex-builder.tsx`). Searching
switches from "one tab's rows" to "every setting across every tab", and each
result names the tab it lives on so the match is never mysterious.

Every generic setting row (`SettingRow`) shows:

- its title and a plain-language explanation, behind a
  `What does this do?` disclosure so the page is not a wall of prose by
  default;
- a **provenance line** — `Default (…)` or `Set to (…)` — stating plainly
  whether the current value is the shipped default or something actually
  chosen, using the real value rather than the word "default";
- the real, live control (a switch, a select, a range, or a text field) wired
  directly to `useSettings()`, never a printed value beside a separate editor.

Beyond the generic rows, four tabs carry richer, design-matched widgets that
do not fit the generic four control kinds:

- **Localization** — a language-mode radio list with an icon per option
  (English / 粵語 / Bilingual) and two independent funny-level cards (English,
  Cantonese), each a labelled slider from 1 to 5 with a short note describing
  the current level.
- **Appearance** — an app-logo section: six colour presets plus a
  drag-and-drop-free upload button (a hidden `<input type="file">`, read
  locally with `FileReader` and stored as a data URL — never uploaded
  anywhere), a fit selector (Contain / Cover / Fill), and a reset action.
- **Security** — a toy-lock registry (list, search, create, relock, remove,
  wired to the existing `window.materialUniGetUi.locks` bridge) and the
  two-factor pairing card described below.
- **Vocabulary** — the personal-vocabulary loader, restyled onto the same
  card affordance as the other tabs.

`SETTINGS_TABS`, `SETTING_DESCRIPTORS`, `SettingsTabId` and the
`SettingsRoute` component's props are read directly by `app.tsx`'s command
palette (a sibling-owned file), so their shape is additive-only: new tabs and
new descriptors may be added, but no existing field name or control-kind
value may change. Because of that constraint, `SETTING_DESCRIPTORS.title`/
`.explanation` remain static English — the command palette reads them as
plain strings, not through the translator — while every other string this
page renders (tab labels, headings, card copy, button labels, accessible
names) goes through `useI18n()`'s `t()`/`a()`.

### Authenticator (`app/src/ui/authenticator-route.tsx`)

The live-codes list: an add-entry card (paste an `otpauth://` URI or a plain
Base32 secret, or generate a fresh one), a search field, and one row per
registered entry — a coloured initial avatar, issuer/account, the current
code in large monospace digits, a countdown ring, and copy/show-URI/remove
actions. Two-factor *pairing* — the QR code, the manual secret, and the
confirm step — lives on Settings → Security, matching the design; this page
is what a paired secret looks like once it is live.

## Configuration

Settings persist through the existing `window.materialUniGetUi.settings`
bridge (arbitrary string keys, so the appearance card's `logoPreset`,
`logoFit` and `logoCustomData` keys need no new main-process code). Locks and
authenticator entries persist through their own existing bridges
(`window.materialUniGetUi.locks`, `.authenticator`). Nothing in this port
adds a new IPC channel.

## The two-factor pairing card, and why it is not just a QR image

`generateQrMatrix` (`app/src/ui/settings/qrcode.ts`) is a local, from-scratch
QR Code encoder (ISO/IEC 18004): Galois-field Reed-Solomon error correction,
byte-mode encoding, error-correction level L, versions 1 through 9, a fixed
mask pattern, and BCH-computed format/version information (computed, not a
hardcoded constant table, so a mistyped constant cannot silently produce an
unreadable code). `QrCodeView` (`qr-code-view.tsx`) renders the resulting
module matrix as an SVG, always on a solid white background regardless of
theme — a themed background is exactly what makes a real scanner fail to read
a code, so this is one of the few places the interface deliberately does not
follow the active theme.

**No third-party QR web service is ever contacted.** The secret this card
usually encodes is drawn entirely from data already in the renderer's memory,
through code that ships with the application.

Pairing follows the "confirm before it arms" contract: generating a secret
registers it **provisionally** through the existing
`window.materialUniGetUi.authenticator.add()` call, and the card then polls
`.codes()` for that entry. Only when the user types back a live code that
matches does the entry stay; a mismatch removes it again
(`.authenticator.remove()`), so an unconfirmed pairing never becomes a
persisted factor. This is built entirely on the bridge calls the
authenticator route already used (`generateSecret`, `add`, `codes`,
`remove`) — no new main-process code was needed to implement it.

## Accessibility

Every icon is `aria-hidden` (per `app/src/ui/md3/icon.tsx`'s contract); the
control that contains it carries its own accessible name via `aria-label` or
visible text. Switches, selects, ranges and text inputs use native form
elements with visible focus rings inherited from the shared `.btn`/
`.text-input`/`.switch` styles. The settings rail uses real tab semantics
with roving `aria-selected`. The two-factor confirm field and the lock
create form are reachable and operable by keyboard alone. Provenance,
explanation and status text is never colour-only; the lock and two-factor
status lines pair colour with plain-language text.

## Failure modes

- **Vocabulary file rejected** — the reason is shown inline and as a
  notification; the previous state is kept.
- **Two-factor confirmation mismatch** — the provisional entry is removed and
  the card explains what to do, rather than leaving an unconfirmed secret
  sitting in the list.
- **QR payload too long** — `generateQrMatrix` returns `null` above roughly
  230 bytes (this encoder's supported range); the card falls back to a plain
  icon tile rather than rendering nothing.
- **Lock creation with an incomplete form** — the button stays disabled and
  never fires a request with a blank target, label or credential.
