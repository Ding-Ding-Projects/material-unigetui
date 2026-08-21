# The WinGet driver

## Behaviour

Drives Microsoft's `winget` CLI as a child process and turns its output into the
application's package model. It is the only driver implemented so far.

| Operation | Command |
| --- | --- |
| Search | `winget search --query <q> --disable-interactivity --accept-source-agreements` |
| Installed | `winget list …` |
| Updates | `winget upgrade --include-unknown …` |
| Install | `winget install --id <id> --exact --accept-package-agreements …` |
| Update | `winget upgrade --id <id> --exact …` |
| Uninstall | `winget uninstall --id <id> --exact …` |

Long operations stream output line by line to `parseOutput`, which reports a
percentage when winget prints one and reports none when it does not. It never
invents a number: no progress is honest, a fabricated bar is not.

### Why the output is parsed as a table

Upstream UniGetUI's C# calls winget with `--output json`. **That flag does not
exist on most installed versions.** winget v1.29.290 rejects it outright, and
`winget features` lists no experimental gate that would enable it. The
fixed-width table parser is therefore the primary path, not a legacy fallback.

Columns are sliced at offsets derived from the header row. Splitting on
whitespace looks correct against a tidy sample and then corrupts every package
whose name contains a space — and most do:

```
Name                               Id                        Version
Advanced Archive Password Recovery Elcomsoft.ArchivePassword 4.66.266.6965
```

A whitespace split turns that name into `Advanced`.

## Configuration

None yet. The executable is resolved from `PATH`. Per-manager executable
overrides are designed (`manager set-executable` in the design handoff) and not
implemented.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| winget absent | `isAvailable()` returns `available: false` with the reason; the manager list shows it |
| A command exits non-zero | The operation is marked `failed` with the exit code named |
| The operation is cancelled | Marked `cancelled`, not `failed` — the user asked for it |
| Output format changes | `parseHeaderSpans` returns `null`, so a format change is distinguishable from "no packages matched" |
| One manager throws during a multi-manager search | Its results are empty; the other managers still return |

## Security considerations

- Arguments are passed as an argv array to `spawn`, never through a shell, so a
  package name cannot become a command.
- `--disable-interactivity` prevents a child process from blocking forever
  waiting for input nobody can give it.
- `--silent` and `--interactive` are mutually exclusive; sending both makes
  winget reject the whole command. There is a test asserting they never coexist.
- Elevation is explicit and never inferred. Pipes are redirected rather than
  inherited, because an elevated child with inherited pipes is how an install
  hangs with nothing to show.

## Verification

- `app/test/unit/winget-driver-test.mjs` — argv construction, the mutually
  exclusive flags, progress parsing, **and a test that spawns the real winget**
  and asserts on what it returns.
- `app/test/unit/winget-table-parser-test.mjs` — parses a golden fixture
  captured from real output, CRLF intact, and asserts the space-containing name
  survives.
- `app/test/fixtures/manager-output/winget-search-7zip.txt` — the fixture. It is
  protected from end-of-line normalisation by `.gitattributes`; without that,
  Git strips the CRLF the fixture exists to preserve.

The parser suite was watched failing on a deliberately whitespace-splitting
implementation before being trusted. A guard nobody has seen fail proves nothing.
