/**
 * The Material Design 3 token contract.
 *
 * These two palettes are lifted verbatim from the checked-in design reference
 * (`design/Material UniGetUI v2.dc.html`), which computed them inline on every
 * render. They are the single source of truth for colour in this application:
 * nothing else may declare a raw hex value for chrome.
 *
 * The design's short role names are kept deliberately. Renaming them to the
 * long-form Material role names would make every ported component diverge from
 * the reference it is checked against, which is the one comparison that catches
 * a bad port.
 */

export type Md3ColorRole =
  | 'p' | 'onp' | 'pc' | 'onpc'
  | 'sc' | 'onsc'
  | 'tc' | 'ontc'
  | 'sf' | 'sfc' | 'sch' | 'schh'
  | 'on' | 'onv'
  | 'ol' | 'olv'
  | 'err' | 'errc' | 'onerrc'
  | 'inv' | 'oninv'
  | 'grn'

export type Md3Palette = Readonly<Record<Md3ColorRole, string>>

export const md3LightPalette: Md3Palette = {
  p: '#0B57D0', onp: '#FFFFFF', pc: '#D3E3FD', onpc: '#041E49',
  sc: '#C2E7FF', onsc: '#001D35',
  tc: '#C4EED0', ontc: '#0F5223',
  sf: '#FFFFFF', sfc: '#F6F8FC', sch: '#EAF1FB', schh: '#DDE9F9',
  on: '#1F1F1F', onv: '#5E6368',
  ol: '#747775', olv: '#E1E5EA',
  err: '#B3261E', errc: '#F9DEDC', onerrc: '#410E0B',
  inv: '#303030', oninv: '#F2F2F2',
  grn: '#146C2E',
}

export const md3DarkPalette: Md3Palette = {
  p: '#A8C7FA', onp: '#062E6F', pc: '#0842A0', onpc: '#D3E3FD',
  sc: '#004A77', onsc: '#C2E7FF',
  tc: '#0F3B2E', ontc: '#8FF0C2',
  sf: '#1A1F26', sfc: '#0F1318', sch: '#28303B', schh: '#333D4B',
  on: '#E3E3E3', onv: '#A8ADB4',
  ol: '#8E918F', olv: '#3A4048',
  err: '#F2B8B5', errc: '#5C1F1B', onerrc: '#F9DEDC',
  inv: '#E3E3E3', oninv: '#1F1F1F',
  grn: '#6DD58C',
}

/** Every role, in declaration order. Used by the guard to prove none was dropped. */
export const md3ColorRoles: readonly Md3ColorRole[] = Object.keys(
  md3LightPalette
) as Md3ColorRole[]

export function md3PaletteFor(theme: 'light' | 'dark'): Md3Palette {
  return theme === 'dark' ? md3DarkPalette : md3LightPalette
}

/**
 * Renders a palette as the CSS custom-property declarations the design injects
 * on its root element (`--p`, `--onp`, …). Returned as a declaration string so
 * one provider can set it once per theme change rather than per render.
 */
export function md3PaletteToCssText(palette: Md3Palette): string {
  return md3ColorRoles.map(role => `--${role}:${palette[role]}`).join(';')
}

/**
 * Typography scale, shape scale, elevation, state-layer opacities and motion.
 * Unlike colour, these do not change between light and dark — the design's
 * canvas runtime used the same values in both themes, so they are declared
 * once here rather than duplicated per palette. Declared as CSS custom
 * properties on `:root` (see app.css) so every ported component reads them
 * instead of hand-rolling a size or a duration.
 */
export const md3Typography = {
  displaySize: '22px',
  headlineSize: '20px',
  titleSize: '16px',
  bodySize: '14px',
  bodySmallSize: '13px',
  labelSize: '12px',
  labelSmallSize: '11px',
  monoFamily: "'Roboto Mono', ui-monospace, monospace",
  bodyFamily: "Roboto, 'Segoe UI', Arial, sans-serif",
} as const

export const md3Shape = {
  none: '0px',
  extraSmall: '4px',
  small: '8px',
  medium: '12px',
  large: '16px',
  extraLarge: '28px',
  full: '999px',
} as const

/** Elevation levels 0-5, as the box-shadow the design's cards and menus use. */
export const md3Elevation = {
  level0: 'none',
  level1: '0 1px 2px rgba(0,0,0,.15), 0 1px 3px 1px rgba(0,0,0,.08)',
  level2: '0 1px 2px rgba(0,0,0,.15), 0 2px 6px 2px rgba(0,0,0,.10)',
  level3: '0 4px 8px 3px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.20)',
  level4: '0 4px 16px rgba(0,0,0,.25)',
  level5: '0 8px 24px rgba(0,0,0,.30)',
} as const

/** State-layer opacities applied over `on`/`onv`-coloured content. */
export const md3StateLayerOpacity = {
  hover: 0.08,
  focus: 0.10,
  pressed: 0.12,
  dragged: 0.16,
} as const

export const md3Motion = {
  durationShort: '100ms',
  durationMedium: '150ms',
  durationLong: '250ms',
  easingStandard: 'cubic-bezier(.2,0,0,1)',
  /** The design's own `pop` keyframe easing, used for popovers and menus. */
  easingEmphasized: 'cubic-bezier(.05,.7,.1,1)',
} as const

/**
 * Renders the theme-independent tokens above as CSS custom-property
 * declarations, in the same `--name:value;--name:value` shape as
 * {@link md3PaletteToCssText} so both can be set on the same root element.
 */
export function md3StaticTokensToCssText(): string {
  const toKebab = (key: string): string =>
    key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  // Shape values collide in spirit with generic-sounding names (`medium`,
  // `large`, `full`) so that group alone is prefixed; the others already
  // carry a self-describing key (`headlineSize`, `level1`, `durationShort`).
  const groups: ReadonlyArray<readonly [Record<string, string>, string]> = [
    [md3Typography, ''],
    [md3Shape, 'shape-'],
    [md3Elevation, ''],
    [md3Motion, ''],
  ]
  const declarations: string[] = []
  for (const [group, prefix] of groups) {
    for (const [key, value] of Object.entries(group)) {
      declarations.push(`--md-${prefix}${toKebab(key)}:${value}`)
    }
  }
  for (const [key, value] of Object.entries(md3StateLayerOpacity)) {
    declarations.push(`--md-state-${key}:${value}`)
  }
  return declarations.join(';')
}
