<div align="center">

# Material UniGetUI

**The Material Design 3 interface for your package managers.**

[Day Teet Hui](https://ding-ding-projects.github.io/material-unigetui/) ·
[Roadmap](ROADMAP.md) ·
[Handoff](HANDOFF.md) ·
[Design reference](design/)

</div>

> [!WARNING]
> **Not released.** There is no installer to download yet. This repository
> contains a working application you can build and run, a complete design, and
> an inventory that says exactly how much of the intended product exists. That
> figure is currently **9 of 434 evidence records**. The roadmap is not
> aspirational marketing — it is the honest remainder.

---

## What this is

A rewrite of the [UniGetUI](https://github.com/Devolutions/UniGetUI) interface
in Material Design 3, driving Windows package managers through **natively
reimplemented drivers**. UniGetUI itself is pinned here as a shallow read-only
submodule at `v2026.2.7` and is used as a reference for command lines and output
parsing — none of its C# is ever executed.

<details open>
<summary><b>Screenshots</b> — a full capture matrix from the real built application</summary>

Every image below was taken from the built artifact through a reproducible,
committed harness — `script/capture-matrix.mjs` — driving the real Electron
renderer over the Chrome DevTools Protocol, never a mockup, a design file, or
a hand-edited image. Captured at commit `975dcc3` (see
[the capture-matrix article](docs/features/quality/capture-matrix.md) for the
exact method and its self-checks). There is deliberately no screenshot of the
Installed or Software updates screens populated with real packages — that is
the machine's software inventory, personal data that does not belong in a
public repository — so both show the honest loading/empty state instead.

<details>
<summary><b>Primary routes</b> — Discover, Software updates, Installed packages, Package bundles</summary>

![Discover packages screen in the built application, light theme, showing the 64px top app bar, the toggleable nav drawer with package-manager list, the tab strip, and the empty search state](docs/assets/screenshots/route-discover.png)

![Software updates screen in the built application, light theme](docs/assets/screenshots/route-updates.png)

![Installed packages screen in the built application, light theme, showing its honest loading state ("0 of 0 / Asking your package managers nicely...") rather than real installed software](docs/assets/screenshots/route-installed.png)

![Package bundles screen in the built application, light theme](docs/assets/screenshots/route-bundles.png)

</details>

<details>
<summary><b>Tools routes</b> — Operation history, Automation, File converter, Ollama suite manager, Authenticator, Logs, Support Tickets, Help &amp; About</summary>

![Operation history screen in the built application, light theme](docs/assets/screenshots/route-history.png)

![Automation (CLI & IPC) screen in the built application, light theme](docs/assets/screenshots/route-automation.png)

![File converter screen in the built application, light theme](docs/assets/screenshots/route-converter.png)

![Ollama suite manager screen in the built application, light theme](docs/assets/screenshots/route-ollama.png)

![Authenticator screen in the built application, light theme](docs/assets/screenshots/route-auth.png)

![Logs screen in the built application, light theme](docs/assets/screenshots/route-logs.png)

![Support Tickets screen in the built application, light theme](docs/assets/screenshots/route-tickets.png)

![Help & About screen in the built application, light theme](docs/assets/screenshots/route-about.png)

</details>

<details>
<summary><b>Settings</b> — tabbed, with its own regex-wired search</summary>

Settings opens on the General tab (same render as `settings-general.png`
below, so only the tabbed captures are shown to avoid a duplicate image).

![Settings surface with the General tab open, showing the application display name control and a reset-all-settings action, each explaining what it does and whether it was changed from its default](docs/assets/screenshots/settings-general.png)

![Settings surface with the Appearance tab open, in the built application](docs/assets/screenshots/settings-appearance.png)

![Settings surface with the Localization tab open, in the built application](docs/assets/screenshots/settings-localization.png)

</details>

<details>
<summary><b>Interaction surfaces</b> — regex builder, tab-strip search, command palette</summary>

![The anchored regex builder popover open beside the Discover screen's search field, with guided controls for anchors, character classes, groups and quantifiers, plus a live pattern field](docs/assets/screenshots/regex-builder.png)

![The tab strip with several open tabs and its search panel expanded, showing scope choices (this strip / this group / grouped tabs / everything open) and the tab-discovery search with its own regex builder](docs/assets/screenshots/tab-strip-search.png)

![The command palette opened with Ctrl+Shift+F, showing searchable destinations and settings](docs/assets/screenshots/command-palette.png)

</details>

<details>
<summary><b>Dark theme and narrow layout</b></summary>

![Discover packages screen rendered in dark theme, recoloured from the dark MD3 palette](docs/assets/screenshots/route-discover-dark.png)

![Discover packages screen emulated at a 480px-wide viewport via CDP device-metrics emulation (the real OS window has a 1280px minimum width, so this is the only way to observe narrow-layout behaviour). This capture also shows a real, unfixed defect: the nav drawer has no responsive behaviour at narrow widths — it stays a fixed 256px wide, leaving under 200px for content and clipping the top app bar's title and icon cluster. See `docs/features/quality/capture-matrix.md` for the exact file and line.](docs/assets/screenshots/route-discover-narrow.png)

</details>

</details>

<details>
<summary><b>Build and run it</b></summary>

```bash
npm install
node script/ensure-electron-binary.mjs
npm run build
npm start
```

`ensure-electron-binary.mjs` exists because npm's install-script gate can leave
the electron package present with no binary underneath it — a state that reads
as "electron is not installed" while the folder sits right there.

</details>

<details>
<summary><b>Verify it</b></summary>

```bash
npm test                 # unit tests, including one that spawns the real winget
npm run test:negative    # breaks the guard on purpose and requires it to go red
npx electron script/verify-site.cjs   # drives the real site and checks behaviour
```

`test:negative` is the one that matters. A guard nobody has watched fail is a
decoration; this one is broken nine different ways on every run and must catch
all nine.

</details>

<details>
<summary><b>What actually works today</b></summary>

- The application builds, launches, and navigates all 13 of its routes.
- **Discover**, **Software updates** and **Installed** read live data through the
  native WinGet driver.
- The renderer is isolated: `contextIsolation: true`, no node integration, and a
  preload bridge that exposes named calls and never a generic channel forwarder.
- A custom Material title bar; the operating-system frame is never product chrome.
- Light and dark themes from a single token contract.
- The Day Teet Hui, generated from the same inventory the tests enforce, with
  10/10 behaviour checks passing.

</details>

<details>
<summary><b>What is deliberately not built yet</b></summary>

- Ten of the eleven in-scope package managers. WinGet only, so far.
- Installing, updating and uninstalling from the interface. The operations queue
  exists and is tested; nothing in the UI triggers it.
- Bundles, history, automation, converter, Ollama, authenticator, logs, tickets,
  about, and settings. Each says so on screen rather than pretending.
- Most of the universal feature contracts. All 62 are in the inventory with
  written reasons.
- No installer has been produced or released.

</details>

<details>
<summary><b>Package managers in scope</b></summary>

WinGet · Scoop · Chocolatey · Pip · Npm · Cargo · Dotnet · PowerShell ·
PowerShell 7 · Vcpkg · Bun

Apt, Dnf, Flatpak, Homebrew, Pacman and Snap exist upstream and are deliberately
out of scope while delivery targets Windows.

</details>

## A note on signing

Artifacts from this project are and will remain **unsigned**. When an installer
eventually ships it will trigger an unknown-publisher warning on Windows. That
is stated here rather than discovered at install time; nothing in this repository
claims a signature it does not have.

## Repository setup that still needs a human

`social-preview.png` is committed at the repository root, but GitHub's social
preview is a repository setting rather than a file, and it is not exposed by the
API — so it cannot be set from here. To make a pasted link show the picture:

**Settings → General → Social preview → Upload an image → `social-preview.png`**

## Licence

MIT. UniGetUI is MIT and is included only as a reference submodule.
