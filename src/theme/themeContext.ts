import { createContext, useContext } from 'react'
import type { PaletteId, ThemePalette } from './themePalettes'

export const themeSurfaces = [
  { id: 'sidebarIndicator', label: 'Sidebar active indicator', description: 'The narrow accent beside the selected navigation item.' },
  { id: 'sidebarHighlight', label: 'Sidebar active and hover', description: 'Choose a light or dark sidebar; navigation text adjusts for contrast.' },
  { id: 'primary', label: 'Primary components', description: 'Primary buttons, form controls, and chart accents.' },
  { id: 'loader', label: 'Loader', description: 'The spinning progress indicator shown during navigation.' },
  { id: 'contentBackground', label: 'Content background', description: 'The page canvas, including the sign-in screen background.' },
] as const

export type ThemeSurface = (typeof themeSurfaces)[number]['id']
export type ThemeSurfaceColors = Record<ThemeSurface, string>
export type ThemeSurfaceOverrides = Partial<ThemeSurfaceColors>
export type SidebarAppearance = 'light' | 'dark'
export type HeaderStyle = 'botanical' | 'texture' | 'dots'

export type ThemeContextValue = {
  palette: ThemePalette
  setPaletteId: (paletteId: PaletteId) => void
  sidebarAppearance: SidebarAppearance
  setSidebarAppearance: (appearance: SidebarAppearance) => void
  headerStyle: HeaderStyle                                   // new
  setHeaderStyle: (style: HeaderStyle) => void               // new
  surfaceColors: ThemeSurfaceColors
  surfaceOverrides: ThemeSurfaceOverrides
  setSurfaceColor: (surface: ThemeSurface, color: string) => void
  resetSurfaceColor: (surface: ThemeSurface) => void
  resetThemeCustomization: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useAppTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider')
  }
  return context
}
