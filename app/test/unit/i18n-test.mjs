import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const { translate, translateAccessible, documentLanguage, defaultI18nOptions } =
  loadCompiled('lib/i18n.ts')
const { baseResources, translationKeys } = loadCompiled('lib/i18n-resources.ts')
const { applyFunnyLevel, clampFunnyLevel, keysWithVariants } =
  loadCompiled('lib/funny-level-text.ts')

const base = { ...defaultI18nOptions }

test('every key has both an English and a Cantonese string', () => {
  assert.ok(translationKeys.length > 0, 'no translation keys')
  for (const key of translationKeys) {
    const entry = baseResources[key]
    assert.equal(typeof entry.en, 'string', `${key} has no English`)
    assert.equal(typeof entry.yue, 'string', `${key} has no Cantonese`)
    assert.ok(entry.en.length > 0, `${key} English is empty`)
    assert.ok(entry.yue.length > 0, `${key} Cantonese is empty`)
  }
})

test('English mode renders English', () => {
  assert.equal(translate('discover', { ...base, mode: 'en' }), baseResources.discover.en)
})

test('Cantonese mode renders Cantonese', () => {
  assert.equal(translate('discover', { ...base, mode: 'yue' }), baseResources.discover.yue)
})

test('bilingual mode renders both, joined', () => {
  const both = translate('discover', { ...base, mode: 'bilingual' })
  assert.ok(both.includes(baseResources.discover.en))
  assert.ok(both.includes(baseResources.discover.yue))
  assert.ok(both.includes('·'))
})

test('bilingual mode collapses when the two languages agree', () => {
  // A product name is identical in both; doubling it would read as a bug.
  const rendered = translate('appName', { ...base, mode: 'bilingual' })
  assert.equal(rendered, baseResources.appName.en)
  assert.ok(!rendered.includes('·'))
})

test('substitution fills named variables', () => {
  const rendered = translate('operationFailed', base, { package: '7-Zip', code: '1' })
  assert.ok(rendered.includes('7-Zip'), rendered)
  assert.ok(rendered.includes('1'), rendered)
  assert.ok(!rendered.includes('{package}'), rendered)
})

test('an unsupplied variable is left visible rather than blanked', () => {
  // Rendering an empty gap would hide that a caller forgot an argument.
  const rendered = translate('operationFailed', base, { package: '7-Zip' })
  assert.ok(rendered.includes('{code}'), rendered)
})

test('funny levels change the wording in both languages', () => {
  for (const language of ['en', 'yue']) {
    const keys = keysWithVariants(language)
    assert.ok(keys.length > 0, `${language} has no variants at all`)
    let changed = 0
    for (const key of keys) {
      const serious = applyFunnyLevel(baseResources[key][language], language, 1, key)
      const playful = applyFunnyLevel(baseResources[key][language], language, 5, key)
      if (serious !== playful) {
        changed += 1
      }
    }
    assert.ok(changed > 0, `${language}: no key actually differs between level 1 and 5`)
  }
})

test('the funny level styles voice and never drops a substitution slot', () => {
  // The rule the whole feature stands on: a joke may not remove a fact.
  for (const level of [1, 2, 3, 4, 5]) {
    for (const language of ['en', 'yue']) {
      const text = applyFunnyLevel(baseResources.operationFailed[language], language, level, 'operationFailed')
      assert.ok(text.includes('{package}'), `level ${level} ${language} lost {package}`)
      assert.ok(text.includes('{code}'), `level ${level} ${language} lost {code}`)
    }
  }
})

test('the destructive warning names the package at every level', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    for (const language of ['en', 'yue']) {
      const text = applyFunnyLevel(baseResources.uninstallWarning[language], language, level, 'uninstallWarning')
      assert.ok(text.includes('{package}'), `level ${level} ${language} stopped naming the package`)
    }
  }
})

test('a key with no variants renders identically at every level', () => {
  const withVariants = new Set([...keysWithVariants('en'), ...keysWithVariants('yue')])
  const plain = translationKeys.find(k => !withVariants.has(k))
  assert.ok(plain, 'expected at least one plain key')
  assert.equal(
    applyFunnyLevel(baseResources[plain].en, 'en', 1, plain),
    applyFunnyLevel(baseResources[plain].en, 'en', 5, plain)
  )
})

test('a missing level falls back downward rather than to the base string', () => {
  // Level 4 is not defined for discoverSub; it must reach level 3, not level 1.
  const four = applyFunnyLevel(baseResources.discoverSub.en, 'en', 4, 'discoverSub')
  const three = applyFunnyLevel(baseResources.discoverSub.en, 'en', 3, 'discoverSub')
  assert.equal(four, three)
})

test('funny levels clamp instead of throwing', () => {
  assert.equal(clampFunnyLevel(0), 1)
  assert.equal(clampFunnyLevel(99), 5)
  assert.equal(clampFunnyLevel('nonsense'), 5)
  assert.equal(clampFunnyLevel(3), 3)
})

test('School mode forces English and full seriousness', () => {
  const schooled = {
    ...base,
    mode: 'yue',
    funnyEnglish: 5,
    funnyCantonese: 5,
    schoolMode: true,
  }
  const rendered = translate('discoverSub', schooled)
  assert.equal(rendered, applyFunnyLevel(baseResources.discoverSub.en, 'en', 1, 'discoverSub'))
  assert.equal(documentLanguage(schooled), 'en')
})

test('School mode does not destroy the stored choices', () => {
  const stored = { ...base, mode: 'yue', funnyCantonese: 5 }
  const schooled = { ...stored, schoolMode: true }
  // Same object values still present, so turning it off restores them.
  assert.equal(schooled.mode, 'yue')
  assert.equal(schooled.funnyCantonese, 5)
  assert.equal(translate('discover', { ...schooled, schoolMode: false }), baseResources.discover.yue)
})

test('the accessible name is not doubled in bilingual mode', () => {
  // A screen reader announcing every label twice is worse than announcing once.
  const visible = translate('discover', { ...base, mode: 'bilingual' })
  const accessible = translateAccessible('discover', { ...base, mode: 'bilingual' })
  assert.ok(visible.includes('·'))
  assert.ok(!accessible.includes('·'))
  assert.equal(accessible, baseResources.discover.en)
})

test('the document language tag follows the mode', () => {
  assert.equal(documentLanguage({ ...base, mode: 'en' }), 'en')
  assert.equal(documentLanguage({ ...base, mode: 'yue' }), 'zh-HK')
  assert.equal(documentLanguage({ ...base, mode: 'bilingual' }), 'en')
})
