import * as React from 'react'
import {
  Md3Palette,
  md3PaletteFor,
  md3PaletteToCssText,
} from './md3/md3-style-contract'

export type ThemeName = 'light' | 'dark'

interface ThemeContextValue {
  readonly theme: ThemeName
  readonly palette: Md3Palette
  toggleTheme(): void
  setTheme(theme: ThemeName): void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = React.useContext(ThemeContext)
  if (value === null) {
    throw new Error('useTheme used outside AppThemeProvider')
  }
  return value
}

/**
 * Publishes the MD3 tokens as CSS custom properties on the document root.
 *
 * The design recomputed its palette on every render. Doing it here, once per
 * theme change, keeps every surface in step without tying colour to render
 * frequency — and means a token is declared in exactly one place.
 */
export function AppThemeProvider(props: {
  readonly children: React.ReactNode
}): JSX.Element {
  const [theme, setTheme] = React.useState<ThemeName>('light')
  const palette = React.useMemo(() => md3PaletteFor(theme), [theme])

  React.useEffect(() => {
    const root = document.documentElement
    root.setAttribute('style', md3PaletteToCssText(palette))
    root.setAttribute('data-theme', theme)
  }, [palette, theme])

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      palette,
      toggleTheme: () => setTheme(current => (current === 'light' ? 'dark' : 'light')),
      setTheme: (next: ThemeName) => setTheme(next),
    }),
    [theme, palette]
  )

  return (
    <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
  )
}
