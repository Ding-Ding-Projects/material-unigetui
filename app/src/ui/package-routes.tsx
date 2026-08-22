import * as React from 'react'
import './packages.css'
import { DiscoveredPackage, InstallOptions, PackageRef } from '../models/package'
import { ManagerAvailability } from '../models/manager'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { SuperConfirmation } from './md3/super-confirmation'
import { Icon } from './md3/icon'
import { useI18n } from './app-state'
import { useNotifications } from './notifications'

/**
 * The three package routes (Discover / Software updates / Installed) and
 * Bundles, ported from the design's `<sc-if value="{{ rPkgs }}">` and
 * `<sc-if value="{{ rBundles }}">` sections.
 *
 * `PackageTable` is the shared row list every route renders — it is the one
 * component app.tsx (owned by a sibling lane) already wires live, so every
 * design detail added here (avatar, source chip, ignore star, install
 * options, installer link, empty state) ships to the running app without
 * touching app.tsx. `PackageBundlesRoute` and `IgnoredUpdatesManager` are
 * additional design-matched surfaces exported for a future integrator to
 * wire in (see the port pig's final report for the exact blocker: the design
 * calls for one Bundles surface, but the currently wired one lives in
 * tool-routes.tsx, a file this lane may not edit).
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

/* ------------------------------------------------------- shared visuals -- */

/** A stable, readable colour for a package's letter avatar, from its name. */
const AVATAR_COLORS = [
  '#0B57D0', '#146C2E', '#B3261E', '#8430CE', '#C25100',
  '#006874', '#5C1F1B', '#37474F', '#AD1457', '#1B5E20',
]

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

function primaryIconFor(action: RowAction): string {
  return action === 'update' ? 'upgrade' : action === 'install' ? 'download' : 'sync'
}

function isHttpUrl(value: string | undefined): value is string {
  if (value === undefined) {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/* ---------------------------------------------------- ignored updates --- */

const IGNORED_SETTING_KEY = 'ignoredUpdatePackages'

/**
 * Per-package "ignore this update" rules, persisted through the same generic
 * settings bridge every other setting uses — there is no dedicated ignored-
 * updates channel, and this lane does not own the preload/IPC surface that
 * would add one, so the existing key-value store is the honest route.
 */
export function useIgnoredUpdates(): {
  readonly ignored: ReadonlySet<string>
  readonly loaded: boolean
  toggle(key: string): void
} {
  const [ignored, setIgnored] = React.useState<ReadonlySet<string>>(new Set())
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void window.materialUniGetUi.settings.all().then(all => {
      if (cancelled) {
        return
      }
      const stored = all[IGNORED_SETTING_KEY]
      setIgnored(new Set(Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []))
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = React.useCallback((key: string) => {
    setIgnored(current => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      void window.materialUniGetUi.settings.set(IGNORED_SETTING_KEY, Array.from(next))
      return next
    })
  }, [])

  return { ignored, loaded, toggle }
}

/**
 * The ignored-updates manager dialog, ported from the design's `igOpen`
 * modal — a searchable list of every ignored rule with a one-click
 * "Watch again" to clear it.
 */
export function IgnoredUpdatesManager(props: {
  readonly rows: readonly PackageRow[]
  readonly ignored: ReadonlySet<string>
  onWatchAgain(key: string): void
  onClose(): void
}): JSX.Element {
  const { t, a } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const matcher = searchMatcher(search)

  const ignoredRows = props.rows.filter(
    row => props.ignored.has(row.key) && matcher.test(`${row.name} ${row.id}`)
  )

  return (
    <div
      className="pkg-dialog-scrim"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        className="pkg-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('pkgIgnoredManager')}
        onClick={event => event.stopPropagation()}
      >
        <div className="pkg-dialog__header">
          <div className="pkg-dialog__header-title">{t('pkgIgnoredManager')}</div>
          <button
            type="button"
            className="pkg-icon-btn"
            aria-label={t('close')}
            onClick={props.onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <SearchField
          id="ignored-updates-search"
          label={t('searchPh')}
          placeholder={t('searchPh')}
          state={search}
          sampleText={ignoredRows[0]?.name ?? ''}
          onChange={setSearch}
        />

        {ignoredRows.length === 0 ? (
          <div className="state-note">{t('pkgIgnoredEmpty')}</div>
        ) : (
          ignoredRows.map(row => (
            <div className="pkg-ignored-row" key={row.key}>
              <Icon name="star" size={18} filled style={{ color: '#F4B400' }} />
              <div className="package-row__grow">
                <div>{row.name}</div>
                <div className="pkg-ignored-row__meta">
                  {row.id} · {row.manager}
                </div>
              </div>
              <button
                type="button"
                className="pkg-pill-btn"
                aria-label={a('pkgUnignoreOne', { package: row.name })}
                onClick={() => props.onWatchAgain(row.key)}
              >
                {t('pkgWatchAgain')}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------- install options -- */

const DEFAULT_INSTALL_OPTIONS: InstallOptions = {}

/**
 * The install-options dialog, ported from the design's `ioOpen` modal:
 * version, scope, architecture, a custom location and arguments, and the
 * five toggles. Saving runs the action with exactly the chosen options,
 * through the same `operations.enqueue` bridge every other install already
 * uses — nothing here invents a new IPC surface.
 */
export function InstallOptionsDialog(props: {
  readonly row: PackageRow
  readonly action: RowAction
  readonly initial?: InstallOptions
  onCancel(): void
  onSave(options: InstallOptions): void
}): JSX.Element {
  const { t } = useI18n()
  const initial = props.initial ?? DEFAULT_INSTALL_OPTIONS
  const [scope, setScope] = React.useState<InstallOptions['scope']>(initial.scope)
  const [architecture, setArchitecture] = React.useState<InstallOptions['architecture']>(
    initial.architecture
  )
  const [location, setLocation] = React.useState(initial.location ?? '')
  const [customArgs, setCustomArgs] = React.useState(initial.customArgs ?? '')
  const [preRelease, setPreRelease] = React.useState(initial.preRelease ?? false)
  const [skipHashCheck, setSkipHashCheck] = React.useState(initial.skipHashCheck ?? false)
  const [interactive, setInteractive] = React.useState(initial.interactive ?? true)
  const [elevated, setElevated] = React.useState(initial.elevated ?? false)
  const [uninstallPrevious, setUninstallPrevious] = React.useState(
    initial.uninstallPrevious ?? false
  )

  const scopes: ReadonlyArray<{ readonly id: NonNullable<InstallOptions['scope']>; readonly label: string }> = [
    { id: 'user', label: t('pkgScopeUser') },
    { id: 'machine', label: t('pkgScopeMachine') },
  ]
  const architectures: ReadonlyArray<NonNullable<InstallOptions['architecture']>> = [
    'x64',
    'x86',
    'arm64',
  ]
  const toggles: ReadonlyArray<{
    readonly key: string
    readonly label: string
    readonly checked: boolean
    readonly icon: string
    set(value: boolean): void
  }> = [
    { key: 'preRelease', label: t('pkgPreRelease'), checked: preRelease, icon: 'science', set: setPreRelease },
    { key: 'skipHashCheck', label: t('pkgSkipHash'), checked: skipHashCheck, icon: 'verified', set: setSkipHashCheck },
    { key: 'interactive', label: t('pkgInteractive'), checked: interactive, icon: 'touch_app', set: setInteractive },
    { key: 'elevated', label: t('pkgElevated'), checked: elevated, icon: 'shield_person', set: setElevated },
    {
      key: 'uninstallPrevious',
      label: t('pkgUninstallPrevious'),
      checked: uninstallPrevious,
      icon: 'delete_sweep',
      set: setUninstallPrevious,
    },
  ]

  return (
    <div className="pkg-dialog-scrim" role="presentation" onClick={props.onCancel}>
      <div
        className="pkg-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${t('pkgInstallOptionsFor', { package: props.row.name })}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="pkg-dialog__title">
          {t('pkgInstallOptionsFor', { package: props.row.name })}
        </div>
        <div className="pkg-dialog__subtitle">{props.row.id}</div>

        <div className="pkg-dialog__chip-row--columns">
          <div>
            <div className="pkg-dialog__group-label">{t('pkgScopeLabel')}</div>
            <div className="pkg-dialog__chip-row" role="group" aria-label={t('pkgScopeLabel')}>
              {scopes.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    'pkg-choice-chip' + (scope === option.id ? ' pkg-choice-chip--on' : '')
                  }
                  aria-pressed={scope === option.id}
                  onClick={() => setScope(current => (current === option.id ? undefined : option.id))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="pkg-dialog__group-label">{t('pkgArchLabel')}</div>
            <div className="pkg-dialog__chip-row" role="group" aria-label={t('pkgArchLabel')}>
              {architectures.map(option => (
                <button
                  key={option}
                  type="button"
                  className={
                    'pkg-choice-chip' + (architecture === option ? ' pkg-choice-chip--on' : '')
                  }
                  aria-pressed={architecture === option}
                  onClick={() =>
                    setArchitecture(current => (current === option ? undefined : option))
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="visually-hidden" htmlFor="install-options-location">
          {t('pkgLocationPh')}
        </label>
        <input
          id="install-options-location"
          className="pkg-text-input"
          value={location}
          placeholder={t('pkgLocationPh')}
          onChange={event => setLocation(event.currentTarget.value)}
        />

        <label className="visually-hidden" htmlFor="install-options-args">
          {t('pkgArgsPh')}
        </label>
        <input
          id="install-options-args"
          className="pkg-text-input pkg-text-input--mono"
          value={customArgs}
          placeholder={t('pkgArgsPh')}
          onChange={event => setCustomArgs(event.currentTarget.value)}
        />

        {toggles.map(toggle => (
          <button
            key={toggle.key}
            type="button"
            className="pkg-toggle-row"
            aria-pressed={toggle.checked}
            onClick={() => toggle.set(!toggle.checked)}
          >
            <Icon
              name={toggle.checked ? 'check_box' : 'check_box_outline_blank'}
              size={19}
              filled={toggle.checked}
              style={{ color: toggle.checked ? 'var(--p)' : 'var(--onv)' }}
            />
            {toggle.label}
          </button>
        ))}

        <div className="pkg-dialog__actions">
          <button type="button" className="btn" onClick={props.onCancel}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn--filled"
            onClick={() =>
              props.onSave({
                scope,
                architecture,
                location: location.trim().length > 0 ? location.trim() : undefined,
                customArgs: customArgs.trim().length > 0 ? customArgs.trim() : undefined,
                preRelease,
                skipHashCheck,
                interactive,
                elevated,
                uninstallPrevious,
              })
            }
          >
            {t('pkgSaveOptions')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- table --- */

export function PackageTable(props: {
  readonly rows: readonly PackageRow[]
  readonly loading: boolean
  readonly error: string | null
  readonly emptyMessage: string
  readonly action: RowAction
  readonly selected: ReadonlySet<string>
  onToggleSelected(key: string): void
  onToggleAll(): void
  onAction(row: PackageRow, action: RowAction, options?: InstallOptions): void
}): JSX.Element {
  const { t, a } = useI18n()
  const { notify } = useNotifications()
  const ignoredUpdates = useIgnoredUpdates()
  const [ignoredManagerOpen, setIgnoredManagerOpen] = React.useState(false)
  const [optionsFor, setOptionsFor] = React.useState<PackageRow | null>(null)

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
    return <div className="pkg-empty">
      <Icon name="inbox" size={56} className="pkg-empty__icon" />
      <div>{props.emptyMessage}</div>
    </div>
  }

  const allSelected = props.rows.every(row => props.selected.has(row.key))
  const canIgnore = props.action === 'update'

  return (
    <div className="package-table">
      <div className="package-table__bulk pkg-bulk-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={allSelected}
            aria-label={allSelected ? t('pkgClearSelection') : t('pkgToggleAll')}
            onChange={props.onToggleAll}
          />
          <span>
            {/* Says what it covers: the rows shown, not everything that exists. */}
            {allSelected
              ? `All ${props.rows.length} shown selected`
              : `Select all ${props.rows.length} shown`}
          </span>
        </label>

        {canIgnore && (
          <button
            type="button"
            className="pkg-pill-btn"
            aria-label={t('pkgIgnoredManagerOpen')}
            onClick={() => setIgnoredManagerOpen(true)}
          >
            <Icon name="notifications_off" size={16} />
            {t('pkgIgnoredManager')}
            {ignoredUpdates.ignored.size > 0 ? ` (${ignoredUpdates.ignored.size})` : ''}
          </button>
        )}
      </div>

      {props.rows.map(row => {
        const isIgnored = ignoredUpdates.ignored.has(row.key)
        const canOpenInstaller = isHttpUrl(row.source)

        return (
          <div className="package-row pkg-row" key={row.key}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={props.selected.has(row.key)}
                aria-label={`Select ${row.name}`}
                onChange={() => props.onToggleSelected(row.key)}
              />
              <span className="visually-hidden">{row.name}</span>
            </label>

            {canIgnore && (
              <button
                type="button"
                className={
                  'pkg-icon-btn pkg-icon-btn--small pkg-row__ignore' +
                  (isIgnored ? ' pkg-icon-btn--active' : '')
                }
                aria-pressed={isIgnored}
                aria-label={
                  isIgnored
                    ? a('pkgUnignoreOne', { package: row.name })
                    : a('pkgIgnoreOne', { package: row.name })
                }
                title={isIgnored ? t('pkgUnignoreOne', { package: row.name }) : t('pkgIgnoreOne', { package: row.name })}
                onClick={() => ignoredUpdates.toggle(row.key)}
              >
                <Icon name="star" size={18} filled={isIgnored} />
              </button>
            )}

            <span
              className="pkg-row__avatar"
              aria-hidden="true"
              style={{ background: avatarColor(row.name) }}
            >
              {row.name.charAt(0).toUpperCase()}
            </span>

            <div className="package-row__grow">
              <div className="package-row__name">{row.name}</div>
              <div className="package-row__id">
                {row.id}
                <span className="package-row__manager">{row.manager}</span>
              </div>
            </div>

            {row.source !== undefined && row.source.length > 0 && (
              <span className="pkg-row__source-chip">{row.source}</span>
            )}

            <div className="pkg-row__version">
              {row.availableVersion !== undefined
                ? `${row.version} → ${row.availableVersion}`
                : row.version}
            </div>

            <div className="pkg-row__actions">
              <button
                type="button"
                className="pkg-icon-btn"
                aria-label={t('pkgInstallOptions')}
                title={t('pkgInstallOptions')}
                onClick={() => setOptionsFor(row)}
              >
                <Icon name="tune" size={18} />
              </button>

              <a
                className={'pkg-icon-btn' + (canOpenInstaller ? '' : ' pkg-icon-btn--disabled')}
                aria-disabled={!canOpenInstaller}
                aria-label={t('pkgOpenDownload')}
                title={canOpenInstaller ? t('pkgOpenDownload') : t('pkgOpenDownloadUnavailable')}
                href={canOpenInstaller ? row.source : undefined}
                target="_blank"
                rel="noreferrer"
                onClick={event => {
                  if (!canOpenInstaller) {
                    event.preventDefault()
                  }
                }}
              >
                <Icon name="download_2" size={18} />
              </a>

              <button
                type="button"
                className="pkg-icon-btn pkg-icon-btn--accent"
                aria-label={
                  props.action === 'install'
                    ? t('install')
                    : props.action === 'update'
                      ? t('update')
                      : t('uninstall')
                }
                title={
                  props.action === 'install'
                    ? t('install')
                    : props.action === 'update'
                      ? t('update')
                      : t('uninstall')
                }
                onClick={() => props.onAction(row, props.action)}
              >
                <Icon name={primaryIconFor(props.action)} size={20} />
              </button>
            </div>
          </div>
        )
      })}

      {ignoredManagerOpen && (
        <IgnoredUpdatesManager
          rows={props.rows}
          ignored={ignoredUpdates.ignored}
          onWatchAgain={key => {
            ignoredUpdates.toggle(key)
            const row = props.rows.find(candidate => candidate.key === key)
            if (row !== undefined) {
              notify('info', t('pkgUnignoreOne', { package: row.name }))
            }
          }}
          onClose={() => setIgnoredManagerOpen(false)}
        />
      )}

      {optionsFor !== null && (
        <InstallOptionsDialog
          row={optionsFor}
          action={props.action}
          onCancel={() => setOptionsFor(null)}
          onSave={options => {
            props.onAction(optionsFor, props.action, options)
            setOptionsFor(null)
          }}
        />
      )}
    </div>
  )
}

/** Shared selection state and the confirmation gate for destructive actions. */
export function usePackageActions(onChanged: () => void): {
  readonly selected: ReadonlySet<string>
  toggle(key: string): void
  toggleAll(rows: readonly PackageRow[]): void
  clear(): void
  request(row: PackageRow, action: RowAction, options?: InstallOptions): void
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
    async (rows: readonly PackageRow[], action: RowAction, options: InstallOptions = {}) => {
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
    (row: PackageRow, action: RowAction, options?: InstallOptions) => {
      // Only the irreversible one is gated. Gating an install as well would
      // train people to click through the gate without reading it.
      if (action === 'uninstall') {
        setPending({ rows: [row], action })
        return
      }
      void run([row], action, options)
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

/* -------------------------------------------------------------- bundles -- */

export interface BundleSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly count: number
}

const BUNDLE_FORMATS: ReadonlyArray<{
  readonly id: string
  readonly label: string
  readonly lossless: boolean
}> = [
  { id: 'json', label: 'JSON', lossless: true },
  { id: 'yaml', label: 'YAML', lossless: true },
  { id: 'csv', label: 'CSV', lossless: true },
  { id: 'tsv', label: 'TSV', lossless: true },
  { id: 'markdown', label: 'Markdown table', lossless: false },
  { id: 'txt', label: 'Plain text', lossless: false },
]

/**
 * The Bundles screen, ported from the design's `rBundles` section: export
 * what is installed, import a bundle, and a card grid of saved bundles.
 *
 * Functionally this duplicates `BundlesRoute` in tool-routes.tsx (a file
 * this lane does not own) rather than replacing it — app.tsx imports the
 * live one from there, and this lane's allowed paths do not include app.tsx
 * or tool-routes.tsx to repoint that import. Exported here, fully wired to
 * the real `bundles.export` / `bundles.import` bridge, ready for an
 * integrator to swap in. See the port pig's final report.
 */
export function PackageBundlesRoute(props: {
  readonly installed: readonly PackageRow[]
  readonly bundles?: readonly BundleSummary[]
  onInstallBundle?(bundle: BundleSummary): void
  onExportBundle?(bundle: BundleSummary): void
  onRemoveBundle?(bundle: BundleSummary): void
  onNewBundle?(): void
}): JSX.Element {
  const { t, a } = useI18n()
  const { notify } = useNotifications()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [imported, setImported] = React.useState<readonly PackageRow[] | null>(null)
  const [skipped, setSkipped] = React.useState(0)
  const [format, setFormat] = React.useState('json')

  const chosen = BUNDLE_FORMATS.find(candidate => candidate.id === format)
  const matcher = searchMatcher(search)
  const bundles = (props.bundles ?? []).filter(bundle =>
    matcher.test(`${bundle.name} ${bundle.description}`)
  )

  return (
    <>
      <div className="pkg-bundles-toolbar">
        <div className="pkg-bundles-toolbar__heading">{t('bundles')}</div>
        <SearchField
          id="bundles-search"
          label={t('searchPh')}
          placeholder={t('searchPh')}
          state={search}
          sampleText={bundles[0]?.name ?? ''}
          onChange={setSearch}
        />
        <button type="button" className="btn" onClick={() => notify('info', t('bundlesImportHeading'))}>
          <Icon name="upload_file" size={18} />
          {t('importBundle')}
        </button>
        <button type="button" className="btn btn--filled" onClick={props.onNewBundle}>
          <Icon name="add" size={18} />
          {t('newBundle')}
        </button>
      </div>

      <div className="card">
        <h2>{t('bundlesExportHeading')}</h2>
        <p>
          {props.installed.length === 0
            ? t('bundlesExportNone')
            : t('bundlesExportCount', { count: String(props.installed.length) })}
        </p>

        <div className="setting-row__control">
          <label className="visually-hidden" htmlFor="bundle-format">
            {t('bundlesFormatLabel')}
          </label>
          <select
            id="bundle-format"
            className="btn"
            value={format}
            aria-label={t('bundlesFormatLabel')}
            onChange={event => setFormat(event.currentTarget.value)}
          >
            {BUNDLE_FORMATS.map(candidate => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn--filled"
            disabled={props.installed.length === 0}
            onClick={() => {
              const entries = props.installed.map(row => ({
                id: row.id,
                name: row.name,
                manager: row.manager,
                version: row.version,
                source: row.source,
              }))
              void window.materialUniGetUi.bundles.export(entries, format).then(result => {
                if (result.ok) {
                  notify('success', t('bundlesExported'), result.path)
                } else {
                  notify('warning', t('bundlesNotExported'), result.reason)
                }
              })
            }}
          >
            {t('exportBundle')}
          </button>
        </div>

        {chosen !== undefined && !chosen.lossless && (
          <p className="setting-row__provenance">
            {t('bundlesLossyNote', { format: chosen.label })}
          </p>
        )}
      </div>

      <div className="card">
        <h2>{t('bundlesImportHeading')}</h2>
        <p>{t('bundlesImportSub')}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void window.materialUniGetUi.bundles.import().then(result => {
              if (!result.ok) {
                notify('warning', t('bundlesNotImported'), result.reason)
                return
              }
              const entries = result.entries ?? []
              setSkipped(result.skipped ?? 0)
              setImported(
                entries.map(entry => ({
                  key: `${entry.manager}:${entry.id}`,
                  id: entry.id,
                  name: entry.name,
                  manager: entry.manager,
                  version: entry.version ?? '',
                  source: entry.source,
                }))
              )
              notify(
                'success',
                t('bundlesImported'),
                (result.skipped ?? 0) > 0
                  ? t('bundlesSkipped', {
                      count: String(result.skipped ?? 0),
                      plural: (result.skipped ?? 0) === 1 ? 'y was' : 'ies were',
                    })
                  : `${entries.length}`
              )
            })
          }}
        >
          {t('bundlesChooseFile')}
        </button>

        {imported !== null && (
          <>
            {skipped > 0 && (
              <p className="setting-row__provenance">
                {t('bundlesSkipped', {
                  count: String(skipped),
                  plural: skipped === 1 ? 'y was' : 'ies were',
                })}
              </p>
            )}
            {imported.map(row => (
              <div className="package-row" key={row.key}>
                <div className="package-row__grow">
                  <div className="package-row__name">{row.name}</div>
                  <div className="package-row__id">
                    {row.id}
                    <span className="package-row__manager">{row.manager}</span>
                  </div>
                </div>
                <div className="package-row__version">{row.version}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {bundles.length > 0 && (
        <div className="pkg-bundles-grid">
          {bundles.map(bundle => (
            <div className="pkg-bundle-card" key={bundle.id}>
              <div className="pkg-bundle-card__head">
                <Icon name="package_2" size={24} style={{ color: 'var(--p)' }} />
                <div className="pkg-bundle-card__name">{bundle.name}</div>
                <span className="pkg-bundle-card__count">{bundle.count} pkgs</span>
              </div>
              <div className="pkg-bundle-card__desc">{bundle.description}</div>
              <div className="pkg-bundle-card__actions">
                <button
                  type="button"
                  className="btn btn--filled"
                  onClick={() => props.onInstallBundle?.(bundle)}
                >
                  {t('installAllBundle')}
                </button>
                <button type="button" className="btn" onClick={() => props.onExportBundle?.(bundle)}>
                  {t('exportBundle')}
                </button>
                <span className="pkg-bundle-card__spacer" />
                <button
                  type="button"
                  className="pkg-icon-btn"
                  aria-label={a('uninstall')}
                  title={t('uninstall')}
                  onClick={() => props.onRemoveBundle?.(bundle)}
                >
                  <Icon name="delete" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export { SearchField, emptySearchState, searchMatcher }
export type { SearchState }
