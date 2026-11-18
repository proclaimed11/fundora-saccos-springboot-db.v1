import { AppIcon } from './appIcon'
import { Card, Skeleton } from '@mantine/core'

type StatWidgetProps = {
  value: string | number
  label: string
  /** Lucide icon name, e.g. 'users' */
  icon: string
  /** color of the icon circle, any CSS color */
  color: string
  /** optional override for the value color, defaults to the normal dark text */
  valueColor?: string
  /** optional unit label; overrides the TZS prefix when the value is formatted as currency */
  miniLabel?: string | null
  /** percent change vs the comparison period; positive is up, negative is down */
  change?: number
  /** text before the change, e.g. 'Grow rate' or 'vs Sep 1 - Sep 30' */
  changeLabel?: string
  /** whether going up is good or bad, default 'up-good' */
  trend?: 'up-good' | 'up-bad'
  /** small context line under the value when there is no change, e.g. '3 need action' */
  hint?: string
  /** optional progress bar, 0 to 100 */
  progress?: number
  /** makes the whole card clickable */
  onClick?: () => void
  loading?: boolean
}

const formatChange = (change: number) => `${Math.abs(change).toFixed(1)}%`

// long currency values shrink instead of being cut off
const sizeFor = (text: string) =>
  text.length > 16 ? 'text-[20px]' : text.length > 12 ? 'text-[24px]' : text.length > 8 ? 'text-[28px]' : 'text-[34px]'

export function StatWidget({
  value,
  label,
  icon,
  color,
  valueColor,
  miniLabel,
  change,
  changeLabel = 'vs last period',
  trend = 'up-good',
  hint,
  progress,
  onClick,
  loading = false,
}: StatWidgetProps) {
  const Tag = onClick ? 'button' : 'div'

  const text = String(value)
  const hasTzsPrefix = typeof value === 'string' && value.startsWith('TZS ')
  // "TZS 3,000,000" -> prefix "TZS" and number "3,000,000"
  const prefix = hasTzsPrefix ? (miniLabel === undefined ? 'TZS' : miniLabel) : null
  const shown = hasTzsPrefix ? text.slice(4) : text
  const suffix = !hasTzsPrefix && miniLabel ? miniLabel : null

  const hasChange = change !== undefined
  const flat = hasChange && Math.abs(change) < 0.05
  const up = hasChange && change >= 0
  const good = trend === 'up-good' ? up : !up
  const changeColor = flat ? 'text-slate-400' : good ? 'text-sky-500' : 'text-red-500'

  return (
    <Card
      padding={0}
      radius="md"
      withBorder={false}
      shadow="none"
      className={`border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-150 ${
        onClick ? 'hover:border-slate-300 hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)]' : ''
      }`}
    >
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`flex w-full items-center gap-4 p-4 text-left ${
          onClick
            ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300'
            : ''
        }`}
      >
        {loading ? (
          <>
            <Skeleton height={56} width={56} circle />
            <div className="flex-1 space-y-2">
              <Skeleton height={10} width={100} />
              <Skeleton height={28} width={90} />
              <Skeleton height={10} width={120} />
            </div>
          </>
        ) : (
          <>
            {/* solid circle with a white icon */}
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              <AppIcon name={icon} size={24} strokeWidth={1.75} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-slate-500">{label}</div>

              <div
                title={text}
                className={`mt-0.5 flex items-baseline gap-1.5 truncate font-extrabold leading-tight tracking-tight text-slate-800 tabular-nums ${sizeFor(shown)}`}
                style={valueColor ? { color: valueColor } : undefined}
              >
                {prefix && <span className="text-[12px] font-semibold tracking-wide text-slate-400">{prefix}</span>}
                <span className="truncate">{shown}</span>
                {suffix && <span className="text-[12px] font-medium text-slate-400">{suffix}</span>}
              </div>

              {progress !== undefined && (
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, Math.max(0, progress)))}
                  aria-label={label}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: color }}
                  />
                </div>
              )}

              {hasChange ? (
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-tight">
                  <span className="truncate text-slate-500">{changeLabel}:</span>
                  <span className={`inline-flex shrink-0 items-center gap-0.5 font-medium ${changeColor}`}>
                    {flat ? (
                      <span aria-hidden="true">–</span>
                    ) : (
                      <AppIcon name={up ? 'chevron-up' : 'chevron-down'} size={14} strokeWidth={2.5} />
                    )}
                    {formatChange(change)}
                    <span className="sr-only">{flat ? 'no change' : up ? 'increase' : 'decrease'}</span>
                  </span>
                </div>
              ) : (
                hint && <div className="mt-1 truncate text-[13px] text-slate-400">{hint}</div>
              )}
            </div>
          </>
        )}
      </Tag>
    </Card>
  )
}