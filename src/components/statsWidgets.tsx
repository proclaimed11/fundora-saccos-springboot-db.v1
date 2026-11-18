import { AppIcon } from './appIcon'
import { Card, Skeleton } from '@mantine/core'

type StatWidgetProps = {
  value: string | number
  label: string
  /** Lucide icon name, e.g. 'users' */
  icon: string
  /** accent color of the icon tile, any CSS color */
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

const formatChange = (change: number) => `${Math.abs(change).toFixed(2)}%`

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
  const showChange = change !== undefined
  const isUp = change !== undefined && change >= 0

  return (
    <Card
      padding={0}
      radius="lg"
      withBorder={false}
      shadow="none"
      className={`border border-slate-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(76,87,125,0.08)] transition duration-200 ${
        onClick ? 'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.05),0_14px_32px_rgba(76,87,125,0.14)]' : ''
      }`}
    >
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`flex w-full flex-col gap-3 p-4 text-left ${
          onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300' : ''
        }`}
      >
        {loading ? (
          <>
            <div className="flex items-center justify-between">
              <Skeleton height={10} width={90} />
              <Skeleton height={36} width={36} radius="md" />
            </div>
            <Skeleton height={22} width={130} />
            <Skeleton height={14} width={150} />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[12.5px] font-medium text-slate-500">{label}</span>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} 12%, white)`,
                }}
              >
                <AppIcon name={icon} size={18} strokeWidth={1.75} />
              </span>
            </div>

            <div
              className="truncate text-[24px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums"
              style={valueColor ? { color: valueColor } : undefined}
            >
              {hasCustomCurrencyLabel ? (
                <>
                  {miniLabel && (
                    <span className="mr-1.5 text-[12px] font-medium tracking-normal text-slate-400">{miniLabel}</span>
                  )}
                  {value.slice(4)}
                </>
              ) : (
                value
              )}
              {displayUnit && (
                <span className="ml-1.5 text-[12px] font-medium tracking-normal text-slate-400">{displayUnit}</span>
              )}
            </div>

            {showChange && (
              <div className="flex min-w-0 items-center gap-2 text-[11px] leading-none">
                <span
                  className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-1 font-semibold ${
                    isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                  }`}
                >
                  <AppIcon name={isUp ? 'arrow-up' : 'arrow-down'} size={11} strokeWidth={2.5} />
                  {formatChange(change)}
                </span>
                <span className="min-w-0 truncate text-slate-400">{changeLabel}</span>
              </div>
            )}
          </>
        )}
      </Tag>
    </Card>
  )
}