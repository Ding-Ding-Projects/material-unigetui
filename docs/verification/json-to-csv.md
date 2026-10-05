# JSON-to-CSV verification scope

Candidate based on `fd6fce6731d16143ad32232b348ce9dd19d31150`, checked on
2026-10-05 in an isolated Linux cloud checkout. Main and open PRs/issues were
read through the authenticated GitHub plugin; no collision was observed.

## Evidence

- Focused parser, real-filesystem host, and React component tests exercise
  strict JSON shape/encoding and resource bounds, exact CSV bytes, formula-like
  cell handling, bounded Unicode preview, token ownership/expiry/replay,
  cancellation before publication, duplicate clicks, denied overwrites,
  file/symlink rejection, cleanup reporting and localized status/error copy.
- The production webpack main/preload/renderer build is checked, with only the
  existing asset/entrypoint size advisories. `verify:converter-built` executes
  the actual built main and preload, simulated native dialogs and real file I/O.
  It does not execute a native renderer or take a screenshot.
- `npm test`, the existing negative guard, symbol/font validators and inventory
  checks are run against the final candidate. `npm test`: 236 tests, 229 passed,
  7 skipped, 0 failed. Skips are four unavailable unsigned installer/artifact
  checks, two Windows command-injection tests and the unavailable live WinGet
  test. The converter-focused subset has 56 passes and no skips.
- Completeness negative guard: all 9 sabotages caught, then restored green.
  Symbol validator: 71 ligatures valid. Font validator: 40 matching digests.
  Site source coverage: 12/12; this is not browser interaction evidence.

## Not claimed

No native dialog interaction, Windows runtime/installer test, live screen-reader
or keyboard audit, rendered theme/language capture, performance claim or complete
feature-contract pass is asserted. Electron 42.0.1 reports its version, but an ordinary headless app launch
(`electron --ozone-platform=headless app --user-data-dir=<fresh temporary path>`)
exits 133 at `process_singleton_posix.cc:299`: `socket() failed: Operation not
permitted (1)`. No sandbox/security bypass is used.
Existing screenshots are historical and are not proof of this lane.

The full converter remains partial. Other formats and PDF operations, batches,
queue/history/recovery and independent website behavior are open. Only public,
synthetic fixtures are used; no taxpayer data, personal vocabulary or populated
installed-software screens enter the candidate.
