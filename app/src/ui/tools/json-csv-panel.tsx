import * as React from 'react'
import { useI18n } from '../app-state'
import { ConverterErrorCode, JsonCsvPreview } from '../../shared/converter-contract'
import { TranslationKey } from '../../lib/i18n-resources'

const ERROR_KEYS: Record<ConverterErrorCode, TranslationKey> = {
  'invalid-json': 'converterErrorJson', shape: 'converterErrorShape', limit: 'converterErrorLimit',
  encoding: 'converterErrorEncoding', number: 'converterErrorNumber', 'file-type': 'converterErrorType',
  cleanup: 'converterErrorCleanup', read: 'converterErrorRead', write: 'converterErrorWrite', exists: 'converterErrorExists',
  expired: 'converterErrorExpired', busy: 'converterErrorBusy', unavailable: 'converterErrorUnavailable',
}

/** One pending conversion per window; remount/navigation invalidates its token. */
export function JsonCsvPanel(): JSX.Element {
  const { t, a } = useI18n()
  const [preview, setPreview] = React.useState<JsonCsvPreview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<TranslationKey>('converterReady')
  const [error, setError] = React.useState<ConverterErrorCode | null>(null)
  const [saved, setSaved] = React.useState<{ outputName: string; rows: number; bytes: number; cleanupWarning?: boolean } | null>(null)
  const pending = React.useRef(false)
  const mounted = React.useRef(true)
  const cancelled = React.useRef(false)
  const request = React.useRef(0)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current++
      void window.materialUniGetUi.converter.cancel().catch(() => undefined)
    }
  }, [])

  const run = async (kind: 'prepare' | 'save') => {
    if (pending.current || (kind === 'save' && !preview)) return
    pending.current = true
    cancelled.current = false
    const current = ++request.current
    setBusy(true)
    setError(null)
    setSaved(null)
    setMessage(kind === 'prepare' ? 'converterReading' : 'converterSaving')
    if (kind === 'prepare') setPreview(null)
    try {
      const result = kind === 'prepare'
        ? await window.materialUniGetUi.converter.prepareJsonCsv()
        : await window.materialUniGetUi.converter.saveJsonCsv(preview!.token)
      if (!mounted.current || current !== request.current) return
      if (cancelled.current && result.status !== 'saved' && !(result.status === 'error' && result.code === 'cleanup')) {
        setPreview(null)
        setMessage('converterCancelled')
        return
      }
      if (result.status === 'ready') {
        setPreview(result.preview)
        setMessage('converterPreviewReady')
      } else if (result.status === 'saved') {
        setPreview(null)
        setSaved(result)
        setMessage('converterSaved')
      } else if (result.status === 'error') {
        setError(result.code)
        if (result.code === 'expired') setPreview(null)
      } else {
        setMessage('converterCancelled')
        if (cancelled.current || kind === 'prepare') setPreview(null)
      }
    } catch {
      if (mounted.current && current === request.current) setError('unavailable')
    } finally {
      if (mounted.current && current === request.current) {
        pending.current = false
        setBusy(false)
      }
    }
  }

  const cancel = async () => {
    const current = request.current
    const wasPending = pending.current
    try {
      const stopped = await window.materialUniGetUi.converter.cancel()
      if (!mounted.current || current !== request.current || (!stopped && wasPending)) return
      cancelled.current = true
      setPreview(null)
      setError(null)
      setMessage('converterCancelled')
    } catch { if (mounted.current) setError('unavailable') }
  }

  return <section className="json-csv-panel" aria-labelledby="json-csv-heading" aria-describedby="json-csv-limits json-csv-loss">
    <h2 id="json-csv-heading">{t('converterJsonCsv')}</h2>
    <p id="json-csv-limits">{t('converterLimits')}</p>
    <p id="json-csv-loss">{t('converterLoss')}</p>
    <p>{t('converterPrivacy')}</p>
    <div className="json-csv-panel__actions">
      <button type="button" className="btn btn--filled" disabled={busy} onClick={() => void run('prepare')}>
        {t('converterChooseJson')}
      </button>
      {preview && <button type="button" className="btn btn--filled" disabled={busy} onClick={() => void run('save')}>
        {t('converterSaveCsv')}
      </button>}
      {(preview || busy) && <button type="button" className="btn" onClick={() => void cancel()}>{t('cancel')}</button>}
    </div>
    <p role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} aria-atomic="true">
      {error ? t(ERROR_KEYS[error]) : t(message)}
      {saved && ` ${t('converterSavedSummary', { name: saved.outputName, rows: String(saved.rows), bytes: String(saved.bytes) })}`}
    </p>
    {saved?.cleanupWarning && <p role="alert">{t('converterErrorCleanup')}</p>}
    {busy && <p>{t('converterNativeCancel')}</p>}
    {preview && <div>
      <p>{t('converterPreviewSummary', { name: preview.inputName, rows: String(preview.rows), columns: String(preview.columns), bytes: String(preview.bytes), escaped: String(preview.escapedCells) })}</p>
      <div className="json-csv-panel__table" role="region" tabIndex={0} aria-label={a('converterPreview')}>
        <table>
          <caption>{t('converterPreview')}</caption>
          <thead><tr>{preview.headers.map((header, i) => <th key={i} scope="col">{header}</th>)}</tr></thead>
          <tbody>{preview.sample.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p>{t('converterPreviewLimit')}</p>
    </div>}
  </section>
}
