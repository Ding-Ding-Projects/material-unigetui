import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const {
  parsePersonalVocabulary,
  applyPersonalVocabulary,
  VOCABULARY_LIMITS,
  VOCABULARY_SCHEMA_VERSION,
  describeRejection,
} = loadCompiled('lib/personal-vocabulary.ts')

const valid = JSON.stringify({
  version: VOCABULARY_SCHEMA_VERSION,
  entries: { package: 'parcel', install: 'summon' },
})

test('a valid file loads', () => {
  const result = parsePersonalVocabulary(valid)
  assert.equal(result.ok, true)
  assert.equal(result.count, 2)
  assert.equal(result.entries.get('package'), 'parcel')
})

test('nothing is applied until a file is supplied', () => {
  // The control is always visible; the data never ships with the application.
  assert.equal(applyPersonalVocabulary('install the package', new Map()), 'install the package')
})

test('replacements apply at word boundaries only', () => {
  const entries = new Map([['install', 'summon']])
  assert.equal(applyPersonalVocabulary('install it', entries), 'summon it')
  // "reinstalled" must not become "resummoned".
  assert.equal(applyPersonalVocabulary('reinstalled', entries), 'reinstalled')
})

test('a longer phrase wins over a shorter prefix of it', () => {
  const entries = new Map([
    ['package', 'parcel'],
    ['package manager', 'quartermaster'],
  ])
  assert.equal(
    applyPersonalVocabulary('the package manager', entries),
    'the quartermaster'
  )
})

const rejections = [
  {
    name: 'a file over the byte ceiling',
    raw: () =>
      JSON.stringify({
        version: VOCABULARY_SCHEMA_VERSION,
        entries: { big: 'x'.repeat(VOCABULARY_LIMITS.maxBytes + 10) },
      }),
    kind: 'too-large',
  },
  { name: 'malformed JSON', raw: () => '{ not json', kind: 'not-json' },
  { name: 'a JSON array', raw: () => '[]', kind: 'not-an-object' },
  {
    name: 'an unknown schema version',
    raw: () => JSON.stringify({ version: 99, entries: {} }),
    kind: 'unsupported-version',
  },
  {
    name: 'a missing entries object',
    raw: () => JSON.stringify({ version: VOCABULARY_SCHEMA_VERSION }),
    kind: 'missing-entries',
  },
  {
    name: 'an unexpected top-level field',
    raw: () =>
      JSON.stringify({ version: VOCABULARY_SCHEMA_VERSION, entries: {}, sneaky: 1 }),
    kind: 'unexpected-field',
  },
  {
    name: 'a non-string value',
    raw: () =>
      JSON.stringify({ version: VOCABULARY_SCHEMA_VERSION, entries: { a: 5 } }),
    kind: 'bad-value',
  },
  {
    name: 'an over-long value',
    raw: () =>
      JSON.stringify({
        version: VOCABULARY_SCHEMA_VERSION,
        entries: { a: 'x'.repeat(VOCABULARY_LIMITS.maxValueLength + 1) },
      }),
    kind: 'bad-value',
  },
  {
    name: 'an over-long key',
    raw: () =>
      JSON.stringify({
        version: VOCABULARY_SCHEMA_VERSION,
        entries: { ['k'.repeat(VOCABULARY_LIMITS.maxKeyLength + 1)]: 'v' },
      }),
    kind: 'bad-key',
  },
  {
    name: 'a duplicate key that JSON.parse would silently collapse',
    raw: () => '{"version":1,"entries":{"a":"one","a":"two"}}',
    kind: 'duplicate-key',
  },
  {
    name: 'an unsafe object key',
    raw: () => '{"version":1,"entries":{"__proto__":"nope"}}',
    kind: 'bad-key',
  },
  {
    // Reported as too-deep rather than bad-value: the depth check runs first,
    // and "the document is nested" is the more accurate diagnosis of a nested
    // entry than "that value is not a string".
    name: 'a nested object where a flat map is required',
    raw: () =>
      JSON.stringify({
        version: VOCABULARY_SCHEMA_VERSION,
        entries: { a: { deeper: 'no' } },
      }),
    kind: 'too-deep',
  },
]

assert.ok(rejections.length > 0, 'no rejection cases declared')

for (const rejection of rejections) {
  test(`rejects ${rejection.name}`, () => {
    const result = parsePersonalVocabulary(rejection.raw())
    assert.equal(result.ok, false, `${rejection.name} was accepted`)
    assert.equal(result.rejection.kind, rejection.kind)
    // Every rejection must be explainable to the person who chose the file.
    const described = describeRejection(result.rejection)
    assert.equal(typeof described, 'string')
    assert.ok(described.length > 0)
  })
}

test('a rejected file applies nothing at all, not even partially', () => {
  // One bad entry among good ones must not leave the good ones loaded.
  const raw = JSON.stringify({
    version: VOCABULARY_SCHEMA_VERSION,
    entries: { good: 'fine', bad: 12 },
  })
  const result = parsePersonalVocabulary(raw)
  assert.equal(result.ok, false)
  assert.equal(result.entries, undefined)
})

test('the file contents never leak through the rejection message', () => {
  // A rejection is shown in the UI; the private words must not travel with it.
  const raw = JSON.stringify({
    version: VOCABULARY_SCHEMA_VERSION,
    entries: { secretword: 12 },
  })
  const result = parsePersonalVocabulary(raw)
  assert.equal(result.ok, false)
  assert.ok(!describeRejection(result.rejection).includes('secretword'))
})
