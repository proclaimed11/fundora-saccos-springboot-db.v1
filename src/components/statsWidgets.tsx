import { AppIcon } from './appIcon'
import { Card, Skeleton } from '@mantine/core'

type StatWidgetProps = {
  value: string | number
  label: string
  /** Lucide icon name, e.g. 'users' */
  icon: string
  /** icon color, any CSS color */
  color: string
  /** optional override for the value color, defaults to the normal dark text */
  valueColor?: string
  /** optional unit label; overrides the TZS prefix when the value is formatted as currency */
  miniLabel?: string | null
  /** percent change vs the comparison period; positive is up, negative is down */
  change?: number
  /** comparison label shown next to the change, e.g. 'vs Sep 1 - Sep 30' */
  changeLabel?: string
  /** makes the whole card clickable */
  onClick?: () => void
  loading?: boolean
}

function formatChange(change: number) {
  return `${Math.abs(change).toFixed(2)}%`
}

export function StatWidget({
  value,
  label,
  icon,
  color,
  valueColor,
  miniLabel,
  change,
  changeLabel = 'vs last period',
  onClick,
  loading = false,
}: StatWidgetProps) {
  const Tag = onClick ? 'button' : 'div'
  const hasTzsPrefix = typeof value === 'string' && value.startsWith('TZS ')
  const hasCustomCurrencyLabel = hasTzsPrefix && miniLabel !== undefined
  const displayUnit = miniLabel && !hasTzsPrefix ? miniLabel : null
  const isUp = change !== undefined && change >= 0
  const showChange = change !== undefined

  return (
    <Card
      padding={0}
      radius="md"
      withBorder
      shadow="none"
      className={`overflow-hidden border-gray-200/80 shadow-[0_8px_24px_rgba(76,87,125,0.08)] ${
        onClick ? 'transition-colors hover:border-gray-300' : ''
      }`}
    >
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`flex min-h-[76px] w-full items-center justify-between gap-3 px-3 py-2 text-left ${
          onClick
            ? 'cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300'
            : ''
        }`}
      >
        {loading ? (
          <>
            <div className="min-w-0 flex-1">
              <Skeleton height={10} width={90} mb={6} />
              <Skeleton height={20} width={110} mb={6} />
              <Skeleton height={10} width={140} />
            </div>
            <Skeleton height={44} width={44} circle className="shrink-0" />
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-normal leading-none text-slate-500">
                {label}
              </div>
              <div
                className="my-1 truncate text-[18px] font-medium leading-tight tracking-tight text-slate-800"
                style={valueColor ? { color: valueColor } : undefined}
              >
                {hasCustomCurrencyLabel ? (
                  <>
                    {miniLabel && (
                      <span className="mr-1 text-sm font-semibold text-slate-900">
                        {miniLabel}
                      </span>
                    )}
                    {value.slice(4)}
                  </>
                ) : (
                  value
                )}
                {displayUnit && (
                  <span className="ml-1 text-sm font-semibold text-slate-900">
                    {displayUnit}
                  </span>
                )}
              </div>
              {showChange && (
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-tight">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      isUp ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    <span aria-hidden="true" className="text-[9px]">
                      {isUp ? '▲' : '▼'}
                    </span>
                    {formatChange(change)}
                  </span>
                  <span className="min-w-0 text-slate-400">{changeLabel}</span>
                </div>
              )}
            </div>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-transparent"
              style={{ color }}
              aria-hidden="true"
            >
              <AppIcon name={icon} size={19} strokeWidth={1.75} />
            </span>
          </>
        )}
      </Tag>
    </Card>
  )
}