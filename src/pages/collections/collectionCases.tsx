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
  LogActivityDialog,
  OpenCaseDialog,
  RemarksDialog,
  type ActivityInput,
  type OpenCaseInput,
} from './collectionDialogs'
import {
  ACTIVITY_ICON,
  ACTIVITY_LABEL,
  CASE_STATUS,
  LOAN_VIEWS,
  OUTCOME,
  SAMPLE_ACTIVITIES,
  SAMPLE_CASES,
  STALE_AFTER_DAYS,
  caseNoFor,
  type CaseStatus,
  type CollectionActivity,
  type CollectionCase,
} from './collectionsData'
import { Can } from '../auth/requirePermission'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'open' | 'needs' | 'closed' | 'all'

type CaseRow = CollectionCase & {
  loan: LoanView
  loanNo: string
  borrower: string
  overdueDays: number
  pastDue: number
  /** newest first */
  activities: CollectionActivity[]
  last: CollectionActivity | null
  /** days since the last contact, or since the case opened when there has been none */
  idleDays: number
  stale: boolean
}

// one row per overdue loan that has no open case
type NeedRow = {
  id: number
  loan: LoanView
  loanNo: string
  borrower: string
  overdueDays: number
  pastDue: number
  /** the date an earlier case on this loan was closed, empty when there was none */
  previous: string
}

type Notice = { text: string; color: 'green' | 'blue'; viewId?: number; recovery?: boolean } | null

type DialogState =
  | { kind: 'open'; loanId: number | null }
  | { kind: 'activity' | 'close' | 'escalate'; caseId: number }
  | null

const TAB_EMPTY: Record<TabKey, string> = {
  open: 'No cases are open',
  needs: 'Every overdue loan has an open case',
  closed: 'No cases have been closed yet',
  all: 'No collection cases yet',
}

const statusOptions = (Object.keys(CASE_STATUS) as CaseStatus[]).map((s) => ({
  value: s,
  label: CASE_STATUS[s].label,
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

function OverdueCell({ loan }: { loan: LoanView }) {
  if (loan.state === 'CLOSED') return <span className="text-xs text-gray-400">Loan fully repaid</span>
  if (loan.overdueDays === 0) return <span className="text-xs text-gray-400">Not overdue now</span>

  return (
    <div>
      <div className="whitespace-nowrap text-sm font-medium text-red-600">{loan.overdueDays} days overdue</div>
      <div className="whitespace-nowrap text-xs text-gray-500">{formatTzs(loan.overdueAmount)} past due</div>
      <div className="mt-1">
        <Badge variant="outline" color={NPL_STYLE[loan.classification].color} radius="sm" size="sm">
          {loan.isNpl ? 'NPL · ' : ''}
          {NPL_STYLE[loan.classification].label}
        </Badge>
      </div>
    </div>
  )
}

function Timeline({ list }: { list: CollectionActivity[] }) {
  if (list.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
        No contact has been logged yet.
      </div>
    )
  }

  return (
    <ul className="space-y-4">
      {list.map((a) => (
        <li key={a.id} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <AppIcon name={ACTIVITY_ICON[a.type]} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-800">{ACTIVITY_LABEL[a.type]}</span>
              <span className="shrink-0 text-xs text-gray-400">{dayjs(a.date).format('MMM D, YYYY')}</span>
            </div>
            <div className="mt-0.5">
              <Badge variant="light" color={OUTCOME[a.outcome].color} radius="sm" size="sm">
                {OUTCOME[a.outcome].label}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-gray-600">{a.description}</div>
            <div className="text-[11px] text-gray-400">By {a.performedBy}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function nextStep(r: CaseRow): string {
  if (!r.last) return 'No one has contacted the borrower yet. Make the first contact and log it.'
  if (r.stale) return `There has been no contact for ${r.idleDays} days. Log the next follow-up.`
  if (r.last.outcome === 'PROMISED_TO_PAY') {
    return 'The borrower promised to pay. Follow up if the payment does not arrive.'
  }
  return 'Log every call, SMS or visit so the history stays complete.'
}

/* ---------- case drawer ---------- */

type DrawerProps = {
  row: CaseRow
  onLog: (r: CaseRow) => void
  onClose: (r: CaseRow) => void
  onEscalate: (r: CaseRow) => void
  onOpenLoan: (r: CaseRow) => void
  onOpenBorrower: (r: CaseRow) => void
  onRecovery: () => void
}

function CaseDrawerBody({ row: r, onLog, onClose, onEscalate, onOpenLoan, onOpenBorrower, onRecovery }: DrawerProps) {
  const isOpen = r.status === 'OPEN'
  const tiles = [
    { label: 'Past due', value: r.loan.overdueDays > 0 ? formatTzs(r.pastDue) : '—' },
    { label: 'Days overdue', value: r.loan.overdueDays > 0 ? `${r.loan.overdueDays} days` : '—' },
    { label: 'Loan outstanding', value: formatTzs(r.loan.outstanding) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="light" color={CASE_STATUS[r.status].color} radius="sm" size="sm">
          {CASE_STATUS[r.status].label}
        </Badge>
        {r.loan.isNpl && r.loan.state !== 'CLOSED' && (
          <Badge variant="outline" color={NPL_STYLE[r.loan.classification].color} radius="sm" size="sm">
            NPL · {NPL_STYLE[r.loan.classification].label}
          </Badge>
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
          <Can area="collections" page="collection-cases" action="edit">
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="xs" leftSection={<AppIcon name="phone" />} onClick={() => onLog(r)}>
                Log activity
              </Button>
              <Button size="xs" variant="default" leftSection={<AppIcon name="check" />} onClick={() => onClose(r)}>
                Close case
              </Button>
              <Button
                size="xs"
                color="orange"
                variant="light"
                disabled={!r.loan.isNpl}
                leftSection={<AppIcon name="undo-2" />}
                onClick={() => onEscalate(r)}
              >
                Escalate to recovery
              </Button>
            </div>
          </Can>
          {!r.loan.isNpl && (
            <p className="mt-2 text-xs text-gray-500">
              Escalation opens once the loan is 90 days overdue and non-performing.
            </p>
          )}
        </div>
      ) : (
        <Alert
          color={r.status === 'ESCALATED' ? 'orange' : 'gray'}
          variant="light"
          icon={<AppIcon name={r.status === 'ESCALATED' ? 'undo-2' : 'circle-check'} />}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm">
              {r.status === 'ESCALATED'
                ? 'This case was handed to recovery. Follow-up continues there.'
                : 'This case is closed.'}
              {r.closeRemarks ? ` "${r.closeRemarks}"` : ''}
            </Text>
            {r.status === 'ESCALATED' && (
              <Button size="compact-xs" onClick={onRecovery}>
                Recovery cases
              </Button>
            )}
          </div>
        </Alert>
      )}

      {isOpen && r.loan.isNpl && (
        <Alert color="red" variant="light" title="Non-performing loan" icon={<AppIcon name="triangle-alert" />}>
          <Text size="sm">
            This loan is {r.loan.overdueDays} days overdue. If follow-up is not working, escalate it to recovery. A loan
            that stays unrecoverable can later be written off.
          </Text>
        </Alert>
      )}

      {isOpen && r.last?.outcome === 'PROMISED_TO_PAY' && !r.stale && (
        <Alert color="blue" variant="light" icon={<AppIcon name="hand-coins" />}>
          <Text size="sm">
            On {dayjs(r.last.date).format('MMM D, YYYY')} the borrower promised to pay. If no payment arrives, log the
            follow-up.
          </Text>
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
        <SectionTitle>{`Contact history (${r.activities.length})`}</SectionTitle>
        <div className="mt-3">
          <Timeline list={r.activities} />
        </div>
      </div>

      <div>
        <SectionTitle>Case details</SectionTitle>
        <Field label="Case number" value={r.caseNo} />
        <Field label="Borrower" value={r.borrower} />
        <Field label="Loan" value={r.loanNo} />
        <Field label="Assigned to" value={r.assignedTo} />
        <Field label="Opened" value={dayjs(r.opened).format('MMM D, YYYY')} />
        {r.closed && <Field label={r.status === 'ESCALATED' ? 'Escalated' : 'Closed'} value={dayjs(r.closed).format('MMM D, YYYY')} />}
        {r.remarks && <Field label="Remarks" value={r.remarks} />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => onOpenLoan(r)}>
          View loan
        </Button>
        <Button size="xs" variant="default" leftSection={<AppIcon name="user-round" />} onClick={() => onOpenBorrower(r)}>
          View borrower
        </Button>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function CollectionCasesPage() {
  const navigate = useNavigate()
  const { canCreate, canEdit } = usePageAccess('collections', 'collection-cases')
  const [params, setParams] = useSearchParams()

  // UI only: changes made in this session, nothing is saved yet
  const [cases, setCases] = useState<CollectionCase[]>(SAMPLE_CASES)
  const [activities, setActivities] = useState<CollectionActivity[]>(SAMPLE_ACTIVITIES)
  const [tab, setTab] = useState<TabKey>('open')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const today = dayjs().format('YYYY-MM-DD')
  const nextId = (list: { id: number }[]) => Math.max(0, ...list.map((x) => x.id)) + 1

  const rows = useMemo<CaseRow[]>(
    () =>
      cases.map((c) => {
        const loan = LOAN_VIEWS.find((l) => l.id === c.loanId)!
        const list = activities
          .filter((a) => a.caseId === c.id)
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        const last = list[0] ?? null
        const idleDays = dayjs().diff(dayjs(last?.date ?? c.opened), 'day')
        return {
          ...c,
          loan,
          loanNo: loan.loanNo,
          borrower: loan.applicantName,
          overdueDays: loan.overdueDays,
          pastDue: loan.overdueAmount,
          activities: list,
          last,
          idleDays,
          stale: c.status === 'OPEN' && idleDays > STALE_AFTER_DAYS,
        }
      }),
    [cases, activities],
  )

  const openRows = rows.filter((r) => r.status === 'OPEN')
  const closedRows = rows.filter((r) => r.status !== 'OPEN')

  // overdue loans with no open case: the daily job normally catches these
  const needs = LOAN_VIEWS.filter((l) => l.state === 'OVERDUE' && !cases.some((c) => c.loanId === l.id && c.status === 'OPEN'))
  const needRows: NeedRow[] = needs.map((l) => ({
    id: l.id,
    loan: l,
    loanNo: l.loanNo,
    borrower: l.applicantName,
    overdueDays: l.overdueDays,
    pastDue: l.overdueAmount,
    previous: cases.filter((c) => c.loanId === l.id && c.closed).sort((a, b) => b.closed!.localeCompare(a.closed!))[0]?.closed ?? '',
  }))

  const promised = openRows.filter((r) => r.last?.outcome === 'PROMISED_TO_PAY')
  const stale = openRows.filter((r) => r.stale)
  const nplOpen = openRows.filter((r) => r.loan.isNpl)
  const underCollection = openRows.reduce((s, r) => s + r.pastDue, 0)

  // here `color` is the icon color
  const stats = [
    { label: 'Open Cases', value: openRows.length, icon: 'phone', color: '#45bdfc' },
    { label: 'Overdue Without A Case', value: needs.length, icon: 'triangle-alert', color: '#ef4444' },
    { label: 'Past Due Under Collection', value: formatTzs(underCollection), icon: 'banknote', color: '#8e44ad' },
    { label: 'Promised To Pay', value: promised.length, icon: 'hand-coins', color: 'var(--app-brand)' },
    { label: `No Contact In ${STALE_AFTER_DAYS} Days`, value: stale.length, icon: 'clock', color: '#e08a1e' },
  ]

  const tabData: Record<'open' | 'closed' | 'all', CaseRow[]> = { open: openRows, closed: closedRows, all: rows }

  // /collection-cases?case=1 opens the drawer for case 1
  const caseParam = params.get('case')
  const selected = caseParam ? (rows.find((r) => String(r.id) === caseParam) ?? null) : null
  const openView = (id: number) => setParams({ case: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const dialogCase = dialog && 'caseId' in dialog ? rows.find((r) => r.id === dialog.caseId) : undefined

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  /* ---------- actions ---------- */

  const openCase = (input: OpenCaseInput) => {
    const loan = LOAN_VIEWS.find((l) => l.id === input.loanId)!
    // TODO: POST /api/collections-workflow/loans/{loanId}/open-case { assignedTo, remarks }
    const id = nextId(cases)
    setCases((list) => [
      ...list,
      {
        id,
        caseNo: caseNoFor(id),
        loanId: loan.id,
        status: 'OPEN',
        assignedTo: input.assignedTo,
        opened: today,
        closed: null,
        remarks: input.remarks,
        closeRemarks: null,
      },
    ])
    setNotice({ color: 'green', text: `Case ${caseNoFor(id)} opened for ${loan.applicantName}.`, viewId: id })
    setTab('open')
    setDialog(null)
  }

  const logActivity = (input: ActivityInput) => {
    if (!dialogCase) return
    // TODO: POST /api/collections-workflow/cases/{caseId}/activities { activityType, description, performedBy, outcome }
    setActivities((list) => [
      ...list,
      {
        id: nextId(list),
        caseId: dialogCase.id,
        type: input.type,
        outcome: input.outcome,
        description: input.description,
        performedBy: CURRENT_USER,
        date: today,
      },
    ])
    setNotice({ color: 'green', text: `Contact logged on ${dialogCase.caseNo}.`, viewId: dialogCase.id })
    setDialog(null)
  }

  const closeCase = (remarks: string) => {
    if (!dialogCase) return
    // TODO: POST /api/collections-workflow/cases/{caseId}/close { remarks }
    setCases((list) =>
      list.map((c) => (c.id === dialogCase.id ? { ...c, status: 'CLOSED', closed: today, closeRemarks: remarks } : c)),
    )
    setNotice({ color: 'blue', text: `Case ${dialogCase.caseNo} is closed.` })
    setDialog(null)
  }

  const escalate = (remarks: string) => {
    if (!dialogCase || !dialogCase.loan.isNpl) return
    // TODO: POST /api/collections-workflow/cases/{caseId}/escalate-to-recovery { remarks }
    //       needs Loan.isNpl and no other open recovery case for the loan
    setCases((list) =>
      list.map((c) => (c.id === dialogCase.id ? { ...c, status: 'ESCALATED', closed: today, closeRemarks: remarks } : c)),
    )
    setNotice({
      color: 'green',
      text: `${dialogCase.caseNo} was escalated and a recovery case is open for ${dialogCase.borrower}.`,
      recovery: true,
    })
    setTab('closed')
    setDialog(null)
  }

  /* ---------- columns ---------- */

  const columns: CustomTableColumn<CaseRow>[] = [
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
      render: (r) => <OverdueCell loan={r.loan} />,
      exportValue: (r) => r.overdueDays,
    },
    {
      accessor: 'idleDays',
      header: 'Last contact',
      render: (r) => {
        if (!r.last) {
          return (
            <div>
              <div className={`whitespace-nowrap text-sm ${r.status === 'OPEN' ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                No contact yet
              </div>
              <div className="whitespace-nowrap text-xs text-gray-500">Opened {ago(r.idleDays)}</div>
            </div>
          )
        }
        return (
          <div>
            <div className={`whitespace-nowrap text-sm ${r.stale ? 'font-medium text-amber-600' : 'text-gray-800'}`}>
              {r.stale && <AppIcon name="triangle-alert" className="mr-1" />}
              {ACTIVITY_LABEL[r.last.type]} · {ago(r.idleDays)}
            </div>
            <div className="whitespace-nowrap text-xs text-gray-500">{OUTCOME[r.last.outcome].label}</div>
          </div>
        )
      },
      exportValue: (r) => (r.last ? `${ACTIVITY_LABEL[r.last.type]} ${r.last.date} (${OUTCOME[r.last.outcome].label})` : 'No contact'),
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
        <div>
          <Badge variant="light" color={CASE_STATUS[r.status].color} radius="sm" size="sm">
            {CASE_STATUS[r.status].label}
          </Badge>
          <div className="mt-0.5 text-[11px] text-gray-500">
            {r.activities.length} {r.activities.length === 1 ? 'activity' : 'activities'}
          </div>
        </div>
      ),
      exportValue: (r) => CASE_STATUS[r.status].label,
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
                  <Menu.Item fw={500} leftSection={<AppIcon name="phone" />} onClick={() => setDialog({ kind: 'activity', caseId: r.id })}>
                    Log activity
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
                    disabled={!r.loan.isNpl}
                    leftSection={<AppIcon name="undo-2" />}
                    onClick={() => setDialog({ kind: 'escalate', caseId: r.id })}
                  >
                    {r.loan.isNpl ? 'Escalate to recovery' : 'Escalate (90+ days only)'}
                  </Menu.Item>
                </>
              )}
              <Menu.Divider />
              <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.loanId}`)}>
                View loan
              </Menu.Item>
              <Menu.Item leftSection={<AppIcon name="user-round" />} onClick={() => navigate(`/applicants/${r.loan.applicantId}`)}>
                View borrower
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  const needColumns: CustomTableColumn<NeedRow>[] = [
    {
      accessor: 'borrower',
      header: 'Borrower',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.borrower}</div>
          <div className="truncate text-xs text-gray-500">{r.loanNo}</div>
        </div>
      ),
      exportValue: (r) => `${r.loanNo} (${r.borrower})`,
    },
    {
      accessor: 'overdueDays',
      header: 'Overdue',
      render: (r) => <OverdueCell loan={r.loan} />,
      exportValue: (r) => r.overdueDays,
    },
    {
      accessor: 'pastDue',
      header: 'Past due',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.pastDue)}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">of {formatTzs(r.loan.outstanding)} outstanding</div>
        </div>
      ),
      exportValue: (r) => r.pastDue,
    },
    {
      accessor: 'previous',
      header: 'Earlier case',
      render: (r) => (
        <span className="text-sm text-gray-600">{r.previous ? `Closed ${dayjs(r.previous).format('MMM D, YYYY')}` : '—'}</span>
      ),
      exportValue: (r) => r.previous,
    },
    {
      // the action for this row; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 130,
      render: (r) => (
        // stop the click so the row doesn't also open the loan
        canCreate ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button size="compact-xs" leftSection={<AppIcon name="plus" />} onClick={() => setDialog({ kind: 'open', loanId: r.id })}>
              Open case
            </Button>
          </div>
        ) : null
      ),
    },
  ]

  return (
    <DashboardLayout
      title="Collection Cases"
      subtitle="Follow up overdue loans until they pay"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Collections' }, { label: 'Collection Cases' }]}
      actions={
        canCreate ? (
          <Button
            size="xs"
            disabled={needs.length === 0}
            leftSection={<AppIcon name="plus" />}
            onClick={() => setDialog({ kind: 'open', loanId: null })}
          >
            Open case
          </Button>
        ) : undefined
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
              {notice.recovery && (
                <Button size="compact-xs" onClick={() => navigate('/recovery-cases')}>
                  Recovery cases
                </Button>
              )}
            </div>
          </Alert>
        )}

        {needs.length > 0 && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {needs.length} overdue {needs.length === 1 ? 'loan has' : 'loans have'} no open case. The daily job opens
                them at 07:15 UTC, or you can open them now.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => setTab('needs')}>
                Show them
              </Button>
            </div>
          </Alert>
        )}

        {nplOpen.length > 0 && (
          <Alert color="red" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {nplOpen.length} open {nplOpen.length === 1 ? 'case is' : 'cases are'} on a non-performing loan (90+ days
                overdue) and can be escalated to recovery.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => openView(nplOpen[0].id)}>
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
              ariaLabel="Collection case filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'open', label: `Open (${openRows.length})` },
                { value: 'needs', label: `Needs a case (${needs.length})` },
                { value: 'closed', label: `Closed (${closedRows.length})` },
                { value: 'all', label: `All (${rows.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              Loans are classified every day at 07:00 UTC
            </Text>
          </div>

          {tab === 'needs' ? (
            <CustomTable<NeedRow>
              size="md"
              data={needRows}
              columns={needColumns}
              searchInput
              searchPlaceholder="Search borrower or loan"
              searchKeys={['borrower', 'loanNo']}
              // the longest overdue first
              defaultSort={{ accessor: 'overdueDays', direction: 'desc' }}
              noRecordText={TAB_EMPTY.needs}
              onRowClick={(row) => navigate(`/loans/${row.id}`)}
            />
          ) : (
            <CustomTable<CaseRow>
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
              exportFileName="collection-cases"
              print
              printTitle="Collection Cases"
            />
          )}
        </div>
      </div>

      {/* case drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.borrower ?? ''}>
        {selected && (
          <CaseDrawerBody
            row={selected}
            onLog={(r) => setDialog({ kind: 'activity', caseId: r.id })}
            onClose={(r) => setDialog({ kind: 'close', caseId: r.id })}
            onEscalate={(r) => setDialog({ kind: 'escalate', caseId: r.id })}
            onOpenLoan={(r) => navigate(`/loans/${r.loanId}`)}
            onOpenBorrower={(r) => navigate(`/applicants/${r.loan.applicantId}`)}
            onRecovery={() => navigate('/recovery-cases')}
          />
        )}
      </Drawer>

      <OpenCaseDialog
        opened={dialog?.kind === 'open'}
        loans={needs}
        initialLoanId={dialog?.kind === 'open' ? dialog.loanId : null}
        onClose={() => setDialog(null)}
        onSubmit={openCase}
      />

      <LogActivityDialog
        opened={dialog?.kind === 'activity'}
        caseNo={dialogCase?.caseNo ?? ''}
        borrower={dialogCase?.borrower ?? ''}
        onClose={() => setDialog(null)}
        onSubmit={logActivity}
      />

      <RemarksDialog
        opened={dialog?.kind === 'close'}
        title="Close case"
        message={`Close ${dialogCase?.caseNo ?? 'this case'} for ${dialogCase?.borrower ?? 'the borrower'}? Say how it ended.`}
        confirmLabel="Close case"
        placeholder="Borrower paid in full"
        onClose={() => setDialog(null)}
        onSubmit={closeCase}
      />

      <RemarksDialog
        opened={dialog?.kind === 'escalate'}
        title="Escalate to recovery"
        message={`Hand ${dialogCase?.caseNo ?? 'this case'} to the recovery team? The loan is ${dialogCase?.overdueDays ?? 0} days overdue and non-performing. The case is marked escalated and a recovery case is opened.`}
        confirmLabel="Escalate"
        color="orange"
        placeholder="Handed to the legal team"
        onClose={() => setDialog(null)}
        onSubmit={escalate}
      />
    </DashboardLayout>
  )
}