import * as React from 'react'
import {
  I18nOptions,
  LanguageMode,
  isLanguageMode,
  translate,
  translateAccessible,
  documentLanguage,
} from '../lib/i18n'
import { TranslationKey } from '../lib/i18n-resources'
import { clampFunnyLevel, FunnyLevel } from '../lib/funny-level-text'

/**
 * Application state that every surface reads: the persisted settings and the
 * language options derived from them.
 *
 * Settings live in the main process, so this is the one place that talks to
 * that bridge. A component reads `useSettings()` and never learns there is an
 * IPC boundary underneath.
 */

export type Settings = Record<string, unknown>

interface SettingsContextValue {
  readonly settings: Settings
  readonly loaded: boolean
  set(key: string, value: unknown): Promise<void>
  setMany(patch: Settings): Promise<void>
  reset(): Promise<void>
  /**
   * True when the value is still the shipped default rather than something the
   * user or a prior process actually wrote. Surfaces show this beside a control
   * so "default" is never mistaken for "chosen".
   */
  isDefault(key: string): boolean
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = React.useContext(SettingsContext)
  if (value === null) {
    throw new Error('useSettings used outside AppStateProvider')
  }
  return value
}

interface I18nContextValue extends I18nOptions {
  /** Translates a key, with optional substitutions. */
  t(key: TranslationKey, variables?: Record<string, string>): string
  /** The accessible name, which is never doubled in bilingual mode. */
  a(key: TranslationKey, variables?: Record<string, string>): string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const value = React.useContext(I18nContext)
  if (value === null) {
    throw new Error('useI18n used outside AppStateProvider')
  }
  return value
}

function readLanguageMode(settings: Settings): LanguageMode {
  const stored = settings['languageMode']
  return isLanguageMode(stored) ? stored : 'en'
}

function readFunny(settings: Settings, key: string): FunnyLevel {
  return clampFunnyLevel(settings[key])
}

export function AppStateProvider(props: {
  readonly children: React.ReactNode
}): JSX.Element {
  const [settings, setSettings] = React.useState<Settings>({})
  const [defaults, setDefaults] = React.useState<Settings>({})
  const [loaded, setLoaded] = React.useState(false)
  const [vocabulary, setVocabulary] = React.useState<ReadonlyMap<string, string> | null>(
    null
  )

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const [all, entries] = await Promise.all([
        window.materialUniGetUi.settings.all(),
        window.materialUniGetUi.vocabulary.entries(),
      ])
      if (cancelled) {
        return
      }
      setSettings(all)
      // The shipped defaults are captured at first load so a surface can say
      // whether a value was chosen or merely never changed.
      setDefaults(all)
      setVocabulary(entries.length > 0 ? new Map(entries) : null)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const set = React.useCallback(async (key: string, value: unknown) => {
    const next = await window.materialUniGetUi.settings.set(key, value)
    setSettings(next)
  }, [])

  const setMany = React.useCallback(async (patch: Settings) => {
    const next = await window.materialUniGetUi.settings.setMany(patch)
    setSettings(next)
  }, [])

  const reset = React.useCallback(async () => {
    const next = await window.materialUniGetUi.settings.reset()
    setSettings(next)
  }, [])

  const isDefault = React.useCallback(
    (key: string) =>
      JSON.stringify(settings[key]) === JSON.stringify(defaults[key]),
    [settings, defaults]
  )

  const settingsValue = React.useMemo<SettingsContextValue>(
    () => ({ settings, loaded, set, setMany, reset, isDefault }),
    [settings, loaded, set, setMany, reset, isDefault]
  )

  const i18nValue = React.useMemo<I18nContextValue>(() => {
    const options: I18nOptions = {
      mode: readLanguageMode(settings),
      funnyEnglish: readFunny(settings, 'funnyLevelEnglish'),
      funnyCantonese: readFunny(settings, 'funnyLevelCantonese'),
      schoolMode: settings['schoolMode'] === true,
      vocabulary,
    }
    return {
      ...options,
      t: (key, variables) => translate(key, options, variables),
      a: (key, variables) => translateAccessible(key, options, variables),
    }
  }, [settings, vocabulary])

  React.useEffect(() => {
    document.documentElement.lang = documentLanguage(i18nValue)
  }, [i18nValue])

  return (
    <SettingsContext.Provider value={settingsValue}>
      <I18nContext.Provider value={i18nValue}>{props.children}</I18nContext.Provider>
    </SettingsContext.Provider>
  )
}

/** Re-reads the vocabulary after the user loads or clears a file. */
export async function refreshVocabulary(): Promise<ReadonlyMap<string, string> | null> {
  const entries = await window.materialUniGetUi.vocabulary.entries()
  return entries.length > 0 ? new Map(entries) : null
}
