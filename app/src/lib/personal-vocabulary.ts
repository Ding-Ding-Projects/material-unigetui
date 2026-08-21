/**
 * The local personal-vocabulary file.
 *
 * A user may supply a private JSON file of word replacements that are applied
 * to user-facing text. Nothing ships with this application: until a valid file
 * is supplied, every surface renders its original wording. There are no
 * built-in mappings, no samples, no templates, and no guesses — the control is
 * always visible, the data never is.
 *
 * Everything here is local. Parsing, validation and replacement make no network
 * request, and the contents never reach a log, an export, telemetry, a capture,
 * or any public record.
 */

/** The one documented, versioned, bounded contract. */
export const VOCABULARY_SCHEMA_VERSION = 1

export const VOCABULARY_LIMITS = {
  /** Hard byte ceiling, checked before parsing rather than after. */
  maxBytes: 256 * 1024,
  maxEntries: 2000,
  maxKeyLength: 128,
  maxValueLength: 512,
  /** The document is flat by contract; depth is checked so it stays that way. */
  maxDepth: 2,
} as const

export type VocabularyRejection =
  | { readonly kind: 'too-large'; readonly bytes: number }
  | { readonly kind: 'not-json'; readonly detail: string }
  | { readonly kind: 'not-an-object' }
  | { readonly kind: 'unsupported-version'; readonly found: unknown }
  | { readonly kind: 'missing-entries' }
  | { readonly kind: 'too-many-entries'; readonly count: number }
  | { readonly kind: 'duplicate-key'; readonly key: string }
  | { readonly kind: 'bad-key'; readonly key: string; readonly why: string }
  | { readonly kind: 'bad-value'; readonly key: string; readonly why: string }
  | { readonly kind: 'unexpected-field'; readonly field: string }
  | { readonly kind: 'too-deep' }

export type VocabularyResult =
  | { readonly ok: true; readonly entries: ReadonlyMap<string, string>; readonly count: number }
  | { readonly ok: false; readonly rejection: VocabularyRejection }

const ALLOWED_TOP_LEVEL = new Set(['version', 'entries'])

/** Keys that would let a crafted file reach the prototype chain. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function depthOf(value: unknown, seen = 0): number {
  if (seen > VOCABULARY_LIMITS.maxDepth + 1) {
    return seen
  }
  if (typeof value !== 'object' || value === null) {
    return seen
  }
  let deepest = seen
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, depthOf(child, seen + 1))
  }
  return deepest
}

/**
 * Validates the complete payload before anything is displayed or cached.
 *
 * A rejected file never applies partially. There is no "best effort" path here:
 * a half-applied vocabulary is a surface that disagrees with itself, which is
 * worse than one that simply did not change.
 */
export function parsePersonalVocabulary(raw: string): VocabularyResult {
  const bytes = Buffer.byteLength(raw, 'utf8')
  if (bytes > VOCABULARY_LIMITS.maxBytes) {
    return { ok: false, rejection: { kind: 'too-large', bytes } }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      rejection: {
        kind: 'not-json',
        detail: error instanceof Error ? error.message : 'unparseable',
      },
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, rejection: { kind: 'not-an-object' } }
  }

  const document = parsed as Record<string, unknown>

  for (const field of Object.keys(document)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) {
      return { ok: false, rejection: { kind: 'unexpected-field', field } }
    }
  }

  if (document['version'] !== VOCABULARY_SCHEMA_VERSION) {
    return {
      ok: false,
      rejection: { kind: 'unsupported-version', found: document['version'] },
    }
  }

  const entries = document['entries']
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
    return { ok: false, rejection: { kind: 'missing-entries' } }
  }

  if (depthOf(document) > VOCABULARY_LIMITS.maxDepth) {
    return { ok: false, rejection: { kind: 'too-deep' } }
  }

  // JSON.parse collapses duplicate keys silently, so a duplicate is detected on
  // the raw text rather than on the parsed object.
  const duplicate = findDuplicateEntryKey(raw)
  if (duplicate !== null) {
    return { ok: false, rejection: { kind: 'duplicate-key', key: duplicate } }
  }

  const record = entries as Record<string, unknown>
  const keys = Object.keys(record)

  if (keys.length > VOCABULARY_LIMITS.maxEntries) {
    return { ok: false, rejection: { kind: 'too-many-entries', count: keys.length } }
  }

  const map = new Map<string, string>()
  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) {
      return { ok: false, rejection: { kind: 'bad-key', key, why: 'unsafe object key' } }
    }
    if (key.length === 0) {
      return { ok: false, rejection: { kind: 'bad-key', key, why: 'empty' } }
    }
    if (key.length > VOCABULARY_LIMITS.maxKeyLength) {
      return { ok: false, rejection: { kind: 'bad-key', key, why: 'too long' } }
    }
    const value = record[key]
    if (typeof value !== 'string') {
      return { ok: false, rejection: { kind: 'bad-value', key, why: 'not a string' } }
    }
    if (value.length > VOCABULARY_LIMITS.maxValueLength) {
      return { ok: false, rejection: { kind: 'bad-value', key, why: 'too long' } }
    }
    map.set(key, value)
  }

  return { ok: true, entries: map, count: map.size }
}

/** Scans the raw text for a repeated key inside the entries object. */
function findDuplicateEntryKey(raw: string): string | null {
  const seen = new Set<string>()
  const pattern = /"((?:[^"\\]|\\.)*)"\s*:/g
  let match: RegExpExecArray | null
  let insideEntries = false
  const entriesAt = raw.indexOf('"entries"')

  while ((match = pattern.exec(raw)) !== null) {
    if (entriesAt >= 0 && match.index > entriesAt) {
      insideEntries = true
    }
    if (!insideEntries) {
      continue
    }
    const key = match[1] ?? ''
    if (key === 'entries' || key === 'version') {
      continue
    }
    if (seen.has(key)) {
      return key
    }
    seen.add(key)
  }
  return null
}

/**
 * Applies replacements to one string of user-facing text.
 *
 * Longest key first, so a longer phrase is not broken up by a shorter one that
 * happens to be a prefix of it. Matching is whole-word where the key is
 * word-like, so a replacement cannot appear inside an unrelated longer word.
 */
export function applyPersonalVocabulary(
  text: string,
  entries: ReadonlyMap<string, string>
): string {
  if (entries.size === 0) {
    return text
  }

  let result = text
  const keys = [...entries.keys()].sort((a, b) => b.length - a.length)

  for (const key of keys) {
    const replacement = entries.get(key)
    if (replacement === undefined) {
      continue
    }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&')
    const wordLike = /^[\w\s]+$/.test(key)
    const pattern = wordLike
      ? new RegExp('\\b' + escaped + '\\b', 'g')
      : new RegExp(escaped, 'g')
    result = result.replace(pattern, replacement)
  }

  return result
}

/** A human-readable reason, for the control's own status line. */
export function describeRejection(rejection: VocabularyRejection): string {
  switch (rejection.kind) {
    case 'too-large':
      return `That file is ${rejection.bytes} bytes; the limit is ${VOCABULARY_LIMITS.maxBytes}.`
    case 'not-json':
      return `That file is not valid JSON: ${rejection.detail}`
    case 'not-an-object':
      return 'The file must contain a JSON object.'
    case 'unsupported-version':
      return `Unsupported version ${JSON.stringify(rejection.found)}; this build reads version ${VOCABULARY_SCHEMA_VERSION}.`
    case 'missing-entries':
      return 'The file has no "entries" object.'
    case 'too-many-entries':
      return `That file has ${rejection.count} entries; the limit is ${VOCABULARY_LIMITS.maxEntries}.`
    case 'duplicate-key':
      return `The key ${JSON.stringify(rejection.key)} appears more than once.`
    case 'bad-key':
      return `A key was rejected (${rejection.why}).`
    case 'bad-value':
      return `A value was rejected (${rejection.why}).`
    case 'unexpected-field':
      return `Unexpected top-level field ${JSON.stringify(rejection.field)}.`
    case 'too-deep':
      return 'The document is nested more deeply than the schema allows.'
  }
}
