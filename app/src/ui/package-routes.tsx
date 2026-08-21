import * as React from 'react'
import { DiscoveredPackage, InstallOptions, PackageRef } from '../models/package'
import { ManagerAvailability } from '../models/manager'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { SuperConfirmation } from './md3/super-confirmation'
import { useI18n } from './app-state'
import { useNotifications } from './notifications'

/**
 * The three package routes.
 *
 * They share one component because they are the same screen with different
 * sources and different row actions — duplicating it three times is how two of
 * them quietly drift apart.
 */

export interface PackageRow {
  readonly key: string
  readonly id: string
  readonly name: string
  readonly manager: string
  readonly version: string
  readonly availableVersion?: string
  readonly source?: string
}

export type RowAction = 'install' | 'update' | 'uninstall'

interface LoadState {
  readonly loading: boolean
  readonly error: string | null
  readonly rows: readonly PackageRow[]
}

const INITIAL: LoadState = { loading: false, error: null, rows: [] }

export function usePackageSource(
  load: () => Promise<readonly PackageRow[]>,
  deps: readonly unknown[],
  enabled = true
): LoadState & { reload(): void } {
  const [state, setState] = React.useState<LoadState>(INITIAL)
  const [nonce, setNonce] = React.useState(0)

  React.useEffect(() => {
    if (!enabled) {
      setState(INITIAL)
      return
    }
    let cancelled = false
    setState({ loading: true, error: null, rows: [] })

    load().then(
      rows => {
        // A response that arrives after the user has moved on must not
        // overwrite what they are looking at now.
        if (!cancelled) {
          setState({ loading: false, error: null, rows })
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            rows: [],
          })
        }
      }
    )

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled])

  return { ...state, reload: () => setNonce(n => n + 1) }
}

export function PackageTable(props: {
  readonly rows: readonly PackageRow[]
  readonly loading: boolean
  readonly error: string | null
  readonly emptyMessage: string
  readonly action: RowAction
  readonly selected: ReadonlySet<string>
  onToggleSelected(key: string): void
  onToggleAll(): void
  onAction(row: PackageRow, action: RowAction): void
}): JSX.Element {
  const { t } = useI18n()

  if (props.loading) {
    return <div className="state-note">{t('loading')}</div>
  }
  if (props.error !== null) {
    return (
      <div className="state-note state-note--error">
        <strong>That did not work.</strong> {props.error}
      </div>
    )
  }
  if (props.rows.length === 0) {
    return <div className="state-note">{props.emptyMessage}</div>
  }

  const allSelected = props.rows.every(row => props.selected.has(row.key))

  return (
    <div className="package-table">
      <div className="package-table__bulk">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={allSelected}
            aria-label={
              allSelected ? 'Clear selection' : 'Select every package shown'
            }
            onChange={props.onToggleAll}
          />
          <span>
            {/* Says what it covers: the rows shown, not everything that exists. */}
            {allSelected
              ? `All ${props.rows.length} shown selected`
              : `Select all ${props.rows.length} shown`}
          </span>
        </label>
      </div>

      {props.rows.map(row => (
        <div className="package-row" key={row.key}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={props.selected.has(row.key)}
              aria-label={`Select ${row.name}`}
              onChange={() => props.onToggleSelected(row.key)}
            />
            <span className="visually-hidden">{row.name}</span>
          </label>

          <div className="package-row__grow">
            <div className="package-row__name">{row.name}</div>
            <div className="package-row__id">
              {row.id}
              <span className="package-row__manager">{row.manager}</span>
            </div>
          </div>

          <div className="package-row__version">
            {row.availableVersion !== undefined
              ? `${row.version} → ${row.availableVersion}`
              : row.version}
          </div>

          <button
            type="button"
            className="btn btn--small btn--filled"
            onClick={() => props.onAction(row, props.action)}
          >
            {props.action === 'install'
              ? t('install')
              : props.action === 'update'
                ? t('update')
                : t('uninstall')}
          </button>
        </div>
      ))}
    </div>
  )
}

/** Shared selection state and the confirmation gate for destructive actions. */
export function usePackageActions(onChanged: () => void): {
  readonly selected: ReadonlySet<string>
  toggle(key: string): void
  toggleAll(rows: readonly PackageRow[]): void
  clear(): void
  request(row: PackageRow, action: RowAction): void
  requestBulk(rows: readonly PackageRow[], action: RowAction): void
  readonly gate: JSX.Element | null
} {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = React.useState<{
    readonly rows: readonly PackageRow[]
    readonly action: RowAction
  } | null>(null)
  const { notify } = useNotifications()
  const { t } = useI18n()

  const toggle = React.useCallback((key: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const toggleAll = React.useCallback((rows: readonly PackageRow[]) => {
    setSelected(current => {
      const all = rows.every(row => current.has(row.key))
      return all ? new Set() : new Set(rows.map(row => row.key))
    })
  }, [])

  const clear = React.useCallback(() => setSelected(new Set()), [])

  const run = React.useCallback(
    async (rows: readonly PackageRow[], action: RowAction) => {
      const options: InstallOptions = {}
      for (const row of rows) {
        const ref: PackageRef = {
          key: row.key,
          id: row.id,
          name: row.name,
          manager: row.manager as PackageRef['manager'],
          source: row.source,
        }
        await window.materialUniGetUi.operations.enqueue(action, ref, options)
      }
      notify(
        'info',
        rows.length === 1
          ? t('operationQueued', { package: rows[0]!.name })
          : `${rows.length} operations queued`
      )
      setSelected(new Set())
      onChanged()
    },
    [notify, onChanged, t]
  )

  const request = React.useCallback(
    (row: PackageRow, action: RowAction) => {
      // Only the irreversible one is gated. Gating an install as well would
      // train people to click through the gate without reading it.
      if (action === 'uninstall') {
        setPending({ rows: [row], action })
        return
      }
      void run([row], action)
    },
    [run]
  )

  const requestBulk = React.useCallback(
    (rows: readonly PackageRow[], action: RowAction) => {
      if (rows.length === 0) {
        return
      }
      if (action === 'uninstall') {
        setPending({ rows, action })
        return
      }
      void run(rows, action)
    },
    [run]
  )

  const gate =
    pending === null ? null : (
      <SuperConfirmation
        actionLabel={
          pending.rows.length === 1
            ? `Uninstall ${pending.rows[0]!.name}`
            : `Uninstall ${pending.rows.length} packages`
        }
        subject={pending.rows.map(row => `${row.name} (${row.id})`).join(', ')}
        consequence={t('uninstallWarning', {
          package:
            pending.rows.length === 1
              ? pending.rows[0]!.name
              : `${pending.rows.length} packages`,
        })}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const request = pending
          setPending(null)
          void run(request.rows, request.action)
        }}
      />
    )

  return { selected, toggle, toggleAll, clear, request, requestBulk, gate }
}

export function managerFilterOptions(
  managers: readonly ManagerAvailability[]
): readonly ManagerAvailability[] {
  return managers.filter(manager => manager.available)
}

export function toRow(pkg: DiscoveredPackage): PackageRow {
  return {
    key: pkg.key,
    id: pkg.id,
    name: pkg.name,
    manager: pkg.manager,
    version: pkg.version ?? '',
    source: pkg.source,
  }
}

export { SearchField, emptySearchState, searchMatcher }
export type { SearchState }
