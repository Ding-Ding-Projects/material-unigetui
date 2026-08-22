import { app, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'
import { ManagerId, managerIds } from '../models/manager'

/**
 * Package bundles.
 *
 * A bundle is a plain, versioned list of packages a user wants installed —
 * exported to a file they own, and importable on another machine. The format is
 * deliberately readable and deliberately boring: somebody should be able to
 * open it in a text editor and understand it without this application.
 */

export const BUNDLE_SCHEMA_VERSION = 1

export interface BundleEntry {
  readonly id: string
  readonly name: string
  readonly manager: ManagerId
  readonly version?: string
  readonly source?: string
}

export interface Bundle {
  readonly version: number
  readonly exportedAt: string
  readonly entries: readonly BundleEntry[]
}

/** Bounded, like every other file this application reads from a user. */
export const BUNDLE_LIMITS = {
  maxBytes: 4 * 1024 * 1024,
  maxEntries: 10000,
} as const

export type BundleParseResult =
  | { readonly ok: true; readonly bundle: Bundle; readonly skipped: number }
  | { readonly ok: false; readonly reason: string }

/**
 * Parses a bundle file.
 *
 * Unknown managers are skipped and counted rather than failing the whole
 * import: a bundle written by a future version that knows about a manager this
 * build does not is still mostly useful, and silently dropping the count would
 * hide that something was left out.
 */
export function parseBundle(raw: string): BundleParseResult {
  if (Buffer.byteLength(raw, 'utf8') > BUNDLE_LIMITS.maxBytes) {
    return { ok: false, reason: 'That file is larger than the 4 MB limit.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      reason: `That file is not valid JSON: ${
        error instanceof Error ? error.message : 'unparseable'
      }`,
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'A bundle must be a JSON object.' }
  }

  const document = parsed as Record<string, unknown>
  if (document['version'] !== BUNDLE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Unsupported bundle version ${JSON.stringify(document['version'])}; this build reads version ${BUNDLE_SCHEMA_VERSION}.`,
    }
  }

  const rawEntries = document['entries']
  if (!Array.isArray(rawEntries)) {
    return { ok: false, reason: 'The bundle has no entries array.' }
  }
  if (rawEntries.length > BUNDLE_LIMITS.maxEntries) {
    return {
      ok: false,
      reason: `That bundle lists ${rawEntries.length} packages; the limit is ${BUNDLE_LIMITS.maxEntries}.`,
    }
  }

  const known = new Set<string>(managerIds)
  const entries: BundleEntry[] = []
  let skipped = 0

  for (const candidate of rawEntries) {
    if (typeof candidate !== 'object' || candidate === null) {
      skipped += 1
      continue
    }
    const record = candidate as Record<string, unknown>
    const id = typeof record['id'] === 'string' ? record['id'] : ''
    const manager = typeof record['manager'] === 'string' ? record['manager'] : ''
    if (id.length === 0 || !known.has(manager)) {
      skipped += 1
      continue
    }
    entries.push({
      id,
      name: typeof record['name'] === 'string' ? record['name'] : id,
      manager: manager as ManagerId,
      version: typeof record['version'] === 'string' ? record['version'] : undefined,
      source: typeof record['source'] === 'string' ? record['source'] : undefined,
    })
  }

  return {
    ok: true,
    skipped,
    bundle: {
      version: BUNDLE_SCHEMA_VERSION,
      exportedAt:
        typeof document['exportedAt'] === 'string'
          ? document['exportedAt']
          : new Date().toISOString(),
      entries,
    },
  }
}

export function serializeBundle(entries: readonly BundleEntry[]): string {
  const bundle: Bundle = {
    version: BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  }
  return JSON.stringify(bundle, null, 2) + '\n'
}

/** Converts a bundle to one of the formats the export contract asks for. */
export function formatBundle(
  entries: readonly BundleEntry[],
  format: 'json' | 'csv' | 'tsv' | 'markdown' | 'yaml' | 'txt'
): string {
  switch (format) {
    case 'json':
      return serializeBundle(entries)
    case 'csv':
    case 'tsv': {
      const separator = format === 'csv' ? ',' : '\t'
      const escape = (value: string) =>
        format === 'csv' && /[",\n]/.test(value)
          ? `"${value.replace(/"/g, '""')}"`
          : value
      const header = ['id', 'name', 'manager', 'version', 'source']
      const lines = [header.join(separator)]
      for (const entry of entries) {
        lines.push(
          [
            entry.id,
            entry.name,
            entry.manager,
            entry.version ?? '',
            entry.source ?? '',
          ]
            .map(escape)
            .join(separator)
        )
      }
      return lines.join('\n') + '\n'
    }
    case 'markdown': {
      const lines = [
        '| Package | Id | Manager | Version |',
        '| --- | --- | --- | --- |',
      ]
      for (const entry of entries) {
        lines.push(
          `| ${entry.name} | \`${entry.id}\` | ${entry.manager} | ${entry.version ?? ''} |`
        )
      }
      return lines.join('\n') + '\n'
    }
    case 'yaml': {
      const lines = [`version: ${BUNDLE_SCHEMA_VERSION}`, 'entries:']
      for (const entry of entries) {
        lines.push(`  - id: ${JSON.stringify(entry.id)}`)
        lines.push(`    name: ${JSON.stringify(entry.name)}`)
        lines.push(`    manager: ${entry.manager}`)
        if (entry.version !== undefined) {
          lines.push(`    version: ${JSON.stringify(entry.version)}`)
        }
      }
      return lines.join('\n') + '\n'
    }
    case 'txt':
      return entries.map(entry => `${entry.manager}\t${entry.id}`).join('\n') + '\n'
  }
}

export const BUNDLE_FORMATS = [
  { id: 'json', label: 'JSON', extension: 'json', lossless: true },
  { id: 'yaml', label: 'YAML', extension: 'yaml', lossless: true },
  { id: 'csv', label: 'CSV', extension: 'csv', lossless: true },
  { id: 'tsv', label: 'TSV', extension: 'tsv', lossless: true },
  { id: 'markdown', label: 'Markdown table', extension: 'md', lossless: false },
  { id: 'txt', label: 'Plain text', extension: 'txt', lossless: false },
] as const

export async function exportBundleToFile(
  window: BrowserWindow | null,
  entries: readonly BundleEntry[],
  format: (typeof BUNDLE_FORMATS)[number]['id']
): Promise<{ ok: boolean; path?: string; reason?: string }> {
  const spec = BUNDLE_FORMATS.find(candidate => candidate.id === format)
  if (spec === undefined) {
    return { ok: false, reason: `Unknown format ${format}` }
  }

  const suggested = path.join(
    app.getPath('documents'),
    `material-unigetui-bundle.${spec.extension}`
  )

  const chosen =
    window === null
      ? await dialog.showSaveDialog({ defaultPath: suggested })
      : await dialog.showSaveDialog(window, { defaultPath: suggested })

  if (chosen.canceled || chosen.filePath === undefined) {
    return { ok: false, reason: 'Cancelled.' }
  }

  await fs.writeFile(chosen.filePath, formatBundle(entries, format), 'utf8')
  return { ok: true, path: chosen.filePath }
}
