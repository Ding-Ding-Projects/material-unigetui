import * as React from 'react'
import { Icon } from '../md3/icon'
import { useNotifications } from '../notifications'
import { PackageRow } from '../package-routes'
import { useI18n } from '../app-state'

/** Package bundles is not one of this lane's assigned sections (it belongs to
 * the `bundles` primary route), but it was already defined in this exclusively
 * owned file, so it is kept working and lightly ported — MD3 icons and full
 * localization — rather than left as the one unported surface in the file. */

export function BundlesRoute(props: {
  readonly installed: readonly PackageRow[]
}): JSX.Element {
  const { t } = useI18n()
  const [imported, setImported] = React.useState<readonly PackageRow[] | null>(null)
  const [skipped, setSkipped] = React.useState(0)
  const [format, setFormat] = React.useState('json')
  const { notify } = useNotifications()

  const formats = [
    { id: 'json', label: 'JSON', lossless: true },
    { id: 'yaml', label: 'YAML', lossless: true },
    { id: 'csv', label: 'CSV', lossless: true },
    { id: 'tsv', label: 'TSV', lossless: true },
    { id: 'markdown', label: 'Markdown table', lossless: false },
    { id: 'txt', label: 'Plain text', lossless: false },
  ]

  const chosen = formats.find(candidate => candidate.id === format)

  return (
    <>
      <h1 className="route-surface__heading">{t('bundles')}</h1>
      <p className="route-surface__sub">{t('bundlesSub')}</p>

      <div className="card">
        <h2>{t('bundlesExportTitle')}</h2>
        <p>
          {props.installed.length === 0
            ? t('bundlesExportEmpty')
            : t('bundlesExportCount', { count: String(props.installed.length) })}
        </p>

        <div className="setting-row__control">
          <select
            className="btn"
            value={format}
            aria-label={t('bundlesFormatLabel')}
            onChange={event => setFormat(event.currentTarget.value)}
          >
            {formats.map(candidate => (
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
              void window.materialUniGetUi.bundles
                .export(
                  props.installed.map(row => ({
                    id: row.id,
                    name: row.name,
                    manager: row.manager,
                    version: row.version,
                    source: row.source,
                  })),
                  format
                )
                .then(result => {
                  if (result.ok) {
                    notify('success', t('exportBundle'), result.path)
                  } else {
                    notify('warning', t('bundlesNotExported'), result.reason)
                  }
                })
            }}
          >
            <Icon name="package_2" size={16} />
            {t('exportBundle')}
          </button>
        </div>

        {chosen !== undefined && !chosen.lossless && (
          // Said before the export runs, not after.
          <p className="setting-row__provenance">
            {t('bundlesLossyNote', { format: chosen.label })}
          </p>
        )}
      </div>

      <div className="card">
        <h2>{t('bundlesImportTitle')}</h2>
        <p>{t('bundlesImportBody')}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void window.materialUniGetUi.bundles.import().then(result => {
              if (!result.ok) {
                notify('warning', t('bundlesNotImported'), result.reason)
                return
              }
              setImported(
                (result.entries ?? []).map(entry => ({
                  key: `${entry.manager}:${entry.id}`,
                  id: entry.id,
                  name: entry.name,
                  manager: entry.manager,
                  version: entry.version ?? '',
                  source: entry.source,
                }))
              )
              setSkipped(result.skipped ?? 0)
              notify(
                'success',
                t('bundlesImportedTitle'),
                `${result.entries?.length ?? 0}${
                  (result.skipped ?? 0) > 0 ? `, ${result.skipped} skipped` : ''
                }`
              )
            })
          }}
        >
          {t('bundlesChooseFile')}
        </button>

        {imported !== null && (
          <>
            {skipped > 0 && (
              // Never silently dropped: a skipped entry is stated.
              <p className="setting-row__provenance">
                {t('bundlesSkippedNote', { count: String(skipped) })}
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
    </>
  )
}
