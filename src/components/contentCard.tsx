import type { ReactNode } from 'react'
import { Card, Text } from '@mantine/core'

type ContentCardProps = {
  /** optional heading shown at the top of the card */
  title?: string
  /** optional element at the right end of the heading, e.g. a button or icon */
  action?: ReactNode
  /** colors the title bar, e.g. '#268a0f'. Without it the title is plain text */
  headerColor?: string
  /** text color on the colored title bar, default white */
  headerTextColor?: string
  /** remove inner padding, useful for tables that go edge to edge */
  flush?: boolean
  className?: string
  children: ReactNode
}

// soft, wide, slightly blue-gray shadow like the reference card
const CARD_SHADOW = 'shadow-[0_4px_16px_rgba(76,87,125,0.06)]'

export function ContentCard({
  title,
  action,
  headerColor,
  headerTextColor = 'white',
  flush = false,
  className = '',
  children,
}: ContentCardProps) {
  const hasHeader = Boolean(title || action)

  return (
    <Card
      component="section"
      padding={0}
      radius="md"
      shadow="none"
      className={`border border-gray-100 bg-white ${CARD_SHADOW} ${className}`}
    >
      {hasHeader &&
        (headerColor ? (
          <div
            className="flex items-center justify-between gap-2 rounded-t-md border-b border-gray-100 px-4 py-2.5"
            style={{ backgroundColor: headerColor, color: headerTextColor }}
          >
            {title && (
              <Text size="sm" fw={600} c={headerTextColor}>
                {title}
              </Text>
            )}
            {action}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            {title && (
              <Text size="sm" fw={600}>
                {title}
              </Text>
            )}
            {action}
          </div>
        ))}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </Card>
  )
}