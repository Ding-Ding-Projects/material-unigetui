import * as React from 'react'
import { generateQrMatrix } from './qrcode'

/**
 * Renders a QR code drawn entirely in-process, from `qrcode.ts`.
 *
 * No third-party QR web service is ever contacted — that would hand the
 * secret this code usually encodes to a stranger's server on the way to
 * rendering it. The matrix always sits on a solid white background with true
 * dark-on-light contrast, regardless of the active theme, because a themed
 * background is exactly the thing that makes a real scanner fail to read it.
 */
export function QrCodeView(props: {
  readonly text: string
  readonly size?: number
  readonly label: string
}): JSX.Element {
  const matrix = React.useMemo(() => generateQrMatrix(props.text), [props.text])
  const size = props.size ?? 132

  if (matrix === null) {
    return (
      <div className="qr-code qr-code--error" style={{ width: size, height: size }} role="img" aria-label={props.label}>
        Too long to render locally.
      </div>
    )
  }

  const modules = matrix.length
  const quiet = 4 // modules of white border, per spec minimum
  const total = modules + quiet * 2

  return (
    <svg
      className="qr-code"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label={props.label}
      style={{ background: '#ffffff', borderRadius: 8 }}
    >
      <rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={quiet + c}
              y={quiet + r}
              width={1}
              height={1}
              fill="#000000"
            />
          ) : null
        )
      )}
      <title>{props.label}</title>
    </svg>
  )
}
