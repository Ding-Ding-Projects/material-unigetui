import * as React from 'react'

/**
 * The regex builder, anchored to its own field.
 *
 * It belongs to the search bar the user is already typing in — an anchored
 * popover attached to that field, never a global dialog somewhere else. Where
 * several search fields exist on one surface, each gets its own builder bound
 * to its own query, pattern and flags; one shared builder that silently applies
 * to whichever field was touched last is the failure this design avoids.
 */

export interface RegexToken {
  readonly insert: string
  readonly label: string
  readonly description: string
}

/** Grouped so the palette reads as a reference rather than a wall of symbols. */
export const REGEX_TOKEN_GROUPS: ReadonlyArray<{
  readonly title: string
  readonly tokens: readonly RegexToken[]
}> = [
  {
    title: 'Anchors',
    tokens: [
      { insert: '^', label: '^', description: 'start of the text' },
      { insert: '$', label: '$', description: 'end of the text' },
      { insert: '\\b', label: '\\b', description: 'word boundary' },
    ],
  },
  {
    title: 'Characters',
    tokens: [
      { insert: '.', label: '.', description: 'any character' },
      { insert: '\\d', label: '\\d', description: 'a digit' },
      { insert: '\\w', label: '\\w', description: 'a word character' },
      { insert: '\\s', label: '\\s', description: 'whitespace' },
      { insert: '[a-z]', label: '[a-z]', description: 'a character class' },
      { insert: '[^a-z]', label: '[^a-z]', description: 'anything but the class' },
    ],
  },
  {
    title: 'Groups and choice',
    tokens: [
      { insert: '()', label: '( )', description: 'a capturing group' },
      { insert: '(?:)', label: '(?: )', description: 'a group that does not capture' },
      { insert: '|', label: '|', description: 'either side' },
    ],
  },
  {
    title: 'How many',
    tokens: [
      { insert: '*', label: '*', description: 'none or more' },
      { insert: '+', label: '+', description: 'one or more' },
      { insert: '?', label: '?', description: 'optional' },
      { insert: '{2,4}', label: '{2,4}', description: 'between two and four' },
    ],
  },
]

export interface RegexState {
  readonly pattern: string
  readonly ignoreCase: boolean
  readonly multiline: boolean
  readonly dotAll: boolean
}

export const emptyRegexState: RegexState = {
  pattern: '',
  ignoreCase: true,
  multiline: false,
  dotAll: false,
}

export function regexFlags(state: RegexState): string {
  return (
    (state.ignoreCase ? 'i' : '') +
    (state.multiline ? 'm' : '') +
    (state.dotAll ? 's' : '')
  )
}

export interface CompiledMatcher {
  readonly valid: boolean
  /** The reason it will not compile, while the user is still typing. */
  readonly error: string | null
  test(text: string): boolean
}

/**
 * Compiles a matcher for either mode.
 *
 * An unfinished expression returns `valid: false` and a matcher that accepts
 * everything. Rejecting everything instead turns a half-typed pattern into a
 * blank list that reads as "nothing matched" — which is a different and much
 * more alarming claim than "you are still typing".
 */
export function compileMatcher(
  query: string,
  useRegex: boolean,
  state: RegexState
): CompiledMatcher {
  const raw = useRegex ? state.pattern : query
  if (raw.trim().length === 0) {
    return { valid: true, error: null, test: () => true }
  }

  if (!useRegex) {
    const needle = raw.toLowerCase()
    return {
      valid: true,
      error: null,
      test: text => text.toLowerCase().includes(needle),
    }
  }

  try {
    // Bounded by the pattern length: a catastrophic-backtracking pattern is
    // still possible, so the caller keeps result sets small and the field is
    // capped rather than relying on the engine to be safe.
    const compiled = new RegExp(raw, regexFlags(state))
    return { valid: true, error: null, test: text => compiled.test(text) }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'not a valid expression',
      test: () => true,
    }
  }
}

export function RegexBuilder(props: {
  readonly state: RegexState
  readonly sampleText: string
  onChange(state: RegexState): void
  onClose(): void
}): JSX.Element {
  const { state, onChange } = props
  const firstTokenRef = React.useRef<HTMLButtonElement | null>(null)
  const patternRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    firstTokenRef.current?.focus()
  }, [])

  const matcher = compileMatcher('', true, state)

  const insert = (token: string) => {
    const field = patternRef.current
    const start = field?.selectionStart ?? state.pattern.length
    const end = field?.selectionEnd ?? start
    const next =
      state.pattern.slice(0, start) + token + state.pattern.slice(end)
    onChange({ ...state, pattern: next })
    // Put the caret inside a bracket pair rather than after it, which is where
    // the next thing typed almost always belongs.
    const offset = token.endsWith(')') || token.endsWith(']') ? token.length - 1 : token.length
    window.requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + offset, start + offset)
    })
  }

  return (
    <div
      className="regex-builder"
      role="dialog"
      aria-label="Regular expression builder"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          props.onClose()
        }
      }}
    >
      <label className="regex-builder__pattern">
        <span>Pattern</span>
        <input
          ref={patternRef}
          value={state.pattern}
          spellCheck={false}
          onChange={event => onChange({ ...state, pattern: event.currentTarget.value })}
          aria-invalid={!matcher.valid}
          aria-describedby="regex-builder-status"
        />
      </label>

      <div
        id="regex-builder-status"
        className="regex-builder__status"
        role="status"
        data-invalid={!matcher.valid}
      >
        {matcher.valid
          ? state.pattern.length === 0
            ? 'Empty pattern matches everything.'
            : 'Valid expression.'
          : matcher.error}
      </div>

      {REGEX_TOKEN_GROUPS.map((group, groupIndex) => (
        <div className="regex-builder__group" key={group.title}>
          <div className="regex-builder__group-title">{group.title}</div>
          <div className="regex-builder__tokens">
            {group.tokens.map((token, tokenIndex) => (
              <button
                key={token.insert}
                type="button"
                className="chip"
                title={token.description}
                aria-label={`${token.label} — ${token.description}`}
                ref={
                  groupIndex === 0 && tokenIndex === 0 ? firstTokenRef : undefined
                }
                onClick={() => insert(token.insert)}
              >
                {token.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="regex-builder__flags">
        {(
          [
            ['ignoreCase', 'Ignore case', 'i'],
            ['multiline', 'Multiline', 'm'],
            ['dotAll', 'Dot matches newline', 's'],
          ] as const
        ).map(([key, label, flag]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={state[key]}
              onChange={event => onChange({ ...state, [key]: event.currentTarget.checked })}
            />
            <span>
              {label} <code>{flag}</code>
            </span>
          </label>
        ))}
      </div>

      <div className="regex-builder__sample">
        <div className="regex-builder__group-title">Against the current list</div>
        <div>
          {props.sampleText.length === 0
            ? 'Nothing to try it against yet.'
            : matcher.test(props.sampleText)
              ? `Matches, for example, “${props.sampleText}”.`
              : `Does not match “${props.sampleText}”.`}
        </div>
      </div>
    </div>
  )
}
