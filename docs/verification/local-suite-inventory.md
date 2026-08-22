# Local suite inventory

Hand-written, one row per gate. A feature omitted from this table has not been
checked — a registry that only lists what it discovered cannot notice a suite
that was never written, which is the whole reason this is written by hand.

Verified at commit `c75bccd` on 2026-08-22.

## Suites that exist and pass

| Suite | Command | Scope | Evidence |
| --- | --- | --- | --- |
| Unit | `npm test` | 180 tests across 15 files | all passing, zero skipped |
| Type check | `npx tsc --noEmit -p tsconfig.json` | whole source tree, strict | clean |
| Negative regression | `npm run test:negative` | the completeness guard | 9 of 9 sabotages caught, each watched red then green |
| Site behaviour | `npx electron script/verify-site.cjs` | the real generated page, driven | 10 of 10 |
| Packaging | `build-installer.bat /s` | full Squirrel.Windows route | `MaterialUniGetUISetup.exe`, `RELEASES`, full `.nupkg`; `NotSigned` asserted from the PE certificate table |
| Application icon | `npm test` (`app-icon-test.mjs`) | ICO directory read from bytes | 7 entries, 16–256px, embedded bytes found inside the packaged executable |
| Line count | `npm run count-lines` | committed counter | 32,273 project lines; arithmetic self-checked |
| Runtime smoke | `node script/capture-matrix.mjs` | every route, three settings tabs, the regex builder, the command palette, the tab-strip search, dark theme and a narrow viewport | 21 captures under `docs/assets/screenshots/`, driven over the debugging protocol against the real built artifact |
| Installer runtime | headless install, launch, uninstall | the real `Setup.exe` | `docs/assets/screenshots/route-installed.png` |
| Driver integration | `npm test` (`winget-driver-test.mjs`) | spawns the real `winget` | live results asserted |
| Command injection | `npm test` (`windows-command-test.mjs`) | spawns real `cmd.exe` with a hostile package name | watched failing with the escaping removed |
| TOTP conformance | `npm test` (`totp-test.mjs`) | RFC 6238 vectors | all six, SHA-1/256/512 |
| Unlock ladder | `npm test` (`unlock-ladder-test.mjs`) | nonce, expiry, budget at both guards, timing floor, mole grading | watched failing on each guard |
| Vendored fonts | `npm run validate:fonts` | every file named in the font manifest | 40 files, SHA-256 each; watched red on a flipped byte |
| Icon ligatures | `npm run validate:symbols`, `npm test` (`icon-ligature-usage-test.mjs`) | every glyph name the design and the source use, against the shipped font's own GSUB ligature table | all resolve; watched red on a fabricated name |
| Material Design 3 tokens | `npm test` (`md3-token-contract-test.mjs`) | every token a stylesheet reads is declared, and none is declared twice with different values | clean; watched red on an undeclared token |
| Chrome structure | `npm test` (`top-app-bar-nav-drawer-tabs-structure-test.mjs`) | app-bar and drawer roles and names, tab-strip roving focus and `aria-controls` | clean; each assertion watched red against synthetic broken markup |
| Localization coverage | `npm test` (`ported-ui-localization-test.mjs`) | no hard-coded user-facing string in the ported chrome; no duplicate translation key | clean; watched red on a real hard-coded string and a synthetic duplicate key |
| Site contract coverage | `npm run site:coverage` | hand-written enumeration of every contract the published site must carry | 12 of 12; watched red with the embed meta removed |
| Offline documentation bundle | `npm run generate:docs-bundle` | every feature article bundled for the in-app browser | 18 articles; watched red with one filtered out |
| Design parity | `npm run design-parity:guard`, `npm test` (`design-parity-guard-test.mjs`) | 13 hand-written rows: both captures, tuple, Material audit, side-by-side and diff per screen | 13 of 13 evidenced, diffs 5.66-12.44%; six removal cases each watched red then green |

## Suites the contract requires that do NOT exist

These are gates this pass **does not** satisfy. They are listed rather than
omitted, because a missing row reads as an oversight to the next person and as
a decision to nobody.

| Suite | Why it does not exist |
| --- | --- |
| File-conversion, PDF operations, adapter bundling, queue recovery | The converter's catalog and its per-category search are ported, and no converter bridge exists behind them, so there is nothing to test. |
| Ollama local-API, model catalog, hardware fit, pull queue, streaming chat, harness launch, configuration rollback | The manager's chrome is ported and no model-manager bridge exists behind it, so there is nothing to test. |
| Browser-extension download start/progress/completion dialogs | No browser extension is implemented. |
| Logo preset, custom upload, crop/fit/background, display-size conversion | The application *mark* exists and is verified; user-side logo customization does not. |
| End-to-end / Playwright | None written. The runtime smoke above is manual driving of the built artifact. |
| Lint / formatter / static analysis | None configured. |
| Documentation-site build | The site is generated and behaviour-checked; there is no separate docs build. |
| Security | No dedicated suite. The security-relevant paths — command injection, secret storage, ladder grading — have their own tests above. |
| Accessibility, automated | Roles, names and focus order are asserted for the chrome and the tab strip, and every surface is implemented against the rules, but no automated audit runs across the whole tree. |

## What this means for the closeout

**The release-grade gates are not all satisfied**, and the pass is reported that
way. What is proven is proven; what is missing is named. The complete
machine-readable position is
`app/test/fixtures/feature-completeness/evidence-paths.json`: **75 of 434
evidence records present**.
