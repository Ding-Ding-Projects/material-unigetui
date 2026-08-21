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
- [ ] **Site actually deployed** — Pages is enabled and the workflow is committed,
      but runs sit queued and never start on this account, so
      `https://ding-ding-projects.github.io/material-unigetui/` still returns 404.
      Two earlier runs failed on an over-broad asset guard, which is fixed. This
      is an external blocker, not a missing file.
- [x] `social-preview.png` rendered and committed at the repository root
- [ ] **Social preview uploaded to the repository settings** — the API cannot do
      this; it needs one manual step (see README)
- [ ] Package operations reachable from the interface (the queue exists; nothing
      triggers it yet)
- [ ] `build.bat` / `build-installer.bat` / `download-dependencies.bat`
- [ ] Unsigned Squirrel.Windows installer

## Phase 2 — The rest of the managers

- [ ] Scoop
- [ ] Chocolatey
- [ ] Pip
- [ ] Npm
- [ ] Cargo
- [ ] Dotnet
- [ ] PowerShell
- [ ] PowerShell 7
- [ ] Vcpkg
- [ ] Bun

Deliberately out of scope while delivery is Windows-only: Apt, Dnf, Flatpak,
Homebrew, Pacman, Snap. They exist upstream and are not being ported.

## Phase 3 — The remaining routes

- [ ] Package bundles
- [ ] Operation history
- [ ] Automation · CLI & IPC
- [ ] File converter
- [ ] Ollama suite manager
- [ ] Authenticator
- [ ] Logs
- [ ] Support Tickets
- [ ] Help & About
- [ ] Settings, and its 15 sub-tabs

## Phase 4 — The universal contracts

Each has a row in the inventory with its own seven evidence dimensions. None is
optional; the ordering below is about sequence, not priority.

- [ ] Language modes and both funny-level sliders wired to rendered copy
- [ ] Tabs: docking, pinning, grouping, the four tab searches, bulk close
- [ ] Anchored regex builder on every field, dropdown and context menu
- [ ] Command palette on `Ctrl+Shift+F` with exact-element navigation
- [ ] Appearance customization, per-element editors, infinite colour picker
- [ ] Toy locks, Support Tickets recovery, the unlock ladder
- [ ] TOTP pairing and the built-in authenticator
- [ ] Notifications and a reviewable centre
- [ ] Destructive-action super confirmation
- [ ] Bulk actions, universal export, local version history
- [ ] Offline documentation browser
- [ ] ADHD modes
- [ ] School mode and personal-vocabulary upload
- [ ] Narrator and voice selection
- [ ] Status Hub registration
- [ ] Accessibility and responsive sizing proven by capture, not assertion

## Deliberately not doing

- Running UniGetUI's C# engine at runtime. The submodule is a reference for
  command lines and parsing rules only; the backend is reimplemented natively.
  This was raised with its cost stated and chosen anyway.
- Code signing, ever. Artifacts are unsigned and will show an unknown-publisher
  warning; the release notes must say so rather than implying otherwise.
