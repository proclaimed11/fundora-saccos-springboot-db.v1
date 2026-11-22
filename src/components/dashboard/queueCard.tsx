import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionIcon, Button, Menu, Text } from '@mantine/core'
import { ContentCard } from '../contentCard'
import { AppIcon } from '../appIcon'
import { CustomTabs } from '../customTabs'

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
  /** whether this item is overdue */
  late?: boolean
  /** where the row goes when clicked */
  to: string
}

export type QueueTab = {
  value: string
  label: string
  /** an icon name registered in appIcon.tsx */
  icon?: string
  rows: QueueRow[]
  viewAllTo: string
  emptyText: string
}

type QueueCardProps = {
  title: string
  subtitle?: string
  notificationCount?: number
  tabs: QueueTab[]
}

export function QueueCard({ title, subtitle, notificationCount, tabs }: QueueCardProps) {
  const navigate = useNavigate()
  const [selectedValue, setSelectedValue] = useState(tabs[0]?.value ?? '')
  const selectedTab = tabs.find((tab) => tab.value === selectedValue) ?? tabs[0]

  if (!selectedTab) return null

  const shown = selectedTab.rows.slice(0, 3)
  const hidden = selectedTab.rows.length - shown.length

  return (
    <ContentCard flush>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Text size="sm" fw={600}>{title}</Text>
            {notificationCount !== undefined && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-50 px-1.5 text-[10px] font-semibold text-red-500">
                {notificationCount}
              </span>
            )}
          </div>
          {subtitle && (
            <Text size="xs" c="dimmed" mt={3}>
              {subtitle}
            </Text>
          )}
        </div>
        <Menu position="bottom-end" shadow="sm">
          <Menu.Target>
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Queue actions">
              <AppIcon name="ellipsis-vertical" size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {tabs.map((tab) => (
              <Menu.Item key={tab.value} onClick={() => navigate(tab.viewAllTo)}>
                View all {tab.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>

      <CustomTabs
        ariaLabel="Queue categories"
        className="w-fit px-3 pb-1 pt-2"
        tabs={tabs.map((tab) => ({
          value: tab.value,
          label: tab.label,
          count: tab.rows.length,
          icon: tab.icon,
        }))}
        value={selectedTab.value}
        onChange={setSelectedValue}
      />

      {shown.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Text size="sm" fw={500}>
            All caught up
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            {selectedTab.emptyText}
          </Text>
        </div>
      ) : (
        <ul className="px-2 pt-2">
          {shown.map((r) => (
            <li key={r.id} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                onClick={() => navigate(r.to)}
                className="group flex w-full items-center gap-3 px-2.5 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800">{r.title}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {r.sub}
                    {r.valueSub && (
                      <>
                        {' · '}
                        <span className="text-red-400">{r.valueSub}</span>
                      </>
                    )}
                  </span>
                </span>

                <span className="shrink-0 whitespace-nowrap text-sm font-medium text-gray-700">{r.value}</span>
                <AppIcon
                  name="chevron-right"
                  size={14}
                  className="shrink-0 text-gray-300 group-hover:text-brand"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative z-10 mt-1 flex items-center justify-between border-t border-gray-100 bg-white px-4 py-3">
        <Text size="xs" c="dimmed">
          {hidden > 0 ? `+ ${hidden} more not shown` : ' '}
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          color="brand"
          rightSection={<AppIcon name="chevron-right" size={12} />}
          onClick={() => navigate(selectedTab.viewAllTo)}
        >
          View all
        </Button>
      </div>
    </ContentCard>
  )
}