/**
 * Funny levels.
 *
 * Level 1 reads fully professional; level 5 is maximum playfulness. English and
 * Cantonese are set independently, and both ship at 5.
 *
 * The rule that governs every variant below: **the level changes voice, never
 * facts.** At any level the message still names what happened, what is
 * affected, and what the options are — which file, which package, which action
 * is irreversible. A warning nobody can act on is a broken warning, not a funny
 * one. Where a string carries only facts (a version number, a package id, a
 * count), it has no variants at all and passes through untouched.
 *
 * Humour is aimed at the situation, never at the user, their data loss, their
 * money, or their machine.
 */

import { TranslationKey } from './i18n-resources'

export type FunnyLevel = 1 | 2 | 3 | 4 | 5

export const funnyLevels: readonly FunnyLevel[] = [1, 2, 3, 4, 5]

export function isFunnyLevel(value: unknown): value is FunnyLevel {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

export function clampFunnyLevel(value: unknown): FunnyLevel {
  const numeric = typeof value === 'number' ? Math.round(value) : 5
  if (numeric <= 1) {
    return 1
  }
  if (numeric >= 5) {
    return 5
  }
  return numeric as FunnyLevel
}

/**
 * Per-key variants, indexed by level.
 *
 * A key absent from this table renders its base string at every level. That is
 * the correct default: most strings are labels, and a label does not get funnier.
 */
type VariantTable = Partial<Record<TranslationKey, Partial<Record<FunnyLevel, string>>>>

const ENGLISH_VARIANTS: VariantTable = {
  discoverSub: {
    1: 'Search the configured package managers.',
    3: 'Search every package manager this build can drive.',
    5: 'Rummage through every package manager this build can boss around.',
  },
  updatesSub: {
    1: 'Packages with a newer version available.',
    3: 'Everything with a newer version waiting.',
    5: 'Everything quietly pretending it is not out of date.',
  },
  installedSub: {
    1: 'Packages reported as installed.',
    3: 'Everything your package managers admit to having installed.',
    5: 'The full inventory of things you definitely meant to install.',
  },
  emptyUpToDate: {
    1: 'No updates are available.',
    3: 'Everything is up to date.',
    5: 'Nothing to update. Suspiciously tidy.',
  },
  emptyNoResults: {
    1: 'No packages matched.',
    3: 'Nothing matched that search.',
    5: 'Not a single match. Either it does not exist or we both spelled it wrong.',
  },
  loading: {
    1: 'Loading.',
    3: 'Asking your package managers…',
    5: 'Asking your package managers nicely…',
  },
  operationFailed: {
    // Level 5 still names the package and still says it failed. The joke is
    // about the situation, never a softening of what happened.
    1: '{package} failed. Exit code {code}.',
    3: '{package} failed with exit code {code}.',
    5: '{package} did not make it. Exit code {code}, if that helps anyone.',
  },
  operationCancelled: {
    1: '{package} was cancelled.',
    3: '{package} was cancelled.',
    5: '{package} stopped, as instructed. No hard feelings.',
  },
  operationSucceeded: {
    1: '{package} completed.',
    3: '{package} finished.',
    5: '{package} is in. Well done, everybody.',
  },
  uninstallWarning: {
    1: 'This removes {package} from this computer. It cannot be undone from here.',
    3: 'This removes {package} from this computer, and this app cannot undo it.',
    5: 'This removes {package} from this computer for good. We cannot put it back — that part is between you and the internet.',
  },
}

const CANTONESE_VARIANTS: VariantTable = {
  discoverSub: {
    1: '搜尋已設定嘅套件管理器。',
    3: '搜尋呢個版本用到嘅所有套件管理器。',
    5: '幫你成個 package manager 大掃蕩，睇下有咩好嘢。',
  },
  updatesSub: {
    1: '有新版本嘅套件。',
    3: '所有有得更新嘅嘢。',
    5: '啲扮到自己好新淨、其實已經過氣嘅嘢。',
  },
  installedSub: {
    1: '已安裝嘅套件。',
    3: '你部機承認裝咗嘅嘢。',
    5: '你當初「一定會用」嗰堆嘢，全部喺呢度。',
  },
  emptyUpToDate: {
    1: '冇更新。',
    3: '全部都係最新。',
    5: '冇嘢好更新，乾淨到有啲可疑。',
  },
  emptyNoResults: {
    1: '搵唔到相符嘅套件。',
    3: '冇嘢啱呢個搜尋。',
    5: '一個都冇。唔係佢唔存在，就係我哋兩個都串錯咗。',
  },
  loading: {
    1: '載入中。',
    3: '問緊你啲套件管理器…',
    5: '好聲好氣問緊你啲套件管理器…',
  },
  operationFailed: {
    1: '{package} 失敗。結束代碼 {code}。',
    3: '{package} 失敗咗，結束代碼 {code}。',
    5: '{package} 玩完。結束代碼 {code}，唔知幫唔幫到手。',
  },
  operationCancelled: {
    1: '{package} 已取消。',
    3: '{package} 已經取消咗。',
    5: '{package} 停咗，你叫停就停，冇怨言。',
  },
  operationSucceeded: {
    1: '{package} 已完成。',
    3: '{package} 搞掂。',
    5: '{package} 入咗。大家辛苦晒。',
  },
  uninstallWarning: {
    1: '呢個操作會喺呢部機移除 {package}，喺呢度復原唔到。',
    3: '呢個操作會喺呢部機移除 {package}，本程式冇得幫你還原。',
    5: '呢個操作會將 {package} 由呢部機徹底移除。我哋擺唔返轉頭 —— 嗰part你同互聯網自己傾。',
  },
}

/**
 * Picks the variant for a level, falling back downward.
 *
 * A table need not define all five levels: level 4 falls back to 3, then 1,
 * then the base string. That keeps a variant table honest — an author writes
 * the levels that genuinely read differently rather than padding five near-
 * identical sentences.
 */
export function applyFunnyLevel(
  base: string,
  language: 'en' | 'yue',
  level: FunnyLevel,
  key: TranslationKey
): string {
  const table = language === 'en' ? ENGLISH_VARIANTS : CANTONESE_VARIANTS
  const variants = table[key]
  if (variants === undefined) {
    return base
  }
  for (let candidate = level; candidate >= 1; candidate--) {
    const text = variants[candidate as FunnyLevel]
    if (typeof text === 'string') {
      return text
    }
  }
  return base
}

/** Keys that genuinely change with the level, for tests and documentation. */
export function keysWithVariants(language: 'en' | 'yue'): TranslationKey[] {
  const table = language === 'en' ? ENGLISH_VARIANTS : CANTONESE_VARIANTS
  return Object.keys(table) as TranslationKey[]
}
