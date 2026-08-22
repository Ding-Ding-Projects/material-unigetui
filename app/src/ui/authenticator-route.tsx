import * as React from 'react'
import { useNotifications } from './notifications'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'

/**
 * The built-in authenticator.
 *
 * Holds arbitrary TOTP secrets — not only this application's own locks — and
 * reads live codes. Everything is local: no account, no sync, no network.
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

export function AuthenticatorRoute(): JSX.Element {
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
      <h1 className="route-surface__heading">Authenticator</h1>
      <p className="route-surface__sub">
        Time-based codes for whatever accounts you like, held on this computer
        only.
      </p>

      <div className="note note--plain">
        <strong>Local only.</strong> No account, no sync, no network request.
        Secrets are encrypted with this computer&rsquo;s own key material, are
        never written in the clear, and are deliberately left out of ordinary
        exports. Deleting the application-data folder removes them.
      </div>

      <div className="card">
        <h2>Add an entry</h2>
        <p>
          Paste an <code>otpauth://</code> URI, or a plain base32 secret. A URI
          brings its own algorithm, digit count and period, and those are kept
          rather than replaced with defaults.
        </p>

        <label className="tab-panel__field">
          <span>otpauth:// URI or base32 secret</span>
          <input
            type="text"
            spellCheck={false}
            value={input}
            onChange={event => setInput(event.currentTarget.value)}
          />
        </label>

        <div className="setting-row__control">
          <input
            className="text-input"
            placeholder="Issuer (if not in the URI)"
            value={issuer}
            aria-label="Issuer"
            onChange={event => setIssuer(event.currentTarget.value)}
          />
          <input
            className="text-input"
            placeholder="Account (if not in the URI)"
            value={account}
            aria-label="Account"
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
                    notify('success', 'Entry added')
                  } else {
                    notify('warning', 'Not added', result.reason)
                  }
                })
            }}
          >
            Add
          </button>
          <button
            className="btn"
            onClick={() => {
              void window.materialUniGetUi.authenticator
                .generateSecret()
                .then(secret => setInput(secret))
            }}
          >
            Generate a new secret
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <SearchField
          id="auth-search"
          label="Search entries"
          placeholder="Search entries…"
          state={search}
          sampleText={entries[0]?.issuer ?? ''}
          resultSummary={`${shown.length} of ${entries.length}`}
          onChange={setSearch}
        />
      )}

      {entries.length === 0 ? (
        <div className="state-note">
          No entries yet. Nothing ships with this application.
        </div>
      ) : shown.length === 0 ? (
        <div className="state-note">No entry matched that search.</div>
      ) : (
        shown.map(entry => {
          const code = codes.find(candidate => candidate.id === entry.id)
          return (
            <div className="auth-entry" key={entry.id}>
              <div className="auth-entry__text">
                <div className="auth-entry__issuer">
                  {entry.issuer.length > 0 ? entry.issuer : 'Unnamed'}
                </div>
                <div className="auth-entry__account">{entry.account}</div>
                <div className="setting-row__provenance">
                  {entry.algorithm} · {entry.digits} digits · {entry.period}s
                </div>
              </div>

              <div className="auth-entry__codes">
                {code === undefined || code.code.length === 0 ? (
                  <span className="auth-entry__unavailable">
                    {/* Undecryptable rather than wrong: digits that cannot be
                        right are worse than none. */}
                    unavailable on this computer
                  </span>
                ) : (
                  <>
                    <div className="auth-entry__code" aria-live="off">
                      {formatCode(code.code)}
                    </div>
                    <div className="auth-entry__meta">
                      {/* A number of seconds, never colour or motion alone. */}
                      {code.secondsRemaining}s · next {formatCode(code.next)}
                    </div>
                  </>
                )}
              </div>

              <div className="auth-entry__actions">
                <button
                  className="btn btn--small"
                  disabled={code === undefined || code.code.length === 0}
                  onClick={() => {
                    if (code !== undefined) {
                      void navigator.clipboard.writeText(code.code)
                      notify('info', 'Code copied')
                    }
                  }}
                >
                  Copy
                </button>
                <button
                  className="btn btn--small"
                  aria-expanded={revealed === entry.id}
                  onClick={() =>
                    setRevealed(current => (current === entry.id ? null : entry.id))
                  }
                >
                  {revealed === entry.id ? 'Hide' : 'Show URI'}
                </button>
                <button
                  className="btn btn--small"
                  onClick={() => {
                    void window.materialUniGetUi.authenticator
                      .remove(entry.id)
                      .then(setEntries)
                  }}
                >
                  Remove
                </button>
              </div>

              {revealed === entry.id && (
                <div className="auth-entry__uri">
                  <p className="setting-row__provenance">
                    This carries the secret. Anyone who reads it can generate
                    your codes.
                  </p>
                  <code>{entry.uri}</code>
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}

/** Grouped in threes, which is how people read a code aloud. */
function formatCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }
  if (code.length === 8) {
    return `${code.slice(0, 4)} ${code.slice(4)}`
  }
  return code
}
