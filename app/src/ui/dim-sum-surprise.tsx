import * as React from 'react'
import { useI18n } from './app-state'

/**
 * The dim sum surprise.
 *
 * Non-blocking, auto-dismissing, never focus-stealing, and it never gates
 * startup. There is no setting to switch it off — that is the contract — which
 * is exactly why it has to stay this polite.
 *
 * It fires at most once per launch, and only after the interface is already
 * usable.
 */

interface Surprise {
  readonly english: string
  readonly traditional: string
  readonly jyutping: string
  readonly photoUrl: string
  readonly altEnglish: string
  readonly altCantonese: string
}

const VISIBLE_MS = 9000
/** Long enough that it never lands during the first paint. */
const DELAY_MS = 2500

export function DimSumSurprise(): JSX.Element | null {
  const [surprise, setSurprise] = React.useState<Surprise | null>(null)
  const [photoFailed, setPhotoFailed] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)
  const { mode } = useI18n()
  const fired = React.useRef(false)

  React.useEffect(() => {
    // At most once per launch, guarded by a ref so a remount cannot re-draw.
    if (fired.current) {
      return
    }
    fired.current = true

    const timer = setTimeout(() => {
      void window.materialUniGetUi.dimSum.surprise().then(result => {
        if (result !== null) {
          setSurprise(result)
        }
      })
    }, DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    if (surprise === null) {
      return
    }
    const timer = setTimeout(() => setDismissed(true), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [surprise])

  if (surprise === null || dismissed) {
    return null
  }

  // The dish's own name, correct in both languages whatever the mode. The
  // funny level styles the words around it and never the dish itself.
  const name =
    mode === 'yue'
      ? surprise.traditional
      : mode === 'bilingual'
        ? `${surprise.english} · ${surprise.traditional}`
        : surprise.english

  const alt = mode === 'yue' ? surprise.altCantonese : surprise.altEnglish

  return (
    <aside
      className="dim-sum"
      // Polite, and not a dialog: it must never take focus or interrupt a
      // screen reader mid-sentence.
      role="note"
      aria-live="polite"
      aria-label={`Dim sum: ${name}`}
    >
      {!photoFailed && (
        <img
          className="dim-sum__photo"
          src={surprise.photoUrl}
          alt={alt}
          onError={() => setPhotoFailed(true)}
        />
      )}
      <div className="dim-sum__text">
        <div className="dim-sum__name">{name}</div>
        {surprise.jyutping.length > 0 && (
          <div className="dim-sum__jyutping">{surprise.jyutping}</div>
        )}
      </div>
      <button
        type="button"
        className="dim-sum__dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        {'×'}
      </button>
    </aside>
  )
}
