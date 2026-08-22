import * as React from 'react'

/**
 * A Material Symbols Rounded glyph, ported from the design's icon usage.
 *
 * The design addresses a glyph by writing its ligature NAME as the element's
 * text content — `<span style="font-family:'Material Symbols Rounded'">menu</span>`
 * renders a hamburger icon because the font substitutes a glyph for that exact
 * word. Two consequences follow, both handled here rather than left to every
 * call site to remember:
 *
 * 1. An unknown ligature name renders as the literal English word instead of
 *    a icon, so `name` must be one of the design's own glyph names.
 * 2. The ligature name is real text content. Read aloud or matched by
 *    `textContent`, it would glue onto whatever label sits beside it (e.g.
 *    "descriptionExport as PDF"). This component is therefore always
 *    `aria-hidden`; the *control* that contains it must carry its own
 *    accessible name (an `aria-label`, `title` used as the accessible name,
 *    or visible text).
 *
 * The font itself is vendored by a sibling lane (`app/src/ui/fonts.css`,
 * not touched here) under the family name `Material Symbols Rounded`.
 */
export interface IconProps {
  /** The exact ligature name from the design, e.g. `'menu'`, `'settings'`. */
  readonly name: string
  /** Pixel font-size. Defaults to 20px, the design's most common icon size. */
  readonly size?: number
  /** `font-variation-settings: 'FILL' 1` — used for selected/filled states. */
  readonly filled?: boolean
  readonly className?: string
  readonly style?: React.CSSProperties
}

export function Icon(props: IconProps): JSX.Element {
  const size = props.size ?? 20
  return (
    <span
      aria-hidden="true"
      className={['md-icon', props.className].filter(Boolean).join(' ')}
      style={{
        fontFamily: "'Material Symbols Rounded'",
        fontSize: size,
        lineHeight: 1,
        fontVariationSettings: props.filled ? "'FILL' 1" : undefined,
        ...props.style,
      }}
    >
      {props.name}
    </span>
  )
}
