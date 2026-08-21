/**
 * Parser for winget's fixed-width table output.
 *
 * winget gained `--output json` after v1.29, and the upstream reference assumes
 * it. Real installs in the field are older than that, so this parser is the
 * fallback path, not a legacy curiosity — it is what runs on most machines
 * today.
 *
 * Columns MUST be sliced at offsets derived from the header row. Splitting on
 * whitespace looks correct against a tidy sample and then silently corrupts
 * every package whose name contains a space, which is most of them:
 *
 *     Advanced Archive Password Recovery  Elcomsoft.ArchivePassword  4.66...
 */

export interface WinGetTableRow {
  readonly [column: string]: string
}

/** A column and the character offset its values start at. */
interface ColumnSpan {
  readonly name: string
  readonly start: number
  /** Exclusive; undefined for the final column, which runs to end of line. */
  readonly end: number | undefined
}

/**
 * Locates each column by finding its header label in the header line.
 *
 * Returns null when the line does not look like a winget header, so a caller
 * can tell "no packages matched" apart from "the format changed under us".
 */
export function parseHeaderSpans(
  headerLine: string,
  expected: readonly string[]
): readonly ColumnSpan[] | null {
  const starts: Array<{ name: string; start: number }> = []
  let cursor = 0

  for (const name of expected) {
    const index = headerLine.indexOf(name, cursor)
    if (index === -1) {
      return null
    }
    starts.push({ name, start: index })
    cursor = index + name.length
  }

  return starts.map((column, i) => ({
    name: column.name,
    start: column.start,
    end: starts[i + 1]?.start,
  }))
}

/** True for the `-------` rule winget prints under its header. */
function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.length > 0 && /^-+$/.test(trimmed)
}

/**
 * Parses a winget table into rows keyed by column name.
 *
 * `expected` names the columns this command emits, in order — for `search`
 * that is Name, Id, Version, Match, Source.
 */
export function parseWinGetTable(
  output: string,
  expected: readonly string[]
): readonly WinGetTableRow[] {
  // Normalise line endings before anything splits. winget emits CRLF; a split
  // on '\n' alone leaves a trailing '\r' on every single field, which then
  // travels all the way into a package id and fails to match anything.
  const lines = output.replace(/\r\n/g, '\n').split('\n')

  let spans: readonly ColumnSpan[] | null = null
  const rows: WinGetTableRow[] = []

  for (const line of lines) {
    if (spans === null) {
      spans = parseHeaderSpans(line, expected)
      continue
    }
    if (isSeparatorLine(line) || line.trim().length === 0) {
      continue
    }

    const row: Record<string, string> = {}
    for (const span of spans) {
      row[span.name] = line.slice(span.start, span.end).trim()
    }

    // A row with no id is winget chatter (progress spinners, agreement
    // notices), not a package. Dropping it here keeps the caller simple.
    if ((row['Id'] ?? '').length > 0) {
      rows.push(row)
    }
  }

  return rows
}
