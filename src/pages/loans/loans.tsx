import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Badge, Menu, Progress, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { PageState } from '../../components/pageState'
import { formatTzs } from '../../utils/format'
import { usePageAccess } from '../auth/usePageAccess'
import { writeOffFor } from '../collections/writeOffStore'
import type { WriteOffEntry } from '../collections/collectionsData'
import { LoanBalanceDrawer } from './loanBalanceDrawer'
import {
  LOANS,
  LOAN_STATE,
  NPL_STYLE,
  SAMPLE_PAYMENTS,
  SAMPLE_PENALTIES,
  methodLabel,
  viewOf,
  type LoanState,
  type LoanView,
} from './loanApplicationsData'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'active' | 'overdue' | 'npl' | 'closed' | 'written' | 'all'
type LoanStatus = LoanState | 'WRITTEN_OFF'

// a loan with its write-off, when it has one
type Row = LoanView & {
  status: LoanStatus
  writtenOff: WriteOffEntry | null
  /** what the borrower still owes, zero once the loan is written off */
  owed: number
}

const TAB_EMPTY: Record<TabKey, string> = {
  active: 'No loans are being repaid',
  overdue: 'No loans are overdue',
  npl: 'No loans are non-performing',
  closed: 'No loans have been fully repaid yet',
  written: 'No loans have been written off',
  all: 'No loans have been disbursed yet',
}

const STATUS_STYLE: Record<LoanStatus, { label: string; color: string }> = {
  ...LOAN_STATE,
  WRITTEN_OFF: { label: 'Written off', color: 'dark' },
}

const statusOptions = (Object.keys(STATUS_STYLE) as LoanStatus[]).map((s) => ({
  value: s,
  label: STATUS_STYLE[s].label,
}))

export function LoansPage() {
  const navigate = useNavigate()
  const { canCreate: canPay } = usePageAccess('repayments', 'payments')
  const [tab, setTab] = useState<TabKey>('active')
  const [balanceId, setBalanceId] = useState<number | null>(null)

  // SAMPLE ONLY: replaced by GET /api/loans and the balance endpoint later.
  // Write-offs made in this session come from the shared write-off store.
  const rows: Row[] = LOANS.map((l) => {
    const v = viewOf(l, SAMPLE_PAYMENTS, SAMPLE_PENALTIES)
    const writtenOff = writeOffFor(l.id)
    return {
      ...v,
      writtenOff,
      status: writtenOff ? 'WRITTEN_OFF' : v.state,
      owed: writtenOff ? 0 : v.outstanding,
    }
  })

  const active = rows.filter((r) => r.status === 'ACTIVE' || r.status === 'OVERDUE')
  const overdue = rows.filter((r) => r.status === 'OVERDUE')
  const npl = rows.filter((r) => r.isNpl && !r.writtenOff)
  const closed = rows.filter((r) => r.status === 'CLOSED')
  const written = rows.filter((r) => r.writtenOff)
  const outstanding = active.reduce((s, r) => s + r.owed, 0)
  const collected = SAMPLE_PAYMENTS.filter((p) => dayjs(p.date).isSame(dayjs(), 'month')).reduce(
    (s, p) => s + p.amount,
    0,
  )

  const tabData: Record<TabKey, Row[]> = { active, overdue, npl, closed, written, all: rows }
  const balanceRow = rows.find((r) => r.id === balanceId) ?? null

  // here `color` is the icon color
  const stats = [
    { label: 'Active Loans', value: active.length, icon: 'hand-coins', color: '#45bdfc' },
    { label: 'Overdue', value: overdue.length, icon: 'clock', color: '#e08a1e' },
    { label: 'Non-performing', value: npl.length, icon: 'triangle-alert', color: '#ef4444' },
    { label: 'Total Outstanding', value: formatTzs(outstanding), miniLabel: 'TZS', icon: 'banknote', color: '#8e44ad' },
    { label: 'Collected This Month', value: formatTzs(collected), miniLabel: 'TZS', icon: 'circle-check', color: 'var(--app-brand)' },
  ]

  const columns: CustomTableColumn<Row>[] = [
    {
      accessor: 'applicantName',
      header: 'Borrower',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.applicantName}</div>
          <div className="truncate text-xs text-gray-500">{r.loanNo}</div>
        </div>
      ),
      exportValue: (r) => `${r.loanNo} (${r.applicantName})`,
    },
    {
      accessor: 'principal',
      header: 'Loan',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.principal)}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            {r.tenure} months · {r.interestRate}% · {methodLabel(r.interestMethod)}
          </div>
        </div>
      ),
      exportValue: (r) => r.principal,
    },
    {
      accessor: 'owed',
      header: 'Outstanding',
      render: (r) =>
        r.writtenOff ? (
          <div>
            <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(0)}</div>
            <div className="whitespace-nowrap text-xs text-gray-500">{formatTzs(r.writtenOff.amount)} written off</div>
          </div>
        ) : (
          <div className="w-36">
            <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.outstanding)}</div>
            <Progress value={r.repaidPct} size="xs" radius="xl" color="brand" mt={4} />
            <div className="mt-0.5 text-[11px] text-gray-500">{r.repaidPct}% repaid</div>
          </div>
        ),
      exportValue: (r) => r.owed,
    },
    {
      // sorting by this puts the worst overdue loans first
      accessor: 'overdueDays',
      header: 'Next due',
      render: (r) => {
        if (r.writtenOff) return <span className="text-xs text-gray-400">Written off</span>
        if (!r.next) return <span className="text-xs text-gray-400">Fully repaid</span>

        if (r.overdueDays > 0) {
          return (
            <div>
              <div className="whitespace-nowrap text-sm font-medium text-red-600">
                <AppIcon name="triangle-alert" className="mr-1" />
                {r.overdueDays} days overdue
              </div>
              <div className="whitespace-nowrap text-xs text-gray-500">{formatTzs(r.overdueAmount)} past due</div>
            </div>
          )
        }

        const days = dayjs(r.next.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day')
        return (
          <div>
            <div className="whitespace-nowrap text-sm text-gray-800">{dayjs(r.next.dueDate).format('MMM D, YYYY')}</div>
            <div className="whitespace-nowrap text-xs text-gray-500">
              {days === 0 ? 'Due today' : `In ${days} days`} · {formatTzs(r.next.outstanding)}
            </div>
          </div>
        )
      },
      exportValue: (r) => r.overdueDays,
    },
    {
      accessor: 'status',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <div className="space-y-1">
          <Badge variant={r.writtenOff ? 'filled' : 'light'} color={STATUS_STYLE[r.status].color} radius="sm" size="sm">
            {STATUS_STYLE[r.status].label}
          </Badge>
          {r.status === 'OVERDUE' && (
            <div>
              <Badge variant="outline" color={NPL_STYLE[r.classification].color} radius="sm" size="sm">
                {r.isNpl ? 'NPL · ' : ''}
                {NPL_STYLE[r.classification].label}
              </Badge>
            </div>
          )}
        </div>
      ),
      exportValue: (r) => STATUS_STYLE[r.status].label,
    },
    {
      accessor: 'disbursed',
      header: 'Disbursed',
      type: 'date',
    },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (r) => (
        // stop the click so the row doesn't also open the loan
        <div onClick={(e) => e.stopPropagation()}>
          <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${r.loanNo}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {r.status !== 'CLOSED' && !r.writtenOff && canPay && (
                <>
                  <Menu.Item
                    fw={500}
                    leftSection={<AppIcon name="banknote" />}
                    onClick={() => navigate(`/loans/${r.id}?pay=1`)}
                  >
                    Record payment
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item leftSection={<AppIcon name="scale" />} onClick={() => setBalanceId(r.id)}>
                View balance
              </Menu.Item>
              <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => navigate(`/loans/${r.id}`)}>
                View loan
              </Menu.Item>
              <Menu.Item
                leftSection={<AppIcon name="user-round" />}
                onClick={() => navigate(`/applicants/${r.applicantId}`)}
              >
                View borrower
              </Menu.Item>
              {r.applicationId && (
                <Menu.Item
                  leftSection={<AppIcon name="file-text" />}
                  onClick={() => navigate(`/loan-applications/${r.applicationId}`)}
                >
                  View application
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout
      title="Loans"
      subtitle="Disbursed loans and their repayments"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Loans' }, { label: 'Active loans' }]}
    >
      <div className="space-y-4">
        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        {/* row 2: table in a plain card */}
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CustomTabs
              ariaLabel="Loan filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'active', label: `Active (${active.length})` },
                { value: 'overdue', label: `Overdue (${overdue.length})` },
                { value: 'npl', label: `Non-performing (${npl.length})` },
                { value: 'closed', label: `Closed (${closed.length})` },
                { value: 'written', label: `Written off (${written.length})` },
                { value: 'all', label: `All (${rows.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              Outstanding {formatTzs(outstanding)} · Past due {formatTzs(overdue.reduce((s, r) => s + r.overdueAmount, 0))}
            </Text>
          </div>

          {/* TODO: pass loading, error and onRetry from the API call */}
          <PageState>
            <CustomTable<Row>
              size="md"
              data={tabData[tab]}
              columns={columns}
              searchInput
              searchPlaceholder="Search borrower or loan"
              searchKeys={['loanNo', 'applicantName', 'loanOfficer']}
              filters={{ status: statusOptions, disbursed: 'date' }}
              // the most overdue loans first
              defaultSort={{ accessor: 'overdueDays', direction: 'desc' }}
              noRecordText={TAB_EMPTY[tab]}
              onRowClick={(row) => navigate(`/loans/${row.id}`)}
              exportCsv
              exportFileName="loans"
              print
              printTitle="Loans"
            />
          </PageState>
        </div>
      </div>

      <LoanBalanceDrawer
        loan={balanceRow}
        writtenOff={balanceRow?.writtenOff ?? null}
        canPay={canPay}
        onClose={() => setBalanceId(null)}
        onPay={(l) => navigate(`/loans/${l.id}?pay=1`)}
        onOpenLoan={(l) => navigate(`/loans/${l.id}`)}
      />
    </DashboardLayout>
  )
}