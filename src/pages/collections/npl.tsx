import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Popover, Switch, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import { JournalPreview } from '../loans/disbursementDialog'
import { NPL_STYLE, type JournalLine, type LoanView, type NplClass } from '../loans/loanApplicationsData'
import { WriteOffDialog, type WriteOffInput } from './collectionDialogs'
import {
  LOAN_VIEWS,
  SAMPLE_CASES,
  SAMPLE_RECOVERY_CASES,
  //SAMPLE_WRITE_OFFS,
  type WriteOffEntry,
} from './collectionsData'
import { allWriteOffs, saveWriteOff } from './writeOffStore'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'loans' | 'written'
type FollowUp = 'RECOVERY' | 'COLLECTION' | 'NONE'
// RISK = every overdue loan, the default view
type ClassFilter = NplClass | 'RISK'

// a loan row with the follow-up work already going on for it
type NplRow = LoanView & { followUp: FollowUp }

type Notice = { text: string; color: 'green' | 'blue'; showWritten?: boolean } | null

const CLASSES: NplClass[] = ['CURRENT', 'WATCH', 'SUBSTANDARD', 'DOUBTFUL', 'LOSS']

// the dot on each class card, these match the badge colors of NPL_STYLE
const CLASS_HEX: Record<NplClass, string> = {
  CURRENT: '#40c057',
  WATCH: '#fab005',
  SUBSTANDARD: '#fd7e14',
  DOUBTFUL: '#fa5252',
  LOSS: '#343a40',
}

// the same buckets as POST /api/collections-workflow/loans/{loanId}/classify-npl
const CLASS_RULES: { cls: NplClass; range: string; short: string }[] = [
  { cls: 'CURRENT', range: 'Nothing overdue', short: 'Not overdue' },
  { cls: 'WATCH', range: '1 to 30 days overdue', short: '1–30 days' },
  { cls: 'SUBSTANDARD', range: '31 to 90 days overdue', short: '31–90 days' },
  { cls: 'DOUBTFUL', range: '91 to 180 days overdue', short: '91–180 days' },
  { cls: 'LOSS', range: 'More than 180 days overdue', short: '180+ days' },
]

// a colored edge on the borrower cell so the worst loans stand out in a long list
const ROW_EDGE: Record<NplClass, string> = {
  CURRENT: 'border-transparent',
  WATCH: 'border-transparent',
  SUBSTANDARD: 'border-orange-300',
  DOUBTFUL: 'border-red-400',
  LOSS: 'border-gray-800',
}

const FOLLOW_UP: Record<FollowUp, { label: string; color: string }> = {
  RECOVERY: { label: 'In recovery', color: 'orange' },
  COLLECTION: { label: 'In collection', color: 'blue' },
  NONE: { label: 'No case', color: 'gray' },
}

const followOptions = (Object.keys(FOLLOW_UP) as FollowUp[]).map((f) => ({ value: f, label: FOLLOW_UP[f].label }))

// SAMPLE ONLY: read from the sample cases, they are not shared with the other pages in this UI-only version
const followUpFor = (loanId: number): FollowUp => {
  if (SAMPLE_RECOVERY_CASES.some((c) => c.loanId === loanId && c.status === 'OPEN')) return 'RECOVERY'
  if (SAMPLE_CASES.some((c) => c.loanId === loanId && c.status === 'OPEN')) return 'COLLECTION'
  return 'NONE'
}

/* ---------- small pieces ---------- */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="sm" fw={600} mb={4}>
      {children}
    </Text>
  )
}

function ClassBadge({ cls, npl = false }: { cls: NplClass; npl?: boolean }) {
  return (
    <Badge variant="outline" color={NPL_STYLE[cls].color} radius="sm" size="sm">
      {npl ? 'NPL · ' : ''}
      {NPL_STYLE[cls].label}
    </Badge>
  )
}

// one compact card per class: it is the summary and the filter at the same time
type ClassCardProps = {
  cls: NplClass
  count: number
  amount: number
  selected: boolean
  onClick: () => void
}

function ClassCard({ cls, count, amount, selected, onClick }: ClassCardProps) {
  const rule = CLASS_RULES.find((r) => r.cls === cls)!
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
        selected ? 'border-brand ring-2 ring-brand' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CLASS_HEX[cls] }} aria-hidden="true" />
          <span className="text-xs font-semibold text-gray-700">{NPL_STYLE[cls].label}</span>
        </div>
        <span className="text-lg font-semibold leading-none text-gray-800">{count}</span>
      </div>
      <div className="mt-1.5 truncate text-xs text-gray-500">{formatTzs(amount)}</div>
      <div className="text-[11px] text-gray-400">{rule.short}</div>
    </button>
  )
}

/* ---------- written-off drawer ---------- */

type DrawerProps = {
  entry: WriteOffEntry
  onOpenLoan: (e: WriteOffEntry) => void
  onOpenBorrower: (e: WriteOffEntry) => void
}

function WriteOffDrawerBody({ entry: e, onOpenLoan, onOpenBorrower }: DrawerProps) {
  const tiles = [
    { label: 'Written off', value: formatTzs(e.amount) },
    { label: 'Days overdue', value: `${e.overdueDays} days` },
    { label: 'Written off on', value: dayjs(e.date).format('MMM D, YYYY') },
  ]

  // the same entry the write-off dialog showed
  const journal: JournalLine[] = [
    { side: 'DEBIT', code: 'BAD_DEBT_EXPENSE', name: 'Bad debt expense', amount: e.amount },
    { side: 'CREDIT', code: 'LOAN_RECEIVABLE', name: 'Loan receivable', amount: e.amount },
    { side: 'DEBIT', code: 'WRITE_OFF_EXPENSE', name: 'Write-off expense', amount: e.amount },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="filled" color="dark" radius="sm" size="sm">
          Written off
        </Badge>
        <ClassBadge cls={e.classification} />
        <Text size="xs" c="dimmed">
          {e.loanNo} · Approved by {e.approvedBy}
        </Text>
      </div>

      <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />}>
        <Text size="sm">A written-off loan is final. Its balances were set to zero and it cannot be edited.</Text>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>What was written off</SectionTitle>
        <Field label="Principal" value={formatTzs(e.principal)} />
        <Field label="Interest" value={formatTzs(e.interest)} />
        <Field label="Penalty" value={formatTzs(e.penalty)} />
        <Field label="Total" value={formatTzs(e.amount)} />
      </div>

      <div>
        <SectionTitle>Write-off details</SectionTitle>
        <Field label="Borrower" value={e.borrower} />
        <Field label="Loan" value={e.loanNo} />
        <Field label="Class at write-off" value={NPL_STYLE[e.classification].label} />
        <Field label="Approved by" value={e.approvedBy} />
        <Field label="Reason" value={e.reason} />
      </div>

      <div>
        <SectionTitle>Journal entry</SectionTitle>
        <JournalPreview lines={journal} />
      </div>

      <div className="flex flex-wrap gap-2">
        {e.loanId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => onOpenLoan(e)}>
            View loan
          </Button>
        )}
        {e.applicantId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="user-round" />} onClick={() => onOpenBorrower(e)}>
            View borrower
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function NplPage() {
  const navigate = useNavigate()
  const { canEdit } = usePageAccess('collections', 'npl')
  const [params, setParams] = useSearchParams()

  // UI only: write-offs made in this session, nothing is saved yet
 const [written, setWritten] = useState<WriteOffEntry[]>(allWriteOffs)
  const [tab, setTab] = useState<TabKey>('loans')
  const [classFilter, setClassFilter] = useState<ClassFilter>('RISK')
  const [nplOnly, setNplOnly] = useState(false)
  const [dialogLoanId, setDialogLoanId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const today = dayjs().format('YYYY-MM-DD')

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  /* ---------- the loan lists ---------- */

  const writtenLoanIds = written.map((w) => w.loanId).filter((id): id is number => id !== null)

  // loans still being repaid and not written off
  const rows: NplRow[] = LOAN_VIEWS.filter((l) => l.state !== 'CLOSED' && !writtenLoanIds.includes(l.id)).map((l) => ({
    ...l,
    followUp: followUpFor(l.id),
  }))

  const nplRows = rows.filter((r) => r.isNpl)
  const overdueRows = rows.filter((r) => r.classification !== 'CURRENT')
  const noCase = nplRows.filter((r) => r.followUp === 'NONE')

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const nplOutstanding = nplRows.reduce((s, r) => s + r.outstanding, 0)
  // the API works the ratio out on the outstanding amount
  const nplRatio = totalOutstanding > 0 ? (nplOutstanding / totalOutstanding) * 100 : 0
  const totalWritten = written.reduce((s, w) => s + w.amount, 0)

  const classTotals = CLASSES.map((c) => {
    const list = rows.filter((r) => r.classification === c)
    return { cls: c, count: list.length, amount: list.reduce((s, r) => s + r.outstanding, 0) }
  })

  // the table: the chosen class (or every overdue loan), optionally only the 90+ day loans
  const visible = rows.filter((r) => {
    if (nplOnly && !r.isNpl) return false
    return classFilter === 'RISK' ? r.classification !== 'CURRENT' : r.classification === classFilter
  })

  // here `color` is the icon color
  const stats = [
    { label: 'NPL Loans', value: nplRows.length, icon: 'triangle-alert', color: '#ef4444' },
    { label: 'NPL Outstanding', value: formatTzs(nplOutstanding), icon: 'banknote', color: '#8e44ad' },
    { label: 'NPL Ratio', value: `${nplRatio.toFixed(1)}%`, icon: 'scale', color: '#e08a1e' },
    { label: 'NPL Without A Case', value: noCase.length, icon: 'phone', color: '#0077b5' },
  ]

  // /npl?writeoff=1 opens the drawer for write-off 1
  const viewParam = params.get('writeoff')
  const selected = viewParam ? (written.find((w) => String(w.id) === viewParam) ?? null) : null
  const openView = (id: number) => setParams({ writeoff: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const dialogLoan = dialogLoanId ? rows.find((r) => r.id === dialogLoanId) : undefined

  // clicking the chosen class again goes back to every overdue loan
  const pickClass = (c: NplClass) => {
    setClassFilter((current) => (current === c ? 'RISK' : c))
    setNplOnly(false)
  }

  const toggleNplOnly = (on: boolean) => {
    setNplOnly(on)
    if (on) setClassFilter('RISK')
  }

  const filterLabel = nplOnly
    ? 'Non-performing loans (90+ days)'
    : classFilter === 'RISK'
      ? 'All overdue loans'
      : `${NPL_STYLE[classFilter].label} loans`

  /* ---------- actions ---------- */

  const classify = (r: NplRow) => {
    // TODO: POST /api/collections-workflow/loans/{loanId}/classify-npl?classifiedBy=
    //       the daily job does this for every active loan at 07:00 UTC
    setNotice({
      color: 'blue',
      text: `${r.loanNo} classified as ${NPL_STYLE[r.classification].label} (${r.overdueDays} days overdue).`,
    })
  }

  const classifyAll = () => {
    // TODO: POST /api/collections-workflow/loans/{loanId}/classify-npl for each active loan
    setNotice({
      color: 'blue',
      text: `${rows.length} active ${rows.length === 1 ? 'loan' : 'loans'} classified. ${nplRows.length} ${
        nplRows.length === 1 ? 'is' : 'are'
      } non-performing.`,
    })
  }

  const writeOff = (input: WriteOffInput) => {
    if (!dialogLoan || !dialogLoan.isNpl) return
    // TODO: POST /api/collections-workflow/loans/{loanId}/write-off { reason, approvedBy }
    //       needs Loan.isNpl and a loan that is not already written off.
    //       The API zeroes the balances and closes every open case on the loan.
    const entry: WriteOffEntry = {
      id: Math.max(0, ...written.map((w) => w.id)) + 1,
      loanId: dialogLoan.id,
      applicantId: dialogLoan.applicantId,
      loanNo: dialogLoan.loanNo,
      borrower: dialogLoan.applicantName,
      principal: dialogLoan.outstandingPrincipal,
      interest: dialogLoan.outstandingInterest,
      penalty: dialogLoan.outstandingPenalty,
      amount: dialogLoan.outstanding,
      overdueDays: dialogLoan.overdueDays,
      classification: dialogLoan.classification,
      reason: input.reason,
      approvedBy: input.approvedBy,
      date: today,
    }
    setWritten((list) => [entry, ...list])
    saveWriteOff(entry)
    setNotice({
      color: 'green',
      text: `${dialogLoan.loanNo} was written off for ${formatTzs(dialogLoan.outstanding)}. Its open cases are closed.`,
      showWritten: true,
    })
    setTab('written')
    setDialogLoanId(null)
  }

  /* ---------- columns ---------- */

  const loanColumns: CustomTableColumn<NplRow>[] = [
    {
      accessor: 'applicantName',
      header: 'Borrower',
      render: (r) => (
        <div className={`min-w-0 border-l-4 pl-2 ${ROW_EDGE[r.classification]}`}>
          <div className="truncate text-sm font-medium text-gray-800">{r.applicantName}</div>
          <div className="truncate text-xs text-gray-500">{r.loanNo}</div>
        </div>
      ),
      exportValue: (r) => `${r.loanNo} (${r.applicantName})`,
    },
    {
      accessor: 'overdueDays',
      header: 'Overdue',
      render: (r) =>
        r.overdueDays > 0 ? (
          <div>
            <div className="whitespace-nowrap text-sm font-medium text-red-600">{r.overdueDays} days</div>
            <div className="whitespace-nowrap text-xs text-gray-500">{formatTzs(r.overdueAmount)} past due</div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Not overdue</span>
        ),
      exportValue: (r) => r.overdueDays,
    },
    {
      accessor: 'classification',
      header: 'Class',
      sortable: false,
      render: (r) => <ClassBadge cls={r.classification} npl={r.isNpl} />,
      exportValue: (r) => NPL_STYLE[r.classification].label,
    },
    {
      accessor: 'outstanding',
      header: 'Outstanding',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.outstanding)}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            P {r.outstandingPrincipal.toLocaleString('en-US')} · I {r.outstandingInterest.toLocaleString('en-US')} · Pen{' '}
            {r.outstandingPenalty.toLocaleString('en-US')}
          </div>
        </div>
      ),
      exportValue: (r) => r.outstanding,
    },
    {
      accessor: 'followUp',
      header: 'Follow-up',
      sortable: false,
      render: (r) => (
        <Badge variant="light" color={FOLLOW_UP[r.followUp].color} radius="sm" size="sm">
          {FOLLOW_UP[r.followUp].label}
        </Badge>
      ),
      exportValue: (r) => FOLLOW_UP[r.followUp].label,
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
          <Menu position="bottom-end" shadow="md" width={240}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${r.loanNo}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {canEdit && (
                <>
                  <Menu.Item
                    fw={500}
                    color="red"
                    disabled={!r.isNpl}
                    leftSection={<AppIcon name="triangle-alert" />}
                    onClick={() => setDialogLoanId(r.id)}
                  >
                    {r.isNpl ? 'Write off loan' : 'Write off (NPL only)'}
                  </Menu.Item>
                  <Menu.Item leftSection={<AppIcon name="refresh-cw" />} onClick={() => classify(r)}>
                    Classify now
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              {r.followUp === 'RECOVERY' && (
                <Menu.Item leftSection={<AppIcon name="undo-2" />} onClick={() => navigate('/recovery-cases')}>
                  Recovery case
                </Menu.Item>
              )}
              {r.followUp === 'COLLECTION' && (
                <Menu.Item leftSection={<AppIcon name="phone" />} onClick={() => navigate('/collection-cases')}>
                  Collection case
                </Menu.Item>
              )}
              {r.followUp === 'NONE' && r.overdueDays > 0 && (
                <Menu.Item leftSection={<AppIcon name="plus" />} onClick={() => navigate('/collection-cases')}>
                  Open a collection case
                </Menu.Item>
              )}
              <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.id}`)}>
                View loan
              </Menu.Item>
              <Menu.Item leftSection={<AppIcon name="user-round" />} onClick={() => navigate(`/applicants/${r.applicantId}`)}>
                View borrower
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  const writtenColumns: CustomTableColumn<WriteOffEntry>[] = [
    {
      accessor: 'borrower',
      header: 'Borrower',
      render: (w) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{w.borrower}</div>
          <div className="truncate text-xs text-gray-500">{w.loanNo}</div>
        </div>
      ),
      exportValue: (w) => `${w.loanNo} (${w.borrower})`,
    },
    {
      accessor: 'amount',
      header: 'Written off',
      render: (w) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(w.amount)}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            P {w.principal.toLocaleString('en-US')} · I {w.interest.toLocaleString('en-US')} · Pen{' '}
            {w.penalty.toLocaleString('en-US')}
          </div>
        </div>
      ),
      exportValue: (w) => w.amount,
    },
    {
      accessor: 'overdueDays',
      header: 'At write-off',
      render: (w) => (
        <div>
          <div className="whitespace-nowrap text-sm text-gray-800">{w.overdueDays} days overdue</div>
          <div className="mt-1">
            <ClassBadge cls={w.classification} />
          </div>
        </div>
      ),
      exportValue: (w) => `${w.overdueDays} days (${NPL_STYLE[w.classification].label})`,
    },
    {
      accessor: 'reason',
      header: 'Reason',
      render: (w) => (
        <div className="max-w-[280px]">
          <div className="truncate text-sm text-gray-800">{w.reason}</div>
          <div className="text-xs text-gray-500">Approved by {w.approvedBy}</div>
        </div>
      ),
      exportValue: (w) => w.reason,
    },
    { accessor: 'date', header: 'Date', type: 'date' },
  ]

  return (
    <DashboardLayout
      title="NPL & Write-offs"
      subtitle="Non-performing loans and the loans written off as lost"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Collections' }, { label: 'NPL & Write-offs' }]}
      actions={
        <>
          {/* the classification rules, kept out of the way until someone wants them */}
          <Popover position="bottom-end" width={290} shadow="md" withArrow>
            <Popover.Target>
              <ActionIcon variant="default" size="lg" aria-label="How loans are classified">
                <AppIcon name="circle-help" />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="sm" fw={600} mb={8}>
                How loans are classified
              </Text>
              <ul className="space-y-2">
                {CLASS_RULES.map((c) => (
                  <li key={c.cls} className="flex items-center justify-between gap-3">
                    <ClassBadge cls={c.cls} />
                    <span className="text-xs text-gray-600">{c.range}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <p>A loan is non-performing (NPL) once it is 90 days or more overdue.</p>
                <p>Only an NPL loan can be escalated to recovery or written off.</p>
                <p>Loans are classified every day at 07:00 UTC.</p>
              </div>
            </Popover.Dropdown>
          </Popover>

          {canEdit && (
            <Button size="xs" variant="default" leftSection={<AppIcon name="refresh-cw" />} onClick={classifyAll}>
              Classify all now
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color={notice.color}
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name={notice.color === 'green' ? 'circle-check' : 'info'} />}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">{notice.text}</Text>
              {notice.showWritten && (
                <Button
                  size="compact-xs"
                  onClick={() => {
                    setTab('written')
                    setNotice(null)
                  }}
                >
                  View write-offs
                </Button>
              )}
            </div>
          </Alert>
        )}

        {noCase.length > 0 && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {noCase.length} non-performing {noCase.length === 1 ? 'loan has' : 'loans have'} no collection or
                recovery case.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => navigate('/collection-cases')}>
                Collection cases
              </Button>
            </div>
          </Alert>
        )}

        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        {/* row 2: the classes, they summarise the portfolio and filter the table */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {classTotals.map((c) => (
            <ClassCard
              key={c.cls}
              cls={c.cls}
              count={c.count}
              amount={c.amount}
              selected={classFilter === c.cls}
              onClick={() => pickClass(c.cls)}
            />
          ))}
        </div>

        {/* row 3: table in a plain card */}
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CustomTabs
              ariaLabel="NPL tabs"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'loans', label: `Loans at risk (${overdueRows.length})` },
                { value: 'written', label: `Written off (${written.length})` },
              ]}
            />

            {tab === 'loans' ? (
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  size="xs"
                  label="NPL only (90+ days)"
                  checked={nplOnly}
                  onChange={(e) => toggleNplOnly(e.currentTarget.checked)}
                />
                {(classFilter !== 'RISK' || nplOnly) && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setClassFilter('RISK')
                      setNplOnly(false)
                    }}
                  >
                    Clear filter
                  </Button>
                )}
              </div>
            ) : (
              <Text size="xs" c="dimmed">
                Total written off {formatTzs(totalWritten)}
              </Text>
            )}
          </div>

          {tab === 'loans' && (
            <Text size="xs" c="dimmed" mb="xs">
              {filterLabel} · showing {visible.length} of {rows.length} active loans · {formatTzs(
                visible.reduce((s, r) => s + r.outstanding, 0),
              )}{' '}
              outstanding
            </Text>
          )}

          {tab === 'written' ? (
            <CustomTable<WriteOffEntry>
              size="md"
              data={written}
              columns={writtenColumns}
              searchInput
              searchPlaceholder="Search borrower, loan or reason"
              searchKeys={['borrower', 'loanNo', 'reason']}
              filters={{ date: 'date' }}
              // the newest write-offs first
              defaultSort={{ accessor: 'date', direction: 'desc' }}
              noRecordText="No loans have been written off"
              onRowClick={(row) => openView(row.id)}
              exportCsv
              exportFileName="write-offs"
              print
              printTitle="Write-offs"
            />
          ) : (
            <CustomTable<NplRow>
              size="md"
              data={visible}
              columns={loanColumns}
              searchInput
              searchPlaceholder="Search borrower or loan"
              searchKeys={['applicantName', 'loanNo', 'loanOfficer']}
              filters={{ followUp: followOptions }}
              // the longest overdue first
              defaultSort={{ accessor: 'overdueDays', direction: 'desc' }}
              noRecordText="No loans match this filter"
              onRowClick={(row) => navigate(`/loans/${row.id}`)}
              exportCsv
              exportFileName="loans-at-risk"
              print
              printTitle="Loans at risk"
            />
          )}
        </div>
      </div>

      {/* written-off details drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.borrower ?? ''}>
        {selected && (
          <WriteOffDrawerBody
            entry={selected}
            onOpenLoan={(e) => navigate(`/loans/${e.loanId}`)}
            onOpenBorrower={(e) => navigate(`/applicants/${e.applicantId}`)}
          />
        )}
      </Drawer>

      <WriteOffDialog
        opened={!!dialogLoan}
        loan={dialogLoan ?? null}
        onClose={() => setDialogLoanId(null)}
        onSubmit={writeOff}
      />
    </DashboardLayout>
  )
}