import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Menu,
  Modal,
  NumberInput,
  Select,
  Text,
  Textarea,
} from '@mantine/core'
import { AppIcon } from '../../components/appIcon'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import { ContractConfirmDialog } from './contractDialogs'
import { CURRENT_USER } from './disbursementDialog'
import {
  LOANS,
  SAMPLE_GRACE_PERIODS,
  SAMPLE_PAYMENTS,
  SAMPLE_PENALTIES,
  graceDaysFor,
  penaltiesToCharge,
  viewOf,
  type GracePeriod,
  type LoanView,
  type PenaltyRecord,
} from './loanApplicationsData'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

// our own rule, the API sets no limit on a grace period
const MAX_GRACE_DAYS = 60

type TabKey = 'charged' | 'due' | 'grace'
type Notice = { text: string; color: 'green' | 'blue' } | null

type ChargedRow = PenaltyRecord & {
  loanNo: string
  applicantName: string
  paidStatus: 'Paid' | 'Partly paid' | 'Unpaid'
}

// one row per loan, because the API charges a whole loan at a time
type DueRow = {
  id: number
  loanId: number
  loanNo: string
  applicantName: string
  /** the late installments that would be charged, like #4, #5 */
  installments: string
  count: number
  overdueDays: number
  /** what is still owing on those installments */
  basis: number
  rate: number
  amount: number
  grace: number
  items: { installmentNo: number; rate: number; amount: number }[]
}

type GraceRow = GracePeriod & { loanNo: string; applicantName: string; overdueDays: number }

const TAB_EMPTY: Record<TabKey, string> = {
  charged: 'No penalties have been charged',
  due: 'Every late installment has been charged',
  grace: 'No grace periods have been granted',
}

const paidOptions = [
  { value: 'Paid', label: 'Paid' },
  { value: 'Partly paid', label: 'Partly paid' },
  { value: 'Unpaid', label: 'Unpaid' },
]

const activeOptions = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Ended' },
]

function effectOf(g: GraceRow) {
  if (!g.active) return { text: 'Ended', sub: 'No longer applies' }
  if (g.overdueDays === 0) return { text: 'Nothing is late', sub: `Covers up to ${g.graceDays} days` }
  if (g.overdueDays <= g.graceDays) {
    return { text: `${g.overdueDays} days late`, sub: `${g.graceDays - g.overdueDays} days of grace left` }
  }
  return { text: `${g.overdueDays} days late`, sub: `Past the ${g.graceDays}-day grace period` }
}

/* ---------- add a grace period ---------- */

type GraceInput = { loanId: number; graceDays: number; reason: string }

type GraceDialogProps = {
  opened: boolean
  loans: LoanView[]
  /** loans that already have an active grace period */
  activeLoanIds: number[]
  onClose: () => void
  onSubmit: (input: GraceInput) => void
}

type GraceErrors = Partial<Record<'loan' | 'days' | 'reason', string>>

function GraceDialog({ opened, loans, activeLoanIds, onClose, onSubmit }: GraceDialogProps) {
  const [loanId, setLoanId] = useState<string | null>(null)
  const [days, setDays] = useState<number | ''>(14)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<GraceErrors>({})

  const loan = loans.find((v) => String(v.id) === loanId)
  const clear = (key: keyof GraceErrors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const reset = () => {
    setLoanId(null)
    setDays(14)
    setReason('')
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const found: GraceErrors = {}

    if (!loan) found.loan = 'Select the loan'
    else if (activeLoanIds.includes(loan.id)) {
      found.loan = 'This loan already has an active grace period. End it first.'
    }

    if (days === '' || days < 1) found.days = 'Enter at least 1 day'
    else if (days > MAX_GRACE_DAYS) found.days = `A grace period can be at most ${MAX_GRACE_DAYS} days`

    if (!reason.trim()) found.reason = 'Add the reason for the extra time'

    setErrors(found)
    if (Object.keys(found).length > 0 || !loan || days === '') return

    // TODO: POST /api/grace-periods { loanId, graceDays, ... } (the field names come from the GracePeriod model)
    onSubmit({ loanId: loan.id, graceDays: days, reason: reason.trim() })
    reset()
  }

  return (
    <Modal opened={opened} onClose={close} title="Add grace period" centered>
      <div className="space-y-4">
        <Select
          label="Loan"
          description="Only loans that still have a balance are listed"
          placeholder="Search by borrower or loan number"
          size="sm"
          searchable
          nothingFoundMessage="No open loans found"
          data={loans.map((v) => ({ value: String(v.id), label: `${v.applicantName} · ${v.loanNo}` }))}
          allowDeselect={false}
          value={loanId}
          onChange={(v) => {
            setLoanId(v)
            clear('loan')
          }}
          error={errors.loan}
        />

        <NumberInput
          label="Grace days"
          description="A late installment is only charged once it is more than this many days late"
          size="sm"
          suffix=" days"
          min={1}
          max={MAX_GRACE_DAYS}
          allowNegative={false}
          allowDecimal={false}
          hideControls
          value={days}
          onChange={(v) => {
            setDays(v === '' ? '' : Number(v))
            clear('days')
          }}
          error={errors.days}
        />

        <Textarea
          label="Reason"
          placeholder="Why is the borrower getting extra time?"
          size="sm"
          autosize
          minRows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.currentTarget.value)
            clear('reason')
          }}
          error={errors.reason}
        />

        {loan && days !== '' && (
          <div className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {loan.overdueDays === 0 ? (
              <>Nothing is late on {loan.loanNo} right now.</>
            ) : (
              <>
                {loan.loanNo} is {loan.overdueDays} days late.
              </>
            )}{' '}
            {loan.overdueDays > days
              ? 'That is already past this grace period, so its late installments will be charged on the next run.'
              : `Late installments will not be charged until they are more than ${days} days late.`}
          </div>
        )}

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="xs">
            A grace period only holds back penalties. Due dates, the days overdue and the NPL class do not change.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            Add grace period
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- page ---------- */

export function PenaltiesPage() {
  const navigate = useNavigate()
  const { canCreate, canEdit } = usePageAccess('repayments', 'penalties')
  const [tab, setTab] = useState<TabKey>('charged')
  // UI only: changes made in this session, nothing is saved yet
  const [addedPenalties, setAddedPenalties] = useState<PenaltyRecord[]>([])
  const [graceList, setGraceList] = useState<GracePeriod[]>(SAMPLE_GRACE_PERIODS)
  const [graceOpen, setGraceOpen] = useState(false)
  const [endId, setEndId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const penalties = useMemo(() => [...SAMPLE_PENALTIES, ...addedPenalties], [addedPenalties])
  const views = useMemo(() => LOANS.map((l) => viewOf(l, SAMPLE_PAYMENTS, penalties)), [penalties])

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  /* ---------- the three lists ---------- */

  const charged: ChargedRow[] = views.flatMap((v) =>
    v.penalties.map((p) => {
      const s = v.installments.find((i) => i.installmentNo === p.installmentNo)
      const paid = s?.penaltyPaid ?? 0
      const owed = s?.penaltyDue ?? p.amount
      return {
        ...p,
        loanNo: v.loanNo,
        applicantName: v.applicantName,
        paidStatus: paid >= owed ? 'Paid' : paid > 0 ? 'Partly paid' : 'Unpaid',
      } as ChargedRow
    }),
  )

  const due: DueRow[] = views.flatMap((v) => {
    const grace = graceDaysFor(v.id, graceList)
    const items = penaltiesToCharge(v, v.installments, v.penalties, grace)
    if (items.length === 0) return []
    const late = items.map((i) => v.installments.find((s) => s.installmentNo === i.installmentNo)!)
    return [
      {
        id: v.id,
        loanId: v.id,
        loanNo: v.loanNo,
        applicantName: v.applicantName,
        installments: items.map((i) => `#${i.installmentNo}`).join(', '),
        count: items.length,
        overdueDays: Math.max(...late.map((s) => s.daysOverdue)),
        basis: late.reduce((t, s) => t + s.outstanding, 0),
        rate: v.penaltyRate,
        amount: items.reduce((t, i) => t + i.amount, 0),
        grace,
        items,
      },
    ]
  })

  const graceRows: GraceRow[] = graceList.map((g) => {
    const v = views.find((x) => x.id === g.loanId)!
    return { ...g, loanNo: v.loanNo, applicantName: v.applicantName, overdueDays: v.overdueDays }
  })

  const activeGrace = graceList.filter((g) => g.active)
  const totalCharged = charged.reduce((s, r) => s + r.amount, 0)
  const stillUnpaid = views.reduce((s, v) => s + v.outstandingPenalty, 0)
  const openLoans = views.filter((v) => v.state !== 'CLOSED')

  // here `color` is the icon color
  const stats = [
    { label: 'Penalties Charged', value: charged.length, icon: 'triangle-alert', color: '#ef4444' },
    { label: 'Total Charged', value: formatTzs(totalCharged), icon: 'banknote', color: '#e08a1e' },
    { label: 'Still Unpaid', value: formatTzs(stillUnpaid), icon: 'clock', color: '#8e44ad' },
    { label: 'Loans To Charge', value: due.length, icon: 'hourglass', color: '#0077b5' },
    { label: 'Active Grace Periods', value: activeGrace.length, icon: 'calendar-check', color: 'var(--app-brand)' },
  ]

  /* ---------- actions ---------- */

  const charge = (list: DueRow[]) => {
    if (list.length === 0) return
    // TODO: POST /api/payments-workflow/loans/{loanId}/accrue-penalties for each loan
    //       (safe to repeat, it never charges the same installment twice)
    const today = dayjs().format('YYYY-MM-DD')
    const made: PenaltyRecord[] = list.flatMap((r, i) =>
      r.items.map((p, j) => ({
        id: Date.now() + i * 100 + j,
        loanId: r.loanId,
        installmentNo: p.installmentNo,
        rate: p.rate,
        amount: p.amount,
        date: today,
      })),
    )
    setAddedPenalties((l) => [...l, ...made])
    setNotice({
      color: 'green',
      text: `${made.length} ${made.length === 1 ? 'penalty' : 'penalties'} charged on ${list.length} ${
        list.length === 1 ? 'loan' : 'loans'
      }, ${formatTzs(made.reduce((s, p) => s + p.amount, 0))} in total.`,
    })
    setTab('charged')
  }

  const addGrace = (input: GraceInput) => {
    const v = views.find((x) => x.id === input.loanId)!
    setGraceList((l) => [
      { id: Date.now(), ...input, grantedBy: CURRENT_USER, date: dayjs().format('YYYY-MM-DD'), active: true },
      ...l,
    ])
    setNotice({
      color: 'green',
      text: `${input.graceDays} days of grace granted on ${v.loanNo}. Its late installments are not charged until they are more than ${input.graceDays} days late.`,
    })
    setGraceOpen(false)
    setTab('grace')
  }

  const endGrace = () => {
    const g = graceList.find((x) => x.id === endId)
    if (!g) return
    // TODO: PUT /api/grace-periods/{id} to switch it off (the field name comes from the GracePeriod model)
    const v = views.find((x) => x.id === g.loanId)!
    setGraceList((l) => l.map((x) => (x.id === g.id ? { ...x, active: false } : x)))
    setNotice({
      color: 'blue',
      text: `The grace period on ${v.loanNo} has ended. Any late installment can now be charged on the next run.`,
    })
    setEndId(null)
  }

  const endingLoan = endId ? views.find((v) => v.id === graceList.find((g) => g.id === endId)?.loanId) : undefined

  /* ---------- columns ---------- */

  const chargedColumns: CustomTableColumn<ChargedRow>[] = [
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
      accessor: 'installmentNo',
      header: 'Installment',
      render: (r) => <Text size="sm">#{r.installmentNo}</Text>,
      exportValue: (r) => r.installmentNo,
    },
    { accessor: 'rate', header: 'Rate', render: (r) => <Text size="sm">{r.rate}%</Text>, exportValue: (r) => r.rate },
    {
      accessor: 'amount',
      header: 'Penalty',
      render: (r) => (
        <Text size="sm" fw={500}>
          {formatTzs(r.amount)}
        </Text>
      ),
      exportValue: (r) => r.amount,
    },
    {
      accessor: 'paidStatus',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <Badge
          variant="light"
          color={r.paidStatus === 'Paid' ? 'green' : r.paidStatus === 'Partly paid' ? 'yellow' : 'red'}
          radius="sm"
          size="sm"
        >
          {r.paidStatus}
        </Badge>
      ),
    },
    { accessor: 'date', header: 'Charged on', type: 'date' },
  ]

  const dueColumns: CustomTableColumn<DueRow>[] = [
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
      accessor: 'count',
      header: 'Late installments',
      render: (r) => (
        <div>
          <div className="text-sm text-gray-800">
            {r.count} {r.count === 1 ? 'installment' : 'installments'}
          </div>
          <div className="text-xs text-gray-500">{r.installments}</div>
        </div>
      ),
      exportValue: (r) => r.installments,
    },
    {
      accessor: 'overdueDays',
      header: 'Days late',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-red-600">{r.overdueDays} days</div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            {r.grace > 0 ? `After ${r.grace} days of grace` : 'No grace period'}
          </div>
        </div>
      ),
      exportValue: (r) => r.overdueDays,
    },
    {
      accessor: 'basis',
      header: 'Owing on them',
      render: (r) => <Text size="sm">{formatTzs(r.basis)}</Text>,
      exportValue: (r) => r.basis,
    },
    {
      accessor: 'amount',
      header: 'Penalty to charge',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.amount)}</div>
          <div className="text-xs text-gray-500">{r.rate}% of what is owing</div>
        </div>
      ),
      exportValue: (r) => r.amount,
    },
    {
      // the action for this row; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 120,
      render: (r) => (
        // stop the click so the row doesn't also open the loan
        canCreate ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button size="compact-xs" leftSection={<AppIcon name="check" />} onClick={() => charge([r])}>
              Charge
            </Button>
          </div>
        ) : null
      ),
    },
  ]

  const graceColumns: CustomTableColumn<GraceRow>[] = [
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
      accessor: 'graceDays',
      header: 'Grace',
      render: (r) => (
        <Text size="sm" fw={500}>
          {r.graceDays} days
        </Text>
      ),
      exportValue: (r) => r.graceDays,
    },
    {
      accessor: 'reason',
      header: 'Reason',
      render: (r) => (
        <div className="max-w-[280px]">
          <div className="truncate text-sm text-gray-800">{r.reason}</div>
          <div className="text-xs text-gray-500">Granted by {r.grantedBy}</div>
        </div>
      ),
      exportValue: (r) => r.reason,
    },
    {
      accessor: 'overdueDays',
      header: 'Effect now',
      sortable: false,
      render: (r) => {
        const e = effectOf(r)
        return (
          <div>
            <div className="whitespace-nowrap text-sm text-gray-800">{e.text}</div>
            <div className="whitespace-nowrap text-xs text-gray-500">{e.sub}</div>
          </div>
        )
      },
      exportValue: (r) => effectOf(r).text,
    },
    {
      accessor: 'active',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <Badge variant="light" color={r.active ? 'green' : 'gray'} radius="sm" size="sm">
          {r.active ? 'Active' : 'Ended'}
        </Badge>
      ),
      exportValue: (r) => (r.active ? 'Active' : 'Ended'),
    },
    { accessor: 'date', header: 'Granted', type: 'date' },
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
              {r.active && canEdit && (
                <>
                  <Menu.Item fw={500} leftSection={<AppIcon name="x" />} onClick={() => setEndId(r.id)}>
                    End grace period
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.loanId}`)}>
                View loan
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout
      title="Penalties & Grace"
      subtitle="Late penalties and the extra time granted to borrowers"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Repayments' }, { label: 'Penalties & Grace' }]}
      actions={
        <>
          {canCreate && (
            <Button
              size="xs"
              variant="default"
              disabled={due.length === 0}
              leftSection={<AppIcon name="triangle-alert" />}
              onClick={() => charge(due)}
            >
              Charge all now
            </Button>
          )}
          {canCreate && (
            <Button size="xs" leftSection={<AppIcon name="plus" />} onClick={() => setGraceOpen(true)}>
              Add grace period
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
            <Text size="sm">{notice.text}</Text>
          </Alert>
        )}

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
              ariaLabel="Penalty filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'charged', label: `Charged (${charged.length})` },
                { value: 'due', label: `To be charged (${due.length})` },
                { value: 'grace', label: `Grace periods (${activeGrace.length} active)` },
              ]}
            />
            <Text size="xs" c="dimmed">
              Penalties are charged every day at 06:30 UTC
            </Text>
          </div>

          {tab === 'charged' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                A late penalty is charged once on each late installment: the amount still owing on it times the loan's
                penalty rate. The same installment is never charged twice, even if the charge runs again.
              </p>
              <CustomTable<ChargedRow>
                size="md"
                data={charged}
                columns={chargedColumns}
                searchInput
                searchPlaceholder="Search borrower or loan"
                searchKeys={['applicantName', 'loanNo']}
                filters={{ paidStatus: paidOptions, date: 'date' }}
                defaultSort={{ accessor: 'date', direction: 'desc' }}
                noRecordText={TAB_EMPTY.charged}
                onRowClick={(row) => navigate(`/loans/${row.loanId}`)}
                exportCsv
                exportFileName="penalties"
                print
                printTitle="Penalties"
              />
            </div>
          )}

          {tab === 'due' && (
            <div className="space-y-3">
              {due.length > 0 && (
                <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
                  <Text size="sm">
                    These loans have late installments that are past their grace period and not charged yet. The daily
                    job charges them at 06:30 UTC, or you can charge them now. A loan is always charged as a whole.
                  </Text>
                </Alert>
              )}
              <CustomTable<DueRow>
                size="md"
                data={due}
                columns={dueColumns}
                searchInput
                searchPlaceholder="Search borrower or loan"
                searchKeys={['applicantName', 'loanNo']}
                // the longest overdue first
                defaultSort={{ accessor: 'overdueDays', direction: 'desc' }}
                noRecordText={TAB_EMPTY.due}
                onRowClick={(row) => navigate(`/loans/${row.loanId}`)}
              />
            </div>
          )}

          {tab === 'grace' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                A grace period gives one loan extra days before a late installment is charged. A loan can only have one
                active grace period at a time, and {openLoans.length} {openLoans.length === 1 ? 'loan is' : 'loans are'}{' '}
                open right now.
              </p>
              <CustomTable<GraceRow>
                size="md"
                data={graceRows}
                columns={graceColumns}
                searchInput
                searchPlaceholder="Search borrower or loan"
                searchKeys={['applicantName', 'loanNo', 'reason']}
                filters={{ active: activeOptions, date: 'date' }}
                defaultSort={{ accessor: 'date', direction: 'desc' }}
                noRecordText={TAB_EMPTY.grace}
                onRowClick={(row) => navigate(`/loans/${row.loanId}`)}
                exportCsv
                exportFileName="grace-periods"
              />
            </div>
          )}
        </div>
      </div>

      <GraceDialog
        opened={graceOpen}
        loans={openLoans}
        activeLoanIds={activeGrace.map((g) => g.loanId)}
        onClose={() => setGraceOpen(false)}
        onSubmit={addGrace}
      />

      <ContractConfirmDialog
        opened={endId !== null}
        title="End grace period"
        message={`End the grace period on ${endingLoan?.loanNo ?? 'this loan'}? Its late installments can then be charged a penalty on the next run.`}
        confirmLabel="End grace period"
        onClose={() => setEndId(null)}
        onConfirm={endGrace}
      />
    </DashboardLayout>
  )
}