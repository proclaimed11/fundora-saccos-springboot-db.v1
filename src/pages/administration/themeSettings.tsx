import { useEffect, useState } from 'react'
import { Alert, Button, ColorInput, SegmentedControl, Text } from '@mantine/core'
import { AppIcon } from '../../components/appIcon'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import {
  useAppTheme,
  themeSurfaces,
  type HeaderStyle,
  type SidebarAppearance,
  type ThemeSurfaceColors,
} from '../../theme/themeContext'
import { themePalettes } from '../../theme/themePalettes'

const CARD = 'rounded-md bg-white p-4 shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

const isHexColor = (value: string) => /^#[\da-f]{6}$/i.test(value)

// the header looks the user can switch between
const HEADER_OPTIONS: { id: HeaderStyle; name: string; description: string }[] = [
  { id: 'botanical', name: 'Botanical', description: 'The current header with the leaf pattern in your brand color.' },
  { id: 'texture', name: 'Soft texture', description: 'A calm, light texture with flowing lines.' },
]

/* ---------- a color field that can be typed in ---------- */

type ColorFieldProps = {
  label: string
  value: string
  swatches: string[]
  onCommit: (color: string) => void
}

// keeps what is being typed or dragged as a draft, and saves it once it is a valid color and has settled
function ColorField({ label, value, swatches, onCommit }: ColorFieldProps) {
  const [draft, setDraft] = useState(value)

  // a reset or another change elsewhere updates the field
  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (draft.toLowerCase() === value || !isHexColor(draft)) return
    const t = setTimeout(() => onCommit(draft), 250)
    return () => clearTimeout(t)
  }, [draft, value, onCommit])

  return (
    <ColorInput
      aria-label={`${label} color`}
      format="hex"
      value={draft}
      onChange={setDraft}
      swatches={swatches}
      swatchesPerRow={10}
    />
  )
}

/* ---------- live preview ---------- */

const PREVIEW_NAV = [
  { icon: 'gauge', label: 'Dashboard', active: true },
  { icon: 'users', label: 'Applicants' },
  { icon: 'hand-coins', label: 'Loans' },
]

function LivePreview({
  colors,
  sidebarAppearance,
}: {
  colors: ThemeSurfaceColors
  sidebarAppearance: SidebarAppearance
}) {
  const dark = sidebarAppearance === 'dark'

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <div className="flex h-56">
        {/* sidebar */}
        <div
          className="w-28 shrink-0 py-2"
          style={{ backgroundColor: dark ? '#1f2937' : '#ffffff', color: dark ? '#e5e7eb' : '#4b5563' }}
        >
          {PREVIEW_NAV.map((item) => (
            <div
              key={item.label}
              className="relative flex items-center gap-2 px-3 py-1.5 text-[11px]"
              style={
                item.active
                  ? { backgroundColor: colors.sidebarHighlight, color: 'var(--app-sidebar-highlight-text)' }
                  : undefined
              }
            >
              {item.active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: colors.sidebarIndicator }}
                />
              )}
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
                style={{
                  borderColor: item.active ? 'transparent' : dark ? '#374151' : '#d1d5db',
                  backgroundColor: item.active ? colors.primary : 'transparent',
                  color: item.active ? '#ffffff' : dark ? '#e5e7eb' : '#4b5563',
                }}
              >
                <AppIcon name={item.icon} size={13} />
              </span>
              {item.label}
            </div>
          ))}
        </div>

        {/* page */}
        <div className="flex-1 p-3" style={{ backgroundColor: colors.contentBackground }}>
          <div className="rounded bg-white p-3 shadow-sm">
            <div className="h-2 w-16 rounded bg-gray-300" />
            <div className="mt-2 h-2 w-24 rounded bg-gray-100" />
            <div className="mt-3 h-1.5 rounded-full bg-gray-100">
              <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: colors.primary }} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className="rounded px-2.5 py-1 text-[11px] font-medium text-white"
                style={{ backgroundColor: colors.primary }}
              >
                Save
              </span>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200"
                style={{ borderTopColor: colors.loader }}
                aria-label="Loader preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function ThemeSettingsPage() {
  const {
    palette,
    setPaletteId,
    sidebarAppearance,
    setSidebarAppearance,
    headerStyle,
    setHeaderStyle,
    surfaceColors,
    surfaceOverrides,
    setSurfaceColor,
    resetSurfaceColor,
    resetThemeCustomization,
  } = useAppTheme()

  const hasCustomColors =
    Object.keys(surfaceOverrides).length > 0 ||
    palette.id !== 'green' ||
    sidebarAppearance !== 'dark' ||
    headerStyle !== 'botanical'

  return (
    <DashboardLayout
      title="Theme Settings"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Theme Settings' }]}
      subtitle="Manage the appearance of your workspace."
      actions={
        <Button
          size="xs"
          variant="default"
          disabled={!hasCustomColors}
          leftSection={<AppIcon name="refresh-cw" />}
          onClick={resetThemeCustomization}
        >
          Reset to default
        </Button>
      }
    >
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* palettes */}
          <section aria-labelledby="theme-presets-heading" className={CARD}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand-dark">
                <AppIcon name="palette" size={20} strokeWidth={1.25} />
              </div>
              <div>
                <Text id="theme-presets-heading" size="md" fw={600}>
                  Theme palettes
                </Text>
                <Text size="xs" c="dimmed">
                  Pick a ready-made palette for the whole workspace.
                </Text>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {themePalettes.map((option) => {
                const isSelected = palette.id === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setPaletteId(option.id)}
                    className={`rounded-md border bg-white p-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                      isSelected ? 'border-brand ring-2 ring-brand' : 'border-gray-200'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-800">{option.name}</span>
                      {isSelected && <AppIcon name="circle-check" className="text-brand" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">{option.description}</span>
                    <span className="mt-3 flex h-8 overflow-hidden rounded">
                      {option.shades.map((shade, i) => (
                        <span key={i} className="flex-1" style={{ backgroundColor: shade }} title={shade} />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>

            {surfaceOverrides.primary && (
              <Alert color="yellow" variant="light" icon={<AppIcon name="info" />} mt="md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text size="sm">
                    A custom primary color is set, so buttons and charts ignore the palette's main shade.
                  </Text>
                  <Button size="compact-xs" variant="default" onClick={() => resetSurfaceColor('primary')}>
                    Use palette color
                  </Button>
                </div>
              </Alert>
            )}
          </section>

          {/* header background */}
          <section aria-labelledby="theme-header-heading" className={CARD}>
            <div className="mb-4">
              <Text id="theme-header-heading" size="md" fw={600}>
                Header background
              </Text>
              <Text size="xs" c="dimmed">
                Choose the look of the band at the top of every page.
              </Text>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {HEADER_OPTIONS.map((option) => {
                const isSelected = headerStyle === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setHeaderStyle(option.id)}
                    className={`rounded-md border bg-white p-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                      isSelected ? 'border-brand ring-2 ring-brand' : 'border-gray-200'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-800">{option.name}</span>
                      {isSelected && <AppIcon name="circle-check" className="text-brand" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">{option.description}</span>

                    {/* small preview of the header band */}
                    <span
                      className={`mt-3 block h-14 rounded border border-gray-200 ${
                        option.id === 'texture' ? 'texture-pattern' : ''
                      }`}
                      style={
                        option.id === 'texture'
                          ? undefined
                          : {
                              backgroundColor: '#ffffff',
                              backgroundImage: `radial-gradient(ellipse 90px 24px at 15% 100%, color-mix(in srgb, ${surfaceColors.primary} 18%, white) 0 60%, transparent 64%), radial-gradient(ellipse 90px 24px at 85% 100%, color-mix(in srgb, ${surfaceColors.primary} 18%, white) 0 60%, transparent 64%)`,
                            }
                      }
                    />
                  </button>
                )
              })}
            </div>
          </section>

          {/* individual colors */}
          <section aria-labelledby="theme-customization-heading" className={CARD}>
            <div className="mb-4">
              <Text id="theme-customization-heading" size="md" fw={600}>
                Customize application colors
              </Text>
              <Text size="xs" c="dimmed">
                Type a hex code or use the picker. Changes show in the preview and are saved on this device.
              </Text>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {themeSurfaces.map(({ id, label, description }) => (
                <div key={id} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: surfaceColors[id] }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <Text size="sm" fw={600}>
                          {label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {description}
                        </Text>
                      </div>
                    </div>
                    {surfaceOverrides[id] && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={() => resetSurfaceColor(id)}
                        aria-label={`Reset ${label} color`}
                      >
                        Reset
                      </Button>
                    )}
                  </div>

                  {id === 'sidebarHighlight' && (
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      value={sidebarAppearance}
                      onChange={(value) => {
                        if (value === 'light' || value === 'dark') setSidebarAppearance(value)
                      }}
                      data={[
                        { label: 'Light sidebar', value: 'light' },
                        { label: 'Dark sidebar', value: 'dark' },
                      ]}
                      mt="sm"
                      aria-label="Sidebar appearance"
                    />
                  )}

                  <div className="mt-3">
                    <ColorField
                      label={label}
                      value={surfaceColors[id]}
                      swatches={[...palette.shades]}
                      onCommit={(color) => setSurfaceColor(id, color)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* live preview, stays in view while the colors are edited */}
        <aside className={`${CARD} xl:sticky xl:top-4`}>
          <Text size="md" fw={600}>
            Live preview
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            How your choices look together.
          </Text>
          <LivePreview colors={surfaceColors} sidebarAppearance={sidebarAppearance} />
          <Text size="xs" c="dimmed" mt="sm">
            Palette: {palette.name} · Sidebar: {sidebarAppearance === 'dark' ? 'Dark' : 'Light'} · Header:{' '}
            {headerStyle === 'texture' ? 'Soft texture' : 'Botanical'}
          </Text>
        </aside>
      </div>
    </DashboardLayout>
  )
}