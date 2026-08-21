# Contributing

## Before you start

Read [HANDOFF.md](HANDOFF.md). It records the traps this project has already
paid for, and most of them are invisible from the source.

## Setting up

```bash
npm install
node script/ensure-electron-binary.mjs
npm run build
npm start
```

## Before you open a pull request

```bash
npm test               # includes a test that spawns the real winget
npm run test:negative  # must catch all nine sabotages
npx electron script/verify-site.cjs   # only if you touched site/
```

If you changed a UI surface, **look at the built application**, not just the
tests. A component test that injects its dependency proves the screen and
nothing about the wiring behind it.

## House rules

- **Never add code signing.** It is prohibited here, permanently.
- **Never add a gating test or lint job to CI.** Checks run locally.
- **Never commit a capture of the populated Installed or Software updates
  screens.** That is a real software inventory and it is personal data.
- **Adopting a contract means adding its row to the inventory**, marked
  `pending` with a reason, in the same change. A pending row is fine; a missing
  row fails the build.
- Commit messages are bilingual, English and Hong Kong-style Cantonese, and both
  halves say what actually changed. Joke about the code, never about a person.
