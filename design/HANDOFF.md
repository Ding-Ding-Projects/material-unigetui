# Material UniGetUI — Herng Ha handoff

## What this is
`Material UniGetUI v2.dc.html` is the complete Material Design 3 renderer surface for the UniGetUI rewrite: every page, dialog and control is wired to in-renderer state. It is designed to drop into a desktop shell as the single renderer window.

## Drop-in steps
1. Shell window: frameless optional; the UI provides its own chrome-free layout (min 1280×800 recommended, default 1450×900 like upstream).
2. Load the page in the shell's browser window. Keep `nodeIntegration` off; expose a preload bridge instead.
3. Replace the simulated layer with real calls through the existing UniGetUI IPC API (`docs/IPC.md`, `docs/CLI.md` in the source repo). The mapping below is 1:1.

## Renderer → IPC mapping
| UI surface | IPC / CLI verb |
| --- | --- |
| Discover / search | `package search --query … --manager …` |
| Updates list / Update all | `package updates`, `package update-all` |
| Installed list | `package installed` |
| Install / update / uninstall row actions | `package install/update/uninstall --id …` (options dialog → `--version --scope --architecture --location --elevated --interactive --skip-hash --pre-release`) |
| Download installer flow | `package download --id … --output …` |
| Ignored updates manager | `package ignored list/add/remove` |
| Operations dock (cancel, retry, run-now/next/last, forget, output) | `operation list/get/output/wait/cancel/retry/reorder/forget` |
| Manager toggles, sources, executable override | `manager enable/disable/reload/set-executable`, `source list/add/remove` |
| Desktop shortcuts dialog | `shortcut list/set/reset/reset-all` |
| Settings pages | `settings list/get/set/clear`, `settings secure …` (keys: `SettingsEngine_Names.cs`) |
| Backup page (local + GitHub cloud) | `backup status/local create`, `backup github login …`, `backup cloud list/create/download/restore` |
| Bundles page | `bundle get/reset/import/export/add/remove/install` |
| Logs pages | `log app`, `log manager`, `log operations` |
| Deep links | `unigetui://showPackage`, `showDiscoverPage`, `showUpdatesPage`, `showInstalledPage`, `showUniGetUI` |
| Headless / tray | `--daemon`, `--headless --ipc-api-transport …` |

## Renderer-local features (no backend needed)
Tabs + groups + pins + 4-scope tab search, bulk close (contain / not-contain, preview-first), the advanced regex builder on every search field, per-element context menus and appearance editors, toy locks + Support Tickets (store in app-data folder `MaterialUniGetUI`), authenticator (TOTP), command palette (Ctrl+Shift+F), localization EN/粵語/bilingual + funny level, vocabulary upload, logo customization, super confirmation, file converter and Ollama manager (both call local adapters).

## Persistence
Renderer state that should persist: tabs/groups/pins, appearance overrides, locks (credentials → OS credential vault, never files), settings map, window geometry. Store under `%LOCALAPPDATA%\MaterialUniGetUI` — that folder is also the documented toy-lock recovery path; deleting it must clear every lock.
