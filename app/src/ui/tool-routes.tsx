import * as React from 'react'
import { Operation } from '../models/operation'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { useNotifications } from './notifications'
import { PackageRow } from './package-routes'

/**
 * The tool routes that carry real content: operation history, logs, bundles,
 * Support Tickets, and the automation reference.
 *
 * Everything shown here is genuinely produced by the application. Where a
 * surface has nothing to show yet it says so; nothing is padded with sample
 * data pretending to be real.
 */

/* --------------------------------------------------------------- logs --- */

interface LogEntryDto {
  readonly at: string
  readonly level: string
  readonly scope: string
  readonly message: string
}

export function LogsRoute(): JSX.Element {
  const [entries, setEntries] = React.useState<readonly LogEntryDto[]>([])
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [levels, setLevels] = React.useState<ReadonlySet<string>>(
    new Set(['debug', 'info', 'warn', 'error'])
  )
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
      <h1 className="route-surface__heading">Logs</h1>
      <p className="route-surface__sub">
        What this application has actually done this session.
      </p>

      <SearchField
        id="logs-search"
        label="Search the log"
        placeholder="Search the log…"
        state={search}
        sampleText={entries[0]?.message ?? ''}
        resultSummary={`${shown.length} of ${entries.length}`}
        onChange={setSearch}
      />

      <div className="filter-row" role="group" aria-label="Filter by level">
        {['debug', 'info', 'warn', 'error'].map(level => (
          <button
            key={level}
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
            {level} ({counts.get(level) ?? 0})
          </button>
        ))}
        <button className="btn btn--small" onClick={refresh}>
          Refresh
        </button>
        <button
          className="btn btn--small"
          onClick={() => {
            void window.materialUniGetUi.logs.clear().then(() => {
              refresh()
              notify('info', 'Log cleared', 'The file on disk is untouched.')
            })
          }}
        >
          Clear the in-memory log
        </button>
      </div>

      {path.length > 0 && (
        <p className="setting-row__provenance">
          Also appended to <code>{path}</code>
        </p>
      )}

      {shown.length === 0 ? (
        <div className="state-note">
          {entries.length === 0
            ? 'Nothing has been logged yet this session.'
            : 'No log line matched that filter.'}
        </div>
      ) : (
        <div className="log-list">
          {shown.map((entry, index) => (
            <div className="log-line" data-level={entry.level} key={`${entry.at}-${index}`}>
              <span className="log-line__time">{entry.at.slice(11, 19)}</span>
              <span className="log-line__level">{entry.level}</span>
              <span className="log-line__scope">{entry.scope}</span>
              <span className="log-line__message">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ history --- */

export function HistoryRoute(props: {
  readonly operations: readonly Operation[]
}): JSX.Element {
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const matcher = searchMatcher(search)

  const finished = props.operations.filter(
    operation =>
      operation.status === 'succeeded' ||
      operation.status === 'failed' ||
      operation.status === 'cancelled'
  )
  const shown = finished.filter(operation =>
    matcher.test(`${operation.package.name} ${operation.package.id} ${operation.action} ${operation.status}`)
  )

  return (
    <>
      <h1 className="route-surface__heading">Operation history</h1>
      <p className="route-surface__sub">
        Everything that finished this session, however it finished.
      </p>

      <SearchField
        id="history-search"
        label="Search history"
        placeholder="Search finished operations…"
        state={search}
        sampleText={finished[0]?.package.name ?? ''}
        resultSummary={`${shown.length} of ${finished.length}`}
        onChange={setSearch}
      />

      {shown.length === 0 ? (
        <div className="state-note">
          {finished.length === 0
            ? 'Nothing has finished yet. History is kept for this session only.'
            : 'No operation matched that search.'}
        </div>
      ) : (
        shown.map(operation => (
          <div className="package-row" key={operation.id}>
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
          </div>
        ))
      )}
    </>
  )
}

/* ------------------------------------------------------------ bundles --- */

export function BundlesRoute(props: {
  readonly installed: readonly PackageRow[]
}): JSX.Element {
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
      <h1 className="route-surface__heading">Package bundles</h1>
      <p className="route-surface__sub">
        A plain, readable list of packages you can carry to another machine.
      </p>

      <div className="card">
        <h2>Export what is installed</h2>
        <p>
          {props.installed.length === 0
            ? 'Open Installed packages first so there is something to export.'
            : `${props.installed.length} packages are currently listed as installed.`}
        </p>

        <div className="setting-row__control">
          <select
            className="btn"
            value={format}
            aria-label="Export format"
            onChange={event => setFormat(event.currentTarget.value)}
          >
            {formats.map(candidate => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
          <button
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
                    notify('success', 'Bundle exported', result.path)
                  } else {
                    notify('warning', 'Not exported', result.reason)
                  }
                })
            }}
          >
            Export
          </button>
        </div>

        {chosen !== undefined && !chosen.lossless && (
          // Said before the export runs, not after.
          <p className="setting-row__provenance">
            {chosen.label} is for reading, not for re-importing: it keeps the
            names and versions but drops the source, so this application cannot
            read it back as a bundle.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Import a bundle</h2>
        <p>Reads a JSON bundle and lists what it contains. Nothing is installed automatically.</p>
        <button
          className="btn"
          onClick={() => {
            void window.materialUniGetUi.bundles.import().then(result => {
              if (!result.ok) {
                notify('warning', 'Not imported', result.reason)
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
                'Bundle read',
                `${result.entries?.length ?? 0} packages${
                  (result.skipped ?? 0) > 0 ? `, ${result.skipped} skipped` : ''
                }`
              )
            })
          }}
        >
          Choose a bundle file…
        </button>

        {imported !== null && (
          <>
            {skipped > 0 && (
              // Never silently dropped: a skipped entry is stated.
              <p className="setting-row__provenance">
                {skipped} entr{skipped === 1 ? 'y was' : 'ies were'} skipped —
                either malformed, or for a package manager this build does not
                drive.
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

/* ------------------------------------------------------------ tickets --- */

interface TicketDto {
  readonly id: string
  readonly number: string
  readonly category: string
  readonly severity: string
  readonly description: string
  readonly status: string
  readonly openedAt: string
  readonly replies: readonly string[]
}

export function TicketsRoute(): JSX.Element {
  const [tickets, setTickets] = React.useState<readonly TicketDto[]>([])
  const [category, setCategory] = React.useState('Locked out of a tab')
  const [severity, setSeverity] = React.useState('Normal')
  const [description, setDescription] = React.useState('')
  const [dataPath, setDataPath] = React.useState('')

  React.useEffect(() => {
    void window.materialUniGetUi.tickets.all().then(setTickets)
    void window.materialUniGetUi.shell.appDataPath().then(setDataPath)
  }, [])

  return (
    <>
      <h1 className="route-surface__heading">Support Tickets</h1>
      <p className="route-surface__sub">
        The recovery route if you ever lock yourself out of your own copy.
      </p>

      {/*
        The one plain line, deliberately outside the comedy and never styled by
        the funny level. Nobody should sit waiting for a reply that was never
        coming.
      */}
      <div className="note note--plain">
        <strong>Nothing here is sent anywhere.</strong> No ticket exists outside
        this computer, no network request is made, no data is collected, and
        nobody is reading it. This is a local recovery flow wearing a costume.
      </div>

      <div className="card">
        <h2>Open a ticket</h2>
        <label className="tab-panel__field">
          <span>Category</span>
          <select
            className="btn"
            value={category}
            onChange={event => setCategory(event.currentTarget.value)}
          >
            {[
              'Locked out of a tab',
              'Locked out of a setting',
              'Forgot a password',
              'Lost an authenticator',
              'Something else',
            ].map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="tab-panel__field">
          <span>Severity</span>
          <select
            className="btn"
            value={severity}
            onChange={event => setSeverity(event.currentTarget.value)}
          >
            {['Low', 'Normal', 'High', 'Critical', 'Catastrophic'].map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="tab-panel__field">
          <span>What happened?</span>
          <textarea
            className="text-input"
            rows={3}
            value={description}
            onChange={event => setDescription(event.currentTarget.value)}
          />
        </label>

        <button
          className="btn btn--filled"
          disabled={description.trim().length === 0}
          onClick={() => {
            void window.materialUniGetUi.tickets
              .create(category, severity, description)
              .then(next => {
                setTickets(next)
                setDescription('')
              })
          }}
        >
          Submit ticket
        </button>
      </div>

      <div className="card">
        <h2>The thing that actually works</h2>
        <p>
          Deleting the application-data folder clears every lock and every
          setting. That is the documented recovery route, and it is the only one.
        </p>
        <p>
          <code>{dataPath || 'resolving…'}</code>
        </p>
        <button
          className="btn"
          onClick={() => void window.materialUniGetUi.shell.openAppData()}
        >
          Open that folder
        </button>
        <p className="setting-row__provenance">
          This opens the folder and stops there. The deleting is yours to do, in
          your own file manager.
        </p>
      </div>

      {tickets.length > 0 && (
        <div className="card">
          <h2>Your tickets</h2>
          {tickets.map(ticket => (
            <div className="ticket" key={ticket.id}>
              <div className="ticket__head">
                <strong>{ticket.number}</strong>
                <span className="package-row__manager">{ticket.status}</span>
                <span className="setting-row__provenance">
                  {ticket.category} · {ticket.severity}
                </span>
              </div>
              <p className="ticket__body">{ticket.description}</p>
              {ticket.replies.map((reply, index) => (
                <p className="ticket__reply" key={index}>
                  {reply}
                </p>
              ))}
              {ticket.status !== 'resolved' && (
                <button
                  className="btn btn--small"
                  onClick={() => {
                    void window.materialUniGetUi.tickets
                      .advance(ticket.id)
                      .then(setTickets)
                  }}
                >
                  Ask for an update
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* --------------------------------------------------------- automation --- */

export function AutomationRoute(): JSX.Element {
  return (
    <>
      <h1 className="route-surface__heading">Automation · CLI &amp; IPC</h1>
      <p className="route-surface__sub">
        What this application can be driven with, and what it cannot yet.
      </p>

      <div className="note">
        <strong>No command-line interface is implemented yet.</strong> The verbs
        below are the design's intended surface, recorded here so the gap is
        visible rather than implied. Each has a row in the completeness
        inventory.
      </div>

      <div className="card">
        <h2>Intended verbs</h2>
        <div className="scroll-x">
          <table className="plain-table">
            <thead>
              <tr>
                <th>Surface</th>
                <th>Verb</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Discover / search', 'package search --query … --manager …', 'in the interface only'],
                ['Updates', 'package updates, package update-all', 'in the interface only'],
                ['Installed', 'package installed', 'in the interface only'],
                ['Row actions', 'package install/update/uninstall --id …', 'in the interface only'],
                ['Operations dock', 'operation list/get/output/cancel/forget', 'in the interface only'],
                ['Managers', 'manager enable/disable/set-executable', 'not implemented'],
                ['Bundles', 'bundle export/import', 'in the interface only'],
                ['Settings', 'settings list/get/set/clear', 'in the interface only'],
                ['Logs', 'log app / log operations', 'in the interface only'],
                ['Deep links', 'unigetui://showPackage …', 'not implemented'],
              ].map(([surface, verb, state]) => (
                <tr key={verb}>
                  <td>{surface}</td>
                  <td>
                    <code>{verb}</code>
                  </td>
                  <td>{state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
