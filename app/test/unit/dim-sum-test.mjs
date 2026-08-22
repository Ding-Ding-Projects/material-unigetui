import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const { drawsSurprise, photoUrlFor, photoUrlCandidates, PHOTO_RELEASES, SURPRISE_CHANCE } =
  loadCompiled('main-process/dim-sum.ts')

const dish = {
  slug: 'classic-har-gow',
  english: 'Classic Har Gow',
  traditional: '蝦餃',
  jyutping: 'haa1 gaau2',
  category: 'steamed-dim-sum',
  imageFile: 'hk-dish-0001-classic-har-gow.png',
  altEnglish: 'Warm tea-house photograph of Classic Har Gow',
  altCantonese: '港式茶樓木枱上嘅蝦餃',
}

test('the chance is exactly one in ten, as stated', () => {
  assert.equal(SURPRISE_CHANCE, 0.1)
})

test('the draw is never more frequent than stated', () => {
  // Boundaries, not a statistical sample: 0.0999 fires, 0.1 does not.
  assert.equal(drawsSurprise(() => 0), true)
  assert.equal(drawsSurprise(() => 0.0999), true)
  assert.equal(drawsSurprise(() => 0.1), false)
  assert.equal(drawsSurprise(() => 0.9), false)
})

test('the photo URL is built from the catalog filename, never the slug', () => {
  // Guessing "<slug>.webp" produced a 404 for every single dish; the real
  // filenames look like "hk-dish-0001-classic-har-gow.png".
  const url = photoUrlFor(dish)
  assert.ok(url.includes('hk-dish-0001-classic-har-gow.png'), url)
  assert.ok(!url.includes('classic-har-gow.webp'), url)
})

test('photos come from the published release assets, not the repository tree', () => {
  // The raw repository path 404s; the sanctioned source is the catalog-v1*
  // release assets.
  const url = photoUrlFor(dish)
  assert.ok(url.includes('/releases/download/'), url)
  assert.ok(!url.includes('raw.githubusercontent.com'), url)
})

test('every release is offered as a candidate', () => {
  // The 2,866 images are split across three releases, so a dish may be on any
  // of them and a caller has to be able to try the next.
  const candidates = photoUrlCandidates(dish)
  assert.equal(candidates.length, PHOTO_RELEASES.length)
  assert.equal(new Set(candidates).size, candidates.length)
  for (const release of PHOTO_RELEASES) {
    assert.ok(
      candidates.some(url => url.includes(`/${release}/`)),
      `no candidate for ${release}`
    )
  }
})

test('no photo is ever read from inside this repository', () => {
  for (const url of photoUrlCandidates(dish)) {
    assert.ok(url.startsWith('https://github.com/Ding-Ding-Projects/dim-sum-photos/'), url)
  }
})
