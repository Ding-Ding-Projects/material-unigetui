# Local suite inventory

Hand-written, one row per gate. A feature omitted from this table has not been
checked — a registry that only lists what it discovered cannot notice a suite
that was never written, which is the whole reason this is written by hand.

Verified at commit `1f3f86c` on 2026-08-22.

## Suites that exist and pass

| Suite | Command | Scope | Evidence |
| --- | --- | --- | --- |
| Unit | `npm test` | 141 tests across 10 files | all passing |
| Type check | `npx tsc --noEmit -p tsconfig.json` | whole source tree, strict | clean |
| Negative regression | `npm run test:negative` | the completeness guard | 9 of 9 sabotages caught, each watched red then green |
| Site behaviour | `npx electron script/verify-site.cjs` | the real generated page, driven | 10 of 10 |
| Packaging | `build-installer.bat /s` | full Squirrel.Windows route | `MaterialUniGetUISetup.exe`, `RELEASES`, full `.nupkg`; `NotSigned` asserted from the PE certificate table |
| Application icon | `npm test` (`app-icon-test.mjs`) | ICO directory read from bytes | 7 entries, 16–256px, embedded bytes found inside the packaged executable |
| Line count | `npm run count-lines` | committed counter | 22,801 project lines; arithmetic self-checked |
| Runtime smoke | headless launch + drive | Discover, Updates, Installed, Settings, Logs, Tickets, Authenticator | captures under `docs/assets/screenshots/` |
| Installer runtime | headless install, launch, uninstall | the real `Setup.exe` | `docs/assets/screenshots/installed-app.png` |
| Driver integration | `npm test` (`winget-driver-test.mjs`) | spawns the real `winget` | live results asserted |
| Command injection | `npm test` (`windows-command-test.mjs`) | spawns real `cmd.exe` with a hostile package name | watched failing with the escaping removed |
| TOTP conformance | `npm test` (`totp-test.mjs`) | RFC 6238 vectors | all six, SHA-1/256/512 |
| Unlock ladder | `npm test` (`unlock-ladder-test.mjs`) | nonce, expiry, budget at both guards, timing floor, mole grading | watched failing on each guard |

## Suites the contract requires that do NOT exist

These are gates this pass **does not** satisfy. They are listed rather than
omitted, because a missing row reads as an oversight to the next person and as
a decision to nobody.

| Suite | Why it does not exist |
| --- | --- |
| File-conversion, PDF operations, adapter bundling, queue recovery | No file converter is implemented. |
| Ollama local-API, model catalog, hardware fit, pull queue, streaming chat, harness launch, configuration rollback | No Ollama manager is implemented. |
| Browser-extension download start/progress/completion dialogs | No browser extension is implemented. |
| Logo preset, custom upload, crop/fit/background, display-size conversion | The application *mark* exists and is verified; user-side logo customization does not. |
| Accessibility | No automated accessibility suite. Keyboard operation, focus rings, roles and names are implemented per surface but not yet asserted. |
| Localization coverage | The i18n engine and both funny levels are tested; no suite asserts every rendered string passes through them. |
| End-to-end / Playwright | None written. The runtime smoke above is manual driving of the built artifact. |
| Lint / formatter / static analysis | None configured. |
| Documentation-site build | The site is generated and behaviour-checked; there is no separate docs build. |
| Security | No dedicated suite. The security-relevant paths — command injection, secret storage, ladder grading — have their own tests above. |
| Capture coverage across every surface | Seven surfaces are captured. The full matrix, including narrow layout and contrast theme, is not. |

## What this means for the closeout

**The release-grade gates are not all satisfied**, and the pass is reported that
way. What is proven is proven; what is missing is named. The complete
machine-readable position is
`app/test/fixtures/feature-completeness/evidence-paths.json`: **75 of 434
evidence records present**.
