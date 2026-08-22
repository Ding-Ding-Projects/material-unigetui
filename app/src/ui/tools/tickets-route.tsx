import * as React from 'react'
import { Icon } from '../md3/icon'
import { SearchField, SearchState, emptySearchState, searchMatcher } from '../md3/search-field'
import { useI18n } from '../app-state'
import { TranslationKey } from '../../lib/i18n-resources'

/** Ported from the design's `rTickets` section: the Support Tickets comedy
 * desk from the shared instructions' unlock-ladder recovery route. Every
 * "resolution" ends the same way — pointing at the app-data folder and
 * saying the user has to delete it themselves. */

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

const CATEGORY_KEYS: readonly TranslationKey[] = [
  'ticketsCatTab',
  'ticketsCatSetting',
  'ticketsCatPassword',
  'ticketsCatAuthenticator',
  'ticketsCatOther',
]
const SEVERITY_KEYS: readonly TranslationKey[] = [
  'severityLow',
  'severityNormal',
  'severityHigh',
  'severityCritical',
  'severityCatastrophic',
]

export function TicketsRoute(): JSX.Element {
  const { t } = useI18n()
  const [tickets, setTickets] = React.useState<readonly TicketDto[]>([])
  const [category, setCategory] = React.useState<TranslationKey>('ticketsCatTab')
  const [severity, setSeverity] = React.useState<TranslationKey>('severityNormal')
  const [description, setDescription] = React.useState('')
  const [dataPath, setDataPath] = React.useState('')
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)

  React.useEffect(() => {
    void window.materialUniGetUi.tickets.all().then(setTickets)
    void window.materialUniGetUi.shell.appDataPath().then(setDataPath)
  }, [])

  const matcher = searchMatcher(search)
  const shown = tickets.filter(ticket =>
    matcher.test(`${ticket.number} ${ticket.category} ${ticket.description} ${ticket.status}`)
  )

  return (
    <>
      <h1 className="route-surface__heading">{t('tickets')}</h1>
      <p className="route-surface__sub">{t('ticketsSub')}</p>

      {/*
        The one plain line, deliberately outside the comedy and never styled
        by the funny level. Nobody should sit waiting for a reply that was
        never coming.
      */}
      <div className="note note--plain">
        <strong>{t('ticketsPrivacyNote')}</strong>
      </div>

      <div className="card">
        <h2>{t('ticketsNewTitle')}</h2>
        <label className="tab-panel__field">
          <span>{t('ticketsCategoryLabel')}</span>
          <select
            className="btn"
            value={category}
            onChange={event => setCategory(event.currentTarget.value as TranslationKey)}
          >
            {CATEGORY_KEYS.map(key => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>

        <label className="tab-panel__field">
          <span>{t('ticketsSeverityLabel')}</span>
          <select
            className="btn"
            value={severity}
            onChange={event => setSeverity(event.currentTarget.value as TranslationKey)}
          >
            {SEVERITY_KEYS.map(key => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>

        <label className="tab-panel__field">
          <span>{t('ticketsDescLabel')}</span>
          <textarea
            className="text-input"
            rows={3}
            value={description}
            onChange={event => setDescription(event.currentTarget.value)}
          />
        </label>

        <button
          type="button"
          className="btn btn--filled"
          disabled={description.trim().length === 0}
          onClick={() => {
            void window.materialUniGetUi.tickets
              .create(t(category), t(severity), description)
              .then(next => {
                setTickets(next)
                setDescription('')
              })
          }}
        >
          {t('ticketsSubmit')}
        </button>
      </div>

      <div className="card">
        <h2>{t('ticketsWorkingTitle')}</h2>
        <p>{t('ticketsWorkingBody')}</p>
        <p>
          <code>{dataPath || '…'}</code>
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void window.materialUniGetUi.shell.openAppData()}
        >
          <Icon name="folder_open" size={16} />
          {t('ticketsOpenFolder')}
        </button>
        <p className="setting-row__provenance">{t('ticketsOpenFolderNote')}</p>
      </div>

      {tickets.length > 0 && (
        <div className="card">
          <h2>{t('ticketsYourTickets')}</h2>

          <SearchField
            id="tickets-search"
            label={t('ticketsSearchLabel')}
            placeholder={t('ticketsSearchPh')}
            state={search}
            sampleText={tickets[0]?.description ?? ''}
            resultSummary={`${shown.length} ${t('of')} ${tickets.length}`}
            onChange={setSearch}
          />

          {shown.map(ticket => (
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
                  type="button"
                  className="btn btn--small"
                  onClick={() => {
                    void window.materialUniGetUi.tickets.advance(ticket.id).then(setTickets)
                  }}
                >
                  {t('ticketsAskUpdate')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
