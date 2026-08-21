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
