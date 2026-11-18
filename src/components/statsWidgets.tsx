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

// the number is shortened only when the full text is too long for the card
const MAX_FULL = 9

const UNITS = [
  { value: 1e12, label: 'T' },
  { value: 1e9, label: 'B' },
  { value: 1e6, label: 'M' },
  { value: 1e3, label: 'K' },
]

// "10,000,000" -> "10M", "1,250,000,000" -> "1.25B", short values are left as they are
// "10,000,000" -> { num: "10", unit: "M" }, short values keep an empty unit
function shorten(text: string): { num: string; unit: string } {
  if (text.length <= MAX_FULL) return { num: text, unit: '' }

  const n = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n)) return { num: text, unit: '' }

  const abs = Math.abs(n)
  const unit = UNITS.find((u) => abs >= u.value)
  if (!unit) return { num: text, unit: '' }

  // up to 2 decimals, trailing zeros removed: 100.00 -> 100, 1.50 -> 1.5
  const scaled = (n / unit.value).toFixed(2).replace(/\.?0+$/, '')
  return { num: scaled, unit: unit.label }
}

// long currency values shrink instead of being cut off
const sizeFor = (text: string) =>
  text.length > 16 ? 'text-[14px]' : text.length > 12 ? 'text-[16px]' : text.length > 8 ? 'text-[19px]' : 'text-[22px]'

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
  const full = hasTzsPrefix ? text.slice(4) : text
  const { num, unit } = shorten(full)
  const shown = num + unit
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
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
          onClick
            ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300'
            : ''
        }`}
      >
        {loading ? (
          <>
            <Skeleton height={40} width={40} circle />
            <div className="flex-1 space-y-1.5">
              <Skeleton height={8} width={90} />
              <Skeleton height={18} width={80} />
              <Skeleton height={8} width={100} />
            </div>
          </>
        ) : (
          <>
            {/* solid circle with a white icon */}
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              <AppIcon name={icon} size={18} strokeWidth={1.75} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-slate-500">{label}</div>

              <div
                title={text}
                className={`flex items-baseline gap-1 truncate font-bold leading-tight tracking-tight text-slate-800 tabular-nums ${sizeFor(shown)}`}
                style={valueColor ? { color: valueColor } : undefined}
              >
                {prefix && <span className="text-[10px] font-semibold tracking-wide text-slate-400">{prefix}</span>}
                <span className="truncate">
                  {num}
                  {unit && (
                    <span style={{ color: 'color-mix(in srgb, var(--app-brand) 55%, transparent)' }}>{unit}</span>
                  )}
                </span>
                {suffix && <span className="text-[10px] font-medium text-slate-400">{suffix}</span>}
              </div>

              {progress !== undefined && (
                <div
                  className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"
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
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] leading-tight">
                  <span className="truncate text-slate-500">{changeLabel}:</span>
                  <span className={`inline-flex shrink-0 items-center gap-0.5 font-medium ${changeColor}`}>
                    {flat ? (
                      <span aria-hidden="true">–</span>
                    ) : (
                      <AppIcon name={up ? 'chevron-up' : 'chevron-down'} size={12} strokeWidth={2.5} />
                    )}
                    {formatChange(change)}
                    <span className="sr-only">{flat ? 'no change' : up ? 'increase' : 'decrease'}</span>
                  </span>
                </div>
              ) : (
                hint && <div className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</div>
              )}
            </div>
          </>
        )}
      </Tag>
    </Card>
  )
}