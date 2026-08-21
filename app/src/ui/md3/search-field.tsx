import * as React from 'react'
import {
  RegexBuilder,
  RegexState,
  emptyRegexState,
  compileMatcher,
  CompiledMatcher,
} from './regex-builder'

/**
 * A search field with its own anchored regex builder.
 *
 * Every search surface in this application uses this component, which is what
 * makes the builder genuinely universal rather than present on the one field
 * somebody remembered. Plain text is the default; regex is an explicit opt-in.
 */

export interface SearchState {
  readonly query: string
  readonly useRegex: boolean
  readonly regex: RegexState
}

export const emptySearchState: SearchState = {
  query: '',
  useRegex: false,
  regex: emptyRegexState,
}

export function searchMatcher(state: SearchState): CompiledMatcher {
  return compileMatcher(state.query, state.useRegex, state.regex)
}

export function SearchField(props: {
  readonly id: string
  readonly label: string
  readonly placeholder: string
  readonly state: SearchState
  /** One example from the list, so the builder can show a real trial match. */
  readonly sampleText?: string
  readonly resultSummary?: string
  onChange(state: SearchState): void
}): JSX.Element {
  const [builderOpen, setBuilderOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const { state, onChange } = props

  const matcher = searchMatcher(state)
  const statusId = `${props.id}-status`

  const closeBuilder = React.useCallback(() => {
    setBuilderOpen(false)
    // Focus returns to the field that opened it, never to the top of the page.
    inputRef.current?.focus()
  }, [])

  return (
    <div className="search-anchor">
      <label className="visually-hidden" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="search-field">
        <input
          id={props.id}
          ref={inputRef}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={state.useRegex ? state.regex.pattern : state.query}
          placeholder={props.placeholder}
          aria-describedby={statusId}
          aria-invalid={!matcher.valid}
          onChange={event => {
            const value = event.currentTarget.value
            onChange(
              state.useRegex
                ? { ...state, regex: { ...state.regex, pattern: value } }
                : { ...state, query: value }
            )
          }}
        />

        <label className="search-field__toggle">
          <input
            type="checkbox"
            checked={state.useRegex}
            onChange={event => {
              const useRegex = event.currentTarget.checked
              // Carry the text across so switching modes does not silently
              // discard what the user already typed.
              onChange(
                useRegex
                  ? { ...state, useRegex, regex: { ...state.regex, pattern: state.query } }
                  : { ...state, useRegex, query: state.regex.pattern }
              )
            }}
          />
          <span>Regex</span>
        </label>

        <button
          type="button"
          className="btn btn--small"
          aria-expanded={builderOpen}
          aria-controls={`${props.id}-builder`}
          onClick={() => setBuilderOpen(open => !open)}
        >
          Builder
        </button>
      </div>

      <div
        id={statusId}
        className="search-field__status"
        role="status"
        data-invalid={!matcher.valid}
      >
        {matcher.valid
          ? (props.resultSummary ?? '')
          : `Not a valid expression yet — ${matcher.error ?? ''}`}
      </div>

      {builderOpen && (
        <div id={`${props.id}-builder`} className="search-anchor__popover">
          <RegexBuilder
            state={state.regex}
            sampleText={props.sampleText ?? ''}
            onChange={regex => onChange({ ...state, useRegex: true, regex })}
            onClose={closeBuilder}
          />
        </div>
      )}
    </div>
  )
}
