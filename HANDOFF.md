# Handoff

Written for whoever picks this up next, including a future me with no memory of
today. Every claim below was checked against the repository as it stands, not
recalled.

## Where this stands

A Material Design 3 rewrite of the UniGetUI interface, built from a finished
design canvas. The application **builds, launches and works** against real
package-manager data, and roughly 2% of the intended feature surface exists.
Both halves of that sentence matter.

- **62** canonical contracts adopted, in `app/test/fixtures/feature-completeness/canonical-features.json`.
- **9 of 434** evidence records present. The rest are `pending` with written reasons.
- **25** unit tests pass, one of which spawns the real `winget`.
- **9 of 9** sabotages caught by the negative regression.
- **10 of 10** site behaviour checks pass.
- **No release, no installer, no packaging script.**

## The decisions that shape everything

**The backend is reimplemented natively.** UniGetUI is pinned as a shallow
submodule at `v2026.2.7` under `vendor/unigetui-reference/` and is a *reference
for command lines and parsing rules only*. Its C# is never executed. This was
raised with its cost stated — it is by far the most expensive option — and
chosen deliberately. Do not "simplify" it later by shelling out to the upstream
engine without asking.

**The renderer is isolated.** `contextIsolation: true`, no node integration, and
a preload bridge in `app/src/preload.ts` that exposes named calls only. The
sibling repository `desktop-material` runs the opposite way round; this is a
deliberate divergence, and there is a guard test asserting it. Do not align it
back.

**Everything is bundled.** `app/package.json` has no dependencies at all —
webpack inlines them — so the packaged application carries no `node_modules`.

## What genuinely works

| Surface | State |
| --- | --- |
| Discover | Live search through the WinGet driver, debounced as you type |
| Software updates | Live, real pending upgrades |
| Installed packages | Live |
| The other 10 routes | Present in the nav, honest "not implemented" panel |
| Light/dark theme | One token contract, both palettes from the design |
| Day Teet Hui | Generated from the inventory, deployed by `pages.yml` |

## Traps already paid for — do not rediscover these

**`winget --output json` does not exist on most machines.** Upstream's C# uses
it. winget v1.29.290 rejects it outright and has no experimental flag for it.
The fixed-width table parser is therefore the *primary* path, not a fallback.

**Columns must be sliced at header offsets.** Splitting on whitespace looks
correct against a tidy sample and silently mangles every package whose name
contains a space — "Advanced Archive Password Recovery" becomes "Advanced".
There is a test for exactly this, and it was watched failing before being
trusted.

**Golden fixtures must not be normalised.** `.gitattributes` carries
`app/test/fixtures/manager-output/** -text`. Without it Git strips the CRLF that
the fixture exists to preserve, and it already happened once — the guard test
caught it, which is the only reassuring part.

**npm's script gate leaves electron with no binary.** The package is present,
`dist/electron.exe` is not, and it reads as "electron is not installed".
`script/ensure-electron-binary.mjs` repairs it and judges success by the binary
existing, never by the installer's exit code.

**Test output compiles to CommonJS.** Sources use extensionless relative imports
that webpack resolves and raw Node ESM does not. `app/test/helpers/compiled.mjs`
loads through `createRequire` for that reason, and because a dynamic import of a
Windows absolute path also needs a `file://` URL.

**Driving the page finds what reading it cannot.** The site's invalid-regex
handling hid every row — a blank table reading as "nothing matched" — and no
amount of source review would have shown that. `script/verify-site.cjs` exists
to catch that class of defect.

## Next, in order

1. Wire install/update/uninstall from the interface. The queue
   (`app/src/main-process/operations-queue.ts`) is written and typechecked but
   **nothing triggers it**, so that path is entirely unexercised.
2. `build.bat`, `build-installer.bat`, `download-dependencies.bat` over one
   `script/build-windows.ps1`, then an unsigned Squirrel.Windows installer.
3. The remaining ten drivers, one at a time, each with golden fixtures captured
   from real output rather than hand-written.
4. The universal contracts, working down the inventory.

## House rules that bite here

- **Code signing is permanently prohibited.** Never add a signer. Say plainly
  that artifacts are unsigned.
- **CI runs no tests and no lint.** It builds, packages and publishes. Local
  checks are still run in the task that changes the code; they simply never gate.
- **Never capture the populated Installed or Software updates screens.** That is
  the machine's real software inventory and it is personal data. The committed
  captures use a public catalogue search for this reason.
