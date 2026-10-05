import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'
const { convertJsonToCsv } = loadCompiled('main-process/converter/json-csv.ts')
const { JSON_CSV_LIMITS: limits } = loadCompiled('shared/converter-contract.ts')
const convert = raw => convertJsonToCsv(Buffer.from(raw))
const rejects = (raw, code) => assert.throws(() => convert(raw), error => error.code === code)

test('JSON to CSV preserves first-row key order and quotes commas, quotes, newlines and Unicode', () => {
  const result = convert('[{"name":"A, B","note":"say \\\"hi\\\"\\n再見","yes":true,"none":null,"n":12},{"n":-12,"none":"","yes":false,"note":"😀","name":"last"}]')
  assert.equal(result.csv, '"name","note","yes","none","n"\r\n"A, B","say ""hi""\n再見","true","","12"\r\n"last","😀","false","","-12"\r\n')
  assert.equal(result.rows, 2)
  assert.equal(result.columns, 5)
  assert.equal(result.bytes, Buffer.byteLength(result.csv))
})

test('formula-like strings and headers are escaped but safe integer numbers are not', () => {
  const result = convert(JSON.stringify([{ '=header': '=HYPERLINK("https://example.invalid")', normal: ' \t@SUM(A1)', third: '\ntext', fourth: -23 }]))
  assert.equal(result.escapedCells, 4)
  assert.equal(result.headers[0], "'=header")
  assert.deepEqual(result.sample[0], ["'=HYPERLINK(\"https://example.invalid\")", "' \t@SUM(A1)", "'\ntext", '-23'])
})

for (const raw of ['[]', '{}', '[{}]', '[null]', '[1]', '[[]]', '[{"a":{}}]', '[{"a":[]}]', '[{"a":1},{"b":2}]', '[{"a":1},{"a":2,"b":3}]', '[{"a":1,"a":2}]', '[{"a":1,"\\u0061":2}]']) {
  test(`unsupported shape rejected: ${raw}`, () => rejects(raw, 'shape'))
}
for (const raw of ['', '[{"a":tru}]', '[{"a":01}]', '[{"a":"unfinished}]', '[{"a":1}] trailing', '[{"a":1}']) {
  test(`invalid JSON rejected: ${raw}`, () => assert.throws(() => convert(raw)))
}
for (const value of ['1.5', '1e2', '9007199254740992', '-9007199254740992', '1e999']) {
  test(`lossy/unsupported numeric syntax rejected: ${value}`, () => rejects(`[{"a":${value}}]`, 'number'))
}

test('integer boundaries, negative zero, BOM and prototype-named keys are preserved', () => {
  const result = convert('\ufeff[{"__proto__":9007199254740991,"constructor":-9007199254740991,"zero":-0}]')
  assert.ok(result.csv.includes('"9007199254740991","-9007199254740991","-0"'))
})

test('invalid UTF-8 and unpaired surrogate/control strings fail closed', () => {
  assert.throws(() => convertJsonToCsv(Buffer.from([0xff])), error => error.code === 'encoding')
  for (const raw of ['[{"a":"\\ud800"}]', '[{"a":"\\udc00"}]', '[{"a":"\\u0000"}]', '[{"\\u0001":"value"}]']) rejects(raw, 'encoding')
})

test('input, row, column, cell and string limits are enforced', () => {
  rejects(' '.repeat(limits.inputBytes + 1), 'limit')
  rejects(JSON.stringify(Array(limits.rows + 1).fill({ a: 1 })), 'limit')
  rejects(JSON.stringify([Object.fromEntries(Array.from({ length: limits.columns + 1 }, (_, i) => [String(i), 1]))]), 'limit')
  rejects(JSON.stringify(Array(1001).fill(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), null])))), 'limit')
  rejects(JSON.stringify([{ a: 'x'.repeat(limits.stringLength + 1) }]), 'limit')
})

test('preview is bounded and does not clip saved data or split Unicode pairs', () => {
  const input = Array.from({ length: 4 }, () => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i), '😀'.repeat(121)])))
  const result = convert(JSON.stringify(input))
  assert.equal(result.sample.length, 3)
  assert.equal(result.headers.length, 5)
  assert.equal(result.sample[0].length, 5)
  assert.equal(result.sample[0][0], '😀'.repeat(120) + '…')
  assert.ok(result.csv.includes('😀'.repeat(121)))
})

test('output byte guard rejects before returning oversized CSV', () => {
  const previous = limits.outputBytes
  limits.outputBytes = 5
  try { rejects('[{"a":"long value"}]', 'limit') }
  finally { limits.outputBytes = previous }
})
