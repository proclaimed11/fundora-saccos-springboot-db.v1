import { AppIcon } from '../../components/appIcon'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import { CURRENT_USER } from '../loans/disbursementDialog'
import { NPL_STYLE, type LoanView } from '../loans/loanApplicationsData'
import {
  LogRecoveryActionDialog,
  RemarksDialog,
  WriteOffDialog,
  type RecoveryActionInput,
  type WriteOffInput,
} from './collectionDialogs'
import {
  LOAN_VIEWS,
  RECOVERY_ACTION_ICON,
  RECOVERY_ACTION_LABEL,
  RECOVERY_STALE_AFTER_DAYS,
  RECOVERY_STATUS,
  SAMPLE_RECOVERY_ACTIONS,
  SAMPLE_RECOVERY_CASES,
  caseNoFor,
  type RecoveryAction,
  type RecoveryCase,
  type RecoveryStatus,
  type WriteOffRecord,
} from './collectionsData'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { allWriteOffs, nextWriteOffId, saveWriteOff, writeOffFor } from './writeOffStore'
import { Can } from '../auth/requirePermission'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'open' | 'closed' | 'all'

type RecoveryRow = RecoveryCase & {
  loan: LoanView
  loanNo: string
  borrower: string
  overdueDays: number
  /** what the borrower still owes, zero once the loan is written off */
  outstanding: number
  /** newest first */
  actions: RecoveryAction[]
  last: RecoveryAction | null
  /** days since the last action, or since the case opened when there has been none */
  idleDays: number
  stale: boolean
  writeOff: WriteOffRecord | null
  /** the collection case it was escalated from */
  sourceCaseNo: string
}

type Notice = { text: string; color: 'green' | 'blue'; viewId?: number } | null

type DialogState = { kind: 'action' | 'close' | 'writeoff'; caseId: number } | null

const TAB_EMPTY: Record<TabKey, string> = {
  open: 'No recovery cases are open',
  closed: 'No recovery cases have been closed yet',
  all: 'No recovery cases yet',
}

const statusOptions = (Object.keys(RECOVERY_STATUS) as RecoveryStatus[]).map((s) => ({
  value: s,
  label: RECOVERY_STATUS[s].label,
}))

const ago = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`)

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

function OverdueCell({ r }: { r: RecoveryRow }) {
  if (r.writeOff) return <span className="text-xs text-gray-400">Loan written off</span>
  if (r.loan.state === 'CLOSED') return <span className="text-xs text-gray-400">Loan fully repaid</span>
  if (r.loan.overdueDays === 0) return <span className="text-xs text-gray-400">Not overdue now</span>

  return (
    <div>
      <div className="whitespace-nowrap text-sm font-medium text-red-600">{r.loan.overdueDays} days overdue</div>
      <div className="whitespace-nowrap text-xs text-gray-500">{formatTzs(r.loan.overdueAmount)} past due</div>
      <div className="mt-1">
        <Badge variant="outline" color={NPL_STYLE[r.loan.classification].color} radius="sm" size="sm">
          {r.loan.isNpl ? 'NPL · ' : ''}
          {NPL_STYLE[r.loan.classification].label}
        </Badge>
      </div>
    </div>
  )
}

function Timeline({ list, onView }: { list: RecoveryAction[]; onView: (a: RecoveryAction) => void }) {
  if (list.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
        No recovery action has been logged yet.
      </div>
    )
  }

  return (
    <ul className="space-y-4">
      {list.map((a) => (
        <li key={a.id} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <AppIcon name={RECOVERY_ACTION_ICON[a.type]} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-800">{RECOVERY_ACTION_LABEL[a.type]}</span>
              <span className="shrink-0 text-xs text-gray-400">{dayjs(a.date).format('MMM D, YYYY')}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">{a.description}</div>
            {a.amount > 0 && (
              <div className="mt-1 text-xs font-medium text-gray-800">Amount: {formatTzs(a.amount)}</div>
            )}
            {a.documentName && (
              <div className="mt-1.5 flex items-center gap-2 rounded-md border border-gray-200 px-2.5 py-1.5">
                <AppIcon name="file-text" className="text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{a.documentName}</span>
                <Button size="compact-xs" variant="subtle" color="brand" onClick={() => onView(a)}>
                  View
                </Button>
              </div>
            )}
            <div className="text-[11px] text-gray-400">By {a.performedBy}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function nextStep(r: RecoveryRow): string {
  if (!r.last) return 'No recovery action has been logged yet. Log the first step, such as a demand letter.'
  if (r.stale) return `Nothing has been done for ${r.idleDays} days. Log the next step or close the case.`
  if (r.last.type === 'NEGOTIATED_SETTLEMENT') {
    return 'A settlement was discussed. Record any money received on the Payments page, then close the case once it is cleared.'
  }
  return 'Log every legal step so the history stays complete. If the loan cannot be recovered, it can be written off.'
}

/* ---------- case drawer ---------- */

type DrawerProps = {
  row: RecoveryRow
  onLog: (r: RecoveryRow) => void
  onClose: (r: RecoveryRow) => void
  onWriteOff: (r: RecoveryRow) => void
  onOpenLoan: (r: RecoveryRow) => void
  onOpenBorrower: (r: RecoveryRow) => void
  onSourceCase: (r: RecoveryRow) => void
  onPayments: () => void
  onViewDocument: (a: RecoveryAction) => void
}

function CaseDrawerBody({
  row: r,
  onLog,
  onClose,
  onWriteOff,
  onOpenLoan,
  onOpenBorrower,
  onSourceCase,
  onPayments,
  onViewDocument
}: DrawerProps) {
  const isOpen = r.status === 'OPEN'
  const settlement = r.actions.filter((a) => a.type === 'NEGOTIATED_SETTLEMENT').reduce((s, a) => s + a.amount, 0)

  const tiles = [
    { label: r.writeOff ? 'Written off' : 'Outstanding', value: formatTzs(r.writeOff ? r.writeOff.amount : r.outstanding) },
    { label: 'Days overdue', value: r.loan.overdueDays > 0 && !r.writeOff ? `${r.loan.overdueDays} days` : '—' },
    { label: 'Settlement discussed', value: settlement > 0 ? formatTzs(settlement) : '—' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="light" color={RECOVERY_STATUS[r.status].color} radius="sm" size="sm">
          {RECOVERY_STATUS[r.status].label}
        </Badge>
        {r.writeOff ? (
          <Badge variant="filled" color="dark" radius="sm" size="sm">
            Written off
          </Badge>
        ) : (
          r.loan.isNpl && (
            <Badge variant="outline" color={NPL_STYLE[r.loan.classification].color} radius="sm" size="sm">
              NPL · {NPL_STYLE[r.loan.classification].label}
            </Badge>
          )
        )}
        <Text size="xs" c="dimmed">
          {r.caseNo} · {r.loanNo} · Assigned to {r.assignedTo}
        </Text>
      </div>

      {/* what to do next */}
      {isOpen ? (
        <div className="rounded-md border border-brand/20 bg-brand-subtle p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Next step</div>
          <p className="mt-1 text-sm text-gray-700">{nextStep(r)}</p>
          <Can area="collections" page="recovery-cases" action="edit">
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="xs" leftSection={<AppIcon name="scale" />} onClick={() => onLog(r)}>
                Log action
              </Button>
              <Button size="xs" variant="default" leftSection={<AppIcon name="check" />} onClick={() => onClose(r)}>
                Close case
              </Button>
              <Button
                size="xs"
                color="red"
                variant="light"
                disabled={!r.loan.isNpl}
                leftSection={<AppIcon name="triangle-alert" />}
                onClick={() => onWriteOff(r)}
              >
                Write off loan
              </Button>
            </div>
          </Can>
          <p className="mt-2 text-xs text-gray-500">
            A write-off is the last step for a loan that cannot be recovered. It needs the loan to be non-performing.
          </p>
        </div>
      ) : (
        <Alert
          color={r.writeOff ? 'red' : 'gray'}
          variant="light"
          icon={<AppIcon name={r.writeOff ? 'triangle-alert' : 'circle-check'} />}
        >
          <Text size="sm">
            {r.writeOff
              ? `The loan was written off on ${dayjs(r.writeOff.date).format('MMM D, YYYY')}. ${r.writeOff.reason}`
              : 'This recovery case is closed.'}
            {!r.writeOff && r.closeRemarks ? ` "${r.closeRemarks}"` : ''}
          </Text>
        </Alert>
      )}

      {isOpen && (
        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm">
              Recovery actions are only a log. Money collected must be recorded as a payment on the loan.
            </Text>
            <Button size="compact-xs" variant="default" onClick={onPayments}>
              Payments
            </Button>
          </div>
        </Alert>
      )}

      {isOpen && r.stale && (
        <Alert color="yellow" variant="light" icon={<AppIcon name="clock" />}>
          <Text size="sm">No action has been logged for {r.idleDays} days.</Text>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>{`Recovery actions (${r.actions.length})`}</SectionTitle>
        <div className="mt-3">
          <Timeline list={r.actions} onView={onViewDocument} />
        </div>
      </div>

      <div>
        <SectionTitle>Case details</SectionTitle>
        <Field label="Case number" value={r.caseNo} />
        <Field label="Escalated from" value={r.sourceCaseNo} />
        <Field label="Borrower" value={r.borrower} />
        <Field label="Loan" value={r.loanNo} />
        <Field label="Assigned to" value={r.assignedTo} />
        <Field label="Opened" value={dayjs(r.opened).format('MMM D, YYYY')} />
        {r.closed && <Field label="Closed" value={dayjs(r.closed).format('MMM D, YYYY')} />}
        {r.remarks && <Field label="Remarks" value={r.remarks} />}
        {r.writeOff && <Field label="Approved by" value={r.writeOff.approvedBy} />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => onOpenLoan(r)}>
          View loan
        </Button>
        <Button size="xs" variant="default" leftSection={<AppIcon name="user-round" />} onClick={() => onOpenBorrower(r)}>
          View borrower
        </Button>
        {r.sourceCaseId && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="phone" />} onClick={() => onSourceCase(r)}>
            Collection case
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function RecoveryCasesPage() {
  const navigate = useNavigate()
  const { canEdit } = usePageAccess('collections', 'recovery-cases')
  const [params, setParams] = useSearchParams()

  // UI only: changes made in this session, nothing is saved yet
  const [cases, setCases] = useState<RecoveryCase[]>(() =>
  SAMPLE_RECOVERY_CASES.map((c) => {
    const w = writeOffFor(c.loanId)
    return w && c.status === 'OPEN'
      ? { ...c, status: 'CLOSED' as const, closed: w.date, closeRemarks: 'Loan written off' }
      : c
  }),
)
  const [actions, setActions] = useState<RecoveryAction[]>(SAMPLE_RECOVERY_ACTIONS)
  const [writeOffs, setWriteOffs] = useState<Record<number, WriteOffRecord>>(() =>
  Object.fromEntries(
    allWriteOffs()
      .filter((w) => w.loanId !== null)
      .map((w) => [
        w.loanId as number,
        { loanId: w.loanId as number, amount: w.amount, reason: w.reason, approvedBy: w.approvedBy, date: w.date },
      ]),
  ),
)
  const [tab, setTab] = useState<TabKey>('open')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  

const viewDocument = (a: RecoveryAction) => {
  if (!a.documentName) return
  setViewing({
    title: RECOVERY_ACTION_LABEL[a.type],
    fileName: a.documentName,
    subtitle: `Logged by ${a.performedBy} on ${dayjs(a.date).format('MMM D, YYYY')}`,
    notes: a.description,
    file: a.file,
  })
}

  const today = dayjs().format('YYYY-MM-DD')
  const nextId = (list: { id: number }[]) => Math.max(0, ...list.map((x) => x.id)) + 1

  const rows = useMemo<RecoveryRow[]>(
    () =>
      cases.map((c) => {
        const loan = LOAN_VIEWS.find((l) => l.id === c.loanId)!
        const list = actions
          .filter((a) => a.recoveryCaseId === c.id)
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        const last = list[0] ?? null
        const idleDays = dayjs().diff(dayjs(last?.date ?? c.opened), 'day')
        const writeOff = writeOffs[c.loanId] ?? null
        return {
          ...c,
          loan,
          loanNo: loan.loanNo,
          borrower: loan.applicantName,
          overdueDays: loan.overdueDays,
          outstanding: writeOff ? 0 : loan.outstanding,
          actions: list,
          last,
          idleDays,
          stale: c.status === 'OPEN' && idleDays > RECOVERY_STALE_AFTER_DAYS,
          writeOff,
          sourceCaseNo: c.sourceCaseId ? caseNoFor(c.sourceCaseId) : '—',
        }
      }),
    [cases, actions, writeOffs],
  )

  const openRows = rows.filter((r) => r.status === 'OPEN')
  const closedRows = rows.filter((r) => r.status !== 'OPEN')
  const stale = openRows.filter((r) => r.stale)
  const underRecovery = openRows.reduce((s, r) => s + r.outstanding, 0)
  const settlements = openRows
    .flatMap((r) => r.actions)
    .filter((a) => a.type === 'NEGOTIATED_SETTLEMENT')
    .reduce((s, a) => s + a.amount, 0)
  const writtenOff = Object.values(writeOffs).reduce((s, w) => s + w.amount, 0)

  // here `color` is the icon color
  const stats = [
    { label: 'Open Recovery Cases', value: openRows.length, icon: 'undo-2', color: '#e08a1e' },
    { label: 'Amount Under Recovery', value: formatTzs(underRecovery), icon: 'banknote', color: '#8e44ad' },
    { label: 'Settlements Discussed', value: formatTzs(settlements), icon: 'hand-coins', color: 'var(--app-brand)' },
    { label: `No Action In ${RECOVERY_STALE_AFTER_DAYS} Days`, value: stale.length, icon: 'clock', color: '#0077b5' },
    { label: 'Written Off This Session', value: formatTzs(writtenOff), icon: 'triangle-alert', color: '#ef4444' },
  ]

  const tabData: Record<TabKey, RecoveryRow[]> = { open: openRows, closed: closedRows, all: rows }

  // /recovery-cases?case=1 opens the drawer for recovery case 1
  const caseParam = params.get('case')
  const selected = caseParam ? (rows.find((r) => String(r.id) === caseParam) ?? null) : null
  const openView = (id: number) => setParams({ case: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const dialogCase = dialog ? rows.find((r) => r.id === dialog.caseId) : undefined

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  /* ---------- actions ---------- */

  const logAction = (input: RecoveryActionInput) => {
    if (!dialogCase) return
    // TODO: POST /api/collections-workflow/recovery-cases/{recoveryCaseId}/actions
    //       { actionType, description, amount, documentPath, performedBy }
    setActions((list) => [
      ...list,
      {
        id: nextId(list),
        recoveryCaseId: dialogCase.id,
        type: input.type,
        description: input.description,
        amount: input.amount,
        documentName: input.documentName,
        file: input.file,
        performedBy: CURRENT_USER,
        date: today,
      },
    ])
    setNotice({ color: 'green', text: `Recovery action logged on ${dialogCase.caseNo}.`, viewId: dialogCase.id })
    setDialog(null)
  }

  const closeCase = (remarks: string) => {
    if (!dialogCase) return
    // TODO: POST /api/collections-workflow/recovery-cases/{recoveryCaseId}/close { remarks }
    setCases((list) =>
      list.map((c) => (c.id === dialogCase.id ? { ...c, status: 'CLOSED', closed: today, closeRemarks: remarks } : c)),
    )
    setNotice({ color: 'blue', text: `Recovery case ${dialogCase.caseNo} is closed.` })
    setTab('closed')
    setDialog(null)
  }

  const writeOff = (input: WriteOffInput) => {
    if (!dialogCase || !dialogCase.loan.isNpl) return
    // TODO: POST /api/collections-workflow/loans/{loanId}/write-off { reason, approvedBy }
    //       needs Loan.isNpl and a loan that is not already written off.
    //       The API zeroes the balances and closes every open case on the loan.

    const loan = dialogCase.loan
    const amount = loan.outstanding

    // Persist to the shared write-off store (visible on other pages)
    saveWriteOff({
      id: nextWriteOffId(),
      loanId: loan.id,
      applicantId: loan.applicantId,
      loanNo: loan.loanNo,
      borrower: loan.applicantName,
      principal: loan.outstandingPrincipal,
      interest: loan.outstandingInterest,
      penalty: loan.outstandingPenalty,
      amount: loan.outstanding,
      overdueDays: loan.overdueDays,
      classification: loan.classification,
      reason: input.reason,
      approvedBy: input.approvedBy,
      date: today,
    })

    // Keep the local UI state in sync for this page
    setWriteOffs((w) => ({
      ...w,
      [dialogCase.loanId]: {
        loanId: dialogCase.loanId,
        amount,
        reason: input.reason,
        approvedBy: input.approvedBy,
        date: today,
      },
    }))

    setCases((list) =>
      list.map((c) =>
        c.loanId === dialogCase.loanId && c.status === 'OPEN'
          ? { ...c, status: 'CLOSED', closed: today, closeRemarks: 'Loan written off' }
          : c,
      ),
    )

    setNotice({
      color: 'green',
      text: `${dialogCase.loanNo} was written off for ${formatTzs(amount)}. The recovery case is now closed.`,
      viewId: dialogCase.id,
    })
    setTab('closed')
    setDialog(null)
  }

  /* ---------- columns ---------- */

  const columns: CustomTableColumn<RecoveryRow>[] = [
    {
      accessor: 'borrower',
      header: 'Borrower',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.borrower}</div>
          <div className="truncate text-xs text-gray-500">
            {r.caseNo} · {r.loanNo}
          </div>
        </div>
      ),
      exportValue: (r) => `${r.caseNo} (${r.borrower}, ${r.loanNo})`,
    },
    {
      accessor: 'overdueDays',
      header: 'Overdue',
      render: (r) => <OverdueCell r={r} />,
      exportValue: (r) => r.overdueDays,
    },
    {
      accessor: 'outstanding',
      header: 'Outstanding',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.outstanding)}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            {r.writeOff ? `${formatTzs(r.writeOff.amount)} written off` : `of ${formatTzs(r.loan.principal)} loan`}
          </div>
        </div>
      ),
      exportValue: (r) => r.outstanding,
    },
    {
      accessor: 'idleDays',
      header: 'Last action',
      render: (r) => {
        if (!r.last) {
          return (
            <div>
              <div
                className={`whitespace-nowrap text-sm ${r.status === 'OPEN' ? 'font-medium text-amber-600' : 'text-gray-400'}`}
              >
                No action yet
              </div>
              <div className="whitespace-nowrap text-xs text-gray-500">Opened {ago(r.idleDays)}</div>
            </div>
          )
        }
        return (
          <div>
            <div className={`whitespace-nowrap text-sm ${r.stale ? 'font-medium text-amber-600' : 'text-gray-800'}`}>
              {r.stale && <AppIcon name="triangle-alert" className="mr-1" />}
              {RECOVERY_ACTION_LABEL[r.last.type]} · {ago(r.idleDays)}
            </div>
            <div className="max-w-[220px] truncate text-xs text-gray-500">{r.last.description}</div>
          </div>
        )
      },
      exportValue: (r) => (r.last ? `${RECOVERY_ACTION_LABEL[r.last.type]} ${r.last.date}` : 'No action'),
    },
    {
      accessor: 'assignedTo',
      header: 'Assigned to',
      render: (r) => <span className="text-sm text-gray-800">{r.assignedTo}</span>,
    },
    {
      accessor: 'status',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <div className="space-y-1">
          <Badge variant="light" color={RECOVERY_STATUS[r.status].color} radius="sm" size="sm">
            {RECOVERY_STATUS[r.status].label}
          </Badge>
          {r.writeOff && (
            <div>
              <Badge variant="filled" color="dark" radius="sm" size="sm">
                Written off
              </Badge>
            </div>
          )}
          <div className="text-[11px] text-gray-500">
            {r.actions.length} {r.actions.length === 1 ? 'action' : 'actions'}
          </div>
        </div>
      ),
      exportValue: (r) => RECOVERY_STATUS[r.status].label,
    },
    { accessor: 'opened', header: 'Opened', type: 'date' },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (r) => (
        // stop the click so the row doesn't also open the drawer
        <div onClick={(e) => e.stopPropagation()}>
          <Menu position="bottom-end" shadow="md" width={240}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${r.caseNo}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {r.status === 'OPEN' && canEdit && (
                <>
                  <Menu.Item
                    fw={500}
                    leftSection={<AppIcon name="scale" />}
                    onClick={() => setDialog({ kind: 'action', caseId: r.id })}
                  >
                    Log action
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => openView(r.id)}>
                View case
              </Menu.Item>
              {r.status === 'OPEN' && canEdit && (
                <>
                  <Menu.Item leftSection={<AppIcon name="check" />} onClick={() => setDialog({ kind: 'close', caseId: r.id })}>
                    Close case
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    disabled={!r.loan.isNpl}
                    leftSection={<AppIcon name="triangle-alert" />}
                    onClick={() => setDialog({ kind: 'writeoff', caseId: r.id })}
                  >
                    {r.loan.isNpl ? 'Write off loan' : 'Write off (NPL only)'}
                  </Menu.Item>
                </>
              )}
              <Menu.Divider />
              <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.loanId}`)}>
                View loan
              </Menu.Item>
              <Menu.Item
                leftSection={<AppIcon name="user-round" />}
                onClick={() => navigate(`/applicants/${r.loan.applicantId}`)}
              >
                View borrower
              </Menu.Item>
              {r.sourceCaseId && (
                <Menu.Item
                  leftSection={<AppIcon name="phone" />}
                  onClick={() => navigate(`/collection-cases?case=${r.sourceCaseId}`)}
                >
                  Collection case
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
      title="Recovery Cases"
      subtitle="Legal and recovery steps for loans that stopped paying"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Collections' }, { label: 'Recovery Cases' }]}
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
              {notice.viewId && (
                <Button
                  size="compact-xs"
                  onClick={() => {
                    openView(notice.viewId!)
                    setNotice(null)
                  }}
                >
                  View case
                </Button>
              )}
            </div>
          </Alert>
        )}

        {/* recovery cases are not opened by hand, they come from escalation */}
        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm">
              A recovery case is created when a collection case on a non-performing loan (90+ days overdue) is
              escalated.
            </Text>
            <Button size="compact-xs" variant="default" onClick={() => navigate('/collection-cases')}>
              Collection cases
            </Button>
          </div>
        </Alert>

        {stale.length > 0 && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {stale.length} open {stale.length === 1 ? 'case has' : 'cases have'} had no action for over{' '}
                {RECOVERY_STALE_AFTER_DAYS} days.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => openView(stale[0].id)}>
                Review case
              </Button>
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
              ariaLabel="Recovery case filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'open', label: `Open (${openRows.length})` },
                { value: 'closed', label: `Closed (${closedRows.length})` },
                { value: 'all', label: `All (${rows.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              Loans are classified every day at 07:00 UTC
            </Text>
          </div>

          <CustomTable<RecoveryRow>
            size="md"
            data={tabData[tab]}
            columns={columns}
            searchInput
            searchPlaceholder="Search borrower, case or loan"
            searchKeys={['caseNo', 'borrower', 'loanNo', 'assignedTo']}
            filters={{ status: statusOptions, opened: 'date' }}
            // the longest overdue first
            defaultSort={{ accessor: 'overdueDays', direction: 'desc' }}
            noRecordText={TAB_EMPTY[tab]}
            onRowClick={(row) => openView(row.id)}
            exportCsv
            exportFileName="recovery-cases"
            print
            printTitle="Recovery Cases"
          />
        </div>
      </div>

      {/* case drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.borrower ?? ''}>
        {selected && (
          <CaseDrawerBody
            row={selected}
            onLog={(r) => setDialog({ kind: 'action', caseId: r.id })}
            onClose={(r) => setDialog({ kind: 'close', caseId: r.id })}
            onWriteOff={(r) => setDialog({ kind: 'writeoff', caseId: r.id })}
            onOpenLoan={(r) => navigate(`/loans/${r.loanId}`)}
            onOpenBorrower={(r) => navigate(`/applicants/${r.loan.applicantId}`)}
            onSourceCase={(r) => navigate(`/collection-cases?case=${r.sourceCaseId}`)}
            onPayments={() => navigate('/payments')}
            onViewDocument={viewDocument}
          />
        )}
      </Drawer>

      <LogRecoveryActionDialog
        opened={dialog?.kind === 'action'}
        caseNo={dialogCase?.caseNo ?? ''}
        borrower={dialogCase?.borrower ?? ''}
        onClose={() => setDialog(null)}
        onSubmit={logAction}
      />

      <RemarksDialog
        opened={dialog?.kind === 'close'}
        title="Close recovery case"
        message={`Close ${dialogCase?.caseNo ?? 'this case'} for ${dialogCase?.borrower ?? 'the borrower'}? Say how it ended.`}
        confirmLabel="Close case"
        placeholder="Settlement paid in full"
        onClose={() => setDialog(null)}
        onSubmit={closeCase}
      />

      <WriteOffDialog
        opened={dialog?.kind === 'writeoff'}
        loan={dialogCase?.loan ?? null}
        onClose={() => setDialog(null)}
        onSubmit={writeOff}
      />

      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </DashboardLayout>
  )
}