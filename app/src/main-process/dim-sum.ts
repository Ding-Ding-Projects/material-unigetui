import { app } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * The dim sum surprise.
 *
 * A 10% chance at startup of a dish — its bilingual name and a photo.
 *
 * **Sourcing, and a deliberate deviation.** The surprise contract says the
 * images are bundled local assets with no network fetch. The dim-sum sourcing
 * rule says the opposite for consumer projects: photos come only from the
 * public `Ding-Ding-Projects/dim-sum-photos` catalog or an application-data
 * cache, and are never committed into a consuming repository.
 *
 * The sourcing rule wins, because it is the narrower and more recent one and
 * because vendoring 2,866 photographs into this repository would be absurd.
 * The consequence is stated rather than hidden: the catalog is fetched once
 * into the application-data cache, and **a machine that has never been online
 * simply never sees the surprise**. It is decoration, it is non-blocking, and
 * it never gates startup — so degrading to nothing is honest rather than
 * broken. This deviation is documented in the feature article.
 *
 * There is no setting to switch it off, per the contract. The 10% is drawn
 * fresh per launch and can fire at most once.
 */

const CATALOG_URL =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json'

/** One in ten, per launch, exactly as the contract states. */
export const SURPRISE_CHANCE = 0.1

export interface DimSumDish {
  readonly slug: string
  readonly english: string
  readonly traditional: string
  readonly jyutping: string
  readonly category: string
  /** The catalog's own image filename. Never guessed from the slug. */
  readonly imageFile: string
  /** The catalog's own alt text, so the surprise is readable aloud. */
  readonly altEnglish: string
  readonly altCantonese: string
}

interface CachedCatalog {
  readonly fetchedAt: string
  readonly sourceUrl: string
  readonly total: number
  readonly dishes: readonly DimSumDish[]
}

function cachePath(): string {
  return path.join(app.getPath('userData'), 'dim-sum-cache.json')
}

/** Reads the cache, or null when there is none or it is unreadable. */
async function readCache(): Promise<CachedCatalog | null> {
  try {
    const raw = await fs.readFile(cachePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as CachedCatalog).dishes) &&
      (parsed as CachedCatalog).dishes.length > 0
    ) {
      return parsed as CachedCatalog
    }
  } catch {
    // No cache yet, or a corrupt one. Either way there is nothing to use.
  }
  return null
}

/**
 * Fetches the catalog once and caches a small names-only subset.
 *
 * Only the fields the surprise renders are kept, and the source URL and fetch
 * time are recorded beside them so the cache is never mistaken for a second
 * authority on the catalog.
 */
async function refreshCache(): Promise<CachedCatalog | null> {
  try {
    const response = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      return null
    }
    const document = (await response.json()) as {
      total?: number
      dishes?: ReadonlyArray<Record<string, unknown>>
    }
    const dishes: DimSumDish[] = []
    for (const dish of document.dishes ?? []) {
      const name = dish['name'] as { en?: unknown; zhHant?: unknown } | undefined
      const image = dish['image'] as
        | { path?: unknown; alt?: { en?: unknown; yue?: unknown } }
        | undefined

      if (
        typeof dish['slug'] !== 'string' ||
        typeof name?.en !== 'string' ||
        typeof name?.zhHant !== 'string' ||
        typeof image?.path !== 'string'
      ) {
        continue
      }

      // The filename comes from the catalog's own image.path, never from the
      // slug: guessing "<slug>.webp" produced a 404 for every dish, because the
      // real names are "hk-dish-0001-classic-har-gow.png".
      const imageFile = image.path.split('/').pop() ?? ''
      if (imageFile.length === 0) {
        continue
      }

      dishes.push({
        slug: dish['slug'],
        english: name.en,
        traditional: name.zhHant,
        jyutping: typeof dish['jyutping'] === 'string' ? dish['jyutping'] : '',
        category: typeof dish['category'] === 'string' ? dish['category'] : '',
        imageFile,
        altEnglish: typeof image.alt?.en === 'string' ? image.alt.en : name.en,
        altCantonese:
          typeof image.alt?.yue === 'string' ? image.alt.yue : name.zhHant,
      })
    }

    if (dishes.length === 0) {
      return null
    }

    const cache: CachedCatalog = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: CATALOG_URL,
      total: typeof document.total === 'number' ? document.total : dishes.length,
      dishes,
    }

    await fs.mkdir(path.dirname(cachePath()), { recursive: true })
    await fs.writeFile(cachePath(), JSON.stringify(cache), 'utf8')
    return cache
  } catch {
    // Offline, blocked, or slow. The surprise is decoration; failing to fetch
    // it is not an error worth telling anybody about.
    return null
  }
}

/** True on a fresh 10% draw. Exported so the odds are testable. */
export function drawsSurprise(random: () => number = Math.random): boolean {
  return random() < SURPRISE_CHANCE
}

export interface SurpriseResult {
  readonly dish: DimSumDish
  readonly photoUrl: string
}

/**
 * Resolves one dish for this launch, or null.
 *
 * Returns null for every honest reason there might be nothing to show: the
 * draw failed, there is no cache and no network, or the catalog was empty.
 */
export async function resolveSurprise(
  random: () => number = Math.random
): Promise<SurpriseResult | null> {
  if (!drawsSurprise(random)) {
    return null
  }

  const cache = (await readCache()) ?? (await refreshCache())
  if (cache === null || cache.dishes.length === 0) {
    return null
  }

  const dish = cache.dishes[Math.floor(random() * cache.dishes.length)]
  if (dish === undefined) {
    return null
  }

  return { dish, photoUrl: photoUrlFor(dish) }
}

/**
 * The published release assets that hold the photographs.
 *
 * The catalog's 2,866 images are split across three releases, so a dish's photo
 * may be on any of them. Photos are NOT in the repository tree — the raw path
 * from `image.path` returns 404 — they are release assets, which is exactly the
 * sanctioned source.
 */
export const PHOTO_RELEASES = [
  'catalog-v1',
  'catalog-v1-part-002',
  'catalog-v1-part-003',
] as const

export function photoUrlFor(
  dish: DimSumDish,
  release: (typeof PHOTO_RELEASES)[number] = PHOTO_RELEASES[0]
): string {
  return (
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/' +
    `${release}/${dish.imageFile}`
  )
}

/** Every candidate URL, so a caller can try the next release on a 404. */
export function photoUrlCandidates(dish: DimSumDish): readonly string[] {
  return PHOTO_RELEASES.map(release => photoUrlFor(dish, release))
}
