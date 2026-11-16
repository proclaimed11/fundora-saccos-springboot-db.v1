import { Text } from '@mantine/core'
import { ChartCard } from '../chartCard'
import { useAppTheme } from '../../theme/themeContext'

type LoansByStatusProps = {
  /** loansByStatus from the API, e.g. { ACTIVE: 3, CLOSED: 1, WRITTEN_OFF: 1 } */
  data: Record<string, number>
}

const COLORS: Record<string, string> = {
  CLOSED: '#45bdfc',
  WRITTEN_OFF: '#c0392b',
}
const FALLBACK = '#9ca3af'

// "WRITTEN_OFF" -> "Written off"
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

const R = 40
const C = 2 * Math.PI * R

export function LoansByStatus({ data }: LoansByStatusProps) {
  const { surfaceColors } = useAppTheme()
  const colorForStatus = (status: string) =>
    status === 'ACTIVE' ? surfaceColors.primary : COLORS[status] ?? FALLBACK
  const entries = Object.entries(data).filter(([, n]) => n > 0)
  const total = entries.reduce((sum, [, n]) => sum + n, 0)

  let offset = 0
  const segments = entries.map(([status, count]) => {
    const length = (count / total) * C
    const seg = { status, count, length, offset }
    offset += length
    return seg
  })

  return (
    <ChartCard
      title="Loans by Status"
      subtitle="Portfolio distribution by loan status"
      cardHeight={224}
    >
      {(height) => {
        // donut grows with the available height (bigger in the modal)
        const size = Math.round(height * 0.7)

        return total === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            No loans yet
          </Text>
        ) : (
          <div
            className="flex flex-wrap items-center justify-center gap-8"
            style={{ minHeight: height }}
          >
            {/* donut */}
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f3f5" strokeWidth="14" />
                {segments.map((s) => (
                  <circle
                    key={s.status}
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke={colorForStatus(s.status)}
                    strokeWidth="14"
                    strokeDasharray={`${s.length} ${C - s.length}`}
                    strokeDashoffset={-s.offset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold leading-none text-gray-700">{total}</span>
                <span className="mt-1 text-[11px] text-gray-400">Total loans</span>
              </div>
            </div>

            {/* legend */}
            <ul className="space-y-2">
              {segments.map((s) => (
                <li key={s.status} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colorForStatus(s.status) }}
                  />
                  <span className="text-gray-600">{pretty(s.status)}</span>
                  <span className="ml-2 font-semibold text-gray-700">{s.count}</span>
                  <span className="text-xs text-gray-400">
                    ({Math.round((s.count / total) * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      }}
    </ChartCard>
  )
}