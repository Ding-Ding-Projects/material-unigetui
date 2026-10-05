import * as React from 'react'
import { Icon } from '../md3/icon'
import { SearchField, SearchState, emptySearchState, searchMatcher } from '../md3/search-field'
import { useI18n } from '../app-state'
import { TranslationKey } from '../../lib/i18n-resources'

import { JsonCsvPanel } from './json-csv-panel'

/** One real JSON-to-CSV lane; the remaining adapter catalog stays unavailable. */

interface FormatEntry {
  readonly id: string
  readonly icon: string
  readonly labelKey: TranslationKey
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
      { id: 'md-html', icon: 'description', labelKey: 'converterFormatMarkdownHtml' },
      { id: 'pdf-split', icon: 'call_split', labelKey: 'converterFormatPdfSplit' },
      { id: 'pdf-merge', icon: 'call_merge', labelKey: 'converterFormatPdfMerge' },
    ],
  },
  {
    id: 'images',
    icon: 'image',
    titleKey: 'converterCatImages',
    formats: [
      { id: 'png-jpg', icon: 'image', labelKey: 'converterFormatPngJpg' },
      { id: 'webp-png', icon: 'image', labelKey: 'converterFormatWebpPng' },
      { id: 'svg-raster', icon: 'image', labelKey: 'converterFormatSvgRaster' },
    ],
  },
  {
    id: 'audio',
    icon: 'audiotrack',
    titleKey: 'converterCatAudio',
    formats: [{ id: 'wav-mp3', icon: 'audiotrack', labelKey: 'converterFormatWavMp3' }],
  },
  {
    id: 'video',
    icon: 'movie',
    titleKey: 'converterCatVideo',
    formats: [{ id: 'mov-mp4', icon: 'movie', labelKey: 'converterFormatMovMp4' }],
  },
  {
    id: 'archives',
    icon: 'folder_zip',
    titleKey: 'converterCatArchives',
    formats: [{ id: 'zip-7z', icon: 'folder_zip', labelKey: 'converterFormatZip7z' }],
  },
  {
    id: 'data',
    icon: 'table_chart',
    titleKey: 'converterCatData',
    formats: [
      { id: 'json-yaml', icon: 'table_chart', labelKey: 'converterFormatJsonYaml' },
      { id: 'csv-json', icon: 'table_chart', labelKey: 'converterFormatCsvJson' },
    ],
  },
  {
    id: 'code',
    icon: 'code',
    titleKey: 'converterCatCode',
    formats: [{ id: 'crlf-lf', icon: 'code', labelKey: 'converterFormatLineEndings' }],
  },
  {
    id: 'binary',
    icon: 'memory',
    titleKey: 'converterCatBinary',
    formats: [{ id: 'base64', icon: 'memory', labelKey: 'converterFormatBase64' }],
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
  const shown = category.formats.filter(format => matcher.test(t(format.labelKey)))

  return (
    <>
      <h1 className="route-surface__heading">{t('converter')}</h1>
      <p className="route-surface__sub">{t('converterSub')}</p>

      <JsonCsvPanel />

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
            tabIndex={candidate.id === category.id ? 0 : -1}
            aria-controls={`converter-panel-${candidate.id}`}
            className="category-tab"
            onClick={() => setActiveCategory(candidate.id)}
            onKeyDown={event => {
              const index = CATEGORIES.findIndex(item => item.id === candidate.id)
              const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORIES.length - 1
                : event.key === 'ArrowRight' ? (index + 1) % CATEGORIES.length
                : event.key === 'ArrowLeft' ? (index + CATEGORIES.length - 1) % CATEGORIES.length : -1
              const next = CATEGORIES[nextIndex]
              if (!next) return
              event.preventDefault()
              setActiveCategory(next.id)
              document.getElementById(`converter-tab-${next.id}`)?.focus()
            }}
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
          sampleText={category.formats[0] ? t(category.formats[0].labelKey) : ''}
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
                <div className="format-row__name">{t(format.labelKey)}</div>
                <div className="format-row__note">{t('converterNoAdapter')}</div>
              </div>
              <span className="format-row__status">{a('converterNoAdapter')}</span>
            </div>
          ))
        )}
      </div>

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
