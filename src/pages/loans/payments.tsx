import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Drawer,
  Menu,
  Modal,
  NumberInput,
  Select,
  Text,
} from '@mantine/core'
import { AppIcon } from '../../components/appIcon'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import { applicants } from '../applicants/applicantsData'
import { PaymentDialog, type PaymentInput } from './paymentDialog'
import {
  LOANS,
  METHOD_LABEL,
  SAMPLE_PAYMENTS,
  SAMPLE_PENALTIES,
  allocatePayment,
  viewOf,
  type LoanPayment,
  type LoanView,
  type PaymentMethod,
} from './loanApplicationsData'
import { ScheduleDrawer } from './scheduleDrawer'
import { printReceipt } from './printDocs'
import { Can } from '../auth/requirePermission'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type Row = LoanPayment & {
  loanNo: string
  applicantName: string
  penalty: number
  interest: number
  principal: number
  /** the installments the money went to, like #3 or #3–#5 */
  applied: string
}

type TabKey = 'all' | 'today' | 'month'
type Notice = { text: string; viewId?: number } | null

const TAB_EMPTY: Record<TabKey, string> = {
  all: 'No payments have been recorded yet',
  today: 'No payments were recorded today',
  month: 'No payments were recorded this month',
}

const methodOptions = (Object.keys(METHOD_LABEL) as PaymentMethod[]).map((k) => ({
  value: k,
  label: METHOD_LABEL[k],
}))

const n = (x: number) => (x === 0 ? '—' : x.toLocaleString('en-US'))

const appliedTo = (p: LoanPayment) => {
  const nos = p.allocations.map((a) => a.installmentNo)
  if (nos.length === 0) return '—'
  return nos.length > 2 ? `#${nos[0]}–#${nos[nos.length - 1]}` : nos.map((x) => `#${x}`).join(', ')
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

// how one payment was split: penalty, interest and principal
function SplitBar({ r }: { r: Row }) {
  const total = r.penalty + r.interest + r.principal
  if (total === 0) return null
  const parts = [
    { label: 'Penalty', value: r.penalty, color: 'bg-amber-400' },
    { label: 'Interest', value: r.interest, color: 'bg-sky-400' },
    { label: 'Principal', value: r.principal, color: 'bg-brand' },
  ].filter((p) => p.value > 0)

  return (
    <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
      {parts.map((p) => (
        <span
          key={p.label}
          title={`${p.label} ${formatTzs(p.value)}`}
          className={p.color}
          style={{ width: `${(p.value / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

/* ---------- receipt drawer ---------- */

type BodyProps = {
  row: Row
  loan: LoanView
  onPay: (l: LoanView) => void
  onOpenLoan: (l: LoanView) => void
  onSchedule: (r: Row) => void // new
}

function ReceiptBody({ row: r, loan, onPay, onOpenLoan, onSchedule }: BodyProps) {
  const [copied, setCopied] = useState(false)
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  // SAMPLE ONLY: the real public link comes from the API (/api/receipts/**)
  const link = `${window.location.origin}/receipts/${r.id}`

  const copy = () => {
    navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tiles = [
    { label: 'Amount received', value: formatTzs(r.amount) },
    { label: 'Installments touched', value: String(r.allocations.length) },
    { label: 'Loan balance now', value: formatTzs(loan.outstanding) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="light" color="brand" radius="sm" size="sm">
          {METHOD_LABEL[r.method]}
        </Badge>
        <Text size="xs" c="dimmed">
          {r.reference || 'Cash payment'} · {dayjs(r.date).format('MMM D, YYYY')}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>How it was applied</SectionTitle>
        <div className="rounded-md border border-gray-200">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            <span>Installment</span>
            <span className="text-right">Penalty</span>
            <span className="text-right">Interest</span>
            <span className="text-right">Principal</span>
          </div>
          {r.allocations.map((a) => {
            const s = loan.installments.find((i) => i.installmentNo === a.installmentNo)
            return (
              <div
                key={a.installmentNo}
                className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-2 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">#{a.installmentNo}</div>
                  <div className="text-[11px] text-gray-400">
                    Due {s ? dayjs(s.dueDate).format('MMM D, YYYY') : '—'}
                  </div>
                </div>
                <span className="text-right text-gray-800">{n(a.penalty)}</span>
                <span className="text-right text-gray-800">{n(a.interest)}</span>
                <span className="text-right text-gray-800">{n(a.principal)}</span>
              </div>
            )
          })}
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
            <span>Total</span>
            <span className="text-right">{n(r.penalty)}</span>
            <span className="text-right">{n(r.interest)}</span>
            <span className="text-right">{n(r.principal)}</span>
          </div>
        </div>
        <div className="mt-1.5 text-[11px] text-gray-400">
          Oldest unpaid installment first. Inside each one: penalty, then interest, then principal. Amounts in TZS.
        </div>
      </div>

      <div>
        <SectionTitle>Payment details</SectionTitle>
        <Field label="Borrower" value={r.applicantName} />
        <Field label="Loan" value={r.loanNo} />
        <Field label="Method" value={METHOD_LABEL[r.method]} />
        <Field label="Reference" value={r.reference || 'None (cash)'} />
        <Field label="Date" value={dayjs(r.date).format('MMM D, YYYY')} />
        <Field label="Received by" value={r.receivedBy} />
        {r.unallocated > 0 && <Field label="Not applied" value={formatTzs(r.unallocated)} />}
        <Field label="Applied in total" value={formatTzs(r.penalty + r.interest + r.principal)} />
      </div>

      <div>
        <SectionTitle>Proof of payment</SectionTitle>
        {r.receiptName ? (
          <div className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
            <AppIcon name="file-text" className="text-gray-400" size={20} />
            <div className="min-w-0 flex-1 truncate text-sm text-gray-800">{r.receiptName}</div>
            <Button
              size="compact-xs"
              variant="subtle"
              color="brand"
              onClick={() =>
                setViewing({
                  title: 'Proof of payment',
                  fileName: r.receiptName!,
                  subtitle: `${r.applicantName} · ${dayjs(r.date).format('MMM D, YYYY')}`,
                  file: r.receiptFile,
                })
              }
            >
              View
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500">
            No receipt uploaded
          </div>
        )}
      </div>

      <div className="rounded-md bg-gray-50 px-3 py-2.5">
        <div className="text-xs text-gray-500">Receipt link</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{link}</span>
          <Button
            size="compact-xs"
            variant={copied ? 'light' : 'default'}
            color={copied ? 'green' : undefined}
            leftSection={<AppIcon name={copied ? 'check' : 'clipboard'} />}
            onClick={copy}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div className="mt-1 text-[11px] text-gray-400">
          Anyone with the link can view this receipt, so send it to the borrower.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* inactive for now: no click handler until printing is built */}
        <Button size="xs" variant="default" leftSection={<AppIcon name="printer" />} onClick={() => printReceipt(r, loan)}>
          Print receipt
        </Button>
        <Button size="xs" variant="default" leftSection={<AppIcon name="external-link" />} onClick={() => onOpenLoan(loan)}>
          View loan
        </Button>
        <Button size="xs" variant="default" leftSection={<AppIcon name="calendar-days" />} onClick={() => onSchedule(r)}>
          View payment schedule
        </Button>
        {loan.state !== 'CLOSED' && (
          <Can area="repayments" page="payments" action="create">
          <Button size="xs" leftSection={<AppIcon name="banknote" />} onClick={() => onPay(loan)}>
            Record another payment
          </Button>
          </Can>
        )}
      </div>
      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

/* ---------- repayment reminders ---------- */

// the same rule as POST /api/repayment-reminders/send: installments due within the window, or already overdue
function reminderPlan(views: LoanView[], windowDays: number) {
  const today = dayjs().startOf('day')
  const open = views.flatMap((v) => v.installments.filter((s) => s.outstanding > 0).map((s) => ({ v, s })))
  const overdue = open.filter(({ s }) => s.daysOverdue > 0)
  const upcoming = open.filter(
    ({ s }) => s.daysOverdue === 0 && dayjs(s.dueDate).startOf('day').diff(today, 'day') <= windowDays,
  )
  // an email is only sent when the borrower has an email address, a notification is always logged
  const withEmail = [...overdue, ...upcoming].filter(({ v }) => !!applicants.find((a) => a.id === v.applicantId)?.email)

  return {
    upcoming: upcoming.length,
    overdue: overdue.length,
    emailsSent: withEmail.length,
    notificationsLogged: overdue.length + upcoming.length,
  }
}

type Plan = ReturnType<typeof reminderPlan>

type ReminderProps = {
  opened: boolean
  views: LoanView[]
  onClose: () => void
  onSent: (plan: Plan) => void
}

function ReminderDialog({ opened, views, onClose, onSent }: ReminderProps) {
  const [days, setDays] = useState<number | ''>(3)
  const plan = reminderPlan(views, days === '' ? 3 : days)
  const nothing = plan.upcoming + plan.overdue === 0

  const send = () => {
    // TODO: POST /api/repayment-reminders/send?upcomingWindowDays={days}
    onSent(plan)
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Send repayment reminders" centered>
      <div className="space-y-4">
        <Text size="sm">
          Email borrowers whose installments are due soon or already overdue. A notification is logged for each one.
        </Text>

        <NumberInput
          label="Upcoming window"
          description="Include installments due within this many days"
          size="sm"
          suffix=" days"
          min={0}
          max={30}
          allowNegative={false}
          allowDecimal={false}
          hideControls
          value={days}
          onChange={(v) => setDays(v === '' ? '' : Number(v))}
        />

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Due soon', value: plan.upcoming },
            { label: 'Overdue', value: plan.overdue },
            { label: 'Emails to send', value: plan.emailsSent },
          ].map((t) => (
            <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-500">{t.label}</div>
              <div className="text-lg font-medium text-gray-800">{t.value}</div>
            </div>
          ))}
        </div>

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="xs">
            This also runs by itself every day at 06:00 UTC. Sending now just does it ahead of time.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" disabled={nothing} leftSection={<AppIcon name="send" />} onClick={send}>
            {nothing ? 'Nobody to remind' : 'Send reminders'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- page ---------- */

export function PaymentsPage() {
  const navigate = useNavigate()
  const { canCreate } = usePageAccess('repayments', 'payments')
  const [params, setParams] = useSearchParams()

  // UI only: payments recorded in this session, nothing is saved yet
  const [added, setAdded] = useState<LoanPayment[]>([])
  const [tab, setTab] = useState<TabKey>('all')
  const [notice, setNotice] = useState<Notice>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [pickId, setPickId] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string>()
  const [payId, setPayId] = useState<number | null>(null)
  const [remindOpen, setRemindOpen] = useState(false)
  const [schedule, setSchedule] = useState<{ loanId: number; highlight: number[] } | null>(null)

  const openSchedule = (r: Row) =>
    setSchedule({ loanId: r.loanId, highlight: r.allocations.map((a) => a.installmentNo) })

  const payments = useMemo(() => [...SAMPLE_PAYMENTS, ...added], [added])
  const views = useMemo(() => LOANS.map((l) => viewOf(l, payments, SAMPLE_PENALTIES)), [payments])

  // every loan of that borrower, so the drawer can switch between them
  const scheduleLoan = schedule ? views.find((v) => v.id === schedule.loanId) : undefined
  const scheduleLoans = scheduleLoan ? views.filter((v) => v.applicantId === scheduleLoan.applicantId) : []

  const rows = useMemo<Row[]>(
    () =>
      payments.map((p) => {
        const v = views.find((x) => x.id === p.loanId)!
        const sum = (key: 'penalty' | 'interest' | 'principal') => p.allocations.reduce((s, a) => s + a[key], 0)
        return {
          ...p,
          loanNo: v.loanNo,
          applicantName: v.applicantName,
          penalty: sum('penalty'),
          interest: sum('interest'),
          principal: sum('principal'),
          applied: appliedTo(p),
        }
      }),
    [payments, views],
  )

  const today = dayjs().format('YYYY-MM-DD')
  const todayRows = rows.filter((r) => r.date === today)
  const monthRows = rows.filter((r) => dayjs(r.date).isSame(dayjs(), 'month'))
  const tabData: Record<TabKey, Row[]> = { all: rows, today: todayRows, month: monthRows }

  const sum = (list: Row[]) => list.reduce((s, r) => s + r.amount, 0)

  // collection efficiency: what was collected on installments that have fallen due, against what was due
  const fallenDue = views.flatMap((v) => v.installments.filter((s) => !dayjs(s.dueDate).isAfter(dayjs(), 'day')))
  const expected = fallenDue.reduce((t, s) => t + s.principalDue + s.interestDue + s.penaltyDue, 0)
  const collected = fallenDue.reduce((t, s) => t + s.paid, 0)
  const efficiency = expected > 0 ? Math.round((collected / expected) * 100) : 0
  const pastDue = views.reduce((t, v) => t + v.overdueAmount, 0)

  // here `color` is the icon color
  const stats = [
    { label: 'Collected Today', value: formatTzs(sum(todayRows)), icon: 'banknote', color: '#45bdfc' },
    { label: 'Collected This Month', value: formatTzs(sum(monthRows)), icon: 'calendar-check', color: 'var(--app-brand)' },
    { label: 'Payments This Month', value: monthRows.length, icon: 'credit-card', color: '#8e44ad' },
    { label: 'Past Due To Collect', value: formatTzs(pastDue), icon: 'clock', color: '#e08a1e' },
    { label: 'Collection Efficiency', value: `${efficiency}%`, icon: 'hand-coins', color: '#0077b5' },
  ]

  // /payments?view=101 opens the receipt for payment 101
  const viewId = params.get('view')
  const selected = viewId ? (rows.find((r) => String(r.id) === viewId) ?? null) : null
  const selectedLoan = selected ? views.find((v) => v.id === selected.loanId) : undefined
  const openView = (id: number) => setParams({ view: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const payLoan = payId ? (views.find((v) => v.id === payId && v.state !== 'CLOSED') ?? null) : null
  const pickLoan = views.find((v) => String(v.id) === pickId)

  const loanOptions = views
    .filter((v) => v.state !== 'CLOSED')
    .map((v) => ({
      value: String(v.id),
      label: `${v.applicantName} · ${v.loanNo} · ${formatTzs(v.outstanding)} outstanding`,
    }))

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const closePick = () => {
    setPickOpen(false)
    setPickId(null)
    setPickError(undefined)
  }

  const continuePick = () => {
    if (!pickLoan) {
      setPickError('Select the loan the payment is for')
      return
    }
    setPayId(pickLoan.id)
    closePick()
  }

  const startPay = (v: LoanView) => {
    closeView()
    setPayId(v.id)
  }

  const usedReferences = payments.map((p) => p.reference).filter(Boolean)

  const record = (input: PaymentInput) => {
    if (!payLoan) return
    // TODO: POST /api/payments-workflow/loans/{loanId}/pay { amount, paymentMethod, referenceNumber, receivedBy }
    const { allocations, unallocated } = allocatePayment(input.amount, payLoan.installments)
    const payment: LoanPayment = {
      id: Date.now(),
      loanId: payLoan.id,
      ...input,
      date: today,
      allocations,
      unallocated,
    }
    const after = viewOf(payLoan, [...payLoan.payments, payment], payLoan.penalties)

    setAdded((list) => [...list, payment])
    setNotice({
      text: `${formatTzs(input.amount)} recorded for ${payLoan.applicantName}. ${
        after.state === 'CLOSED'
          ? 'The loan is fully repaid and now closed.'
          : `${formatTzs(after.outstanding)} is still outstanding on ${payLoan.loanNo}.`
      }`,
      viewId: payment.id,
    })
    setTab('all')
    setPayId(null)
  }

  const columns: CustomTableColumn<Row>[] = [
    {
      // the accessor is "method" so the Method filter can read it
      accessor: 'method',
      header: 'Payment',
      sortable: false,
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.reference || 'Cash payment'}</div>
          <div className="truncate text-xs text-gray-500">
            {METHOD_LABEL[r.method]} · {r.receivedBy}
          </div>
        </div>
      ),
      exportValue: (r) => `${METHOD_LABEL[r.method]} ${r.reference}`.trim(),
    },
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
      accessor: 'amount',
      header: 'Amount',
      render: (r) => <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.amount)}</div>,
      exportValue: (r) => r.amount,
    },
    {
      accessor: 'applied',
      header: 'Applied to',
      sortable: false,
      render: (r) => (
        <div className="space-y-1.5">
          <div className="text-sm text-gray-800">Installment {r.applied}</div>
          <SplitBar r={r} />
        </div>
      ),
      exportValue: (r) => `${r.applied} (penalty ${r.penalty}, interest ${r.interest}, principal ${r.principal})`,
    },
    { accessor: 'date', header: 'Date', type: 'date' },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (r) => {
        const loan = views.find((v) => v.id === r.loanId)!
        return (
          // stop the click so the row doesn't also open the receipt
          <div onClick={(e) => e.stopPropagation()}>
            <Menu position="bottom-end" shadow="md" width={230}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for payment ${r.id}`}>
                  <AppIcon name="ellipsis-vertical" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item fw={500} leftSection={<AppIcon name="eye" />} onClick={() => openView(r.id)}>
                  View receipt
                </Menu.Item>
                <Menu.Item leftSection={<AppIcon name="calendar-days" />} onClick={() => openSchedule(r)}>
                  View payment schedule
                </Menu.Item>
                {loan.state !== 'CLOSED' && canCreate && (
                  <Menu.Item leftSection={<AppIcon name="banknote" />} onClick={() => startPay(loan)}>
                    Record another payment
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.loanId}`)}>
                  View loan
                </Menu.Item>
                <Menu.Item
                  leftSection={<AppIcon name="user-round" />}
                  onClick={() => navigate(`/applicants/${loan.applicantId}`)}
                >
                  View borrower
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        )
      },
    },
  ]

  return (
    <DashboardLayout
      title="Payments"
      subtitle="Every repayment received across all loans"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Repayments' }, { label: 'Payments' }]}
      actions={
        <>
          {canCreate && (
            <Button size="xs" variant="default" leftSection={<AppIcon name="send" />} onClick={() => setRemindOpen(true)}>
              Send reminders
            </Button>
          )}
          {canCreate && (
            <Button size="xs" leftSection={<AppIcon name="plus" />} onClick={() => setPickOpen(true)}>
              Record payment
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color="green"
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name="circle-check" />}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">{notice.text}</Text>
              {notice.viewId && (
                <Button
                  size="compact-xs"
                  onClick={() => {
                    openView(notice.viewId!)
                    setNotice(null)
                  }}
                >
                  View receipt
                </Button>
              )}
            </div>
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
              ariaLabel="Payment filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'all', label: `All (${rows.length})` },
                { value: 'today', label: `Today (${todayRows.length})` },
                { value: 'month', label: `This month (${monthRows.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              Total shown {formatTzs(sum(tabData[tab]))}
            </Text>
          </div>

          <CustomTable<Row>
            size="md"
            data={tabData[tab]}
            columns={columns}
            searchInput
            searchPlaceholder="Search borrower, loan or reference"
            searchKeys={['applicantName', 'loanNo', 'reference']}
            filters={{ method: methodOptions, date: 'date' }}
            // the newest payments first
            defaultSort={{ accessor: 'date', direction: 'desc' }}
            noRecordText={TAB_EMPTY[tab]}
            onRowClick={(row) => openView(row.id)}
            exportCsv
            exportFileName="payments"
            print
            printTitle="Payments"
          />
        </div>
      </div>

      {/* receipt drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.applicantName ?? ''}>
        {selected && selectedLoan && (
        <ReceiptBody
          row={selected}
          loan={selectedLoan}
          onPay={startPay}
          onOpenLoan={(l) => navigate(`/loans/${l.id}`)}
          onSchedule={(r) => {
            closeView()
            openSchedule(r)
          }}
        />
        )}
      </Drawer>

      {/* step 1 of recording a payment: which loan is it for */}
      <Modal opened={pickOpen} onClose={closePick} title="Record payment" centered>
        <div className="space-y-4">
          <Select
            label="Loan"
            description="Only loans that still have a balance are listed"
            placeholder="Search by borrower or loan number"
            size="sm"
            searchable
            nothingFoundMessage="No open loans found"
            data={loanOptions}
            allowDeselect={false}
            value={pickId}
            onChange={(v) => {
              setPickId(v)
              setPickError(undefined)
            }}
            error={pickError}
          />

          {pickLoan && (
            <div className="rounded-md bg-gray-50 px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Outstanding</span>
                <span className="font-medium text-gray-800">{formatTzs(pickLoan.outstanding)}</span>
              </div>
              {pickLoan.overdueAmount > 0 && (
                <div className="mt-1 flex justify-between gap-4">
                  <span className="text-gray-500">Past due</span>
                  <span className="font-medium text-red-600">
                    {formatTzs(pickLoan.overdueAmount)} · {pickLoan.overdueDays} days
                  </span>
                </div>
              )}
              {pickLoan.next && (
                <div className="mt-1 flex justify-between gap-4">
                  <span className="text-gray-500">Next due</span>
                  <span className="font-medium text-gray-800">
                    {dayjs(pickLoan.next.dueDate).format('MMM D, YYYY')} · {formatTzs(pickLoan.next.outstanding)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button size="xs" variant="default" onClick={closePick}>
              Cancel
            </Button>
            <Button size="xs" onClick={continuePick}>
              Continue
            </Button>
          </div>
        </div>
      </Modal>

      {/* step 2: the same payment dialog as on the loan profile */}
      <PaymentDialog
        opened={!!payLoan}
        loan={payLoan}
        usedReferences={usedReferences}
        onClose={() => setPayId(null)}
        onSubmit={record}
      />

      <ReminderDialog
        opened={remindOpen}
        views={views}
        onClose={() => setRemindOpen(false)}
        onSent={(plan) => {
          setRemindOpen(false)
          setNotice({
            text: `Reminders sent: ${plan.upcoming} due soon and ${plan.overdue} overdue. ${plan.emailsSent} emails sent and ${plan.notificationsLogged} notifications logged.`,
          })
        }}
      />

      <ScheduleDrawer
        opened={!!schedule}
        loans={scheduleLoans}
        loanId={schedule?.loanId ?? null}
        highlight={schedule?.highlight}
        onClose={() => setSchedule(null)}
        onOpenLoan={(l) => navigate(`/loans/${l.id}`)}
        onPay={(l) => {
          setSchedule(null)
          setPayId(l.id)
        }}
      />
    </DashboardLayout>
  )
}