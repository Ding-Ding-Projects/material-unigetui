import * as React from 'react'
import { SearchField, SearchState, emptySearchState, searchMatcher } from '../md3/search-field'
import { useI18n } from '../app-state'

/** Ported from the design's `rAutomation` section. No CLI or IPC-over-stdio
 * surface exists yet — `preload.ts` exposes only the renderer bridge, and
 * nothing in `main/` listens on a socket or spawns a daemon — so every verb
 * below is honestly marked as interface-only or not implemented. */

const VERBS: ReadonlyArray<{ readonly surface: string; readonly verb: string; readonly interfaceOnly: boolean }> = [
  { surface: 'Discover / search', verb: 'package search --query … --manager …', interfaceOnly: true },
  { surface: 'Updates', verb: 'package updates, package update-all', interfaceOnly: true },
  { surface: 'Installed', verb: 'package installed', interfaceOnly: true },
  { surface: 'Row actions', verb: 'package install/update/uninstall --id …', interfaceOnly: true },
  { surface: 'Operations dock', verb: 'operation list/get/output/cancel/forget', interfaceOnly: true },
  { surface: 'Managers', verb: 'manager enable/disable/set-executable', interfaceOnly: false },
  { surface: 'Bundles', verb: 'bundle export/import', interfaceOnly: true },
  { surface: 'Settings', verb: 'settings list/get/set/clear', interfaceOnly: true },
  { surface: 'Logs', verb: 'log app / log operations', interfaceOnly: true },
  { surface: 'Deep links', verb: 'unigetui://showPackage …', interfaceOnly: false },
]

export function AutomationRoute(): JSX.Element {
  const { t } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const matcher = searchMatcher(search)
  const shown = VERBS.filter(row => matcher.test(`${row.surface} ${row.verb}`))

  return (
    <>
      <h1 className="route-surface__heading">{t('automation')}</h1>
      <p className="route-surface__sub">{t('automationSub')}</p>

      <div className="note">
        <strong>{t('notImplementedTitle')}</strong> {t('automationNote')}
      </div>

      <SearchField
        id="automation-search"
        label={t('automationSearchLabel')}
        placeholder={t('automationSearchPh')}
        state={search}
        sampleText={VERBS[0]?.verb ?? ''}
        resultSummary={`${shown.length} ${t('of')} ${VERBS.length}`}
        onChange={setSearch}
      />

      <div className="card">
        <h2>{t('automationVerbsTitle')}</h2>
        <div className="scroll-x">
          <table className="plain-table">
            <thead>
              <tr>
                <th>{t('automationColSurface')}</th>
                <th>{t('automationColVerb')}</th>
                <th>{t('automationColState')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={3}>{t('emptyNoResults')}</td>
                </tr>
              ) : (
                shown.map(row => (
                  <tr key={row.verb}>
                    <td>{row.surface}</td>
                    <td>
                      <code>{row.verb}</code>
                    </td>
                    <td>
                      {row.interfaceOnly
                        ? t('automationStateInterfaceOnly')
                        : t('automationStateNotImplemented')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
