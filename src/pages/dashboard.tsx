import dayjs from 'dayjs'
import { Text } from '@mantine/core'
import { DashboardLayout } from '../components/layout/dashboardLayout'
import { LoansByStatus } from '../components/dashboard/loansByStatus'
import { TrendChart, type TrendPoint } from '../components/dashboard/trendChart'
import { QueueCard, type QueueRow, type QueueTab } from '../components/dashboard/queueCard'
import { BucketChart, type Bucket } from '../components/dashboard/bucketChart'
import { StatWidget } from '../components/statsWidgets'
import { formatTzs } from '../utils/format'
import { useAppTheme } from '../theme/themeContext'
import { useAuth } from '../auth/authContext'
import { useRoles } from './administration/roles/rolesContext'
import {
  LOANS,
  SAMPLE_PAYMENTS,
  SAMPLE_PENALTIES,
  applications,
  viewOf,
} from './loans/loanApplicationsData'
import { applicants } from './applicants/applicantsData'
import { SAMPLE_ACCOUNTS } from './accounting/accountingData'
import { SAMPLE_CASES } from './collections/collectionsData'
import { HomeFallback } from '../components/dashboard/homeFallback'

// the grid classes for however many stat cards a role can see, so the row always fills the width
// (full class names, so Tailwind can find them)
const STAT_COLS: Record<number, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 xl:grid-cols-5',
}

// the same for the right-hand cards when there is no left column
const SIDE_COLS: Record<number, string> = {
  1: '',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
}

// 8000000 -> "TZS 8M", 1200000 -> "TZS 1.2M"
const shortTzs = (n: number) =>
  `TZS ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`

/* ---------- key numbers, built from the same sample data as their pages ---------- */

const views = LOANS.map((l) => viewOf(l, SAMPLE_PAYMENTS, SAMPLE_PENALTIES))
const openLoans = views.filter((v) => v.state !== 'CLOSED')

const totalOutstanding = openLoans.reduce((s, v) => s + v.outstanding, 0)
const atRisk = openLoans.filter((v) => v.overdueDays > 0).reduce((s, v) => s + v.outstanding, 0)
const parPercent = totalOutstanding > 0 ? (atRisk / totalOutstanding) * 100 : 0

// installments that fall due in the next 7 days
const dueThisWeek = openLoans
  .flatMap((v) => v.installments)
  .filter((s) => {
    const days = dayjs(s.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day')
    return s.outstanding > 0 && days >= 0 && days <= 7
  })
  .reduce((s, i) => s + i.outstanding, 0)

const todayDate = dayjs().format('YYYY-MM-DD')
const collectedToday = SAMPLE_PAYMENTS.filter((p) => p.date === todayDate).reduce((s, p) => s + p.amount, 0)

// cash on hand plus the bank and mobile money accounts
const cashAvailable = SAMPLE_ACCOUNTS.filter((a) =>
  ['CASH', 'BANK_CRDB', 'BANK_NMB', 'MPESA'].includes(a.accountCode),
).reduce((s, a) => s + a.currentBalance, 0)

// each number belongs to a dashboard widget, the Roles page decides who sees which widget
type DashStat = {
  widget: string
  label: string
  value: string | number
  icon: string
  color: string
  miniLabel?: string
  change?: number
  changeLabel?: string
}

// SAMPLE ONLY: replaced by GET /api/dashboard in a later step
// here `color` is the icon color
const stats: DashStat[] = [
  { widget: 'loan-book', label: 'Total Outstanding', value: formatTzs(totalOutstanding), miniLabel: 'TZS', icon: 'scale', color: '#8e44ad', change: 3.75, changeLabel: 'vs Sep 1 - Sep 30' },
  { widget: 'cash', label: 'Cash Available', value: formatTzs(cashAvailable), miniLabel: 'TZS', icon: 'landmark', color: '#45bdfc', change: 0.77, changeLabel: 'vs Sep 1 - Sep 30' },
  { widget: 'collections', label: 'Due This Week', value: formatTzs(dueThisWeek), miniLabel: 'TZS', icon: 'calendar-days', color: '#e08a1e', change: -0.89, changeLabel: 'vs Sep 1 - Sep 30' },
  { widget: 'collections', label: 'Collected Today', value: formatTzs(collectedToday), miniLabel: 'TZS', icon: 'banknote', color: 'var(--app-brand)', change: 3.22, changeLabel: 'vs Sep 1 - Sep 30' },
  { widget: 'loan-book', label: 'Portfolio At Risk', value: `${parPercent.toFixed(1)}%`, icon: 'triangle-alert', color: '#ef4444', change: 0.35, changeLabel: 'vs Sep 1 - Sep 30' },
]

// SAMPLE ONLY: no endpoint in the API doc returns this yet
const trend: TrendPoint[] = [
  { month: 'May', disbursed: 800000, collected: 120000 },
  { month: 'Jun', disbursed: 1200000, collected: 260000 },
  { month: 'Jul', disbursed: 900000, collected: 340000 },
  { month: 'Aug', disbursed: 1500000, collected: 410000 },
  { month: 'Sep', disbursed: 1100000, collected: 520000 },
  { month: 'Oct', disbursed: 1400000, collected: 178525 },
]

// sample data from /api/reports/collections-aging
const agingBuckets: Bucket[] = [
  { label: '1-30 days', count: 1, amount: 120000, color: '#eab308' },
  { label: '31-60 days', count: 0, amount: 0, color: '#f97316' },
  { label: '61-90 days', count: 0, amount: 0, color: '#ef4444' },
  { label: '90+ days', count: 1, amount: 250000, color: '#991b1b' },
]

/* ---------- the work queues, built from the same sample data as their pages ---------- */

// our own rule, the same limits as the pages: highlight anything waiting longer than this
const LATE_APPROVAL_DAYS = 7
const LATE_KYC_DAYS = 7

const waiting = (n: number) => (n <= 0 ? 'today' : n === 1 ? '1 day' : `${n} days`)

// oldest first, so the longest wait is at the top
type Queue = { row: QueueRow; days: number }
const oldestFirst = (list: Queue[]) => [...list].sort((a, b) => b.days - a.days).map((q) => q.row)

// waiting for an approval decision
const approvalQueue: Queue[] = applications
  .filter((a) => a.status === 'CREDIT_APPROVED' || a.status === 'PENDING_APPROVAL')
  .map((a) => {
    const days = dayjs().diff(dayjs(a.submittedAt ?? a.created), 'day')
    return {
      days,
      row: {
        id: a.id,
        title: a.applicantName,
        sub: a.applicationNo,
        value: shortTzs(a.requestedAmount),
        valueSub: `Waiting ${waiting(days)}`,
        late: days > LATE_APPROVAL_DAYS,
        to: `/loan-approvals?review=${a.id}`,
      },
    }
  })

// applicants whose documents are waiting for a KYC decision
const kycQueue: Queue[] = applicants
  .filter((a) => a.status === 'PENDING_KYC')
  .map((a) => {
    const days = dayjs().diff(dayjs(a.registered), 'day')
    return {
      days,
      row: {
        id: a.id,
        title: a.name,
        sub: a.applicantNo,
        value: a.isReturning ? 'Returning' : 'New',
        valueSub: `Waiting ${waiting(days)}`,
        late: days > LATE_KYC_DAYS,
        to: `/applicants/${a.id}`,
      },
    }
  })

const overdueCollectionsQueue: Queue[] = views
  .filter((loan) => loan.state === 'OVERDUE' && loan.overdueAmount > 0)
  .map((loan) => {
    const openCase = SAMPLE_CASES.find((collectionCase) => collectionCase.loanId === loan.id && collectionCase.status === 'OPEN')
    return {
      days: loan.overdueDays,
      row: {
        id: loan.id,
        title: loan.applicantName,
        sub: loan.loanNo,
        value: formatTzs(loan.overdueAmount),
        valueSub: `${loan.overdueDays} days overdue`,
        late: true,
        to: openCase ? `/collection-cases?case=${openCase.id}` : `/loans/${loan.id}`,
      },
    }
  })

export function Dashboard() {
  const { surfaceColors } = useAppTheme()
  const { user } = useAuth()
  const { can } = useRoles()

  // the dashboard is open to everyone, each widget needs its own permission (set on the Roles page)
  const show = (widget: string) => can('dashboard', 'view', widget)

  const approvalRows = oldestFirst(approvalQueue)
  const kycRows = oldestFirst(kycQueue)

  // sample data from /api/reports/npl
  const nplBuckets: Bucket[] = [
    { label: 'Current', count: 2, amount: 1000000, color: surfaceColors.primary },
    { label: 'Watch', count: 0, amount: 0, color: '#eab308' },
    { label: 'Substandard', count: 0, amount: 0, color: '#f97316' },
    { label: 'Doubtful', count: 1, amount: 250000, color: '#ef4444' },
    { label: 'Loss', count: 0, amount: 0, color: '#991b1b' },
  ]

  const visibleStats = stats.filter((s) => show(s.widget))

  const showTrend = show('trend')
  const showStatus = show('status')
  const showNpl = show('npl')
  const showApprovals = show('approvals')
  const showKyc = show('kyc')
  const showAging = show('aging')
  const showOverdueCollections = show('overdue-collections') && can('collections', 'view', 'collection-cases')
  const queueTabs: QueueTab[] = [
    ...(showApprovals
      ? [{
          value: 'approvals',
          label: 'Pending approvals',
          rows: approvalRows,
          viewAllTo: '/loan-approvals',
          emptyText: 'Nothing is waiting for approval',
        }]
      : []),
    ...(showKyc
      ? [{
          value: 'kyc',
          label: 'KYC review',
          rows: kycRows,
          viewAllTo: '/kyc-review',
          emptyText: 'No applicants are waiting for KYC review',
        }]
      : []),
    ...(showOverdueCollections
      ? [{
          value: 'overdue-collections',
          label: 'Overdue collections',
          rows: oldestFirst(overdueCollectionsQueue),
          viewAllTo: '/collection-cases',
          emptyText: 'No overdue loans need follow-up',
        }]
      : []),
  ]

  const leftVisible = showTrend || showStatus || showNpl
  const rightVisible = showApprovals || showKyc || showOverdueCollections || showAging
  const sideCount = [showApprovals || showKyc || showOverdueCollections, showAging].filter(Boolean).length
  const nothing = visibleStats.length === 0 && !leftVisible && !rightVisible

  return (
    <DashboardLayout
      title="Dashboard"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]}
      subtitle={
        <>
          Welcome Back{'  '}
          <span className="text-sm font-medium text-brand">{user?.name}</span>!
        </>
      }
    >
      {/* a role with no dashboard widgets */}
      {nothing && <HomeFallback />}

      {/* row 1: key numbers */}
      {visibleStats.length > 0 && (
      <div className={`grid grid-cols-1 gap-4 ${STAT_COLS[visibleStats.length]}`}>
        {visibleStats.map((s) => (
            <StatWidget
              key={s.label}
              label={s.label}
              value={s.value}
              icon={s.icon}
              color={s.color}
              miniLabel={s.miniLabel}
              change={s.change}
              changeLabel={s.changeLabel}
            />
          ))}
        </div>
      )}

      {/* row 2: charts on the left (2/3), queues and aging stacked on the right (1/3) */}
      {(leftVisible || rightVisible) && (
        <div
          className={`grid items-start gap-4 ${visibleStats.length > 0 ? 'mt-4' : ''} ${
            leftVisible && rightVisible ? 'lg:grid-cols-3' : ''
          }`}
        >
          {leftVisible && (
            <div className={`space-y-4 ${rightVisible ? 'lg:col-span-2' : ''}`}>
              {showTrend && <TrendChart data={trend} />}

              {(showStatus || showNpl) && (
                <div className={`grid gap-4 ${showStatus && showNpl ? 'md:grid-cols-2' : ''}`}>
                  {showStatus && <LoansByStatus data={{ ACTIVE: 3, CLOSED: 1, WRITTEN_OFF: 1 }} />}
                  {showNpl && (
                    <BucketChart
                      title="NPL Classification"
                      buckets={nplBuckets}
                      footer={
                        <>
                          <Text size="sm" c="dimmed">NPL ratio</Text>
                          <Text size="sm" fw={600}>20.0%</Text>
                        </>
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {rightVisible && (
            <div className={leftVisible ? 'space-y-4' : `grid items-start gap-4 ${SIDE_COLS[sideCount]}`}>
              {queueTabs.length > 0 && (
                <QueueCard title="Review queue" tabs={queueTabs} />
              )}
              {showAging && (
                <BucketChart
                  title="Collections Aging"
                  buckets={agingBuckets}
                  footer={
                    <>
                      <Text size="sm" c="dimmed">Total overdue</Text>
                      <Text size="sm" fw={600}>{formatTzs(370000)}</Text>
                    </>
                  }
                />
              )}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}