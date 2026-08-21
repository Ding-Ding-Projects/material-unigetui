# Agent instructions

A sanitized mirror of the shared instructions this project is developed under.
Edit the canonical instructions first; this file is a copy, so changing it here
does not propagate anywhere.

## Non-negotiable

**Code signing is permanently prohibited.** Never request, generate, store, or
use a signing certificate, and never add a signing step. Artifacts are unsigned
and will trigger an unknown-publisher warning on Windows; say so plainly in
release notes rather than implying otherwise.

**CI runs no tests and no lint.** Workflows build, package and publish. They must
not gain a gating test, lint, type-check or coverage job. Checking moves to the
task that changes the code: run the suite locally, report the real result, and
fix what breaks — it simply never blocks a release.

**Never capture the populated Installed or Software updates screens.** They list
the machine's real software inventory, which is personal data and must not enter
a public repository. Committed captures use a public catalogue search instead.

**The renderer stays isolated.** `contextIsolation: true`, node integration off,
and a preload bridge exposing named calls only. Never add a generic
`invoke(channel, …)` forwarder — it hands the renderer the whole main process.
There is a guard test asserting this; it is deliberate, not an oversight.

**The reference submodule is never executed.** `vendor/unigetui-reference` is
pinned shallow at a release tag and is read for command lines and parsing rules.
Reimplement in TypeScript; do not shell out to it.

## Working discipline

- Prefer reversible, auditable changes. Read repository documentation before
  editing. Keep changes scoped and report concrete evidence.
- Every task that changes this repository ends with the work committed, merged
  to the default branch, pushed, and the push verified.
- Commit messages are bilingual — concise English plus playful Hong Kong-style
  Cantonese — and both halves state what actually changed. Humour styles the
  telling, never the facts. Roast the code, never a person.
- Scan the repository's open issues before finishing, and again at natural
  checkpoints. Fix what is actionable; comment the exact blocker on what is not.

## Verifying

- `npm test` — unit tests, including one that spawns the real `winget`.
- `npm run test:negative` — breaks the completeness guard nine ways and requires
  it to go red each time. **A guard nobody has watched fail is a decoration.**
- `npx electron script/verify-site.cjs` — drives the real site and checks
  behaviour, not markup.
- Verify a UI change against the **built artifact**, not the source. A component
  test that injects its dependency proves the screen and nothing about the wiring.

## Traps recorded here so nobody pays for them twice

- **`winget --output json` does not exist on most installed versions.** The
  fixed-width table parser is the primary path.
- **Slice columns at header offsets.** A whitespace split corrupts every package
  name containing a space.
- **Golden fixtures must not be end-of-line normalised.** `.gitattributes` marks
  the fixture directory `-text`; without it the CRLF the fixture exists to
  preserve is silently stripped.
- **npm's install-script gate can leave the electron package with no binary.**
  Repair it with the committed helper, and judge success by the binary existing
  rather than by the installer's exit code.
- **A backslash does not survive being written through a shell.** Prefer a regex
  literal, or `startsWith`, over a pattern assembled in a shell string.
- **Normalise line endings before any multi-line regex.** On a CRLF checkout an
  un-normalised pattern fails for a line that is genuinely present, and that
  failure looks exactly like a deletion.
- **Assert an empty derived list before iterating it.** A loop over an
  accidentally empty list passes by doing nothing.

## Contracts

Every user-facing surface in this project — the application and the published
site alike — is expected to carry the full feature contract set: language modes,
accessibility, tabs and searches with anchored regex builders, appearance
customization, notifications, exports, local history, and the rest. The complete
list lives in `app/test/fixtures/feature-completeness/canonical-features.json`,
with per-dimension evidence beside it. A contract that is not built yet has a
row marked `pending` with a written reason. **A pending row is acceptable; a
missing row fails the build.**
