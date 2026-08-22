import * as React from 'react'
import './settings.css'
import { useI18n } from './app-state'
import { useNotifications } from './notifications'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { Icon } from './md3/icon'

/**
 * The built-in authenticator.
 *
 * Holds arbitrary TOTP secrets — not only this application's own locks — and
 * reads live codes. Everything is local: no account, no sync, no network.
 * Two-factor pairing with a locally drawn QR code lives on the Settings →
 * Security tab; this page is the live-codes list plus the paste-a-secret path.
 */

interface AuthEntry {
  readonly id: string
  readonly issuer: string
  readonly account: string
  readonly algorithm: string
  readonly digits: number
  readonly period: number
  readonly uri: string
}

interface AuthCode {
  readonly id: string
  readonly code: string
  readonly next: string
  readonly secondsRemaining: number
}

const AVATAR_COLORS = ['#0B57D0', '#146C2E', '#7B1FA2', '#E37400', '#00796B', '#C2185B']

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

export function AuthenticatorRoute(): JSX.Element {
  const { t } = useI18n()
  const [entries, setEntries] = React.useState<readonly AuthEntry[]>([])
  const [codes, setCodes] = React.useState<readonly AuthCode[]>([])
  const [input, setInput] = React.useState('')
  const [issuer, setIssuer] = React.useState('')
  const [account, setAccount] = React.useState('')
  const [revealed, setRevealed] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const { notify } = useNotifications()

  const refresh = React.useCallback(() => {
    void window.materialUniGetUi.authenticator.list().then(setEntries)
  }, [])

  React.useEffect(refresh, [refresh])

  // Codes are recomputed once a second. The main process owns the secrets, so
  // nothing here ever holds one.
  React.useEffect(() => {
    let cancelled = false
    const tick = () => {
      void window.materialUniGetUi.authenticator.codes().then(next => {
        if (!cancelled) {
          setCodes(next)
        }
      })
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [entries])

  const matcher = searchMatcher(search)
  const shown = entries.filter(entry =>
    matcher.test(`${entry.issuer} ${entry.account}`)
  )

  return (
    <>
      <h1 className="route-surface__heading">{t('auth')}</h1>
      <p className="route-surface__sub">{t('authSub')}</p>

      <div className="note note--plain">
        <strong>{t('authLocalNoteTitle')}</strong> {t('authLocalNoteBody')}
      </div>

      <div className="card settings-card">
        <h2>{t('authAddHeading')}</h2>
        <p>{t('authAddBody')}</p>

        <label className="tab-panel__field">
          <span>{t('authInputLabel')}</span>
          <input
            type="text"
            spellCheck={false}
            value={input}
            onChange={event => setInput(event.currentTarget.value)}
          />
        </label>

        <div className="auth-add-fields">
          <input
            className="text-input"
            placeholder={t('authIssuerPh')}
            value={issuer}
            aria-label={t('twoFAIssuerLabel')}
            onChange={event => setIssuer(event.currentTarget.value)}
          />
          <input
            className="text-input"
            placeholder={t('authAccountPh')}
            value={account}
            aria-label={t('twoFAAccountLabel')}
            onChange={event => setAccount(event.currentTarget.value)}
          />
        </div>

        <div className="setting-row__control">
          <button
            className="btn btn--filled"
            disabled={input.trim().length === 0}
            onClick={() => {
              void window.materialUniGetUi.authenticator
                .add(input, issuer, account)
                .then(result => {
                  if (result.ok) {
                    setInput('')
                    setIssuer('')
                    setAccount('')
                    refresh()
                    notify('success', t('authAddedNotify'))
                  } else {
                    notify('warning', t('authNotAddedNotify'), result.reason)
                  }
                })
            }}
          >
            <Icon name="add" size={16} />
            {t('add')}
          </button>
          <button
            className="btn"
            onClick={() => {
              void window.materialUniGetUi.authenticator
                .generateSecret()
                .then(secret => setInput(secret))
            }}
          >
            <Icon name="autorenew" size={16} />
            {t('authGenerateBtn')}
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <SearchField
          id="auth-search"
          label={t('authSearchLabel')}
          placeholder={t('authSearchPh')}
          state={search}
          sampleText={entries[0]?.issuer ?? ''}
          resultSummary={`${shown.length} ${t('of')} ${entries.length}`}
          onChange={setSearch}
        />
      )}

      {entries.length === 0 ? (
        <div className="state-note">{t('authEmptyList')}</div>
      ) : shown.length === 0 ? (
        <div className="state-note">{t('authNoMatch')}</div>
      ) : (
        shown.map(entry => {
          const code = codes.find(candidate => candidate.id === entry.id)
          const issuerLetter = (entry.issuer.length > 0 ? entry.issuer : t('authUnnamed')).charAt(0).toUpperCase()
          return (
            <div className="auth-entry" key={entry.id}>
              <div className="auth-entry__avatar" style={{ background: avatarColor(entry.issuer + entry.account) }} aria-hidden="true">
                {issuerLetter}
              </div>
              <div className="auth-entry__text">
                <div className="auth-entry__issuer">
                  {entry.issuer.length > 0 ? entry.issuer : t('authUnnamed')}
                  {' · '}
                  {entry.account}
                </div>
                <div className="setting-row__provenance">
                  {entry.algorithm} · {entry.digits} digits · {entry.period}s
                </div>
              </div>

              {code === undefined || code.code.length === 0 ? (
                <span className="auth-entry__unavailable">
                  {/* Undecryptable rather than wrong: digits that cannot be
                      right are worse than none. */}
                  {t('authUnavailable')}
                </span>
              ) : (
                <>
                  <div className="auth-entry__code" aria-live="off">
                    {formatCode(code.code)}
                  </div>
                  <div className="auth-entry__ring" aria-hidden="true">
                    {code.secondsRemaining}
                  </div>
                </>
              )}

              <div className="auth-entry__actions">
                <button
                  className="btn btn--small"
                  disabled={code === undefined || code.code.length === 0}
                  aria-label={`${t('authCopyBtn')} · ${entry.issuer}`}
                  onClick={() => {
                    if (code !== undefined) {
                      void navigator.clipboard.writeText(code.code)
                      notify('info', t('authCopiedNotify'))
                    }
                  }}
                >
                  <Icon name="content_copy" size={16} />
                </button>
                <button
                  className="btn btn--small"
                  aria-expanded={revealed === entry.id}
                  aria-label={revealed === entry.id ? t('authHideUriBtn') : `${t('authShowUriBtn')} · ${entry.issuer}`}
                  onClick={() =>
                    setRevealed(current => (current === entry.id ? null : entry.id))
                  }
                >
                  {revealed === entry.id ? t('authHideUriBtn') : t('authShowUriBtn')}
                </button>
                <button
                  className="btn btn--small"
                  aria-label={`${t('authRemoveBtn')} · ${entry.issuer}`}
                  onClick={() => {
                    void window.materialUniGetUi.authenticator
                      .remove(entry.id)
                      .then(setEntries)
                  }}
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>

              {revealed === entry.id && (
                <div className="auth-entry__uri">
                  <p className="setting-row__provenance">{t('authUriWarning')}</p>
                  <code>{entry.uri}</code>
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )

  function formatCode(code: string): string {
    if (code.length === 6) {
      return `${code.slice(0, 3)} ${code.slice(3)}`
    }
    if (code.length === 8) {
      return `${code.slice(0, 4)} ${code.slice(4)}`
    }
    return code
  }
}
