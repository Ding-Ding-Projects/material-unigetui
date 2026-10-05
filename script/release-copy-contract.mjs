/** Static release-copy guard. Runtime acceptance still needs independent proof. */
export const RELEASES_URL = 'https://github.com/Ding-Ding-Projects/material-unigetui/releases'

export function hasHonestReleaseCopy(source) {
  const text = source.replace(/^\s*>\s?/gm, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const stableLink = source.includes(`href="${RELEASES_URL}"`) || source.includes(`](${RELEASES_URL})`)
  const neverReleased = /\bnot released(?: yet)?\b|\b(?:there is )?no installer (?:to download|has been produced|has been released)\b/i
  return stableLink &&
    /work in progress/i.test(text) &&
    /unsigned Windows installers are available/i.test(text) &&
    /unknown-publisher warning/i.test(text) &&
    /does not certify feature completeness or native acceptance/i.test(text) &&
    !neverReleased.test(text)
}

/** This lane must not be described as wholly unbuilt or as universally complete. */
export function hasHonestConverterCopy(source) {
  const text = source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  return /one bounded local JSON → CSV lane/.test(text) &&
    /Other adapters remain unavailable/.test(text) &&
    /does not complete the converter contract/.test(text) &&
    /Native app\/dialog, accessibility, theme\/language and fresh capture verification remain pending/.test(text) &&
    source.includes(`href="${RELEASES_URL.replace(/\/releases$/, '')}/blob/main/docs/features/json-to-csv.md"`) &&
    !/Most of the routes:[^<]*\bconverter\b/i.test(source)
}
