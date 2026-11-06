import {
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createTheme, MantineProvider, type MantineColorsTuple } from '@mantine/core'
import { ThemeContext } from './themeContext'
import { themeSurfaces } from './themeContext'
import {
  isPaletteId,
  themePalettes,
  type PaletteId,
} from './themePalettes'
import type {
  ThemeSurface,
  ThemeSurfaceColors,
  ThemeSurfaceOverrides,
  SidebarAppearance,
  HeaderStyle,
} from './themeContext'

const PALETTE_STORAGE_KEY = 'project-tracker-theme'
const COLORS_STORAGE_KEY = 'project-tracker-theme-colors'
const SIDEBAR_APPEARANCE_STORAGE_KEY = 'project-tracker-sidebar-appearance'
const BODY_FONT = "'Geist Variable', sans-serif"
const HEADING_FONT = "'Geist Variable', sans-serif"
const HEADER_STYLE_STORAGE_KEY = 'project-tracker-header-style'

type ThemeVariables = CSSProperties & {
  '--app-brand': string
  '--app-brand-deep': string
  '--app-brand-dark': string
  '--app-brand-light': string
  '--app-brand-subtle': string
  '--app-sidebar-indicator': string
  '--app-sidebar-highlight': string
  '--app-content-background': string
  '--app-loader': string
  '--app-sidebar-background': string
  '--app-sidebar-text': string
  '--app-sidebar-muted': string
  '--app-sidebar-border': string
  '--app-sidebar-highlight-text': string
  '--app-sidebar-avatar': string
  '--app-sidebar-avatar-text': string
}

function getInitialPaletteId(): PaletteId {
  const storedPaletteId = window.localStorage.getItem(PALETTE_STORAGE_KEY)
  return isPaletteId(storedPaletteId) ? storedPaletteId : 'green'
}

function getInitialSidebarAppearance(): SidebarAppearance {
  return window.localStorage.getItem(SIDEBAR_APPEARANCE_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

function getInitialHeaderStyle(): HeaderStyle {
  return window.localStorage.getItem(HEADER_STYLE_STORAGE_KEY) === 'texture' ? 'texture' : 'botanical'
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getInitialOverrides(): ThemeSurfaceOverrides {
  const stored = window.localStorage.getItem(COLORS_STORAGE_KEY)
  if (!stored) return {}

  try {
    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed)) return {}
    const validOverrides: ThemeSurfaceOverrides = {}
    themeSurfaces.forEach(({ id }) => {
      const color = parsed[id]
      if (isHexColor(color)) validOverrides[id] = color.toLowerCase()
    })
    return validOverrides
  } catch {
    return {}
  }
}

function mixHex(first: string, second: string, amount: number) {
  const firstChannels = first.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16)) ?? []
  const secondChannels = second.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16)) ?? []
  return `#${firstChannels
    .map((channel, index) =>
      Math.round(channel + (secondChannels[index] - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function getContrastingTextColor(hex: string) {
  const channels = hex.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? []
  const luminance = channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.45 ? '#263238' : '#ffffff'
}

function createCustomBrandShades(primary: string): MantineColorsTuple {
  const lighterMixes = [0.94, 0.86, 0.72, 0.54, 0.34, 0.16]
  const darkerMixes = [0.14, 0.3, 0.48]
  return [
    mixHex(primary, '#ffffff', lighterMixes[0]),
    mixHex(primary, '#ffffff', lighterMixes[1]),
    mixHex(primary, '#ffffff', lighterMixes[2]),
    mixHex(primary, '#ffffff', lighterMixes[3]),
    mixHex(primary, '#ffffff', lighterMixes[4]),
    mixHex(primary, '#ffffff', lighterMixes[5]),
    primary,
    mixHex(primary, '#000000', darkerMixes[0]),
    mixHex(primary, '#000000', darkerMixes[1]),
    mixHex(primary, '#000000', darkerMixes[2]),
  ]
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [paletteId, setPaletteIdState] = useState<PaletteId>(getInitialPaletteId)
  const [sidebarAppearance, setSidebarAppearanceState] =
    useState<SidebarAppearance>(getInitialSidebarAppearance)
  const [headerStyle, setHeaderStyleState] = useState<HeaderStyle>(getInitialHeaderStyle)
  const [overrides, setOverrides] = useState<ThemeSurfaceOverrides>(getInitialOverrides)
  const palette = themePalettes.find((item) => item.id === paletteId)
  if (!palette) {
    throw new Error(`Unknown theme palette: ${paletteId}`)
  }

  const setPaletteId = (nextPaletteId: PaletteId) => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, nextPaletteId)
    setPaletteIdState(nextPaletteId)
  }

  const setSidebarAppearance = (appearance: SidebarAppearance) => {
    window.localStorage.setItem(SIDEBAR_APPEARANCE_STORAGE_KEY, appearance)
    setSidebarAppearanceState(appearance)
  }

  const setHeaderStyle = (style: HeaderStyle) => {
  window.localStorage.setItem(HEADER_STYLE_STORAGE_KEY, style)
  setHeaderStyleState(style)
  }

  const baseBrand = overrides.primary ?? palette.shades[6]
  const brandShades = useMemo<MantineColorsTuple>(
    () => (overrides.primary ? createCustomBrandShades(baseBrand) : palette.shades),
    [baseBrand, overrides.primary, palette.shades],
  )
  const defaultSurfaceColors = useMemo<ThemeSurfaceColors>(
    () => ({
      sidebarIndicator: palette.shades[6],
      sidebarHighlight: sidebarAppearance === 'dark' ? '#374151' : '#fafcfb',
      primary: palette.shades[6],
      loader: palette.shades[6],
      contentBackground: '#fafcfb',
    }),
    [palette, sidebarAppearance],
  )
  const surfaceColors = useMemo(
    () => ({ ...defaultSurfaceColors, ...overrides }),
    [defaultSurfaceColors, overrides],
  )

  const setSurfaceColor = (surface: ThemeSurface, color: string) => {
    if (!isHexColor(color)) {
      throw new Error(`Invalid theme color for ${surface}: ${color}`)
    }
    const nextOverrides = { ...overrides, [surface]: color.toLowerCase() }
    window.localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(nextOverrides))
    setOverrides(nextOverrides)
  }

  const resetSurfaceColor = (surface: ThemeSurface) => {
    const nextOverrides = { ...overrides }
    delete nextOverrides[surface]
    if (Object.keys(nextOverrides).length === 0) {
      window.localStorage.removeItem(COLORS_STORAGE_KEY)
    } else {
      window.localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(nextOverrides))
    }
    setOverrides(nextOverrides)
  }

  const resetThemeCustomization = () => {
    window.localStorage.removeItem(COLORS_STORAGE_KEY)
    window.localStorage.removeItem(SIDEBAR_APPEARANCE_STORAGE_KEY)
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'green')
    window.localStorage.removeItem(HEADER_STYLE_STORAGE_KEY)
    setHeaderStyleState('botanical')
    setPaletteIdState('green')
    setOverrides({})
    setSidebarAppearanceState('dark')
  }

  const theme = useMemo(
    () =>
      createTheme({
        primaryColor: 'brand',
        colors: { brand: brandShades },
        primaryShade: 6,
        defaultRadius: 'md',
        fontFamily: BODY_FONT,
        headings: { fontFamily: HEADING_FONT },
      }),
    [brandShades],
  )

  const themeVariables = useMemo<ThemeVariables>(
    () => ({
      '--app-brand': surfaceColors.primary,
      '--app-brand-deep': palette.shades[8],
      '--app-brand-dark': palette.shades[8],
      '--app-brand-light': palette.shades[0],
      '--app-brand-subtle': '#fafcfb',
      '--app-sidebar-indicator': surfaceColors.sidebarIndicator,
      '--app-sidebar-highlight': surfaceColors.sidebarHighlight,
      '--app-sidebar-background': sidebarAppearance === 'dark' ? '#1f2937' : '#ffffff',
      '--app-sidebar-text': sidebarAppearance === 'dark' ? '#e5e7eb' : '#4b5563',
      '--app-sidebar-muted': sidebarAppearance === 'dark' ? '#9ca3af' : '#9ca3af',
      '--app-sidebar-border': sidebarAppearance === 'dark' ? '#374151' : '#d1d5db',
      '--app-sidebar-highlight-text': getContrastingTextColor(surfaceColors.sidebarHighlight),
      '--app-sidebar-avatar': sidebarAppearance === 'dark' ? '#374151' : '#fafcfb',
      '--app-sidebar-avatar-text': sidebarAppearance === 'dark' ? '#f9fafb' : palette.shades[8],
      '--app-content-background': surfaceColors.contentBackground,
      '--app-loader': surfaceColors.loader,
    }),
    [palette, sidebarAppearance, surfaceColors],
  )

  useLayoutEffect(() => {
    const root = document.documentElement
    Object.entries(themeVariables).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })
  }, [themeVariables])

  return (
    <ThemeContext.Provider
      value={{
        palette,
        setPaletteId,
        sidebarAppearance,
        setSidebarAppearance,
        surfaceColors,
        surfaceOverrides: overrides,
        setSurfaceColor,
        resetSurfaceColor,
        resetThemeCustomization,
        headerStyle,
        setHeaderStyle,
      }}
    >
      <MantineProvider theme={theme} forceColorScheme="light">
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  )
}
