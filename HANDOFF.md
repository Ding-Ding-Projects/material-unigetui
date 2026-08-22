# Handoff

Written for whoever picks this up next, including a future me with no memory of
today. Every claim was checked against the repository as it stands.

## Where this stands

A Material Design 3 rewrite of the UniGetUI interface, built from a finished
design canvas. It **builds, launches, installs, and does real work**, and all
fourteen sections of the checked-in design reference are now ported into the
renderer. Two of those fourteen are structure without a backend, which is
stated everywhere they are counted rather than folded into the total.

Before this port the renderer had been rebuilt in the design's general spirit
rather than from it: a 40px title bar whose window controls were typed
characters, a plain-text navigation rail, no icon font at all, and Roboto
named in CSS but never vendored, so every surface fell back to the system
font. That is what changed.

| | |
| --- | --- |
| Design sections ported | **14 of 14** (two are structure only, see below) |
| Canonical contracts adopted | **62** |
| Unit tests | **180**, all passing, zero skipped |
| Negative regression | every guard watched red, then green |
| Design-parity evidence | in progress — see `docs/design-parity/inventory.json` |
| Project lines | **32,273** (see `npm run count-lines`) |
| Releases published | Yes — unsigned Squirrel.Windows installer, ~144 MB |

**The two honest exceptions.** The file converter and the Ollama suite manager
render the design's structure and have no bridge behind them at all — no
converter namespace and no model-manager namespace exists. Both show an
explicit empty state naming what is missing, and the converter's drop zone is
genuinely disabled rather than a decorative live-looking control. They are
incomplete features, not finished ones.

## The decisions that shape everything

**The backend is reimplemented natively.** UniGetUI is pinned as a shallow
submodule at `v2026.2.7` under `vendor/unigetui-reference/` and is a *reference
for command lines and parsing rules only*. Its C# is never executed. This was
raised with its cost stated and chosen deliberately. Do not "simplify" it later
by shelling out to the upstream engine without asking.

**The renderer is isolated.** `contextIsolation: true`, no node integration, and
a preload bridge exposing named calls only — never a generic channel forwarder.
The sibling repository runs the opposite way round; this is deliberate and there
is a guard test asserting it.

**Everything is bundled.** `app/package.json` has no dependencies; webpack
inlines them, so the packaged application carries no `node_modules`.

## What genuinely works

- **All eleven manager drivers** are written. Verified live on this machine:
  WinGet, Chocolatey, Pip, Npm, Dotnet, PowerShell, PowerShell 7, Bun. Scoop,
  Cargo and Vcpkg are written and parser-tested but not installed here.
- **Install, update and uninstall** from the interface, through a real queue,
  with cancel, live output and forget. Removal goes through the two-key gate.
- **Language modes and both funny-level sliders**, wired to rendered copy.
- **An anchored regex builder on every search field**, in the app and the site.
- **Tabs** with pinning, grouping, four discovery searches and previewed bulk
  close.
- **Command palette** on `Ctrl+Shift+F` with live controls and exact-element
  navigation.
- **Settings**, 15 tabs, searchable across all of them, every control explaining
  itself and stating whether its value was chosen or is still the default.
- **Logs, Operation history, Bundles, Support Tickets, Automation** — real
  screens, not placeholders.
- **A working authenticator**: arbitrary TOTP secrets, live codes, countdown,
  next-code peek. Secrets encrypted through the OS key material.
- **The unlock ladder**, generated and graded in the main process with
  single-use nonces and a capped skip budget.
- **The dim sum surprise**, sourced from the public catalog's release assets.
- **The Day Teet Hui**, generated from the inventory and deployed.
- **An unsigned installer**, installed and launched headlessly, then removed.

## What is deliberately not built

Every one of these has a row in the inventory with a written reason:

- No lock wizard or unlock prompt on any surface — the lock **store** exists,
  nothing offers a lock yet.
- No QR pairing, and no confirmation step before a TOTP factor arms.
- No ladder UI; the engine is complete and tested, nothing renders it.
- No per-element appearance editor, infinite colour picker, or presets.
- No offline documentation browser, local version history, changelog viewer, or
  external-editor handoff.
- No file converter, Ollama manager, narrator, or Status Hub client.
- ADHD modes persist and are documented but do not yet change any surface.
- No automatic updates from the Squirrel feed.
- No CLI or deep links.

## Traps already paid for — do not rediscover these

**`winget --output json` does not exist on most machines.** Upstream's C# uses
it; v1.29.290 rejects it with no experimental flag. The fixed-width table parser
is the *primary* path.

**Columns must be sliced at header offsets.** A whitespace split corrupts every
package whose name has a space — "Advanced Archive Password Recovery" becomes
"Advanced".

**npm is `npm.cmd`, and Node cannot spawn a `.cmd`.** The driver reported npm as
not installed while it sat on PATH. `windows-command.ts` builds the cmd.exe line
and escapes it twice; `shell: true` would be a command-injection hole, and there
are tests that spawn real cmd with a hostile package name.

**Golden fixtures must not be EOL-normalised.** `.gitattributes` marks the
fixture directory `-text`; without it Git strips the CRLF the fixture exists to
preserve. It already happened once.

**npm's script gate leaves electron with no binary.** Repaired by
`script/ensure-electron-binary.mjs`, judged by the binary existing rather than
the installer's exit code.

**`cmd` refuses the current directory.** `NoDefaultCurrentDirectoryInExePath`
makes `cmd /c build.bat` fail with "is not recognized" for a file that is there.
Invoke by absolute path.

**A backslash written through a shell can become a backspace byte.** It produced
`scriptuild-windows.ps1`. The wrappers use forward slashes; PowerShell accepts
them.

**`ErrorActionPreference = 'Stop'` turns npm's stderr WARNING into a fatal
error.** `Invoke-Native` drops to `Continue` and judges by exit code.

**electron-winstaller names the setup from the product title**, producing
"Material UniGetUISetup.exe" — with a space. Pinned via `setupExe`.

**A GitHub concurrency group cancels queued runs.** Rapid pushes produced no
release for most of them. The release workflow has no group.

**Driving a surface finds what reading it cannot.** The site hid every row on a
half-typed regex; no source review would have shown that.

## Next, in order

1. A lock wizard and unlock prompt, so the lock store is reachable. The engine
   and the ladder are both done and tested; only the surfaces are missing.
2. QR pairing with a confirmation step before the factor arms.
3. The offline documentation browser, generated from `docs/`.
4. Local version history, and export beyond bundles.
5. The remaining routes: converter, Ollama, per-element appearance.
6. Automatic updates from the Squirrel feed.

## House rules that bite here

- **Code signing is permanently prohibited.** Never add a signer.
- **CI runs no tests and no lint.** It builds, packages and publishes.
- **Never capture the populated Installed or Software updates screens.** That is
  a real software inventory and it is personal data.
- **Adopting a contract means adding its inventory row in the same change**,
  marked pending with a reason. A pending row is fine; a missing row fails.
