import { JSON_CSV_LIMITS as LIMITS, ConverterErrorCode } from '../../shared/converter-contract'

export class ConversionError extends Error {
  public constructor(public readonly code: ConverterErrorCode) { super(code) }
}

export interface ConvertedCsv {
  readonly csv: string
  readonly rows: number
  readonly columns: number
  readonly bytes: number
  readonly escapedCells: number
  readonly headers: readonly string[]
  readonly sample: readonly (readonly string[])[]
}

/**
 * A deliberately small JSON grammar: a nonempty array of same-key, nonempty
 * flat objects, containing strings, safe integer literals, booleans or null.
 * Unlike JSON.parse(object), this rejects duplicate keys and lossy numbers.
 * No recursive calls, arbitrary decoder, external executable or network.
 */
export function convertJsonToCsv(bytes: Uint8Array): ConvertedCsv {
  const fail = (code: ConverterErrorCode): never => { throw new ConversionError(code) }
  if (bytes.byteLength > LIMITS.inputBytes) fail('limit')
  let source: string
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return fail('encoding') }
  let position = 0
  const whitespace = () => { while (/[\x20\t\r\n]/.test(source[position] ?? '\0')) position++ }
  const consume = (char: string) => {
    whitespace()
    if (source[position] !== char) fail('invalid-json')
    position++
  }
  const string = (): string => {
    whitespace()
    if (source[position] !== '"') return fail('shape')
    const start = position++
    while (position < source.length) {
      const char = source[position++]
      if (position - start > LIMITS.stringLength * 6 + 2) fail('limit')
      if (char === '\\') { position++; continue }
      if (char !== '"') continue
      let value: string
      try { value = JSON.parse(source.slice(start, position)) as string }
      catch { return fail('invalid-json') }
      if (value.length > LIMITS.stringLength) fail('limit')
      // Reject NUL/control bytes and lone surrogates rather than corrupting UTF-8.
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) fail('encoding')
      return value
    }
    return fail('invalid-json')
  }
  let escapedCells = 0
  const protect = (value: string): string => {
    // Apply to headers too. Quotes alone do not prevent spreadsheet formulas.
    if (/^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value)) {
      escapedCells++
      return `'${value}`
    }
    return value
  }
  const scalar = (): string => {
    whitespace()
    if (source[position] === '"') return protect(string())
    if (source[position] === '{' || source[position] === '[') return fail('shape')
    const start = position
    while (position < source.length && !/[\x20\t\r\n,}\]]/.test(source[position]!)) position++
    const token = source.slice(start, position)
    if (token === 'null') return ''
    if (token === 'true' || token === 'false') return token
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) return fail('invalid-json')
    if (!/^-?(?:0|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token))) return fail('number')
    return token
  }
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
  let output = ''
  let outputBytes = 0
  const append = (values: readonly string[]) => {
    const line = `${values.map(quote).join(',')}\r\n`
    outputBytes += Buffer.byteLength(line, 'utf8')
    if (outputBytes > LIMITS.outputBytes) fail('limit')
    output += line
  }
  const truncate = (value: string) => {
    const clipped = Array.from(value).slice(0, LIMITS.previewLength).join('')
    return clipped.length < value.length ? `${clipped}…` : clipped
  }
  let headers: string[] = []
  let previewHeaders: string[] = []
  const sample: string[][] = []
  let rows = 0
  whitespace()
  if (source[position] !== '[') fail('shape')
  consume('[')
  whitespace()
  if (source[position] === ']') fail('shape')
  while (position < source.length) {
    if (++rows > LIMITS.rows) fail('limit')
    whitespace()
    if (source[position] !== '{') fail('shape')
    consume('{')
    const row = new Map<string, string>()
    whitespace()
    if (source[position] === '}') fail('shape')
    while (position < source.length) {
      const key = string()
      if (row.has(key)) fail('shape')
      if (row.size >= LIMITS.columns) fail('limit')
      consume(':')
      row.set(key, scalar())
      whitespace()
      if (source[position] !== ',') break
      position++
    }
    consume('}')
    if (rows === 1) {
      headers = [...row.keys()]
      const safeHeaders = headers.map(protect)
      previewHeaders = safeHeaders.slice(0, LIMITS.previewColumns).map(truncate)
      append(safeHeaders)
    }
    if (rows * headers.length > LIMITS.cells) fail('limit')
    if (row.size !== headers.length || headers.some(key => !row.has(key))) fail('shape')
    const values = headers.map(key => row.get(key)!)
    append(values)
    if (sample.length < LIMITS.previewRows) sample.push(values.slice(0, LIMITS.previewColumns).map(truncate))
    whitespace()
    if (source[position] !== ',') break
    position++
  }
  consume(']')
  whitespace()
  if (position !== source.length) fail('invalid-json')
  return { csv: output, rows, columns: headers.length, bytes: outputBytes, escapedCells, headers: previewHeaders, sample }
}
