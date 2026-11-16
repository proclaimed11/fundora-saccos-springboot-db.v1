import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Text } from '@mantine/core'
import { ContentCard } from '../contentCard'
import { AppIcon } from '../appIcon'
import { initials } from '../../pages/applicants/applicantsData'

export type QueueRow = {
  id: number | string
  /** main line, usually the borrower */
  title: string
  /** small line under it, e.g. the application number */
  sub: string
  /** value on the right, e.g. an amount */
  value: string
  /** small line under the value, e.g. "Waiting 5 days" */
  valueSub?: string
  /** highlight the waiting text in amber */
  late?: boolean
  /** where the row goes when clicked */
  to: string
}

export type QueueTab = {
  value: string
  label: string
  rows: QueueRow[]
  viewAllTo: string
  emptyText: string
}

type QueueCardProps = {
  title: string
  tabs: QueueTab[]
}

export function QueueCard({ title, tabs }: QueueCardProps) {
  const navigate = useNavigate()
  const [selectedValue, setSelectedValue] = useState(tabs[0]?.value ?? '')
  const selectedTab = tabs.find((tab) => tab.value === selectedValue) ?? tabs[0]

  if (!selectedTab) return null

  const shown = selectedTab.rows.slice(0, 3)
  const hidden = selectedTab.rows.length - shown.length
  return (
    <ContentCard
      title={title}
      headerColor="#fcfdfc"
      headerTextColor="#1f2937"
      flush
    >
      <div className="scrollbar-hidden mb-3 max-w-full overflow-x-auto px-3 pt-3">
        <div role="group" aria-label="Queue categories" className="flex w-max min-w-full border-b border-gray-100">
          {tabs.map((tab) => {
            const selected = tab.value === selectedTab.value
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedValue(tab.value)}
                className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${
                  selected
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 ${selected ? 'text-brand' : 'text-gray-400'}`}>
                  {tab.rows.length}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          {selectedTab.emptyText}
        </Text>
      ) : (
        <ul>
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => navigate(r.to)}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-[11px] font-medium text-brand-dark">
                  {initials(r.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800">{r.title}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {r.sub}
                    {r.valueSub && (
                      <>
                        {' · '}
                        <span className={r.late ? 'font-medium text-amber-600' : ''}>{r.valueSub}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-sm font-medium text-gray-800">{r.value}</span>
                <AppIcon
                  name="chevron-right"
                  size={14}
                  className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <Text size="xs" c="dimmed" ta="center" py={8} className="border-t border-gray-100">
          + {hidden} more
        </Text>
      )}

      <div className="flex justify-end border-t border-gray-100 px-3 py-2">
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => navigate(selectedTab.viewAllTo)}>
          View all
        </Button>
      </div>
    </ContentCard>
  )
}