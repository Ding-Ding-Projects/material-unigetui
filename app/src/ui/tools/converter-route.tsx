import * as React from 'react'
import { Icon } from '../md3/icon'
import { SearchField, SearchState, emptySearchState, searchMatcher } from '../md3/search-field'
import { useI18n } from '../app-state'
import { TranslationKey } from '../../lib/i18n-resources'

/**
 * Ported from the design's `rConverter` section, widened into the categorized
 * adapter catalog the completeness inventory calls for.
 *
 * `window.materialUniGetUi` exposes no converter bridge at all — no adapter
 * registry, no bounded sandboxed decoder, nothing. Inventing one here would
 * be exactly the decorative control this project's rules forbid, so instead:
 * every format below is real (it is what the design's own recent-conversions
 * row lists), every one is honestly marked as having no bundled adapter yet,
 * and the drop zone is a disabled control that says so rather than a button
 * that silently does nothing when clicked.
 */

interface FormatEntry {
  readonly id: string
  readonly icon: string
  readonly label: string
}

interface Category {
  readonly id: string
  readonly icon: string
  readonly titleKey: TranslationKey
  readonly formats: readonly FormatEntry[]
}

const CATEGORIES: readonly Category[] = [
  {
    id: 'documents',
    icon: 'picture_as_pdf',
    titleKey: 'converterCatDocuments',
    formats: [
      { id: 'md-html', icon: 'description', label: 'Markdown → HTML' },
      { id: 'pdf-split', icon: 'call_split', label: 'PDF split' },
      { id: 'pdf-merge', icon: 'call_merge', label: 'PDF merge' },
    ],
  },
  {
    id: 'images',
    icon: 'image',
    titleKey: 'converterCatImages',
    formats: [
      { id: 'png-jpg', icon: 'image', label: 'PNG → JPG' },
      { id: 'webp-png', icon: 'image', label: 'WEBP → PNG' },
      { id: 'svg-raster', icon: 'image', label: 'SVG → raster' },
    ],
  },
  {
    id: 'audio',
    icon: 'audiotrack',
    titleKey: 'converterCatAudio',
    formats: [{ id: 'wav-mp3', icon: 'audiotrack', label: 'WAV → MP3' }],
  },
  {
    id: 'video',
    icon: 'movie',
    titleKey: 'converterCatVideo',
    formats: [{ id: 'mov-mp4', icon: 'movie', label: 'MOV → MP4' }],
  },
  {
    id: 'archives',
    icon: 'folder_zip',
    titleKey: 'converterCatArchives',
    formats: [{ id: 'zip-7z', icon: 'folder_zip', label: 'ZIP ⇄ 7z' }],
  },
  {
    id: 'data',
    icon: 'table_chart',
    titleKey: 'converterCatData',
    formats: [
      { id: 'json-yaml', icon: 'table_chart', label: 'JSON ⇄ YAML' },
      { id: 'csv-json', icon: 'table_chart', label: 'CSV ⇄ JSON' },
    ],
  },
  {
    id: 'code',
    icon: 'code',
    titleKey: 'converterCatCode',
    formats: [{ id: 'crlf-lf', icon: 'code', label: 'Line-ending normalisation' }],
  },
  {
    id: 'binary',
    icon: 'memory',
    titleKey: 'converterCatBinary',
    formats: [{ id: 'base64', icon: 'memory', label: 'Base64 ⇄ binary' }],
  },
]

const FIRST_CATEGORY: Category = CATEGORIES[0] as Category

export function ConverterRoute(): JSX.Element {
  const { t, a } = useI18n()
  const [activeCategory, setActiveCategory] = React.useState(FIRST_CATEGORY.id)
  const [searchByCategory, setSearchByCategory] = React.useState<
    Readonly<Record<string, SearchState>>
  >({})

  const category: Category =
    CATEGORIES.find(candidate => candidate.id === activeCategory) ?? FIRST_CATEGORY
  const search = searchByCategory[category.id] ?? emptySearchState
  const matcher = searchMatcher(search)
  const shown = category.formats.filter(format => matcher.test(format.label))

  return (
    <>
      <h1 className="route-surface__heading">{t('converter')}</h1>
      <p className="route-surface__sub">{t('converterSub')}</p>

      <button type="button" className="tool-dropzone" disabled title={t('converterDropHint')}>
        <Icon name="place_item" size={44} style={{ color: 'var(--p)' }} />
        <div className="tool-dropzone__title">{t('converterDropTitle')}</div>
        <div className="tool-dropzone__hint">{t('converterDropHint')}</div>
      </button>

      <div
        className="category-tabs"
        role="tablist"
        aria-label={t('converter')}
        style={{ marginTop: 20 }}
      >
        {CATEGORIES.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            id={`converter-tab-${candidate.id}`}
            aria-selected={candidate.id === category.id}
            aria-controls={`converter-panel-${candidate.id}`}
            className="category-tab"
            onClick={() => setActiveCategory(candidate.id)}
          >
            <Icon name={candidate.icon} size={16} />
            {t(candidate.titleKey)}
            <span className="category-tab__count">({candidate.formats.length})</span>
          </button>
        ))}
      </div>

      <div
        id={`converter-panel-${category.id}`}
        role="tabpanel"
        aria-labelledby={`converter-tab-${category.id}`}
      >
        <SearchField
          id={`converter-search-${category.id}`}
          label={`${t('converterSearchLabel')} — ${t(category.titleKey)}`}
          placeholder={t('converterSearchPh')}
          state={search}
          sampleText={category.formats[0]?.label ?? ''}
          resultSummary={`${shown.length} ${t('of')} ${category.formats.length}`}
          onChange={next =>
            setSearchByCategory(current => ({ ...current, [category.id]: next }))
          }
        />

        {shown.length === 0 ? (
          <div className="state-note">{t('converterEmptyCategory')}</div>
        ) : (
          shown.map(format => (
            <div className="format-row" key={format.id}>
              <Icon name={format.icon} size={22} style={{ color: 'var(--p)' }} />
              <div className="format-row__grow">
                <div className="format-row__name">{format.label}</div>
                <div className="format-row__note">{t('converterNoAdapter')}</div>
              </div>
              <span className="format-row__status">{a('converterNoAdapter')}</span>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 20, marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
        {t('recent')}
      </div>
      <div className="state-note">{t('converterRecentEmpty')}</div>

      <div
        className="note"
        style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <Icon name="info" size={18} />
        {t('unsupported')}
      </div>
    </>
  )
}
