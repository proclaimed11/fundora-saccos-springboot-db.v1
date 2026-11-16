import { AppIcon } from './appIcon'
import { useState, type ReactNode } from 'react'
import { ActionIcon, Button, Menu, Modal, Text } from '@mantine/core'
import { ContentCard } from './contentCard'
import { DateRangeFilter } from './dashboard/dateRangeFilter'

const DOWNLOADS = [
  { label: 'CSV', icon: 'file-text' },
  { label: 'PDF', icon: 'file-text' },
  { label: 'Image', icon: 'file-image' },
]

type ChartCardProps = {
  title: string
  subtitle?: string
  className?: string
  /** chart body; receives the height to draw at (small in the card, large in the modal) */
  children: (height: number) => ReactNode
  /** line under the chart, e.g. a total. Shown in the card and in the modal */
  footer?: ReactNode
  /** chart height inside the card, in px */
  cardHeight?: number
}

export function ChartCard({
  title,
  subtitle,
  className,
  children,
  footer,
  cardHeight = 240,
}: ChartCardProps) {
  const [open, setOpen] = useState(false)

  const actions = (
    <Menu position="bottom-end" shadow="md" width={190}>
      <Menu.Target>
        <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${title} chart options`}>
          <AppIcon name="ellipsis-vertical" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<AppIcon name="maximize" />} onClick={() => setOpen(true)}>
          Preview graph
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Download as</Menu.Label>
        {DOWNLOADS.map((d) => (
          <Menu.Item key={d.label} leftSection={<AppIcon name={d.icon} />}>
            {d.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )

  return (
    <>
      <ContentCard className={className} flush>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-3">
          <div className="min-w-0">
            <Text size="sm" fw={600}>{title}</Text>
            {subtitle && (
              <Text size="xs" c="dimmed" mt={3}>
                {subtitle}
              </Text>
            )}
          </div>
          {actions}
        </div>
        <div className="p-4">
          {children(cardHeight)}
          {footer && (
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              {footer}
            </div>
          )}
        </div>
      </ContentCard>

      <Modal opened={open} onClose={() => setOpen(false)} title={title} size={960} centered>
        <div className="space-y-4">
          {/* filters + report downloads */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <DateRangeFilter onApply={() => {}} />
            <div className="flex items-center gap-2">
              {DOWNLOADS.map((d) => (
                <Button
                  key={d.label}
                  size="xs"
                  variant="default"
                  leftSection={<AppIcon name={d.icon} />}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {/* the same chart, drawn larger */}
          {children(380)}

          {footer && (
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              {footer}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}