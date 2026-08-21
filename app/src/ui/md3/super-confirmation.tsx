import * as React from 'react'

/**
 * The destructive-action gate.
 *
 * Two independently operated keys arm a slider; only a completed slide
 * authorizes the action. It is deliberately awkward — that is the entire
 * feature — but it is never ambiguous: the exact action and the exact thing it
 * affects are named in plain words at every stage, and an emergency exit is
 * available throughout.
 *
 * Playful copy may surround this. It may not replace the facts.
 */

export interface SuperConfirmationProps {
  /** What is about to happen, named exactly. */
  readonly actionLabel: string
  /** What it happens to — a package name, a file, a count. */
  readonly subject: string
  /** Plain statement of what cannot be undone. Never softened by tone. */
  readonly consequence: string
  onConfirm(): void
  onCancel(): void
}

export function SuperConfirmation(props: SuperConfirmationProps): JSX.Element {
  const [keyA, setKeyA] = React.useState(false)
  const [keyB, setKeyB] = React.useState(false)
  const [slider, setSlider] = React.useState(0)
  const [armedAt, setArmedAt] = React.useState<number | null>(null)
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  const cancelRef = React.useRef<HTMLButtonElement | null>(null)

  const bothKeys = keyA && keyB
  const complete = bothKeys && slider >= 100

  React.useEffect(() => {
    // The emergency exit takes focus, not the confirm control: the safe action
    // is the one a stray keypress should reach.
    cancelRef.current?.focus()
  }, [])

  React.useEffect(() => {
    if (bothKeys && armedAt === null) {
      setArmedAt(Date.now())
    }
    if (!bothKeys) {
      setArmedAt(null)
      setSlider(0)
    }
  }, [bothKeys, armedAt])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onCancel()
    }
  }

  return (
    <div className="scrim" role="presentation">
      <div
        ref={dialogRef}
        className="super-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="super-confirm-title"
        aria-describedby="super-confirm-body"
        onKeyDown={onKeyDown}
      >
        <h2 id="super-confirm-title" className="super-confirm__title">
          {props.actionLabel}
        </h2>

        <div id="super-confirm-body" className="super-confirm__body">
          <p className="super-confirm__subject">{props.subject}</p>
          <p className="super-confirm__consequence">{props.consequence}</p>
        </div>

        <div className="super-confirm__keys">
          <label className="super-confirm__key">
            <input
              type="checkbox"
              checked={keyA}
              onChange={event => setKeyA(event.currentTarget.checked)}
            />
            <span>First key — I have read what this affects</span>
          </label>
          <label className="super-confirm__key">
            <input
              type="checkbox"
              checked={keyB}
              onChange={event => setKeyB(event.currentTarget.checked)}
            />
            <span>Second key — I understand it cannot be undone here</span>
          </label>
        </div>

        <div className="super-confirm__slider" aria-live="polite">
          <label htmlFor="super-confirm-slide">
            {bothKeys
              ? 'Slide all the way across to authorize'
              : 'Turn both keys to unlock the slider'}
          </label>
          <input
            id="super-confirm-slide"
            type="range"
            min={0}
            max={100}
            step={1}
            value={slider}
            disabled={!bothKeys}
            aria-valuetext={`${slider} of 100`}
            onChange={event => setSlider(Number(event.currentTarget.value))}
          />
          <div className="super-confirm__progress" data-complete={complete}>
            {complete ? 'Authorized.' : `${slider}%`}
          </div>
        </div>

        <div className="super-confirm__actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            onClick={props.onCancel}
          >
            Emergency exit
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!complete}
            onClick={() => {
              // Guarded here as well as by the disabled attribute: a disabled
              // button is a visual guard, and a keyboard submit walks past it.
              if (complete) {
                props.onConfirm()
              }
            }}
          >
            {props.actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
