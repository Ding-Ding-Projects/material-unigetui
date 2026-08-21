# Personal vocabulary

## Behaviour

A user may supply a private JSON file of word replacements that are applied to
user-facing text. **Nothing ships with this application.** Until a valid file is
chosen, every surface renders its original wording — there are no built-in
mappings, no samples and no templates. The control is always visible; the data
never is.

Replacements apply at the text boundary only, after translation and after the
funny level, so they can never reach a command, an identifier, a path or a
package id.

## Configuration

Settings → Vocabulary → **Choose a JSON file…**, and **Clear** to remove it.

```json
{ "version": 1, "entries": { "package": "parcel", "install": "summon" } }
```

Longest key wins, so a longer phrase is not broken up by a shorter one that is a
prefix of it. Word-like keys match at word boundaries, so `install` does not turn
`reinstalled` into `resummoned`.

## Failure modes

The file is validated whole before anything is displayed or cached, and a
rejected file applies **nothing at all** — a half-applied vocabulary is a
surface that disagrees with itself.

| Rejected | Why |
| --- | --- |
| Over 256 KB | Checked before reading, not after |
| Not valid JSON | Reported with the parser's own message |
| An array, or not an object | The document must be an object |
| Unknown `version` | This build reads version 1 |
| Missing `entries` | Nothing to apply |
| An unexpected top-level field | The schema is closed, not open |
| A non-string or over-long value | Values are strings under 512 characters |
| An empty or over-long key | Keys are 1–128 characters |
| A duplicate key | `JSON.parse` collapses these silently, so it is detected on the raw text |
| `__proto__`, `constructor`, `prototype` | An unsafe object key |
| Nested more than two deep | The document is flat by contract |
| More than 2000 entries | Bounded |

## Security considerations

Everything is local: parsing, validation and replacement make no network
request. The contents never reach a log, an export, a capture, telemetry, a
crash report or any public record — and the rejection message is deliberately
built without echoing the file's own words or its path, both of which are
private.

## Verification

`app/test/unit/personal-vocabulary-test.mjs` covers all twelve rejection paths,
asserts that a rejected file leaves nothing loaded, and asserts that a rejected
key does not appear in the message the user is shown.
