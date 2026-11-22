import { AppIcon } from './appIcon'

export type CustomTabItem = {
  value: string
  label: string
  count?: number
  icon?: string
}

type CustomTabsProps = {
  tabs: CustomTabItem[]
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

export function CustomTabs({
  tabs,
  value,
  onChange,
  ariaLabel = 'Tabs',
  className = 'px-3 pb-1 pt-3',
}: CustomTabsProps) {
  return (
    <div
      className={`scrollbar-hidden max-w-full overflow-x-auto overscroll-x-contain ${className}`}
      onWheel={(event) => {
        const scroller = event.currentTarget
        const maxScroll = scroller.scrollWidth - scroller.clientWidth
        if (maxScroll <= 0) return

        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        const nextScroll = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + delta))
        if (nextScroll !== scroller.scrollLeft) {
          scroller.scrollLeft = nextScroll
          event.preventDefault()
        }
      }}
    >
      <div role="tablist" aria-label={ariaLabel} className="flex w-max min-w-full justify-between gap-1 px-1 py-1">
        {tabs.map((tab) => {
          const selected = tab.value === value
          const countMatch = tab.count === undefined ? tab.label.match(/^(.*) \((\d+)\)$/) : null
          const label = countMatch?.[1] ?? tab.label
          const count = tab.count ?? (countMatch ? Number(countMatch[2]) : undefined)

          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className={`flex w-max flex-none items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-center text-xs font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                selected
                  ? 'bg-white text-brand shadow-xs'
                  : 'bg-gray-50/60 text-gray-500 hover:bg-gray-100/70 hover:text-gray-800'
              }`}
            >
              {tab.icon && <AppIcon name={tab.icon} size={13} className="shrink-0" />}
              <span>{label}</span>
              {count !== undefined && (
                <span
                  className={`inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border px-1 text-[10px] font-semibold leading-none ${
                    // inactive: the same translucent brand tint and brand-coloured text as the header's user avatar
                    // (Mantine's "light" brand variant); the border stays see-through so the size never shifts
                    selected
                      ? 'border-transparent bg-brand text-white'
                      : 'border-transparent bg-[var(--mantine-color-brand-light)] text-[var(--mantine-color-brand-light-color)]'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
