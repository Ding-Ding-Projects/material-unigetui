import * as React from 'react'
import { Operation, OperationAction } from '../../models/operation'
import { Icon } from '../md3/icon'
import { SearchField, SearchState, emptySearchState, searchMatcher } from '../md3/search-field'
import { useI18n } from '../app-state'

/** Ported from the design's `rHistory` section. Re-running an already-finished
 * operation re-enqueues the same install/update/uninstall through the same
 * bridge the row action buttons use elsewhere — there is no separate "history
 * re-run" channel, so this reuses the one that exists. */

const ACTION_ICON: Record<OperationAction, string> = {
  install: 'download',
  update: 'upgrade',
  uninstall: 'delete',
}

export function HistoryRoute(props: {
  readonly operations: readonly Operation[]
}): JSX.Element {
  const { t, a } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const matcher = searchMatcher(search)

  const finished = props.operations.filter(
    operation =>
      operation.status === 'succeeded' ||
      operation.status === 'failed' ||
      operation.status === 'cancelled'
  )
  const shown = finished.filter(operation =>
    matcher.test(
      `${operation.package.name} ${operation.package.id} ${operation.action} ${operation.status}`
    )
  )

  const rerun = (operation: Operation): void => {
    void window.materialUniGetUi.operations.enqueue(
      operation.action,
      operation.package,
      operation.options
    )
  }

  return (
    <>
      <h1 className="route-surface__heading">{t('history')}</h1>
      <p className="route-surface__sub">{t('historySub')}</p>

      <SearchField
        id="history-search"
        label={t('historySearchLabel')}
        placeholder={t('historySearchPh')}
        state={search}
        sampleText={finished[0]?.package.name ?? ''}
        resultSummary={`${shown.length} ${t('of')} ${finished.length}`}
        onChange={setSearch}
      />

      {shown.length === 0 ? (
        <div className="state-note">
          {finished.length === 0 ? t('historyEmptyNone') : t('historyEmptyFiltered')}
        </div>
      ) : (
        shown.map(operation => (
          <div className="package-row" key={operation.id}>
            <Icon name={ACTION_ICON[operation.action]} />
            <div className="package-row__grow">
              <div className="package-row__name">{operation.package.name}</div>
              <div className="package-row__id">
                {operation.action} · {operation.package.manager}
                {operation.failureReason !== undefined && ` · ${operation.failureReason}`}
              </div>
            </div>
            <div className="package-row__version" data-status={operation.status}>
              {operation.status}
            </div>
            <button
              type="button"
              className="btn btn--small"
              aria-label={`${a('historyRerun')} — ${operation.package.name}`}
              onClick={() => rerun(operation)}
            >
              {t('historyRerun')}
            </button>
          </div>
        ))
      )}
    </>
  )
}
