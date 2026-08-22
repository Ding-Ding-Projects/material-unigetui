import * as React from 'react'
import { RouteId, allRoutes, routeLabel, routeI18nKey, routeIcon } from './routes'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { Icon } from './md3/icon'
import { useI18n } from './app-state'
import type { TranslationKey } from '../lib/i18n-resources'
import './tabs.css'

const GROUP_COLORS = ['#0B57D0', '#146C2E', '#B3261E', '#7B4FE0', '#B85C00'] as const

/** A stable, deterministic pill colour per group name — no state to persist. */
function groupColor(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return GROUP_COLORS[hash % GROUP_COLORS.length]!
}

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

/** The route's localized label, falling back to the English one when no key exists. */
function useTabLabel(): (route: RouteId) => string {
  const { t } = useI18n()
  return React.useCallback(
    (route: RouteId) => {
      const key = routeI18nKey(route) as TranslationKey
      const translated = t(key)
      return translated === key ? routeLabel(route) : translated
    },
    [t]
  )
}

export function TabStrip(props: { readonly tabs: TabsController }): JSX.Element {
  const controller = props.tabs
  const { t } = useI18n()
  const label = useTabLabel()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [scope, setScope] = React.useState<'strip' | 'group' | 'groups' | 'all'>('strip')
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [groupSearchOpen, setGroupSearchOpen] = React.useState(false)
  const [groupSearch, setGroupSearch] = React.useState<SearchState>(emptySearchState)
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [bulkText, setBulkText] = React.useState('')
  const [bulkInvert, setBulkInvert] = React.useState(false)
  const [movePickerFor, setMovePickerFor] = React.useState<string | null>(null)
  const [moveSearch, setMoveSearch] = React.useState<SearchState>(emptySearchState)
  const [newGroupName, setNewGroupName] = React.useState('')

  const matcher = searchMatcher(search)
  const groupMatcher = searchMatcher(groupSearch)
  const moveMatcher = searchMatcher(moveSearch)

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

  const found = scopeSource.filter(tab => matcher.test(`${label(tab.route)} ${tab.group ?? ''}`))

  const groupNames = Object.keys(controller.groups)
  const foundGroups = groupNames.filter(name => groupMatcher.test(name))

  // Preview first: the exact tabs a bulk close would take, computed from the
  // same predicate the action uses so the two cannot disagree.
  const bulkDoomed = React.useMemo(() => {
    if (bulkText.trim().length === 0) {
      return []
    }
    const needle = bulkText.toLowerCase()
    return controller.tabs.filter(tab => {
      const contains = label(tab.route).toLowerCase().includes(needle)
      const matches = bulkInvert ? !contains : contains
      return matches && !tab.pinned
    })
  }, [bulkText, bulkInvert, controller.tabs, label])

  const pinned = controller.tabs.filter(tab => tab.pinned)
  const ordinary = controller.tabs.filter(tab => !tab.pinned)

  const orderedTabs = [...pinned, ...ordinary]

  const moveTargets = groupNames.filter(name => moveMatcher.test(name))
  const movingTab = controller.tabs.find(tab => tab.id === movePickerFor) ?? null

  const closeMovePicker = React.useCallback(() => {
    setMovePickerFor(null)
    setMoveSearch(emptySearchState)
    setNewGroupName('')
  }, [])

  // Roving tabindex: only the active tab is a stop on the page's own Tab
  // order; arrow keys move focus (and, per the tablist pattern, selection)
  // among the tabs themselves.
  const onTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = orderedTabs.findIndex(t => t.id === controller.activeId)
    if (currentIndex === -1) return
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % orderedTabs.length
    else if (event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + orderedTabs.length) % orderedTabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = orderedTabs.length - 1
    if (nextIndex === null) return
    const next = orderedTabs[nextIndex]
    if (next === undefined) return
    event.preventDefault()
    controller.activate(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  const renderTab = (tab: AppTab): JSX.Element => (
    <div
      key={tab.id}
      className="tab"
      data-pinned={tab.pinned}
      data-active={tab.id === controller.activeId}
      onContextMenu={event => {
        event.preventDefault()
        setMovePickerFor(tab.id)
      }}
    >
      {tab.group !== null && (
        <span
          className="tab__group-dot"
          style={{ background: groupColor(tab.group) }}
          aria-hidden="true"
        />
      )}
      <button
        id={`tab-${tab.id}`}
        role="tab"
        aria-selected={tab.id === controller.activeId}
        aria-controls="route-surface"
        tabIndex={tab.id === controller.activeId ? 0 : -1}
        className="tab__label"
        title={tab.pinned ? `${label(tab.route)} (${t('pinned')})` : label(tab.route)}
        onClick={() => controller.activate(tab.id)}
      >
        <Icon name={routeIcon(tab.route)} size={16} />
        <span className="tab__label-text">{label(tab.route)}</span>
        {tab.pinned && <Icon name="keep" size={13} />}
      </button>
      <button
        className="tab__pin"
        aria-label={tab.pinned ? `${t('unpin')} ${label(tab.route)}` : `${t('pin')} ${label(tab.route)}`}
        onClick={() => controller.togglePin(tab.id)}
      >
        <Icon name={tab.pinned ? 'keep_off' : 'keep'} size={14} />
      </button>
      <button
        className="tab__close"
        aria-label={`${t('close')} ${label(tab.route)}`}
        title={`${t('close')} (${label(tab.route)})`}
        onClick={() => controller.close(tab.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )

  return (
    <div className="tab-strip-wrap">
      <div
        className="tab-strip"
        role="tablist"
        aria-label={t('tabStripLabel')}
        onKeyDown={onTablistKeyDown}
      >
        {pinned.length > 0 && <div className="tab-strip__pinned">{pinned.map(renderTab)}</div>}
        {ordinary.map(renderTab)}

        <div className="tab-strip__actions">
          <button
            className="tab-strip__action"
            title={t('searchTabsStrip')}
            aria-label={t('searchTabsStrip')}
            onClick={() => setSearchOpen(open => !open)}
            aria-expanded={searchOpen}
          >
            <Icon name="manage_search" size={18} />
          </button>
          <button
            className="tab-strip__action"
            title={t('searchTabGroups')}
            aria-label={t('searchTabGroups')}
            onClick={() => setGroupSearchOpen(open => !open)}
            aria-expanded={groupSearchOpen}
          >
            <Icon name="folder_open" size={18} />
          </button>
          <button
            className="tab-strip__action"
            title={t('bulkCloseTabs')}
            aria-label={t('bulkCloseTabs')}
            onClick={() => setBulkOpen(open => !open)}
            aria-expanded={bulkOpen}
          >
            <Icon name="playlist_remove" size={18} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="tab-panel">
          <div className="tab-panel__scopes" role="group" aria-label={t('searchScopeLabel')}>
            {(
              [
                ['strip', 'searchScopeStrip'],
                ['group', 'searchScopeGroup'],
                ['groups', 'searchScopeGroups'],
                ['all', 'searchScopeAll'],
              ] as const
            ).map(([id, key]) => (
              <button
                key={id}
                className="chip"
                aria-pressed={scope === id}
                onClick={() => setScope(id)}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <SearchField
            id="tab-search"
            label={t('searchTabsStrip')}
            placeholder={t('searchTabsPlaceholder')}
            state={search}
            sampleText={label(controller.tabs[0]?.route ?? 'discover')}
            resultSummary={t('searchResultSummary', {
              found: String(found.length),
              total: String(scopeSource.length),
            })}
            onChange={setSearch}
          />

          <div className="tab-panel__results">
            {found.length === 0 && <div className="state-note">{t('noTabMatched')}</div>}
            {found.map(tab => (
              <button
                key={tab.id}
                className="tab-panel__result"
                onClick={() => {
                  controller.activate(tab.id)
                  setSearchOpen(false)
                }}
              >
                {label(tab.route)}
                {tab.pinned && ` · ${t('pinned')}`}
                {tab.group !== null && ` · ${tab.group}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {groupSearchOpen && (
        <div className="tab-panel">
          <SearchField
            id="tab-group-search"
            label={t('searchTabGroups')}
            placeholder={t('searchGroupsPlaceholder')}
            state={groupSearch}
            sampleText={groupNames[0] ?? ''}
            resultSummary={t('searchResultSummary', {
              found: String(foundGroups.length),
              total: String(groupNames.length),
            })}
            onChange={setGroupSearch}
          />
          <div className="tab-panel__group-list">
            {foundGroups.length === 0 && <div className="state-note">{t('noGroupMatched')}</div>}
            {foundGroups.map(name => {
              const group = controller.groups[name]!
              const count = controller.tabs.filter(tab => tab.group === name).length
              return (
                <div key={name} className="tab-panel__group-row">
                  <span
                    className="tab__group-dot"
                    style={{ background: groupColor(name) }}
                    aria-hidden="true"
                  />
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ color: 'var(--onv)', fontSize: 11 }}>{count}</span>
                  <button
                    className="tab__pin"
                    aria-label={group.collapsed ? `${t('expand')} ${name}` : `${t('collapse')} ${name}`}
                    onClick={() => controller.setGroupCollapsed(name, !group.collapsed)}
                  >
                    <Icon name={group.collapsed ? 'expand_more' : 'expand_less'} size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="tab-panel">
          <label className="tab-panel__field">
            <span>{t('bulkCloseFieldLabel')}</span>
            <input
              type="text"
              value={bulkText}
              placeholder={t('bulkCloseFieldPlaceholder')}
              onChange={event => setBulkText(event.currentTarget.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={bulkInvert}
              onChange={event => setBulkInvert(event.currentTarget.checked)}
            />
            <span>{t('bulkCloseInvert')}</span>
          </label>

          <div className="tab-panel__preview">
            {bulkText.trim().length === 0 ? (
              // Never runs on an empty query: that would close everything.
              <span>{t('bulkCloseTypeFirst')}</span>
            ) : bulkDoomed.length === 0 ? (
              <span>{t('bulkCloseNothing')}</span>
            ) : (
              <span>
                {t('bulkCloseCount', { count: String(bulkDoomed.length) })}{' '}
                {bulkDoomed.map(tab => label(tab.route)).join(', ')}
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
            {t('close')} {bulkDoomed.length}
          </button>
        </div>
      )}

      {/* Right-click a tab → a single "Move… into group…" entry, opening this
          anchored picker with its own search rather than one menu item per
          group. */}
      {movingTab !== null && (
        <div className="tab-panel" role="dialog" aria-label={t('moveIntoGroupTitle')}>
          <div className="tab-panel__field">
            <span>{t('moveIntoGroupTitle', { tab: label(movingTab.route) })}</span>
          </div>

          <SearchField
            id="tab-move-search"
            label={t('searchTabGroups')}
            placeholder={t('searchGroupsPlaceholder')}
            state={moveSearch}
            sampleText={groupNames[0] ?? ''}
            onChange={setMoveSearch}
          />

          <div className="tab-panel__group-list">
            <button
              className="tab-panel__group-row"
              onClick={() => {
                controller.moveToGroup(movingTab.id, null)
                closeMovePicker()
              }}
            >
              <Icon name="remove_circle" size={16} />
              <span>{t('moveNoGroup')}</span>
            </button>
            {moveTargets.map(name => (
              <button
                key={name}
                className="tab-panel__group-row"
                onClick={() => {
                  controller.moveToGroup(movingTab.id, name)
                  closeMovePicker()
                }}
              >
                <span
                  className="tab__group-dot"
                  style={{ background: groupColor(name) }}
                  aria-hidden="true"
                />
                <span>{name}</span>
              </button>
            ))}
          </div>

          <label className="tab-panel__field">
            <span>{t('moveCreateGroup')}</span>
            <input
              type="text"
              value={newGroupName}
              placeholder={t('moveCreateGroupPlaceholder')}
              onChange={event => setNewGroupName(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--small"
            disabled={newGroupName.trim().length === 0}
            onClick={() => {
              controller.moveToGroup(movingTab.id, newGroupName.trim())
              closeMovePicker()
            }}
          >
            {t('moveCreateGroupAction')}
          </button>

          <button type="button" className="btn btn--small" onClick={closeMovePicker}>
            {t('cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
