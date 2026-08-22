#!/usr/bin/env node
/**
 * Picks the dim sum code name for a release.
 *
 * Names come from the public Ding-Ding-Projects/dim-sum-photos catalog and are
 * used once each per project, so two builds can never be confused in
 * conversation — which is the one job a code name has.
 *
 * Nothing is generated here. No image is created, downloaded into the
 * repository, or vendored: the release links the public asset. If no unused
 * dish can be resolved, the release ships with its version alone and says so.
 * A code name is decoration with a purpose, never a gate.
 *
 * Usage: node script/pick-dim-sum.mjs [--used tag1,tag2]
 */

const CATALOG_URL =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json'

async function main() {
  const usedArg = process.argv.indexOf('--used')
  const used = new Set(
    usedArg === -1
      ? []
      : (process.argv[usedArg + 1] ?? '')
          .split(',')
          .map(entry => entry.trim().toLowerCase())
          .filter(entry => entry.length > 0)
  )

  let catalog
  try {
    const response = await fetch(CATALOG_URL)
    if (!response.ok) {
      throw new Error(`catalog responded ${response.status}`)
    }
    catalog = await response.json()
  } catch (error) {
    // Unreachable catalog is not a release blocker.
    console.log(
      JSON.stringify({
        ok: false,
        reason: `dim sum catalog unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    )
    return
  }

  const dishes = Array.isArray(catalog?.dishes) ? catalog.dishes : []
  if (dishes.length === 0) {
    console.log(JSON.stringify({ ok: false, reason: 'catalog carried no dishes' }))
    return
  }

  const candidate = dishes.find(dish => {
    const slug = typeof dish?.slug === 'string' ? dish.slug.toLowerCase() : ''
    const english = dish?.name?.en
    const traditional = dish?.name?.zhHant
    return (
      slug.length > 0 &&
      typeof english === 'string' &&
      typeof traditional === 'string' &&
      !used.has(slug)
    )
  })

  if (candidate === undefined) {
    console.log(
      JSON.stringify({ ok: false, reason: 'every catalogued dish is already used' })
    )
    return
  }

  console.log(
    JSON.stringify({
      ok: true,
      slug: candidate.slug,
      // Exactly as the catalog records them — the dish's real names, at every
      // funny level and in every language mode.
      codeName: `${candidate.name.en} · ${candidate.name.zhHant}`,
      english: candidate.name.en,
      traditional: candidate.name.zhHant,
      jyutping: typeof candidate.jyutping === 'string' ? candidate.jyutping : '',
      catalogRevision:
        typeof catalog.schemaVersion === 'number' ? catalog.schemaVersion : null,
      catalogTotal: typeof catalog.total === 'number' ? catalog.total : dishes.length,
    })
  )
}

await main()
