import * as React from 'react'
import './settings.css'
import { useSettings, useI18n } from './app-state'
import { useNotifications } from './notifications'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'
import { Icon } from './md3/icon'
import { ManagerAvailability } from '../models/manager'
import { QrCodeView } from './settings/qr-code-view'
import { TranslationKey } from '../lib/i18n-resources'

/**
 * Settings.
 *
 * Sub-tabbed, searchable, and every control explains itself: what it does, and
 * whether the current value was actually chosen or is still the shipped
 * default. "Default" and "somebody set this to the same thing" look identical
 * on screen otherwise, and only one of them is safe to change silently.
 *
 * `SETTINGS_TABS`, `SETTING_DESCRIPTORS`, `SettingsTabId` and the
 * `SettingsRoute` props are read directly by app.tsx's command palette, so
 * their shape stays exactly as it was — additive changes only.
 */

export const SETTINGS_TABS = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'interface', label: 'Interface', icon: 'dashboard' },
  { id: 'localization', label: 'Language', icon: 'translate' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'operations', label: 'Operations', icon: 'sync' },
  { id: 'managers', label: 'Managers', icon: 'inventory_2' },
  { id: 'accessibility', label: 'Accessibility', icon: 'accessibility_new' },
  { id: 'vocabulary', label: 'Vocabulary', icon: 'dictionary' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'backup', label: 'Backup', icon: 'settings_backup_restore' },
  { id: 'internet', label: 'Internet', icon: 'public' },
  { id: 'scheduler', label: 'Scheduler', icon: 'schedule' },
  { id: 'experimental', label: 'Experimental', icon: 'science' },
  { id: 'updates', label: 'Updates', icon: 'system_update' },
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

/**
 * `SETTING_DESCRIPTORS.title`/`.explanation` are static English, by
 * necessity: app.tsx's command palette (outside this lane, not touched here)
 * reads them directly as plain strings rather than through the translator.
 * Everything else this file renders — tab labels, headings, the appearance,
 * localization, security and vocabulary cards, the authenticator page — is
 * fully localized via `t()`/`a()`.
 */

export function SettingsRoute(props: {
  readonly tab: SettingsTabId
  readonly managers: readonly ManagerAvailability[]
  onTabChange(tab: SettingsTabId): void
}): JSX.Element {
  const { settings, set, reset, isDefault } = useSettings()
  const { notify } = useNotifications()
  const { t } = useI18n()
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)

  const matcher = searchMatcher(search)
  const searching = search.query.length > 0 || search.regex.pattern.length > 0

  const visible = SETTING_DESCRIPTORS.filter(descriptor =>
    searching
      ? matcher.test(`${descriptor.title} ${descriptor.explanation} ${descriptor.key}`)
      : descriptor.tab === props.tab
  )

  const activeTab = SETTINGS_TABS.find(tab => tab.id === props.tab)

  return (
    <div className="settings-view">
      <div className="settings-rail" role="tablist" aria-label={t('sectionsNav')}>
        {SETTINGS_TABS.map(tab => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            role="tab"
            className="settings-rail__item"
            aria-selected={tab.id === props.tab}
            onClick={() => props.onTabChange(tab.id)}
          >
            <Icon name={tab.icon} size={19} />
            {tabLabel(t, tab.id, tab.label)}
          </button>
        ))}
      </div>

      <div
        className="settings-content"
        role="tabpanel"
        aria-labelledby={`settings-tab-${props.tab}`}
      >
        <div className="settings-content__head">
          <h1 className="route-surface__heading">
            {activeTab ? tabLabel(t, activeTab.id, activeTab.label) : t('settings')}
          </h1>
          <SearchField
            id="settings-search"
            label={t('settingsSearchLabel')}
            placeholder={t('settingsSearchPh')}
            state={search}
            sampleText={SETTING_DESCRIPTORS[0]?.title ?? ''}
            resultSummary={
              searching
                ? t('settingsResultsAllTabs', { count: String(visible.length) })
                : undefined
            }
            onChange={setSearch}
          />
        </div>
        <p className="route-surface__sub">{t('settingsSub')}</p>

        {searching && visible.length > 0 && (
          <div className="note">{t('settingsShowingAllTabs')}</div>
        )}

        {visible.length === 0 && (
          <div className="state-note">
            {searching ? t('settingsNoMatch') : t('settingsTabEmpty')}
          </div>
        )}

        {visible
          // The Localization tab renders language mode and the two funny
          // sliders as their own richer widgets below; skip the generic row
          // for those three keys so they are not shown twice.
          .filter(descriptor => searching || !isRichlyRendered(descriptor.key))
          .map(descriptor => (
            <SettingRow
              key={descriptor.key}
              descriptor={descriptor}
              value={settings[descriptor.key]}
              isDefault={isDefault(descriptor.key)}
              showTab={searching}
              onChange={value => void set(descriptor.key, value)}
            />
          ))}

        {props.tab === 'localization' && !searching && (
          <LocalizationExtras />
        )}

        {props.tab === 'appearance' && !searching && <AppearanceExtras />}

        {props.tab === 'security' && !searching && <SecurityExtras />}

        {props.tab === 'managers' && !searching && (
          <ManagerList managers={props.managers} />
        )}

        {props.tab === 'vocabulary' && !searching && <VocabularyControl />}

        {props.tab === 'general' && !searching && (
          <div className="card settings-card">
            <h2>{t('settingsResetHeading')}</h2>
            <p>{t('settingsResetBody')}</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void reset()
                notify('info', t('settingsResetDone'))
              }}
            >
              {t('settingsResetButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  function tabLabel(
    translate: (key: TranslationKey) => string,
    id: SettingsTabId,
    fallback: string
  ): string {
    const key = TAB_I18N_KEYS[id]
    return key ? translate(key) : fallback
  }
}

const TAB_I18N_KEYS: Partial<Record<SettingsTabId, TranslationKey>> = {
  general: 'general',
  interface: 'tabInterface',
  localization: 'localization',
  appearance: 'appearance',
  notifications: 'tabNotifications',
  operations: 'tabOperations',
  managers: 'managers',
  accessibility: 'tabAccessibility',
  vocabulary: 'vocabulary',
  security: 'security',
  backup: 'tabBackup',
  internet: 'tabInternet',
  scheduler: 'tabScheduler',
  experimental: 'tabExperimental',
  updates: 'updatesTab',
}

function isRichlyRendered(key: string): boolean {
  return key === 'languageMode' || key === 'funnyLevelEnglish' || key === 'funnyLevelCantonese'
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
  const { t } = useI18n()
  const controlId = `setting-${descriptor.key}`
  const title = descriptor.title
  const explanation = descriptor.explanation

  return (
    <div className="setting-row" id={controlId}>
      <div className="setting-row__text">
        <label className="setting-row__title" htmlFor={`${controlId}-control`}>
          {title}
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
              ? t('settingsDefaultVal', { value: formatValue(props.value) })
              : t('settingsSetVal', { value: formatValue(props.value) })}
          </span>
          <button
            type="button"
            className="setting-row__info"
            aria-expanded={explained}
            aria-controls={`${controlId}-explanation`}
            onClick={() => setExplained(open => !open)}
          >
            {explained ? t('settingsHideDetails') : t('settingsWhatDoes')}
          </button>
        </div>
        {explained && (
          <p id={`${controlId}-explanation`} className="setting-row__explanation">
            {explanation}
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

/**
 * Language-mode radios and the two independent funny-level sliders, styled
 * per the design's dedicated widgets rather than the generic setting row.
 */
function LocalizationExtras(): JSX.Element {
  const { settings, set, isDefault } = useSettings()
  const { t, a } = useI18n()

  const languageMode = String(settings['languageMode'] ?? 'en')
  const languageOptions: ReadonlyArray<{
    readonly value: string
    readonly icon: string
    readonly labelKey: TranslationKey
    readonly subKey: TranslationKey
  }> = [
    { value: 'en', icon: 'language', labelKey: 'languageEnLabel', subKey: 'languageEnSub' },
    { value: 'yue', icon: 'translate', labelKey: 'languageYueLabel', subKey: 'languageYueSub' },
    {
      value: 'bilingual',
      icon: '123',
      labelKey: 'languageBilingualLabel',
      subKey: 'languageBilingualSub',
    },
  ]

  return (
    <>
      <div>
        <p className="route-surface__sub" style={{ margin: '18px 0 0' }}>
          {t('localizationLanguageBody')}
        </p>
        {languageOptions.map(option => (
          <button
            key={option.value}
            type="button"
            className="language-radio"
            aria-pressed={languageMode === option.value}
            onClick={() => void set('languageMode', option.value)}
          >
            <Icon
              name={option.icon}
              size={22}
              filled={languageMode === option.value}
              style={{ color: languageMode === option.value ? 'var(--p)' : 'var(--onv)' }}
            />
            <span className="language-radio__text">
              <span className="language-radio__label">{t(option.labelKey)}</span>
              <br />
              <span className="language-radio__sub">{t(option.subKey)}</span>
            </span>
          </button>
        ))}
      </div>

      <FunnySliderCard
        settingKey="funnyLevelEnglish"
        headingKey="funnyHeadingEnglish"
        value={Number(settings['funnyLevelEnglish'] ?? 5)}
        isDefault={isDefault('funnyLevelEnglish')}
        onChange={value => void set('funnyLevelEnglish', value)}
        translate={t}
        accessible={a}
      />
      <FunnySliderCard
        settingKey="funnyLevelCantonese"
        headingKey="funnyHeadingCantonese"
        value={Number(settings['funnyLevelCantonese'] ?? 5)}
        isDefault={isDefault('funnyLevelCantonese')}
        onChange={value => void set('funnyLevelCantonese', value)}
        translate={t}
        accessible={a}
      />
    </>
  )
}

const FUNNY_NOTE_KEYS: Record<number, TranslationKey> = {
  1: 'funnyNote1',
  2: 'funnyNote2',
  3: 'funnyNote3',
  4: 'funnyNote4',
  5: 'funnyNote5',
}

function FunnySliderCard(props: {
  readonly settingKey: string
  readonly headingKey: TranslationKey
  readonly value: number
  readonly isDefault: boolean
  onChange(value: number): void
  translate(key: TranslationKey, variables?: Record<string, string>): string
  accessible(key: TranslationKey, variables?: Record<string, string>): string
}): JSX.Element {
  const controlId = `setting-${props.settingKey}-slider`
  const noteKey = FUNNY_NOTE_KEYS[Math.min(5, Math.max(1, Math.round(props.value)))] ?? 'funnyNote5'

  return (
    <div className="settings-card funny-card">
      <div className="funny-card__head">
        <Icon name="sentiment_very_satisfied" size={22} style={{ color: 'var(--p)' }} />
        <strong>
          {props.translate(props.headingKey)} · {props.value}
        </strong>
        <span className="funny-card__note">{props.translate(noteKey)}</span>
      </div>
      <label className="visually-hidden" htmlFor={controlId}>
        {props.accessible(props.headingKey)}
      </label>
      <input
        id={controlId}
        type="range"
        min={1}
        max={5}
        value={props.value}
        onChange={event => props.onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}

/** App-logo presets, upload and fit — Appearance tab. */
function AppearanceExtras(): JSX.Element {
  const { settings, set } = useSettings()
  const { t, a } = useI18n()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const presets: ReadonlyArray<{ readonly id: string; readonly icon: string; readonly color: string }> = [
    { id: 'deployed_code', icon: 'deployed_code', color: '#0B57D0' },
    { id: 'inventory_2', icon: 'inventory_2', color: '#146C2E' },
    { id: 'terminal', icon: 'terminal', color: '#7B1FA2' },
    { id: 'bolt', icon: 'bolt', color: '#E37400' },
    { id: 'hub', icon: 'hub', color: '#00796B' },
    { id: 'widgets', icon: 'widgets', color: '#C2185B' },
  ]

  const chosenPreset = String(settings['logoPreset'] ?? 'deployed_code')
  const chosenFit = String(settings['logoFit'] ?? 'contain')
  const customLogo = typeof settings['logoCustomData'] === 'string' ? (settings['logoCustomData'] as string) : ''

  const fitOptions: ReadonlyArray<{ value: string; key: TranslationKey }> = [
    { value: 'contain', key: 'appearanceLogoFitContain' },
    { value: 'cover', key: 'appearanceLogoFitCover' },
    { value: 'fill', key: 'appearanceLogoFitFill' },
  ]

  return (
    <div className="settings-card">
      <div className="settings-card__head">
        <Icon name="palette" size={22} style={{ color: 'var(--p)' }} />
        <h2>{t('logoTitle')}</h2>
      </div>
      <p className="settings-card__body">{t('appearanceLogoBody')}</p>
      <div className="logo-presets">
        {presets.map(preset => (
          <button
            key={preset.id}
            type="button"
            className="logo-preset"
            title={preset.id}
            aria-label={preset.id}
            aria-pressed={customLogo.length === 0 && chosenPreset === preset.id}
            style={{ background: preset.color }}
            onClick={() => {
              void set('logoPreset', preset.id)
              void set('logoCustomData', '')
            }}
          >
            <Icon name={preset.icon} size={28} filled style={{ color: '#fff' }} />
          </button>
        ))}
        <button
          type="button"
          className="logo-preset logo-preset--upload"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('appearanceLogoUploadHint')}
          title={t('upload')}
        >
          <Icon name="upload" size={26} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="visually-hidden"
          aria-label={t('appearanceLogoUploadHint')}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            if (!file) {
              return
            }
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                void set('logoCustomData', reader.result)
              }
            }
            reader.readAsDataURL(file)
            event.currentTarget.value = ''
          }}
        />
      </div>
      <div className="logo-fit-row">
        {fitOptions.map(option => (
          <button
            key={option.value}
            type="button"
            className="btn btn--small"
            aria-pressed={chosenFit === option.value}
            onClick={() => void set('logoFit', option.value)}
          >
            {t(option.key)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            void set('logoPreset', 'deployed_code')
            void set('logoFit', 'contain')
            void set('logoCustomData', '')
          }}
        >
          {t('reset')}
        </button>
      </div>
    </div>
  )
}

/** Toy-lock registry + two-factor pairing card — Security tab. */
function SecurityExtras(): JSX.Element {
  return (
    <>
      <LockRegistry />
      <TwoFactorPairingCard />
    </>
  )
}

interface LockRow {
  readonly id: string
  readonly target: string
  readonly label: string
  readonly method: string
  readonly locked: boolean
}

function LockRegistry(): JSX.Element {
  const { t, a } = useI18n()
  const { notify } = useNotifications()
  const [locks, setLocks] = React.useState<readonly LockRow[]>([])
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [target, setTarget] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [credential, setCredential] = React.useState('')
  const [method, setMethod] = React.useState<'password' | 'totp'>('password')
  const [duration, setDuration] = React.useState<'once' | 'session' | '15m'>('session')

  const refresh = React.useCallback(() => {
    void window.materialUniGetUi.locks.list().then(async records => {
      const withState = await Promise.all(
        records.map(async record => ({
          id: record.id,
          target: record.target,
          label: record.label,
          method: record.method,
          locked: await window.materialUniGetUi.locks.isLocked(record.target),
        }))
      )
      setLocks(withState)
    })
  }, [])

  React.useEffect(refresh, [refresh])

  const matcher = searchMatcher(search)
  const shown = locks.filter(lock => matcher.test(`${lock.label} ${lock.method}`))
  const minutesFor = (value: 'once' | 'session' | '15m'): number =>
    value === '15m' ? 15 : 0

  return (
    <div className="settings-card">
      <div className="settings-card__head">
        <Icon name="lock" size={22} style={{ color: 'var(--p)' }} />
        <h2>{t('securityLockHeading')}</h2>
        <SearchField
          id="lock-search"
          label={t('securityLockSearchLabel')}
          placeholder={t('securityLockSearchPh')}
          state={search}
          sampleText={locks[0]?.label ?? ''}
          onChange={setSearch}
        />
      </div>
      <p className="settings-card__body">{t('securityLockBody')}</p>

      {shown.length === 0 ? (
        <div className="state-note">{t('lockEmpty')}</div>
      ) : (
        shown.map(lock => (
          <div className="lock-row" key={lock.id}>
            <Icon name={lock.method === 'totp' ? 'qr_code_2' : 'password'} size={18} style={{ color: 'var(--onv)' }} />
            <span className="lock-row__label">{lock.label}</span>
            <span className="lock-row__state" data-locked={lock.locked}>
              {lock.locked ? t('lockStateLocked') : t('lockStateUnlocked')}
            </span>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                void window.materialUniGetUi.locks.relock(lock.target).then(() => {
                  refresh()
                  notify('info', t('lockRelockedNotify'))
                })
              }}
            >
              {t('lockRelockBtn')}
            </button>
            <button
              type="button"
              className="btn btn--small"
              aria-label={`${t('lockRemoveBtn')} · ${lock.label}`}
              onClick={() => {
                void window.materialUniGetUi.locks.remove(lock.id).then(() => {
                  refresh()
                  notify('info', t('lockRemovedNotify'))
                })
              }}
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
        ))
      )}

      <div className="lock-method-row">
        <button
          type="button"
          className="lock-method"
          aria-pressed={method === 'password'}
          onClick={() => setMethod('password')}
        >
          <Icon name="password" size={17} />
          {t('lockMethodPassword')}
        </button>
        <button
          type="button"
          className="lock-method"
          aria-pressed={method === 'totp'}
          onClick={() => setMethod('totp')}
        >
          <Icon name="qr_code_2" size={17} />
          {t('lockMethodTotp')}
        </button>
      </div>

      <div className="lock-create-grid">
        <label>
          <span className="visually-hidden">{t('lockCreateTargetLabel')}</span>
          <input
            className="text-input"
            placeholder={t('lockCreateTargetLabel')}
            value={target}
            onChange={event => setTarget(event.currentTarget.value)}
          />
        </label>
        <label>
          <span className="visually-hidden">{a('settingsWhatDoes')}</span>
          <input
            className="text-input"
            placeholder="Label"
            value={label}
            onChange={event => setLabel(event.currentTarget.value)}
          />
        </label>
      </div>
      <input
        className="text-input"
        style={{ width: '100%', marginTop: 8 }}
        placeholder={t('lockCreateCredLabel')}
        value={credential}
        onChange={event => setCredential(event.currentTarget.value)}
      />

      <div className="lock-duration-row">
        {(
          [
            ['once', 'lockDurationOnce'],
            ['session', 'lockDurationSession'],
            ['15m', 'lockDuration15m'],
          ] as const
        ).map(([value, key]) => (
          <button
            key={value}
            type="button"
            className="lock-duration"
            aria-pressed={duration === value}
            onClick={() => setDuration(value)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn btn--filled"
        disabled={target.trim().length === 0 || label.trim().length === 0 || credential.trim().length === 0}
        onClick={() => {
          const create =
            method === 'password'
              ? window.materialUniGetUi.locks.createPassword(target, label, credential, duration, minutesFor(duration))
              : window.materialUniGetUi.locks.createTotp(target, label, credential, duration, minutesFor(duration))
          void create.then(result => {
            if ('error' in result) {
              notify('warning', result.error)
              return
            }
            setTarget('')
            setLabel('')
            setCredential('')
            refresh()
            notify('success', t('lockCreatedNotify'))
          })
        }}
      >
        {t('lockCreateBtn')}
      </button>
    </div>
  )
}

/**
 * Two-factor registration: a locally drawn QR code plus the manual Base32
 * secret. The entry is only kept once the user proves they can generate a
 * matching live code from it — until then it is created provisionally and
 * removed again on a mismatch, so the factor never "arms" unconfirmed.
 */
function TwoFactorPairingCard(): JSX.Element {
  const { t, a } = useI18n()
  const { notify } = useNotifications()
  const [secret, setSecret] = React.useState('')
  const [issuer, setIssuer] = React.useState('Material UniGetUI')
  const [account, setAccount] = React.useState('this device')
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [code, setCode] = React.useState('')
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)

  const uri = React.useMemo(() => {
    if (secret.length === 0) {
      return ''
    }
    const label = encodeURIComponent(`${issuer}:${account}`)
    const query = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    })
    return `otpauth://totp/${label}?${query.toString()}`
  }, [secret, issuer, account])

  const generate = () => {
    void window.materialUniGetUi.authenticator.generateSecret().then(async next => {
      setSecret(next)
      setStatus(null)
      setCode('')
      // Register provisionally — the confirm step decides whether it stays.
      const label = encodeURIComponent(`${issuer}:${account}`)
      const query = new URLSearchParams({
        secret: next,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30',
      })
      const provisionalUri = `otpauth://totp/${label}?${query.toString()}`
      const result = await window.materialUniGetUi.authenticator.add(provisionalUri, issuer, account)
      if (result.ok) {
        const entries = await window.materialUniGetUi.authenticator.list()
        const match = entries.find(entry => entry.uri === provisionalUri)
        setPendingId(match?.id ?? null)
      }
    })
  }

  const confirm = () => {
    if (pendingId === null) {
      setStatus({ ok: false, message: t('twoFANoSecretYet') })
      return
    }
    void window.materialUniGetUi.authenticator.codes().then(codes => {
      const real = codes.find(entry => entry.id === pendingId)
      const cleaned = code.replace(/\s/g, '')
      if (real !== undefined && real.code === cleaned && cleaned.length === 6) {
        setStatus({ ok: true, message: t('twoFAConfirmSuccess') })
        notify('success', t('twoFAConfirmSuccess'))
        setPendingId(null)
      } else {
        setStatus({ ok: false, message: t('twoFAConfirmFail') })
        // Un-arm: the factor never commits without a matching code.
        void window.materialUniGetUi.authenticator.remove(pendingId).then(() => setPendingId(null))
      }
    })
  }

  return (
    <div className="settings-card two-factor-card">
      {uri.length > 0 ? (
        <QrCodeView text={uri} label={t('twoFA')} />
      ) : (
        <div className="qr-code qr-code--error" style={{ width: 132, height: 132 }} aria-hidden="true">
          <Icon name="qr_code_2" size={40} />
        </div>
      )}
      <div className="two-factor-card__body">
        <h2 style={{ fontSize: 'var(--md-body-size)', fontWeight: 500, margin: 0 }}>{t('twoFA')}</h2>
        <p className="settings-card__body">{t('twoFASub')}</p>
        <div className="two-factor-card__fields">
          <input
            className="text-input"
            placeholder={t('twoFAIssuerLabel')}
            aria-label={t('twoFAIssuerLabel')}
            value={issuer}
            onChange={event => setIssuer(event.currentTarget.value)}
          />
          <input
            className="text-input"
            placeholder={t('twoFAAccountLabel')}
            aria-label={t('twoFAAccountLabel')}
            value={account}
            onChange={event => setAccount(event.currentTarget.value)}
          />
        </div>
        <button type="button" className="btn" onClick={generate}>
          <Icon name="autorenew" size={16} />
          {t('twoFAGenerateBtn')}
        </button>
        {secret.length > 0 && (
          <p className="setting-row__provenance" style={{ marginTop: 8 }}>
            {t('twoFAManualSecret')}: <code>{secret}</code>
          </p>
        )}
        <div className="two-factor-card__confirm">
          <input
            value={code}
            onChange={event => setCode(event.currentTarget.value)}
            placeholder={t('twoFAConfirmPlaceholder')}
            aria-label={a('confirmPairing')}
          />
          <button type="button" className="btn btn--filled" onClick={confirm}>
            {t('confirmPairing')}
          </button>
        </div>
        {status && (
          <p className="two-factor-card__status" data-ok={status.ok} role="status">
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}

function ManagerList(props: {
  readonly managers: readonly ManagerAvailability[]
}): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="card settings-card">
      <h2>{t('managersHeading')}</h2>
      <p>{t('managersBody')}</p>
      <div className="manager-list">
        {props.managers.map(manager => (
          <div className="manager-row" key={manager.id} data-available={manager.available}>
            <div className="manager-row__name">{manager.id}</div>
            <div className="manager-row__state">
              {manager.available
                ? `${t('managerAvailable')}${manager.version ? ` · ${manager.version}` : ''}`
                : (manager.unavailableReason ?? t('managerUnavailable'))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VocabularyControl(): JSX.Element {
  const { t } = useI18n()
  const [status, setStatus] = React.useState<string>('')
  const { notify } = useNotifications()

  return (
    <div className="card settings-card">
      <h2>{t('vocabHeading')}</h2>
      <p>{t('vocabBody')}</p>
      <div className="setting-row__control">
        <button
          type="button"
          className="btn btn--filled"
          onClick={() => {
            void window.materialUniGetUi.vocabulary.load().then(result => {
              if (result.ok) {
                setStatus(t('vocabStatusLoaded', { count: String(result.count ?? 0) }))
                notify('success', t('vocabLoadedNotify'), `${result.count ?? 0}`)
              } else {
                setStatus(result.reason ?? t('vocabStatusRejected'))
                notify('warning', t('vocabNotLoadedNotify'), result.reason)
              }
            })
          }}
        >
          {t('vocabChoose')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void window.materialUniGetUi.vocabulary.clear().then(() => {
              setStatus(t('vocabStatusNone'))
              notify('info', t('vocabClearedNotify'))
            })
          }}
        >
          {t('clear')}
        </button>
      </div>
      <p className="setting-row__provenance" role="status">
        {status.length > 0 ? status : t('vocabStatusNone')}
      </p>
    </div>
  )
}
