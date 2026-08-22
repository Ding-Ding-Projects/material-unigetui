import * as React from 'react'
import { Icon } from '../md3/icon'
import { SearchField, SearchState, emptySearchState, searchMatcher } from '../md3/search-field'
import { useNotifications } from '../notifications'
import { useI18n } from '../app-state'
import { TranslationKey } from '../../lib/i18n-resources'

/** Ported from the design's `rLogs` section: a search bar, level filters and a
 * mono-space scroll of everything the app has actually logged this session. */

interface LogEntryDto {
  readonly at: string
  readonly level: string
  readonly scope: string
  readonly message: string
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const
const LEVEL_KEYS: Record<(typeof LEVELS)[number], TranslationKey> = {
  debug: 'logLevelDebug',
  info: 'logLevelInfo',
  warn: 'logLevelWarn',
  error: 'logLevelError',
}

export function LogsRoute(): JSX.Element {
  const { t, a } = useI18n()
  const [entries, setEntries] = React.useState<readonly LogEntryDto[]>([])
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [levels, setLevels] = React.useState<ReadonlySet<string>>(new Set(LEVELS))
  const [path, setPath] = React.useState('')
  const { notify } = useNotifications()

  const refresh = React.useCallback(() => {
    void window.materialUniGetUi.logs.all().then(setEntries)
  }, [])

  React.useEffect(() => {
    refresh()
    void window.materialUniGetUi.logs.path().then(setPath)
  }, [refresh])

  const matcher = searchMatcher(search)
  const shown = entries.filter(
    entry =>
      levels.has(entry.level) &&
      matcher.test(`${entry.scope} ${entry.message} ${entry.level}`)
  )

  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.level, (counts.get(entry.level) ?? 0) + 1)
  }

  return (
    <>
      <h1 className="route-surface__heading">{t('logs')}</h1>
      <p className="route-surface__sub">{t('logsSub')}</p>

      <SearchField
        id="logs-search"
        label={t('logsSearchLabel')}
        placeholder={t('logsSearchPh')}
        state={search}
        sampleText={entries[0]?.message ?? ''}
        resultSummary={`${shown.length} ${t('of')} ${entries.length}`}
        onChange={setSearch}
      />

      <div className="filter-row" role="group" aria-label={t('logLevelGroup')}>
        {LEVELS.map(level => (
          <button
            key={level}
            type="button"
            className="chip"
            aria-pressed={levels.has(level)}
            onClick={() =>
              setLevels(current => {
                const next = new Set(current)
                if (next.has(level)) {
                  next.delete(level)
                } else {
                  next.add(level)
                }
                return next
              })
            }
          >
            {/* The count is shown, so an empty level is visibly empty rather
                than mysteriously absent. */}
            {t(LEVEL_KEYS[level])} ({counts.get(level) ?? 0})
          </button>
        ))}
        <button type="button" className="btn btn--small" onClick={refresh}>
          <Icon name="refresh" size={16} />
          {t('logsRefresh')}
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            void window.materialUniGetUi.logs.clear().then(() => {
              refresh()
              notify('info', t('logsClearedTitle'), t('logsClearedBody'))
            })
          }}
        >
          <Icon name="delete_sweep" size={16} />
          {t('logsClearMemory')}
        </button>
      </div>

      {path.length > 0 && (
        <p className="setting-row__provenance">{t('logsAlsoAppended', { path })}</p>
      )}

      {shown.length === 0 ? (
        <div className="state-note">
          {entries.length === 0 ? t('logsEmptySession') : t('logsEmptyFiltered')}
        </div>
      ) : (
        <div className="log-list">
          {shown.map((entry, index) => (
            <div className="log-line" data-level={entry.level} key={`${entry.at}-${index}`}>
              <span className="log-line__time">{entry.at.slice(11, 19)}</span>
              <span className="log-line__level">{a(LEVEL_KEYS[entry.level as (typeof LEVELS)[number]] ?? 'logLevelInfo')}</span>
              <span className="log-line__scope">{entry.scope}</span>
              <span className="log-line__message">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
