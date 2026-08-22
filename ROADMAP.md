# Roadmap

A tick here means **implemented, verified, and — where it claims something
visible — captured from the real built artifact**. Work that is written but
unverified stays unticked with its state named beside it. A roadmap full of
optimistic ticks is worse than none, because it is the one file a next owner
trusts to say what is left.

Machine-checked status lives in
`app/test/fixtures/feature-completeness/evidence-paths.json`; this file is the
human view of the same thing.

## Phase 1 — A runnable application

- [x] Oak Kay scaffolded on `Ding-Ding-Projects`
- [x] Design canvas committed under `design/` as real, diffable files
- [x] UniGetUI pinned as a shallow reference submodule at `v2026.2.7` (95 MB, not 896 MB)
- [x] Material Design 3 token contract lifted verbatim from the design reference
- [x] Isolated renderer — `contextIsolation: true`, no node integration, named preload bridge
- [x] Custom title bar; the operating-system frame is never product chrome
- [x] All 13 routes present in the nav rail
- [x] WinGet driver, with a test that spawns the real executable
- [x] Fixed-width table parser proven against captured real output
- [x] Operations queue that replaces the design's simulated completion
- [x] Discover, Software updates and Installed reading live data
- [x] Completeness inventory: 62 contracts
- [x] Guard test with anchored assertions
- [x] Executable negative regression — 9/9 sabotages caught
- [x] Documentation site built and generated from the inventory, 10/10 behaviour
      checks passing locally against the real page
- [x] **Site deployed and verified** — live at
      `https://ding-ding-projects.github.io/material-unigetui/`, serving 62 contract
      rows and its Open Graph tags, with `og:image` reachable unauthenticated.
      Runs queued for a long time before starting; two earlier ones failed on an
      over-broad asset guard, since fixed.
- [x] `social-preview.png` rendered and committed at the repository root
- [ ] **Social preview uploaded to the repository settings** — the API cannot do
      this; it needs one manual step (see README)
- [x] Package operations reachable from the interface, through the real queue,
      with cancel, live output and forget
- [x] `build.bat` / `build-installer.bat` / `download-dependencies.bat` over one
      PowerShell script, with silent mode and honest per-phase failures
- [x] Unsigned Squirrel.Windows installer, with the signature state asserted from
      the PE certificate table rather than trusted from the configuration
- [x] That installer installed headlessly, launched, captured, and uninstalled
      again — settings persisted across the real install
- [ ] Automatic updates from the Squirrel feed
- [ ] A published release carrying that installer

## Phase 2 — The rest of the managers

All eleven drivers are written and registered. Ticked where the driver was
verified against the real executable on a development machine; the rest are
written but unproven because the manager is not installed here.

- [x] WinGet — verified live (158 installed, 18 updates)
- [x] Chocolatey — verified live (16 installed, 7 updates)
- [x] Pip — verified live (4 installed, 1 update)
- [x] Npm — verified live (5 installed, 3 updates)
- [x] Dotnet — verified live (available, no tools installed)
- [x] PowerShell — verified live (5.1)
- [x] PowerShell 7 — verified live (7.6.5)
- [x] Bun — verified live (1.3.14)
- [ ] Scoop — written, parser tested, not installed on this machine
- [ ] Cargo — written, parser tested, not installed on this machine
- [ ] Vcpkg — written, parser tested, not installed on this machine

Deliberately out of scope while delivery is Windows-only: Apt, Dnf, Flatpak,
Homebrew, Pacman, Snap. They exist upstream and are not being ported.

## Phase 3 — The remaining routes

All fourteen sections of the checked-in design reference are now ported into
the renderer. Two are ticked with an explicit qualification rather than
silently: they render the design's structure and have no backend behind them.

- [x] Package bundles
- [x] Operation history
- [x] Automation · CLI & IPC
- [ ] File converter — the catalog, its eight categories and their search fields
      are ported, but no converter bridge exists, so every format reports no
      bundled adapter and the drop zone is genuinely disabled. Structure only.
- [ ] Ollama suite manager — same: the design's chrome is ported, and the model
      store, fit verdicts, cart, chat and harness profiles have nothing behind
      them. The empty state names exactly what is missing.
- [x] Authenticator
- [x] Logs
- [x] Support Tickets
- [x] Help & About
- [x] Settings, and its 15 sub-tabs

## Phase 4 — The universal contracts

Each has a row in the inventory with its own seven evidence dimensions. None is
optional; the ordering below is about sequence, not priority.

- [x] Language modes and both funny-level sliders wired to rendered copy
- [x] The dim sum surprise, from the public catalog's release assets
- [x] TOTP to the RFC 6238 vectors, and a working authenticator
- [x] The unlock ladder engine, with every safety rule tested and watched failing
- [x] The lock store — per-element, independent credentials, OS-encrypted
- [ ] A lock wizard and unlock prompt on any surface (the store has no caller)
- [ ] A ladder UI (the engine is complete; nothing renders it)
- [ ] QR pairing, and a confirmation step before a TOTP factor arms
- [x] Anchored regex builder on every application and site search field
- [ ] The same builder on every dropdown and context menu — neither exists yet
- [x] Tabs: pinning, grouping, the four tab searches, previewed bulk close
- [ ] Tab strip docking to other edges
- [x] Command palette on `Ctrl+Shift+F` with exact-element navigation
- [x] Destructive-action super confirmation
- [x] Non-blocking notifications
- [ ] A browsable notification centre (history is kept; nothing renders it)
- [x] Bulk actions on the package lists
- [x] School mode forcing English and seriousness
- [x] Personal-vocabulary upload, validated fail-closed
- [x] ADHD mode settings — persisted and documented
- [ ] ADHD modes actually changing the surfaces
- [ ] Appearance: per-element editors, infinite colour picker, presets
- [x] Support Tickets recovery route
- [x] Export — bundles, in six formats, with the lossy ones disclosed first
- [ ] Export for everything else, and local version history
- [ ] Offline documentation browser
- [ ] Narrator and voice selection
- [ ] Status Hub registration
- [ ] Accessibility and responsive sizing proven by capture, not assertion

## Deliberately not doing

- Running UniGetUI's C# engine at runtime. The submodule is a reference for
  command lines and parsing rules only; the backend is reimplemented natively.
  This was raised with its cost stated and chosen anyway.
- Code signing, ever. Artifacts are unsigned and will show an unknown-publisher
  warning; the release notes must say so rather than implying otherwise.
