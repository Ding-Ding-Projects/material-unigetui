import * as React from 'react'
import './app.css'
import './components.css'
import { AppThemeProvider, useTheme } from './app-theme'
import { primaryRoutes, toolsRoutes, RouteId, routeLabel } from './routes'
import { AppStateProvider, useSettings, useI18n } from './app-state'
import { NotificationsProvider, useNotifications } from './notifications'
import { CommandPalette, PaletteEntry, usePaletteShortcut } from './command-palette'
import { OperationsDock, useOperations } from './operations-dock'
import { SettingsRoute, SettingsTabId, SETTINGS_TABS, SETTING_DESCRIPTORS } from './settings-route'
import { TabStrip, useTabs } from './tabs'
import { DimSumSurprise } from './dim-sum-surprise'
import {
  LogsRoute,
  HistoryRoute,
  BundlesRoute,
  TicketsRoute,
  AutomationRoute,
} from './tool-routes'
import {
  PackageTable,
  PackageRow,
  usePackageActions,
  usePackageSource,
  toRow,
  SearchField,
  SearchState,
  emptySearchState,
  searchMatcher,
} from './package-routes'
import { ManagerAvailability } from '../models/manager'
import { isLanguageMode } from '../lib/i18n'

/* ------------------------------------------------------------- chrome --- */

function TitleBar(): JSX.Element {
  const { theme, toggleTheme } = useTheme()
  const { settings } = useSettings()
  const bridge = window.materialUniGetUi

  const chosenName = String(settings['displayName'] ?? '').trim()
  const displayName = chosenName.length > 0 ? chosenName : 'Material UniGetUI'
  const themeLabel =
    theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

  return (
    <header className="title-bar">
      <span className="title-bar__name">{displayName}</span>
      <span className="title-bar__spacer" />
      <div className="title-bar__buttons">
        <button
          className="title-bar__button"
          onClick={toggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {theme === 'light' ? '◐' : '◑'}
        </button>
        <button
          className="title-bar__button"
          onClick={() => bridge.window.minimize()}
          aria-label="Minimise"
        >
          {'─'}
        </button>
        <button
          className="title-bar__button"
          onClick={() => bridge.window.toggleMaximize()}
          aria-label="Maximise"
        >
          {'▢'}
        </button>
        <button
          className="title-bar__button title-bar__button--close"
          onClick={() => bridge.window.close()}
          aria-label="Close"
        >
          {'✕'}
        </button>
      </div>
    </header>
  )
}

function NavRail(props: {
  readonly route: RouteId
  onNavigate(route: RouteId): void
}): JSX.Element {
  const renderGroup = (
    label: string,
    routes: ReadonlyArray<{ readonly id: RouteId; readonly label: string }>
  ) => (
    <React.Fragment key={label}>
      <div className="nav-rail__group-label">{label}</div>
      {routes.map(route => (
        <button
          key={route.id}
          id={`nav-${route.id}`}
          className="nav-rail__item"
          aria-current={route.id === props.route ? 'page' : undefined}
          onClick={() => props.onNavigate(route.id)}
        >
          {route.label}
        </button>
      ))}
    </React.Fragment>
  )

  return (
    <nav className="nav-rail" aria-label="Sections">
      {renderGroup('Packages', primaryRoutes)}
      {renderGroup('Tools', toolsRoutes)}
    </nav>
  )
}

/* ------------------------------------------------------------- routes --- */

function DiscoverRoute(props: {
  readonly managers: readonly ManagerAvailability[]
  onChanged(): void
}): JSX.Element {
  const { t } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [submitted, setSubmitted] = React.useState('')
  const actions = usePackageActions(props.onChanged)

  const typed = search.useRegex ? search.regex.pattern : search.query

  // Debounced: every query spawns real package-manager processes, so one per
  // keystroke would fork a dozen for a single word.
  React.useEffect(() => {
    const timer = setTimeout(() => setSubmitted(typed), 450)
    return () => clearTimeout(timer)
  }, [typed])

  const state = usePackageSource(
    async () => {
      const found = await window.materialUniGetUi.packages.search(submitted)
      return found.map(toRow)
    },
    [submitted],
    submitted.trim().length > 0
  )

  return (
    <>
      <h1 className="route-surface__heading">{t('discover')}</h1>
      <p className="route-surface__sub">{t('discoverSub')}</p>

      <SearchField
        id="discover-search"
        label={t('searchPh')}
        placeholder={t('searchPh')}
        state={search}
        sampleText={state.rows[0]?.name ?? ''}
        resultSummary={
          submitted.length === 0 ? undefined : `${state.rows.length} results`
        }
        onChange={setSearch}
      />

      <BulkBar
        rows={state.rows}
        selected={actions.selected}
        action="install"
        onRun={rows => actions.requestBulk(rows, 'install')}
      />

      <PackageTable
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage={
          submitted.trim().length === 0
            ? t('emptySearchPrompt')
            : t('emptyNoResults')
        }
        action="install"
        selected={actions.selected}
        onToggleSelected={actions.toggle}
        onToggleAll={() => actions.toggleAll(state.rows)}
        onAction={actions.request}
      />
      {actions.gate}
    </>
  )
}

function UpdatesRoute(props: { onChanged(): void }): JSX.Element {
  const { t } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const actions = usePackageActions(props.onChanged)

  const state = usePackageSource(async () => {
    const updates = await window.materialUniGetUi.packages.updates()
    return updates.map(update => ({
      key: update.key,
      id: update.id,
      name: update.name,
      manager: update.manager,
      version: update.version,
      availableVersion: update.availableVersion,
      source: update.source,
    }))
  }, [])

  const matcher = searchMatcher(search)
  const rows = state.rows.filter(row => matcher.test(`${row.name} ${row.id}`))

  return (
    <>
      <h1 className="route-surface__heading">{t('updates')}</h1>
      <p className="route-surface__sub">{t('updatesSub')}</p>

      <SearchField
        id="updates-search"
        label="Filter updates"
        placeholder="Filter these updates…"
        state={search}
        sampleText={state.rows[0]?.name ?? ''}
        resultSummary={`${rows.length} of ${state.rows.length}`}
        onChange={setSearch}
      />

      <BulkBar
        rows={rows}
        selected={actions.selected}
        action="update"
        onRun={selectedRows => actions.requestBulk(selectedRows, 'update')}
      />

      <PackageTable
        rows={rows}
        loading={state.loading}
        error={state.error}
        emptyMessage={t('emptyUpToDate')}
        action="update"
        selected={actions.selected}
        onToggleSelected={actions.toggle}
        onToggleAll={() => actions.toggleAll(rows)}
        onAction={actions.request}
      />
      {actions.gate}
    </>
  )
}

function InstalledRoute(props: { onChanged(): void }): JSX.Element {
  const { t } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const actions = usePackageActions(props.onChanged)

  const state = usePackageSource(async () => {
    const installed = await window.materialUniGetUi.packages.installed()
    return installed.map(pkg => ({
      key: pkg.key,
      id: pkg.id,
      name: pkg.name,
      manager: pkg.manager,
      version: pkg.version,
      source: pkg.source,
    }))
  }, [])

  const matcher = searchMatcher(search)
  const rows = state.rows.filter(row => matcher.test(`${row.name} ${row.id}`))

  return (
    <>
      <h1 className="route-surface__heading">{t('installed')}</h1>
      <p className="route-surface__sub">{t('installedSub')}</p>

      <SearchField
        id="installed-search"
        label="Filter installed packages"
        placeholder="Filter installed packages…"
        state={search}
        sampleText={state.rows[0]?.name ?? ''}
        resultSummary={`${rows.length} of ${state.rows.length}`}
        onChange={setSearch}
      />

      <BulkBar
        rows={rows}
        selected={actions.selected}
        action="uninstall"
        onRun={selectedRows => actions.requestBulk(selectedRows, 'uninstall')}
      />

      <PackageTable
        rows={rows}
        loading={state.loading}
        error={state.error}
        emptyMessage={t('emptyInstalled')}
        action="uninstall"
        selected={actions.selected}
        onToggleSelected={actions.toggle}
        onToggleAll={() => actions.toggleAll(rows)}
        onAction={actions.request}
      />
      {actions.gate}
    </>
  )
}

/** Says exactly how many rows an action will affect before it runs. */
function BulkBar(props: {
  readonly rows: readonly PackageRow[]
  readonly selected: ReadonlySet<string>
  readonly action: 'install' | 'update' | 'uninstall'
  onRun(rows: readonly PackageRow[]): void
}): JSX.Element | null {
  const chosen = props.rows.filter(row => props.selected.has(row.key))
  if (chosen.length === 0) {
    return null
  }

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <span>
        {chosen.length} selected — {props.action} will run on{' '}
        {chosen.length === 1 ? 'it' : 'all of them'}
      </span>
      <button
        type="button"
        className="btn btn--filled btn--small"
        onClick={() => props.onRun(chosen)}
      >
        {props.action} {chosen.length}
      </button>
    </div>
  )
}

function AboutRoute(): JSX.Element {
  const [dataPath, setDataPath] = React.useState('')

  React.useEffect(() => {
    void window.materialUniGetUi.shell.appDataPath().then(setDataPath)
  }, [])

  return (
    <>
      <h1 className="route-surface__heading">Help &amp; About</h1>
      <p className="route-surface__sub">
        A Material Design 3 rewrite of the UniGetUI interface.
      </p>

      <div className="card">
        <h2>Unsigned artifacts</h2>
        <p>
          Builds of this application are unsigned and always will be. Windows
          will show an unknown-publisher warning when installing one. That is
          expected; it is not evidence of tampering, and it is also not a
          substitute for checking what you downloaded.
        </p>
      </div>

      <div className="card">
        <h2>Your data</h2>
        <p>
          Settings live in this folder. Deleting it resets everything, including
          any locks — that is the documented recovery route if you are ever shut
          out of your own copy.
        </p>
        <p>
          <code>{dataPath || 'resolving…'}</code>
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void window.materialUniGetUi.shell.openAppData()}
        >
          Open that folder
        </button>
      </div>

      <div className="card">
        <h2>Package managers</h2>
        <p>
          Drivers are reimplemented natively rather than calling the original
          UniGetUI engine. UniGetUI is included in the source repository as a
          read-only reference for command lines and output parsing; none of its
          code runs here.
        </p>
      </div>
    </>
  )
}

function NotYetPorted(props: { readonly route: RouteId }): JSX.Element {
  const { t } = useI18n()
  return (
    <>
      <h1 className="route-surface__heading">{routeLabel(props.route)}</h1>
      <p className="route-surface__sub">
        This surface is designed but not yet built.
      </p>
      <div className="state-note">
        <strong>{t('notImplementedTitle')}</strong> {t('notImplementedBody')}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- app --- */

function AppContent(): JSX.Element {
  const { settings, set } = useSettings()
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const notifications = useNotifications()
  const tabs = useTabs()
  const [settingsTab, setSettingsTab] = React.useState<SettingsTabId>('general')
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteSize, setPaletteSize] = React.useState<'card' | 'full'>('card')
  const [dockOpen, setDockOpen] = React.useState(true)
  const [managers, setManagers] = React.useState<readonly ManagerAvailability[]>([])
  const [installed, setInstalled] = React.useState<readonly PackageRow[]>([])
  const [reloadNonce, setReloadNonce] = React.useState(0)

  const route = tabs.activeRoute

  usePaletteShortcut(React.useCallback(() => setPaletteOpen(true), []))

  const { operations } = useOperations()

  React.useEffect(() => {
    void window.materialUniGetUi.managers.list().then(setManagers)
  }, [])

  // Loaded once at startup so Bundles can export without the user having to
  // visit Installed packages first.
  React.useEffect(() => {
    void window.materialUniGetUi.packages.installed().then(packages =>
      setInstalled(
        packages.map(pkg => ({
          key: pkg.key,
          id: pkg.id,
          name: pkg.name,
          manager: pkg.manager,
          version: pkg.version,
          source: pkg.source,
        }))
      )
    )
  }, [reloadNonce])

  // The theme setting and the theme provider are one value, not two that drift.
  React.useEffect(() => {
    const stored = settings['theme']
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
    }
  }, [settings, setTheme])

  const paletteEntries = React.useMemo<readonly PaletteEntry[]>(() => {
    const destinations: PaletteEntry[] = [...primaryRoutes, ...toolsRoutes].map(
      entry => ({
        kind: 'destination',
        id: `route-${entry.id}`,
        title: entry.label,
        context: 'Destination',
        run: () => {
          tabs.openRoute(entry.id)
          // Land on the exact element, focused and briefly highlighted, rather
          // than on the general area with the user left to hunt.
          window.requestAnimationFrame(() => {
            const element = document.getElementById(`nav-${entry.id}`)
            element?.focus()
            element?.classList.add('teleport-flash')
            setTimeout(() => element?.classList.remove('teleport-flash'), 1200)
          })
        },
      })
    )

    const settingEntries: PaletteEntry[] = SETTING_DESCRIPTORS.map(descriptor => {
      const tabLabel =
        SETTINGS_TABS.find(tab => tab.id === descriptor.tab)?.label ?? 'Settings'
      const context = `Settings · ${tabLabel}`
      const value = settings[descriptor.key]

      switch (descriptor.control.kind) {
        case 'toggle':
          return {
            kind: 'toggle',
            id: `setting-${descriptor.key}`,
            title: descriptor.title,
            context,
            value: value === true,
            set: next => void set(descriptor.key, next),
          }
        case 'choice':
          return {
            kind: 'choice',
            id: `setting-${descriptor.key}`,
            title: descriptor.title,
            context,
            value: String(value ?? ''),
            options: descriptor.control.options,
            set: next => void set(descriptor.key, next),
          }
        case 'range':
          return {
            kind: 'range',
            id: `setting-${descriptor.key}`,
            title: descriptor.title,
            context,
            value: Number(value ?? descriptor.control.min),
            min: descriptor.control.min,
            max: descriptor.control.max,
            set: next => void set(descriptor.key, next),
          }
        case 'text':
          return {
            kind: 'action',
            id: `setting-${descriptor.key}`,
            title: descriptor.title,
            context,
            run: () => {
              tabs.openRoute('settings')
              setSettingsTab(descriptor.tab)
            },
          }
      }
    })

    const actions: PaletteEntry[] = [
      {
        kind: 'action',
        id: 'action-open-appdata',
        title: 'Open the application data folder',
        context: 'Action · the documented reset path',
        run: () => void window.materialUniGetUi.shell.openAppData(),
      },
      {
        kind: 'action',
        id: 'action-dismiss-notifications',
        title: 'Dismiss all notifications',
        context: 'Action · notifications',
        run: () => notifications.dismissAll(),
      },
    ]

    return [...destinations, ...settingEntries, ...actions]
  }, [settings, set, tabs, notifications])

  const onChanged = React.useCallback(() => setReloadNonce(n => n + 1), [])

  let surface: JSX.Element
  switch (route) {
    case 'discover':
      surface = <DiscoverRoute key={reloadNonce} managers={managers} onChanged={onChanged} />
      break
    case 'updates':
      surface = <UpdatesRoute key={reloadNonce} onChanged={onChanged} />
      break
    case 'installed':
      surface = <InstalledRoute key={reloadNonce} onChanged={onChanged} />
      break
    case 'settings':
      surface = (
        <SettingsRoute
          tab={settingsTab}
          managers={managers}
          onTabChange={setSettingsTab}
        />
      )
      break
    case 'about':
      surface = <AboutRoute />
      break
    case 'logs':
      surface = <LogsRoute />
      break
    case 'history':
      surface = <HistoryRoute operations={operations} />
      break
    case 'bundles':
      surface = <BundlesRoute installed={installed} />
      break
    case 'tickets':
      surface = <TicketsRoute />
      break
    case 'automation':
      surface = <AutomationRoute />
      break
    default:
      surface = <NotYetPorted route={route} />
  }

  return (
    <div className="app-shell" data-density={String(settings['density'] ?? 'comfortable')}>
      <TitleBar />
      <TabStrip tabs={tabs} />
      <div className="app-body">
        <NavRail route={route} onNavigate={tabs.openRoute} />
        <main className="route-surface" id="route-surface">
          {surface}
        </main>
      </div>

      <OperationsDock
        operations={operations}
        expanded={dockOpen}
        onToggle={() => setDockOpen(open => !open)}
      />

      {paletteOpen && (
        <CommandPalette
          entries={paletteEntries}
          size={paletteSize}
          onSizeChange={setPaletteSize}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      <DimSumSurprise />

      <div className="visually-hidden" aria-live="polite">
        {t('appName')}
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  return (
    <AppStateProvider>
      <AppThemeProvider>
        <NotificationsProvider>
          <AppContent />
        </NotificationsProvider>
      </AppThemeProvider>
    </AppStateProvider>
  )
}

export { isLanguageMode }
