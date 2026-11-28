import { AppIcon } from '../appIcon'
import { ActionIcon, Autocomplete } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useEffect, useRef, useState } from 'react'

// the shortcut hint shows ⌘ K on a Mac and Ctrl K elsewhere (the hotkey "mod+K" handles both)
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
// the same width as Tailwind's xl, where the full search box replaces the icon
const WIDE_SCREEN = '(min-width: 80rem)'
import { visibleSections } from './navItems'
import { useRoles } from '../../pages/administration/roles/rolesContext'

/** fluid: fill the space the header gives it (it shrinks when the breadcrumb is long) instead of a fixed width */
export function NavSearch({ onNavigate, fluid = false }: { onNavigate: (key: string) => void; fluid?: boolean }) {
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  // the box is narrower at rest and widens while typing
  const [focused, setFocused] = useState(false)
  const { can } = useRoles()

  // Ctrl+K (⌘K on a Mac) from anywhere: focus the box, or open the small search on narrower screens
  useHotkeys(
    [
      [
        'mod+K',
        () => {
          if (window.matchMedia(WIDE_SCREEN).matches) desktopInputRef.current?.focus()
          else setMobileOpen(true)
        },
      ],
    ],
    [], // works even while another input has the cursor
  )
  // search only offers the pages the current role may open
  const searchItems = visibleSections(can).flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.label })),
  )
  
  const suggestions = searchItems.map((item) => ({
    value: item.label,
    label: item.label,
  }))

  useEffect(() => {
    if (mobileOpen) {
      mobileInputRef.current?.focus()
    }
  }, [mobileOpen])

  const selectSuggestion = (label: string) => {
    const item = searchItems.find((candidate) => candidate.label === label)
    if (item) {
      setQuery('')
      setMobileOpen(false)
      onNavigate(item.key)
    }
  }

  const renderOption = ({ option }: { option: { value: string } }) => {
    const item = searchItems.find((candidate) => candidate.label === option.value)
    return (
      <div className="flex items-center gap-2">
        {item && <AppIcon name={item.icon} size={14} className="shrink-0 text-gray-500" />}
        <span className="flex-1">{item?.label ?? option.value}</span>
        {item && <span className="text-xs text-gray-400">{item.section}</span>}
      </div>
    )
  }

  return (
    <>
      <Autocomplete
        ref={desktopInputRef}
        aria-label="Search pages"
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        placeholder="Search or jump to…"
        value={query}
        onChange={setQuery}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data={suggestions}
        dropdownOpened={query.trim().length > 0}
        limit={6}
        maxDropdownHeight={320}
        onOptionSubmit={selectSuggestion}
        renderOption={renderOption}
        leftSection={<AppIcon name="search" size={14} strokeWidth={1.5} className="text-brand" />}
        // the shortcut hint, hidden while typing so it never covers the text
        rightSection={
          focused || query ? null : (
            // a small theme-tinted key cap: brand-coloured text on a faint brand wash, with a soft brand edge
            <span
              aria-hidden="true"
              className="pointer-events-none inline-flex items-center gap-0.5 whitespace-nowrap rounded-[5px] border border-[color-mix(in_srgb,var(--app-brand)_28%,transparent)] border-b-[color-mix(in_srgb,var(--app-brand)_45%,transparent)] bg-[color-mix(in_srgb,var(--app-brand)_8%,white)] px-1.5 py-px text-[10px] font-semibold leading-4 text-[var(--app-brand)]"
            >
              {IS_MAC ? '⌘' : 'Ctrl'}
              <span className="opacity-60">+</span>K
            </span>
          )
        }
        rightSectionWidth={60}
        size="xs"
        radius="md"
        // 15rem at rest (was 18rem), back to 18rem while in use
        className={`hidden transition-[width] duration-200 ease-out xl:block ${
          fluid ? 'w-full' : `max-w-[28vw] ${focused ? 'w-72' : 'w-60'}`
        }`}
        classNames={{
          input:
            'border border-emerald-900/10 bg-[#f7faf8] text-slate-700 placeholder:text-slate-500 hover:bg-white focus:bg-white',
          dropdown: 'z-50',
        }}
        styles={{
          input: { backgroundColor: '#f7faf8', color: '#33443c' },
          section: { color: '#64746b' },
        }}
      />
      <div className="flex min-w-0 items-center xl:hidden">
        <div
          className="overflow-hidden transition-[width,opacity] duration-200 ease-out"
          style={{
            width: mobileOpen ? 'min(14rem, 55vw)' : 0,
            opacity: mobileOpen ? 1 : 0,
          }}
          aria-hidden={!mobileOpen}
        >
          <Autocomplete
            ref={mobileInputRef}
            aria-label="Search pages"
            disabled={!mobileOpen}
            placeholder="Search…"
            value={query}
            onChange={setQuery}
            data={suggestions}
            dropdownOpened={mobileOpen && query.trim().length > 0}
            limit={6}
            maxDropdownHeight={320}
            onOptionSubmit={selectSuggestion}
            renderOption={renderOption}
            leftSection={<AppIcon name="search" size={14} strokeWidth={1.5} className="text-brand" />}
            size="xs"
            radius="md"
            className="w-56"
            classNames={{
              input:
                'border border-emerald-900/10 bg-[#f7faf8] text-slate-700 placeholder:text-slate-500 hover:bg-white focus:bg-white',
              dropdown: 'z-50',
            }}
            styles={{
              input: { backgroundColor: '#f7faf8', color: '#33443c' },
              section: { color: '#64746b' },
            }}
          />
        </div>
        <ActionIcon
          variant="subtle"
          size="lg"
          className="shrink-0 text-slate-700 hover:bg-emerald-950/5"
          aria-label={mobileOpen ? 'Close search' : 'Search'}
          onClick={() => {
            setMobileOpen((open) => !open)
            if (mobileOpen) {
              setQuery('')
            }
          }}
        >
          <AppIcon name="search" size={18} strokeWidth={1.5} />
        </ActionIcon>
      </div>
    </>
  )
}