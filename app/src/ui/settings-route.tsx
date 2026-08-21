import * as React from 'react'
import { useSettings, useI18n } from './app-state'
import { useNotifications } from './notifications'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { ManagerAvailability } from '../models/manager'

/**
 * Settings.
 *
 * Sub-tabbed, searchable, and every control explains itself: what it does, and
 * whether the current value was actually chosen or is still the shipped
 * default. "Default" and "somebody set this to the same thing" look identical
 * on screen otherwise, and only one of them is safe to change silently.
 */

export const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'interface', label: 'Interface' },
  { id: 'localization', label: 'Language' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'operations', label: 'Operations' },
  { id: 'managers', label: 'Managers' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'security', label: 'Security' },
  { id: 'backup', label: 'Backup' },
  { id: 'internet', label: 'Internet' },
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'experimental', label: 'Experimental' },
  { id: 'updates', label: 'Updates' },
] as const

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id']

interface SettingDescriptor {
  readonly key: string
  readonly tab: SettingsTabId
  readonly title: string
  /** What it actually does — never a restatement of the title. */
  readonly explanation: string
  readonly control:
    | { readonly kind: 'toggle' }
    | { readonly kind: 'choice'; readonly options: ReadonlyArray<{ value: string; label: string }> }
    | { readonly kind: 'range'; readonly min: number; readonly max: number }
    | { readonly kind: 'text'; readonly placeholder: string }
}

export const SETTING_DESCRIPTORS: readonly SettingDescriptor[] = [
  {
    key: 'languageMode',
    tab: 'localization',
    title: 'Language mode',
    explanation:
      'Chooses English, Hong Kong Cantonese, or both at once. Bilingual shows the two joined, and collapses to one where they are identical.',
    control: {
      kind: 'choice',
      options: [
        { value: 'en', label: 'English' },
        { value: 'yue', label: '粵語' },
        { value: 'bilingual', label: 'Bilingual' },
      ],
    },
  },
  {
    key: 'funnyLevelEnglish',
    tab: 'localization',
    title: 'Funny level — English',
    explanation:
      'How playful English copy reads, from 1 (fully professional) to 5. It changes the wording around the facts and never the facts: an error still names what failed and what to do.',
    control: { kind: 'range', min: 1, max: 5 },
  },
  {
    key: 'funnyLevelCantonese',
    tab: 'localization',
    title: 'Funny level — Cantonese',
    explanation:
      'The same, set independently for Cantonese. Changing one does not move the other.',
    control: { kind: 'range', min: 1, max: 5 },
  },
  {
    key: 'dialogEmoji',
    tab: 'interface',
    title: 'Show emoji in dialogs and messages',
    explanation:
      'Adds a decorative emoji to dialogs and message boxes. Buttons, field labels and accessible names never get one, so nothing an assistive technology reads aloud changes.',
    control: { kind: 'toggle' },
  },
  {
    key: 'schoolMode',
    tab: 'security',
    title: 'School mode',
    explanation:
      'Forces English, full seriousness, and hides the playful capabilities. Your stored choices are kept and return when it is switched off. It is a user-experience lock, not a security boundary.',
    control: { kind: 'toggle' },
  },
  {
    key: 'theme',
    tab: 'appearance',
    title: 'Theme',
    explanation: 'Light or dark. Both palettes come from the same token contract as the rest of the interface.',
    control: {
      kind: 'choice',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
  },
  {
    key: 'density',
    tab: 'appearance',
    title: 'Density',
    explanation: 'How much breathing room rows and controls are given.',
    control: {
      kind: 'choice',
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
      ],
    },
  },
  {
    key: 'notifyOnComplete',
    tab: 'notifications',
    title: 'Notify when an operation finishes',
    explanation:
      'Shows a corner notification when an install, update or removal ends. Failures and warnings stay until dismissed either way.',
    control: { kind: 'toggle' },
  },
  {
    key: 'parallelOperations',
    tab: 'operations',
    title: 'Operations at once',
    explanation:
      'How many package operations may run simultaneously. One is the default because package managers take machine-wide locks, and two concurrent installs fail in ways that look like corruption.',
    control: { kind: 'range', min: 1, max: 4 },
  },
  {
    key: 'adhdFocus',
    tab: 'accessibility',
    title: 'Focus mode',
    explanation:
      'Brings the current surface forward and pushes the rest back. Nothing is hidden that cannot be brought back in one action.',
    control: { kind: 'toggle' },
  },
  {
    key: 'adhdLowStimulation',
    tab: 'accessibility',
    title: 'Low stimulation',
    explanation:
      'Removes non-essential motion and quietens colour. This composes with the operating system’s own reduced-motion setting; it never overrides a request you already made there.',
    control: { kind: 'toggle' },
  },
  {
    key: 'adhdTimeAwareness',
    tab: 'accessibility',
    title: 'Time awareness',
    explanation:
      'Shows how long this session has been open and how long since anything changed. It states the number and says nothing about it.',
    control: { kind: 'toggle' },
  },
  {
    key: 'adhdOneThing',
    tab: 'accessibility',
    title: 'One thing at a time',
    explanation:
      'Keeps a single visible current action that you choose, and that survives switching between screens.',
    control: { kind: 'toggle' },
  },
  {
    key: 'adhdMomentum',
    tab: 'accessibility',
    title: 'Momentum',
    explanation:
      'A dismissible prompt when something has sat untouched for a while. Declining is respected for a stated period, not for thirty seconds.',
    control: { kind: 'toggle' },
  },
  {
    key: 'displayName',
    tab: 'general',
    title: 'Application display name',
    explanation:
      'What this application calls itself in its title bar and About screen. It changes the label only — the data folder, update feed and installer identity are unaffected, so renaming can never orphan your settings.',
    control: { kind: 'text', placeholder: 'Material UniGetUI' },
  },
  {
    key: 'narratorEnabled',
    tab: 'accessibility',
    title: 'Spoken narrator',
    explanation:
      'Speaks app events aloud. Off unless you turn it on, one utterance at a time, and it yields to an active screen reader rather than talking over it.',
    control: { kind: 'toggle' },
  },
]

export function SettingsRoute(props: {
  readonly tab: SettingsTabId
  readonly managers: readonly ManagerAvailability[]
  onTabChange(tab: SettingsTabId): void
}): JSX.Element {
  const { settings, set, reset, isDefault } = useSettings()
  const { notify } = useNotifications()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)

  const matcher = searchMatcher(search)
  const searching = search.query.length > 0 || search.regex.pattern.length > 0

  const visible = SETTING_DESCRIPTORS.filter(descriptor =>
    searching
      ? matcher.test(`${descriptor.title} ${descriptor.explanation} ${descriptor.key}`)
      : descriptor.tab === props.tab
  )

  return (
    <>
      <h1 className="route-surface__heading">Settings</h1>
      <p className="route-surface__sub">
        Every control explains what it does and whether its value was chosen or
        is still the shipped default.
      </p>

      <SearchField
        id="settings-search"
        label="Search settings"
        placeholder="Search every settings tab…"
        state={search}
        sampleText={SETTING_DESCRIPTORS[0]?.title ?? ''}
        resultSummary={
          searching ? `${visible.length} settings across all tabs` : undefined
        }
        onChange={setSearch}
      />

      {!searching && (
        <div className="subtabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              className="subtab"
              aria-selected={tab.id === props.tab}
              onClick={() => props.onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {searching && visible.length > 0 && (
        <div className="note">
          Showing matches from every tab. Each result names the tab it lives on.
        </div>
      )}

      {visible.length === 0 && (
        <div className="state-note">
          {searching
            ? 'No setting matched that search.'
            : 'This tab has no settings yet. Its row in the completeness inventory records what is still missing.'}
        </div>
      )}

      {visible.map(descriptor => (
        <SettingRow
          key={descriptor.key}
          descriptor={descriptor}
          value={settings[descriptor.key]}
          isDefault={isDefault(descriptor.key)}
          showTab={searching}
          onChange={value => void set(descriptor.key, value)}
        />
      ))}

      {props.tab === 'managers' && !searching && (
        <ManagerList managers={props.managers} />
      )}

      {props.tab === 'vocabulary' && !searching && <VocabularyControl />}

      {props.tab === 'general' && !searching && (
        <div className="card">
          <h2>Reset</h2>
          <p>
            Returns every setting to its shipped default. It does not touch your
            installed packages.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void reset()
              notify('info', 'Settings reset to defaults')
            }}
          >
            Reset all settings
          </button>
        </div>
      )}
    </>
  )
}

function SettingRow(props: {
  readonly descriptor: SettingDescriptor
  readonly value: unknown
  readonly isDefault: boolean
  readonly showTab: boolean
  onChange(value: unknown): void
}): JSX.Element {
  const [explained, setExplained] = React.useState(false)
  const { descriptor } = props
  const controlId = `setting-${descriptor.key}`

  return (
    <div className="setting-row" id={controlId}>
      <div className="setting-row__text">
        <label className="setting-row__title" htmlFor={`${controlId}-control`}>
          {descriptor.title}
        </label>
        <div className="setting-row__meta">
          {props.showTab && (
            <span className="setting-row__tab">
              {SETTINGS_TABS.find(tab => tab.id === descriptor.tab)?.label}
            </span>
          )}
          {/* Provenance, stated rather than implied. */}
          <span className="setting-row__provenance">
            {props.isDefault
              ? `Default (${formatValue(props.value)})`
              : `Set to ${formatValue(props.value)}`}
          </span>
          <button
            type="button"
            className="setting-row__info"
            aria-expanded={explained}
            aria-controls={`${controlId}-explanation`}
            onClick={() => setExplained(open => !open)}
          >
            {explained ? 'Hide details' : 'What does this do?'}
          </button>
        </div>
        {explained && (
          <p id={`${controlId}-explanation`} className="setting-row__explanation">
            {descriptor.explanation}
          </p>
        )}
      </div>

      <div className="setting-row__control">
        <SettingControl
          id={`${controlId}-control`}
          descriptor={descriptor}
          value={props.value}
          onChange={props.onChange}
        />
      </div>
    </div>
  )
}

function SettingControl(props: {
  readonly id: string
  readonly descriptor: SettingDescriptor
  readonly value: unknown
  onChange(value: unknown): void
}): JSX.Element {
  const { descriptor } = props

  switch (descriptor.control.kind) {
    case 'toggle':
      return (
        <label className="switch">
          <input
            id={props.id}
            type="checkbox"
            checked={props.value === true}
            onChange={event => props.onChange(event.currentTarget.checked)}
          />
          <span className="switch__track" aria-hidden="true" />
        </label>
      )
    case 'choice':
      return (
        <select
          id={props.id}
          className="btn"
          value={String(props.value ?? '')}
          onChange={event => props.onChange(event.currentTarget.value)}
        >
          {descriptor.control.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'range':
      return (
        <span className="range">
          <input
            id={props.id}
            type="range"
            min={descriptor.control.min}
            max={descriptor.control.max}
            value={Number(props.value ?? descriptor.control.min)}
            onChange={event => props.onChange(Number(event.currentTarget.value))}
          />
          <output>{String(props.value ?? '')}</output>
        </span>
      )
    case 'text':
      return (
        <input
          id={props.id}
          type="text"
          className="text-input"
          value={String(props.value ?? '')}
          placeholder={descriptor.control.placeholder}
          onChange={event => props.onChange(event.currentTarget.value)}
        />
      )
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off'
  }
  if (value === '' || value === undefined || value === null) {
    return 'unset'
  }
  return String(value)
}

function ManagerList(props: {
  readonly managers: readonly ManagerAvailability[]
}): JSX.Element {
  return (
    <div className="card">
      <h2>Package managers</h2>
      <p>
        Detected on this computer. A manager that is not installed says so
        rather than disappearing.
      </p>
      <div className="manager-list">
        {props.managers.map(manager => (
          <div className="manager-row" key={manager.id} data-available={manager.available}>
            <div className="manager-row__name">{manager.id}</div>
            <div className="manager-row__state">
              {manager.available
                ? `available${manager.version ? ` · ${manager.version}` : ''}`
                : (manager.unavailableReason ?? 'not available')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VocabularyControl(): JSX.Element {
  const [status, setStatus] = React.useState<string>('No file loaded.')
  const { notify } = useNotifications()

  return (
    <div className="card">
      <h2>Personal vocabulary</h2>
      <p>
        Load a private JSON file of word replacements. Nothing ships with this
        application: until you supply a valid file, every surface renders its
        original wording. The file is read locally, never uploaded, and never
        written to a log or an export.
      </p>
      <div className="setting-row__control">
        <button
          type="button"
          className="btn btn--filled"
          onClick={() => {
            void window.materialUniGetUi.vocabulary.load().then(result => {
              if (result.ok) {
                setStatus(`Loaded ${result.count} replacements.`)
                notify('success', 'Vocabulary loaded', `${result.count} replacements applied.`)
              } else {
                setStatus(result.reason ?? 'That file was not accepted.')
                notify('warning', 'Vocabulary not loaded', result.reason)
              }
            })
          }}
        >
          Choose a JSON file…
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void window.materialUniGetUi.vocabulary.clear().then(() => {
              setStatus('No file loaded.')
              notify('info', 'Vocabulary cleared')
            })
          }}
        >
          Clear
        </button>
      </div>
      <p className="setting-row__provenance" role="status">
        {status}
      </p>
    </div>
  )
}
