import * as React from 'react'
import { SearchField, SearchState, emptySearchState } from '../md3/search-field'
import { useI18n } from '../app-state'

/**
 * Ported from the design's `rOllama` section.
 *
 * `window.materialUniGetUi` has no `ollama` namespace: no runtime health
 * check, no model catalog, no pull, no chat, no harness profiles. The design
 * shows a live-looking model list with fit verdicts and snapshot/rollback
 * controls; none of that exists behind this build, so rather than fabricate
 * a fake catalog or wire buttons to nothing, this renders the chrome the
 * design specifies — header, search, connection status — honestly reporting
 * that the runtime has never been detected and the model list is empty.
 */
export function OllamaRoute(): JSX.Element {
  const { t } = useI18n()
  // The catalog is genuinely empty — there is nothing to filter — but the
  // search field still participates so the surface matches every other
  // list in the app rather than being the one exception.
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)

  return (
    <>
      <div className="tool-header">
        <h1 className="route-surface__heading tool-header__title">{t('ollama')}</h1>
        <SearchField
          id="ollama-search"
          label={t('ollamaSearchLabel')}
          placeholder={t('ollamaSearchPh')}
          state={search}
          resultSummary={`0 ${t('of')} 0`}
          onChange={setSearch}
        />
        <span className="status-line" data-online="false">
          <span className="status-line__dot" />
          {t('ollamaOffline')}
        </span>
      </div>
      <p className="route-surface__sub">{t('ollamaSub')}</p>

      <p className="setting-row__provenance">{t('ollamaPcFitNote')}</p>

      <div className="state-note">{t('ollamaEmptyModels')}</div>
    </>
  )
}
