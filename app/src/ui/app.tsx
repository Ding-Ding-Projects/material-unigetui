import * as React from 'react'
import './app.css'
import { AppThemeProvider, useTheme } from './app-theme'
import { primaryRoutes, toolsRoutes, RouteId, routeLabel } from './routes'
import { PackageList, PackageRowModel } from './package-list'

function TitleBar(): JSX.Element {
  const { theme, toggleTheme } = useTheme()
  const bridge = window.materialUniGetUi
  const themeLabel =
    theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

  return (
    <header className="title-bar">
      <span className="title-bar__name">Material UniGetUI</span>
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

interface LoadState {
  readonly loading: boolean
  readonly error: string | null
  readonly packages: readonly PackageRowModel[]
}

const INITIAL: LoadState = { loading: true, error: null, packages: [] }

function usePackages(
  load: () => Promise<readonly PackageRowModel[]>,
  deps: readonly unknown[]
): LoadState {
  const [state, setState] = React.useState<LoadState>(INITIAL)

  React.useEffect(() => {
    let cancelled = false
    setState(INITIAL)

    load().then(
      packages => {
        // A response that arrives after the user has moved on must not
        // overwrite whatever they are looking at now.
        if (!cancelled) {
          setState({ loading: false, error: null, packages })
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            packages: [],
          })
        }
      }
    )

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}

function DiscoverRoute(): JSX.Element {
  const [query, setQuery] = React.useState('')
  const [submitted, setSubmitted] = React.useState('')

  // Search as the user types, like the design does, but debounced: each query
  // spawns a real package-manager process, so one per keystroke would fork a
  // dozen processes for a single word.
  React.useEffect(() => {
    const timer = setTimeout(() => setSubmitted(query), 400)
    return () => clearTimeout(timer)
  }, [query])

  const state = usePackages(async () => {
    if (submitted.trim().length === 0) {
      return []
    }
    const found = await window.materialUniGetUi.packages.search(submitted)
    return found.map(p => ({
      key: p.key,
      id: p.id,
      name: p.name,
      versionText: p.version ?? '',
    }))
  }, [submitted])

  const emptyMessage =
    submitted.length === 0
      ? 'Type a search above to find something to install.'
      : 'Nothing matched that search.'

  return (
    <>
      <h1 className="route-surface__heading">Discover packages</h1>
      <p className="route-surface__sub">
        Searches every package manager this build can drive.
      </p>
      <form
        className="search-field"
        onSubmit={event => {
          event.preventDefault()
          setSubmitted(query)
        }}
      >
        <input
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          placeholder="Search packages, sources, IDs…"
          aria-label="Search packages"
        />
      </form>
      <PackageList
        loading={submitted.length > 0 && state.loading}
        error={state.error}
        packages={state.packages}
        emptyMessage={emptyMessage}
      />
    </>
  )
}

function UpdatesRoute(): JSX.Element {
  const state = usePackages(async () => {
    const updates = await window.materialUniGetUi.packages.updates()
    return updates.map(p => ({
      key: p.key,
      id: p.id,
      name: p.name,
      versionText: p.version + ' → ' + p.availableVersion,
    }))
  }, [])

  return (
    <>
      <h1 className="route-surface__heading">Software updates</h1>
      <p className="route-surface__sub">
        Everything with a newer version available.
      </p>
      <PackageList {...state} emptyMessage="Everything is up to date." />
    </>
  )
}

function InstalledRoute(): JSX.Element {
  const state = usePackages(async () => {
    const installed = await window.materialUniGetUi.packages.installed()
    return installed.map(p => ({
      key: p.key,
      id: p.id,
      name: p.name,
      versionText: p.version,
    }))
  }, [])

  return (
    <>
      <h1 className="route-surface__heading">Installed packages</h1>
      <p className="route-surface__sub">
        Everything your package managers report as installed.
      </p>
      <PackageList
        {...state}
        emptyMessage="No installed packages were reported."
      />
    </>
  )
}

/**
 * Routes whose surface has not been ported yet say so plainly.
 *
 * A deliberate honest empty state, not a placeholder dressed up as a working
 * screen. Nothing here is styled to look operable.
 */
function NotYetPorted(props: { readonly route: RouteId }): JSX.Element {
  return (
    <>
      <h1 className="route-surface__heading">{routeLabel(props.route)}</h1>
      <p className="route-surface__sub">
        This surface is designed but not yet built.
      </p>
      <div className="state-note">
        <strong>Not implemented yet.</strong> The design for this screen is
        checked in under <code>design/</code>, and its row in the completeness
        inventory records what is still missing. It is deliberately inert rather
        than a mock that looks like it works.
      </div>
    </>
  )
}

function AppContent(): JSX.Element {
  const [route, setRoute] = React.useState<RouteId>('discover')

  let surface: JSX.Element
  switch (route) {
    case 'discover':
      surface = <DiscoverRoute />
      break
    case 'updates':
      surface = <UpdatesRoute />
      break
    case 'installed':
      surface = <InstalledRoute />
      break
    default:
      surface = <NotYetPorted route={route} />
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <NavRail route={route} onNavigate={setRoute} />
        <main className="route-surface">{surface}</main>
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  return (
    <AppThemeProvider>
      <AppContent />
    </AppThemeProvider>
  )
}
