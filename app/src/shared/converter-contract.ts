/** One bundled adapter; paths and source bytes never cross the preload bridge. */
export const JSON_CSV_LIMITS = {
  inputBytes: 2 * 1024 * 1024,
  outputBytes: 4 * 1024 * 1024,
  rows: 10000,
  columns: 100,
  cells: 100000,
  stringLength: 16384,
  previewRows: 3,
  previewColumns: 5,
  previewLength: 120,
  lifetimeMs: 10 * 60 * 1000,
} as const

export type ConverterErrorCode =
  | 'invalid-json' | 'shape' | 'limit' | 'encoding' | 'number' | 'file-type'
  | 'cleanup' | 'read' | 'write' | 'exists' | 'expired' | 'busy' | 'unavailable'

export interface JsonCsvPreview {
  readonly token: string
  readonly inputName: string
  readonly rows: number
  readonly columns: number
  readonly bytes: number
  readonly escapedCells: number
  readonly headers: readonly string[]
  readonly sample: readonly (readonly string[])[]
}

export type ConverterPreparedResult =
  | { readonly status: 'ready'; readonly preview: JsonCsvPreview }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly code: ConverterErrorCode }

export type ConverterSavedResult =
  | { readonly status: 'saved'; readonly outputName: string; readonly rows: number; readonly bytes: number; readonly cleanupWarning?: boolean }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly code: ConverterErrorCode }
