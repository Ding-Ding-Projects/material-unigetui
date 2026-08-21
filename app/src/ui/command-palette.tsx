import * as React from 'react'
import { SearchField, SearchState, emptySearchState, searchMatcher } from './md3/search-field'

/**
 * The command palette, on Ctrl+Shift+F.
 *
 * Results are not labels. A setting result renders its real control inline and
 * changing it there writes through the same path the settings page uses, so the
 * two can never disagree. A destination result navigates to the exact element
 * rather than to the general area and leaves the user to hunt.
 */

export type PaletteEntry =
  | {
      readonly kind: 'destination'
      readonly id: string
      readonly title: string
      readonly context: string
      run(): void
    }
  | {
      readonly kind: 'action'
      readonly id: string
      readonly title: string
      readonly context: string
      run(): void
    }
  | {
      readonly kind: 'toggle'
      readonly id: string
      readonly title: string
      readonly context: string
      readonly value: boolean
      set(value: boolean): void
    }
  | {
      readonly kind: 'choice'
      readonly id: string
      readonly title: string
      readonly context: string
      readonly value: string
      readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
      set(value: string): void
    }
  | {
      readonly kind: 'range'
      readonly id: string
      readonly title: string
      readonly context: string
      readonly value: number
      readonly min: number
      readonly max: number
      set(value: number): void
    }

export function CommandPalette(props: {
  readonly entries: readonly PaletteEntry[]
  readonly size: 'card' | 'full'
  onSizeChange(size: 'card' | 'full'): void
  onClose(): void
}): JSX.Element {
  const [search, setSearch] = React.useState<SearchState>(emptySearchState)
  const [active, setActive] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement | null>(null)

  const matcher = searchMatcher(search)
  const results = React.useMemo(
    () =>
      props.entries.filter(entry =>
        matcher.test(`${entry.title} ${entry.context}`)
      ),
    [props.entries, matcher]
  )

  React.useEffect(() => {
    setActive(0)
  }, [search])

  const activate = (entry: PaletteEntry) => {
    if (entry.kind === 'destination' || entry.kind === 'action') {
      entry.run()
      props.onClose()
    }
    // A rich control is changed in place; the palette deliberately stays open
    // so several settings can be adjusted without reopening it each time.
  }

  return (
    <div className="scrim" role="presentation" onMouseDown={props.onClose}>
      <div
        className="palette"
        data-size={props.size}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive(index => Math.min(index + 1, results.length - 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive(index => Math.max(index - 1, 0))
          }
          if (event.key === 'Enter') {
            const entry = results[active]
            if (entry !== undefined) {
              event.preventDefault()
              activate(entry)
            }
          }
        }}
      >
        <div className="palette__head">
          <SearchField
            id="palette-search"
            label="Search commands, settings and destinations"
            placeholder="Search commands, settings and destinations…"
            state={search}
            sampleText={results[0]?.title ?? ''}
            resultSummary={`${results.length} of ${props.entries.length}`}
            onChange={setSearch}
          />
          <button
            type="button"
            className="btn btn--small"
            aria-pressed={props.size === 'full'}
            onClick={() => props.onSizeChange(props.size === 'card' ? 'full' : 'card')}
          >
            {props.size === 'card' ? 'Expand' : 'Shrink'}
          </button>
        </div>

        <div className="palette__list" ref={listRef} role="listbox" aria-label="Results">
          {results.length === 0 && (
            <div className="state-note">Nothing matched that search.</div>
          )}
          {results.map((entry, index) => (
            <div
              key={entry.id}
              role="option"
              aria-selected={index === active}
              className="palette__row"
              data-active={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                if (entry.kind === 'destination' || entry.kind === 'action') {
                  activate(entry)
                }
              }}
            >
              <div className="palette__row-text">
                <div className="palette__row-title">{entry.title}</div>
                <div className="palette__row-context">{entry.context}</div>
              </div>
              <div
                className="palette__row-control"
                onClick={event => event.stopPropagation()}
              >
                <PaletteControl entry={entry} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The live control for a result row — the same one the settings page renders. */
function PaletteControl(props: { readonly entry: PaletteEntry }): JSX.Element {
  const { entry } = props

  switch (entry.kind) {
    case 'toggle':
      return (
        <label className="switch">
          <input
            type="checkbox"
            checked={entry.value}
            aria-label={entry.title}
            onChange={event => entry.set(event.currentTarget.checked)}
          />
          <span className="switch__track" aria-hidden="true" />
        </label>
      )
    case 'choice':
      return (
        <select
          className="btn btn--small"
          value={entry.value}
          aria-label={entry.title}
          onChange={event => entry.set(event.currentTarget.value)}
        >
          {entry.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'range':
      return (
        <span className="palette__range">
          <input
            type="range"
            min={entry.min}
            max={entry.max}
            value={entry.value}
            aria-label={entry.title}
            onChange={event => entry.set(Number(event.currentTarget.value))}
          />
          <span aria-hidden="true">{entry.value}</span>
        </span>
      )
    case 'destination':
      return <span className="palette__hint">Go</span>
    case 'action':
      return <span className="palette__hint">Run</span>
  }
}

/**
 * Binds Ctrl+Shift+F.
 *
 * One discoverable global shortcut, as the contract requires. Ctrl+K is
 * deliberately not also bound: two defaults for one surface means neither is
 * the one people learn.
 */
export function usePaletteShortcut(open: () => void): void {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])
}
