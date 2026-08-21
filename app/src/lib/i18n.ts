import { baseResources, TranslationKey, translationKeys } from './i18n-resources'
import { applyFunnyLevel, FunnyLevel } from './funny-level-text'
import { applyPersonalVocabulary } from './personal-vocabulary'

/**
 * The language engine.
 *
 * Three modes, exactly as the design defines them: English, Hong Kong
 * Cantonese, and bilingual — which renders both, joined, and collapses to one
 * when the two are identical (a product name, a version number).
 */

export type LanguageMode = 'en' | 'yue' | 'bilingual'

export const languageModes: readonly LanguageMode[] = ['en', 'yue', 'bilingual']

export function isLanguageMode(value: unknown): value is LanguageMode {
  return typeof value === 'string' && (languageModes as string[]).includes(value)
}

export interface I18nOptions {
  readonly mode: LanguageMode
  /** 1 is fully serious, 5 is maximum playfulness. Independent per language. */
  readonly funnyEnglish: FunnyLevel
  readonly funnyCantonese: FunnyLevel
  /**
   * School mode forces English and behaves as though the Cantonese, bilingual
   * and funny-level capabilities are not installed. It never destroys the
   * user's stored choices; they return when it is switched off.
   */
  readonly schoolMode?: boolean
  /** Validated personal-vocabulary replacements, or null when none is loaded. */
  readonly vocabulary?: ReadonlyMap<string, string> | null
}

export const defaultI18nOptions: I18nOptions = {
  mode: 'en',
  funnyEnglish: 5,
  funnyCantonese: 5,
  schoolMode: false,
  vocabulary: null,
}

const BILINGUAL_SEPARATOR = ' · '

function effectiveMode(options: I18nOptions): LanguageMode {
  return options.schoolMode === true ? 'en' : options.mode
}

function effectiveFunny(options: I18nOptions, language: 'en' | 'yue'): FunnyLevel {
  if (options.schoolMode === true) {
    return 1
  }
  return language === 'en' ? options.funnyEnglish : options.funnyCantonese
}

/**
 * Translates one key.
 *
 * Substitutions are applied after the funny level, so a playful sentence and a
 * serious one interpolate the same exact value. The facts never change with the
 * tone — only the words around them do.
 */
export function translate(
  key: TranslationKey,
  options: I18nOptions,
  variables?: Readonly<Record<string, string>>
): string {
  const entry = baseResources[key]
  const mode = effectiveMode(options)

  const english = applyFunnyLevel(
    entry.en,
    'en',
    effectiveFunny(options, 'en'),
    key
  )
  const cantonese = applyFunnyLevel(
    entry.yue,
    'yue',
    effectiveFunny(options, 'yue'),
    key
  )

  let result: string
  if (mode === 'en') {
    result = english
  } else if (mode === 'yue') {
    result = cantonese
  } else {
    result = english === cantonese ? english : english + BILINGUAL_SEPARATOR + cantonese
  }

  result = substitute(result, variables)

  // The personal vocabulary is applied last and only at this boundary, so it
  // can never reach a command, an identifier, or a path.
  if (options.schoolMode !== true && options.vocabulary) {
    result = applyPersonalVocabulary(result, options.vocabulary)
  }

  return result
}

function substitute(
  text: string,
  variables: Readonly<Record<string, string>> | undefined
): string {
  if (variables === undefined) {
    return text
  }
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name]! : whole
  )
}

/**
 * The accessible name for a control.
 *
 * Bilingual mode is deliberately NOT doubled here: a screen reader announcing
 * every label twice is worse than one that announces it once, so the accessible
 * name uses the primary language while the visible label keeps both.
 */
export function translateAccessible(
  key: TranslationKey,
  options: I18nOptions,
  variables?: Readonly<Record<string, string>>
): string {
  const primary: LanguageMode = effectiveMode(options) === 'yue' ? 'yue' : 'en'
  return translate(key, { ...options, mode: primary }, variables)
}

/** BCP-47 tag for the document, so assistive technology pronounces correctly. */
export function documentLanguage(options: I18nOptions): string {
  return effectiveMode(options) === 'yue' ? 'zh-HK' : 'en'
}

export { translationKeys }
export type { TranslationKey }
