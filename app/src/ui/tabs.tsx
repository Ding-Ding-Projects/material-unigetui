import * as React from 'react'
import { RouteId, allRoutes, routeLabel } from './routes'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'

/**
 * Browser-style tabs.
 *
 * Content is navigated rather than scrolled, tabs can be pinned and grouped,
 * and the state survives a restart. Four searches exist because they answer
 * genuinely different questions: what is in this strip, what is in this group,
 * which group am I looking for, and where is that tab across everything open.
 */

export interface AppTab {
  readonly id: string
  readonly route: RouteId
  readonly pinned: boolean
  readonly group: string | null
}

export interface TabGroup {
  readonly name: string
  readonly collapsed: boolean
}

export interface TabsController {
  readonly tabs: readonly AppTab[]
  readonly groups: Readonly<Record<string, TabGroup>>
  readonly activeId: string
  readonly activeRoute: RouteId
  openRoute(route: RouteId): void
  activate(id: string): void
  close(id: string): void
  closeMany(ids: readonly string[]): void
  togglePin(id: string): void
  moveToGroup(id: string, group: string | null): void
  setGroupCollapsed(name: string, collapsed: boolean): void
}

const STORAGE_KEY = 'tabs'

function newTab(route: RouteId): AppTab {
  return {
    id: `${route}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    route,
    pinned: false,
    group: null,
  }
}

export function useTabs(): TabsController {
  const [tabs, setTabs] = React.useState<readonly AppTab[]>(() => [newTab('discover')])
  const [groups, setGroups] = React.useState<Readonly<Record<string, TabGroup>>>({})
  const [activeId, setActiveId] = React.useState<string>(() => '')
  const restored = React.useRef(false)

  // Restore once, then persist on every change. Restoring on every render
  // would fight the user's own clicks.
  React.useEffect(() => {
    void (async () => {
      const settings = await window.materialUniGetUi.settings.all()
      const stored = settings[STORAGE_KEY]
      if (
        typeof stored === 'object' &&
        stored !== null &&
        Array.isArray((stored as { tabs?: unknown }).tabs)
      ) {
        const parsed = stored as { tabs: AppTab[]; groups?: Record<string, TabGroup>; activeId?: string }
        const valid = parsed.tabs.filter(tab =>
          allRoutes.some(route => route.id === tab.route)
        )
        if (valid.length > 0) {
          setTabs(valid)
          setGroups(parsed.groups ?? {})
          setActiveId(
            valid.some(tab => tab.id === parsed.activeId)
              ? (parsed.activeId as string)
              : valid[0]!.id
          )
        }
      }
      restored.current = true
    })()
  }, [])

  React.useEffect(() => {
    if (!restored.current) {
      return
    }
    void window.materialUniGetUi.settings.set(STORAGE_KEY, {
      tabs,
      groups,
      activeId,
    })
  }, [tabs, groups, activeId])

  React.useEffect(() => {
    if (activeId === '' && tabs.length > 0) {
      setActiveId(tabs[0]!.id)
    }
  }, [activeId, tabs])

  const activeRoute =
    tabs.find(tab => tab.id === activeId)?.route ?? tabs[0]?.route ?? 'discover'

  const openRoute = React.useCallback((route: RouteId) => {
    setTabs(current => {
      const existing = current.find(tab => tab.route === route)
      if (existing !== undefined) {
        setActiveId(existing.id)
        return current
      }
      const created = newTab(route)
      setActiveId(created.id)
      return [...current, created]
    })
  }, [])

  const close = React.useCallback((id: string) => {
    setTabs(current => {
      // Never close the last tab out from under the user; an application with
      // no surface at all reads as a crash.
      if (current.length <= 1) {
        return current
      }
      const index = current.findIndex(tab => tab.id === id)
      const next = current.filter(tab => tab.id !== id)
      setActiveId(previous =>
        previous === id ? (next[Math.max(0, index - 1)]?.id ?? next[0]!.id) : previous
      )
      return next
    })
  }, [])

  const closeMany = React.useCallback((ids: readonly string[]) => {
    setTabs(current => {
      const doomed = new Set(ids)
      // Pinned tabs are excluded by default, exactly as the bulk-close contract
      // requires; including them is a separate, explicit choice.
      const next = current.filter(tab => !doomed.has(tab.id) || tab.pinned)
      if (next.length === 0) {
        return current
      }
      setActiveId(previous =>
        next.some(tab => tab.id === previous) ? previous : next[0]!.id
      )
      return next
    })
  }, [])

  const togglePin = React.useCallback((id: string) => {
    setTabs(current =>
      current.map(tab => (tab.id === id ? { ...tab, pinned: !tab.pinned } : tab))
    )
  }, [])

  const moveToGroup = React.useCallback((id: string, group: string | null) => {
    setTabs(current => current.map(tab => (tab.id === id ? { ...tab, group } : tab)))
    if (group !== null) {
      setGroups(current =>
        current[group] === undefined
          ? { ...current, [group]: { name: group, collapsed: false } }
          : current
      )
    }
  }, [])

  const setGroupCollapsed = React.useCallback((name: string, collapsed: boolean) => {
    setGroups(current => ({ ...current, [name]: { name, collapsed } }))
  }, [])

  return {
    tabs,
    groups,
    activeId,
    activeRoute,
    openRoute,
    activate: setActiveId,
    close,
    closeMany,
    togglePin,
    moveToGroup,
    setGroupCollapsed,
  }
}

export function TabStrip(props: { readonly tabs: TabsController }): JSX.Element {
  const controller = props.tabs
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [scope, setScope] = React.useState<'strip' | 'group' | 'groups' | 'all'>('strip')
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [bulkText, setBulkText] = React.useState('')
  const [bulkInvert, setBulkInvert] = React.useState(false)

  const matcher = searchMatcher(search)

  const scopeSource = React.useMemo(() => {
    switch (scope) {
      case 'strip':
        return controller.tabs
      case 'group': {
        const current = controller.tabs.find(tab => tab.id === controller.activeId)
        return controller.tabs.filter(tab => tab.group === (current?.group ?? null))
      }
      case 'groups':
        return controller.tabs.filter(tab => tab.group !== null)
      case 'all':
      default:
        return controller.tabs
    }
  }, [scope, controller.tabs, controller.activeId])

  const found = scopeSource.filter(tab =>
    matcher.test(`${routeLabel(tab.route)} ${tab.group ?? ''}`)
  )

  // Preview first: the exact tabs a bulk close would take, computed from the
  // same predicate the action uses so the two cannot disagree.
  const bulkDoomed = React.useMemo(() => {
    if (bulkText.trim().length === 0) {
      return []
    }
    const needle = bulkText.toLowerCase()
    return controller.tabs.filter(tab => {
      const contains = routeLabel(tab.route).toLowerCase().includes(needle)
      const matches = bulkInvert ? !contains : contains
      return matches && !tab.pinned
    })
  }, [bulkText, bulkInvert, controller.tabs])

  const pinned = controller.tabs.filter(tab => tab.pinned)
  const ordinary = controller.tabs.filter(tab => !tab.pinned)

  return (
    <div className="tab-strip-wrap">
      <div className="tab-strip" role="tablist" aria-label="Open tabs">
        {[...pinned, ...ordinary].map(tab => (
          <div
            key={tab.id}
            className="tab"
            data-pinned={tab.pinned}
            data-active={tab.id === controller.activeId}
          >
            <button
              role="tab"
              aria-selected={tab.id === controller.activeId}
              className="tab__label"
              title={tab.pinned ? `${routeLabel(tab.route)} (pinned)` : routeLabel(tab.route)}
              onClick={() => controller.activate(tab.id)}
            >
              {tab.pinned && <span aria-hidden="true">📌 </span>}
              {routeLabel(tab.route)}
              {tab.group !== null && <span className="tab__group">{tab.group}</span>}
            </button>
            <button
              className="tab__pin"
              aria-label={
                tab.pinned
                  ? `Unpin ${routeLabel(tab.route)}`
                  : `Pin ${routeLabel(tab.route)}`
              }
              onClick={() => controller.togglePin(tab.id)}
            >
              {tab.pinned ? '▣' : '▢'}
            </button>
            <button
              className="tab__close"
              aria-label={`Close ${routeLabel(tab.route)}`}
              onClick={() => controller.close(tab.id)}
            >
              {'×'}
            </button>
          </div>
        ))}

        <button
          className="tab-strip__action"
          onClick={() => setSearchOpen(open => !open)}
          aria-expanded={searchOpen}
        >
          Search tabs
        </button>
        <button
          className="tab-strip__action"
          onClick={() => setBulkOpen(open => !open)}
          aria-expanded={bulkOpen}
        >
          Close many
        </button>
      </div>

      {searchOpen && (
        <div className="tab-panel">
          <div className="tab-panel__scopes" role="group" aria-label="Search scope">
            {(
              [
                ['strip', 'This strip'],
                ['group', 'This group'],
                ['groups', 'Grouped tabs'],
                ['all', 'Everything open'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className="chip"
                aria-pressed={scope === id}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <SearchField
            id="tab-search"
            label="Search tabs"
            placeholder="Search open tabs…"
            state={search}
            sampleText={routeLabel(controller.tabs[0]?.route ?? 'discover')}
            resultSummary={`${found.length} of ${scopeSource.length} in scope`}
            onChange={setSearch}
          />

          <div className="tab-panel__results">
            {found.length === 0 && <div className="state-note">No tab matched.</div>}
            {found.map(tab => (
              <button
                key={tab.id}
                className="tab-panel__result"
                onClick={() => {
                  controller.activate(tab.id)
                  setSearchOpen(false)
                }}
              >
                {routeLabel(tab.route)}
                {tab.pinned && ' · pinned'}
                {tab.group !== null && ` · ${tab.group}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="tab-panel">
          <label className="tab-panel__field">
            <span>Close tabs whose name…</span>
            <input
              type="text"
              value={bulkText}
              placeholder="contains this text"
              onChange={event => setBulkText(event.currentTarget.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={bulkInvert}
              onChange={event => setBulkInvert(event.currentTarget.checked)}
            />
            <span>Invert — close the ones that do NOT contain it</span>
          </label>

          <div className="tab-panel__preview">
            {bulkText.trim().length === 0 ? (
              // Never runs on an empty query: that would close everything.
              <span>Type something first. An empty query is not a match-all here.</span>
            ) : bulkDoomed.length === 0 ? (
              <span>Nothing would close. Pinned tabs are always excluded.</span>
            ) : (
              <span>
                {bulkDoomed.length} would close:{' '}
                {bulkDoomed.map(tab => routeLabel(tab.route)).join(', ')}
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn btn--danger btn--small"
            disabled={bulkDoomed.length === 0}
            onClick={() => {
              controller.closeMany(bulkDoomed.map(tab => tab.id))
              setBulkOpen(false)
              setBulkText('')
            }}
          >
            Close {bulkDoomed.length}
          </button>
        </div>
      )}
    </div>
  )
}
