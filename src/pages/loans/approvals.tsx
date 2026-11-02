import { AppIcon } from '../../components/appIcon'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Modal, SegmentedControl, Text, Textarea } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import {
  RANK,
  STATUS,
  applications,
  approvalsFor,
  collateralsFor,
  creditFor,
  estimateInstallment,
  guarantorsFor,
  methodLabel,
  totalRepayable,
  type ApplicationStatus,
  type ApprovalRow,
  type LoanApplication,
} from './loanApplicationsData'
import { usePageAccess } from '../auth/usePageAccess'
import { useAuth } from '../../auth/authContext'

// our own rule, the API has no deadline: highlight applications waiting longer than this
const LATE_AFTER_DAYS = 7

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

/* ---------- one application, seen from the approval stage ---------- */

type Row = LoanApplication & {
  levels: ApprovalRow[]
  /** the level that decides next, null when nothing is waiting */
  current: ApprovalRow | null
  awaiting: boolean
  /** the logged-in user's role matches the current level */
  mine: boolean
  rejected: boolean
  /** every level signed off */
  approved: boolean
}

// a decision made in this session; each one fills the next pending level
type Made = { decision: 'APPROVED' | 'REJECTED'; comments: string }

// a rejection must explain itself, the API keeps the comment with the decision
const MIN_REJECT_COMMENT = 5
const MAX_COMMENT = 500

function toRow(a: LoanApplication, made: Made[], role: string | null): Row {
  const queue = [...made]
  const levels: ApprovalRow[] = approvalsFor(a).map((l) => {
    if (l.decision === 'PENDING' && queue.length > 0) {
      const m = queue.shift()!
      return { ...l, decision: m.decision, by: 'You', comments: m.comments || null }
    }
    return l
  })

  const inStage = a.status === 'CREDIT_APPROVED' || a.status === 'PENDING_APPROVAL'
  const rejected = levels.some((l) => l.decision === 'REJECTED')
  const current = inStage && !rejected ? (levels.find((l) => l.decision === 'PENDING') ?? null) : null
  const awaiting = current !== null
  const approved = (a.status !== 'REJECTED' && RANK[a.status] >= 3) || (inStage && !awaiting && !rejected)

  let status: ApplicationStatus = a.status
  if (inStage && rejected) status = 'REJECTED'
  else if (inStage && approved) status = 'APPROVED'
  else if (inStage && made.length > 0) status = 'PENDING_APPROVAL'

  return {
    ...a,
    status,
    levels,
    current,
    awaiting,
    mine: awaiting && !!current && role !== null && current.role === role,
    rejected,
    approved,
  }
}

const waitingDays = (a: LoanApplication) => dayjs().diff(dayjs(a.submittedAt ?? a.created), 'day')

const statusOptions = [
  { value: 'CREDIT_APPROVED', label: STATUS.CREDIT_APPROVED.label },
  { value: 'PENDING_APPROVAL', label: STATUS.PENDING_APPROVAL.label },
  { value: 'APPROVED', label: STATUS.APPROVED.label },
  { value: 'REJECTED', label: STATUS.REJECTED.label },
]

type TabKey = 'awaiting' | 'mine' | 'decided' | 'all'

const TAB_EMPTY: Record<TabKey, string> = {
  awaiting: 'Nothing is waiting for approval',
  mine: 'Nothing is waiting for your decision',
  decided: 'No decisions have been made yet',
  all: 'No applications in the approval stage',
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

const PILL_COLOR: Record<string, string> = {
  APPROVED: 'green',
  APPROVE: 'green',
  PENDING: 'gray',
  REJECTED: 'red',
  REJECT: 'red',
}

function Pill({ value }: { value: string }) {
  return (
    <Badge variant="light" color={PILL_COLOR[value] ?? 'gray'} radius="sm" size="sm">
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </Badge>
  )
}

// the badge in the Approval column and the drawer header
function DecisionBadge({ r }: { r: Row }) {
  if (r.awaiting) {
    return r.mine ? (
      <Badge variant="filled" color="brand" radius="sm" size="sm">
        Your decision
      </Badge>
    ) : (
      <Badge variant="light" color="yellow" radius="sm" size="sm">
        Waiting for {r.current?.levelName ?? 'approver'}
      </Badge>
    )
  }
  if (r.rejected) {
    return (
      <Badge variant="light" color="red" radius="sm" size="sm">
        Rejected
      </Badge>
    )
  }
  if (r.approved) {
    return (
      <Badge variant="light" color="green" radius="sm" size="sm">
        Approved
      </Badge>
    )
  }
  return (
    <Badge variant="light" color={STATUS[r.status].color} radius="sm" size="sm">
      {STATUS[r.status].label}
    </Badge>
  )
}

// one segment per approval level, the current level is highlighted
function LevelBar({ r }: { r: Row }) {
  const rejected = r.levels.find((l) => l.decision === 'REJECTED')

  const text = r.current
    ? `Level ${r.current.levelNo} of ${r.levels.length} · ${r.current.levelName}`
    : rejected
      ? `Rejected at level ${rejected.levelNo}`
      : `All ${r.levels.length} levels approved`

  return (
    <div>
      <div className="flex w-28 gap-0.5" aria-hidden="true">
        {r.levels.map((l) => (
          <span
            key={l.levelNo}
            className={`h-1.5 flex-1 rounded-full ${
              l.decision === 'APPROVED'
                ? 'bg-brand'
                : l.decision === 'REJECTED'
                  ? 'bg-red-400'
                  : r.current?.levelNo === l.levelNo
                    ? 'bg-yellow-400'
                    : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <div className="mt-1 text-xs text-gray-500">{text}</div>
    </div>
  )
}

/* ---------- decision drawer ---------- */

type DrawerProps = {
  row: Row | null
  onClose: () => void
  onApprove: (r: Row, comments: string) => void
  onReject: (r: Row, comments: string) => void
}

// the comment box with the Approve and Reject buttons. The drawer gives it a new key for every level,
// so the text starts empty each time
function DecisionForm({
  row: r,
  onApprove,
  onReject,
}: {
  row: Row
  onApprove: (comments: string) => void
  onReject: (comments: string) => void
}) {
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState(false)

  const text = comments.trim()
  const isLast = r.current?.levelNo === r.levels.length

  // rejecting needs a reason, so check it before asking "are you sure"
  const askReject = () => {
    if (text.length < MIN_REJECT_COMMENT) {
      setError(`Explain why you are rejecting this application (at least ${MIN_REJECT_COMMENT} characters)`)
      return
    }
    setConfirming(true)
  }

  return (
    <>
      <Textarea
        label="Comments"
        description="Required when rejecting, optional when approving"
        placeholder="Add a note for this decision"
        minRows={3}
        autosize
        maxLength={MAX_COMMENT}
        value={comments}
        onChange={(e) => {
          setComments(e.currentTarget.value)
          setError(undefined)
        }}
        error={error}
      />
      <div className="-mt-1 text-right text-[11px] text-gray-400">
        {comments.length}/{MAX_COMMENT}
      </div>
      {isLast && (
        <Text size="xs" c="dimmed">
          This is the last level. Approving it takes you straight to Contracts.
        </Text>
      )}
      <div className="flex justify-end gap-2">
        <Button size="xs" color="red" variant="light" leftSection={<AppIcon name="x" />} onClick={askReject}>
          Reject
        </Button>
        <Button size="xs" leftSection={<AppIcon name="check" />} onClick={() => onApprove(text)}>
          Approve
        </Button>
      </div>

      <Modal opened={confirming} onClose={() => setConfirming(false)} title="Reject this application?" centered>
        <div className="space-y-4">
          <Text size="sm">
            {r.applicantName} · {r.applicationNo} will be stopped at the {r.current?.levelName} level. This cannot be
            undone, a new application has to be started.
          </Text>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="text-xs text-gray-500">Your comment</div>
            <div className="whitespace-pre-wrap text-sm text-gray-800">{text}</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="default" onClick={() => setConfirming(false)}>
              Go back
            </Button>
            <Button
              size="xs"
              color="red"
              leftSection={<AppIcon name="x" />}
              onClick={() => {
                setConfirming(false)
                onReject(text)
              }}
            >
              Reject application
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function ReviewDrawer({ row, onClose, onApprove, onReject }: DrawerProps) {
  const navigate = useNavigate()
  const { canApprove } = usePageAccess('loans', 'approvals')
  if (!row) {
    return <Drawer opened={false} onClose={onClose} />
  }

  const r = row
  const guarantors = guarantorsFor(r)
  const collaterals = collateralsFor(r)
  const credit = creditFor(r)
  const installment = Math.round(estimateInstallment(r))
  const collateralValue = collaterals.reduce((sum, c) => sum + c.value, 0)

  const tiles = [
    { label: 'Requested amount', value: formatTzs(r.requestedAmount) },
    { label: 'Est. monthly installment', value: formatTzs(installment) },
    { label: 'Est. total repayable', value: formatTzs(Math.round(totalRepayable(r))) },
  ]

  return (
    <Drawer opened onClose={onClose} position="right" size="lg" title={r.applicantName}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge r={r} />
          <Text size="xs" c="dimmed">
            {r.applicationNo} · Loan officer {r.loanOfficer}
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
          <SectionTitle>Loan terms</SectionTitle>
          <Field label="Interest" value={`${r.interestRate}% per year · ${methodLabel(r.interestMethod)}`} />
          <Field label="Tenure" value={`${r.tenure} months`} />
          <Field label="Penalty rate" value={`${r.penaltyRate}%`} />
          <Field label="Submitted" value={r.submittedAt ? dayjs(r.submittedAt).format('MMM D, YYYY') : '—'} />
        </div>

        <div>
          <SectionTitle>Checks completed</SectionTitle>
          <Field
            label="Guarantors"
            value={
              r.guarantorRequired
                ? `${guarantors.filter((g) => g.status === 'VERIFIED').length} of ${guarantors.length} verified`
                : 'Not required'
            }
          />
          <Field
            label="Collateral"
            value={
              r.collateralRequired
                ? `${collaterals.length} ${collaterals.length === 1 ? 'asset' : 'assets'} · ${formatTzs(collateralValue)} (${Math.round((collateralValue / r.requestedAmount) * 100)}% of the loan)`
                : 'Not required'
            }
          />
          <Field
            label="Credit assessment"
            value={
              credit
                ? `${credit.decision === 'APPROVE' ? 'Approved' : 'Denied'} · cash flow ${formatTzs(credit.cashFlow)}`
                : r.creditAssessmentRequired
                  ? 'Not run yet'
                  : 'Switched off'
            }
          />
        </div>

        <div>
          <SectionTitle>Approval levels</SectionTitle>
          <p className="mb-3 text-xs text-gray-500">
            Each level must approve in order. A rejection at any level stops the application.
          </p>
          <ul className="space-y-2">
            {r.levels.map((l) => (
              <li
                key={l.levelNo}
                className={`flex items-start gap-3 rounded-md border px-3 py-3 ${
                  r.current?.levelNo === l.levelNo ? 'border-brand bg-brand-subtle' : 'border-gray-200'
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                  {l.levelNo}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">{l.levelName}</div>
                  <div className="text-xs text-gray-500">Required role: {l.role}</div>
                  {l.by && (
                    <div className="mt-1 text-xs text-gray-500">
                      {l.by}
                      {l.comments ? ` · "${l.comments}"` : ''}
                    </div>
                  )}
                </div>
                <Pill value={l.decision} />
              </li>
            ))}
          </ul>
        </div>

        {/* the decision, only while the application is waiting */}
        {r.current && (
          <div className="space-y-3 border-t border-gray-200 pt-5">
            <SectionTitle>{`Your decision · Level ${r.current.levelNo}: ${r.current.levelName}`}</SectionTitle>
            {r.mine && canApprove ? (
              <DecisionForm
                key={`${r.id}-${r.current.levelNo}`}
                row={r}
                onApprove={(c) => onApprove(r, c)}
                onReject={(c) => onReject(r, c)}
              />
            ) : (
            <Alert color="yellow" variant="light" icon={<AppIcon name="lock-keyhole" />}>
              <Text size="sm">
                {r.mine
                  ? 'Your role is not allowed to approve or reject applications.'
                  : `This application is waiting for the ${r.current.levelName} level. Only a user with the ${r.current.role} role can decide it.`}
              </Text>
            </Alert>
            )}
          </div>
        )}

        <Button
          size="xs"
          variant="default"
          leftSection={<AppIcon name="external-link" />}
          onClick={() => navigate(`/loan-applications/${r.id}`)}
        >
          View full application
        </Button>
      </div>
    </Drawer>
  )
}

/* ---------- page ---------- */

export function ApprovalsPage() {
  const { user } = useAuth()
  const role = user?.role ?? null
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // UI only: decisions made in this session, nothing is saved yet
  const [decisions, setDecisions] = useState<Record<number, Made[]>>({})
  const [notice, setNotice] = useState<{ text: string; color: 'green' | 'red' } | null>(null)

  const rows = useMemo(() => applications.map((a) => toRow(a, decisions[a.id] ?? [], role)), [decisions, role])
  const awaiting = rows.filter((r) => r.awaiting)
  const mine = awaiting.filter((r) => r.mine)
  const decided = rows.filter((r) => r.approved || r.rejected)
  const queue = rows.filter((r) => r.awaiting || r.approved || r.rejected)

  const tabData: Record<TabKey, Row[]> = { awaiting, mine, decided, all: queue }

  // here `color` is the icon color
  const stats = [
    { label: 'Awaiting Approval', value: awaiting.length, icon: 'hourglass', color: '#e08a1e' },
    { label: 'Needs My Decision', value: mine.length, icon: 'gavel', color: '#8e44ad' },
    { label: `Waiting Over ${LATE_AFTER_DAYS} Days`, value: awaiting.filter((r) => waitingDays(r) > LATE_AFTER_DAYS).length, icon: 'clock', color: '#0077b5' },
    { label: 'Approved', value: rows.filter((r) => r.approved).length, icon: 'circle-check', color: 'var(--app-brand)' },
    { label: 'Rejected', value: rows.filter((r) => r.rejected).length, icon: 'circle-x', color: '#ef4444' },
  ]

  // /loan-approvals?review=3 opens the review drawer for application 3
  const reviewId = params.get('review')
  const selected = reviewId ? (rows.find((r) => String(r.id) === reviewId) ?? null) : null

  // a decided application is on the Decided tab, anything else starts on Awaiting
  const [tab, setTab] = useState<TabKey>(() => (selected && !selected.awaiting ? 'decided' : 'awaiting'))

  const open = (r: Row) => setParams({ review: String(r.id) }, { replace: true })
  const close = () => setParams({}, { replace: true })

  const approve = (r: Row, comments: string) => {
    // TODO: POST /api/loan-origination/applications/{applicationId}/approve { approverId, comments }
    setDecisions((d) => ({ ...d, [r.id]: [...(d[r.id] ?? []), { decision: 'APPROVED', comments }] }))

    // the final level approved: go straight to Contracts with this contract's panel open
    if (r.current?.levelNo === r.levels.length) {
      navigate(`/loan-contracts?contract=${r.id}`, { state: { approvedId: r.id } })
      return
    }

    // an earlier level approved: it moves on to the next level
    const nextLevel = r.levels.find((l) => l.levelNo === (r.current?.levelNo ?? 0) + 1)
    close()
    setNotice({
      text: `${r.applicantName} approved at the ${r.current?.levelName} level.${
        nextLevel ? ` It now waits for ${nextLevel.levelName}.` : ''
      }`,
      color: 'green',
    })
  }

  const reject = (r: Row, comments: string) => {
    // TODO: POST /api/loan-origination/applications/{applicationId}/reject { approverId, comments }
    //       a rejection at any level halts the application as REJECTED
    setDecisions((d) => ({ ...d, [r.id]: [...(d[r.id] ?? []), { decision: 'REJECTED', comments }] }))
    close()
    setTab('decided')
    setNotice({
      text: `${r.applicantName} was rejected at the ${r.current?.levelName} level. The application is stopped.`,
      color: 'red',
    })
  }

  const columns: CustomTableColumn<Row>[] = [
    {
      accessor: 'applicationNo',
      header: 'Application',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.applicantName}</div>
          <div className="truncate text-xs text-gray-500">{r.applicationNo}</div>
        </div>
      ),
      exportValue: (r) => `${r.applicationNo} (${r.applicantName})`,
    },
    {
      accessor: 'requestedAmount',
      header: 'Amount',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.requestedAmount)}</div>
          <div className="text-xs text-gray-500">
            {r.tenure} months · {methodLabel(r.interestMethod)}
          </div>
        </div>
      ),
      exportValue: (r) => r.requestedAmount,
    },
    {
      // accessor only carries the column, the content is built from the credit assessment
      accessor: 'creditAssessmentRequired',
      header: 'Affordability',
      sortable: false,
      render: (r) => {
        const credit = creditFor(r)
        if (!credit) {
          return <span className="text-xs text-gray-400">Credit check skipped</span>
        }
        return (
          <div>
            <div className="whitespace-nowrap text-sm text-gray-800">Cash flow {formatTzs(credit.cashFlow)}</div>
            <div className="whitespace-nowrap text-xs text-gray-500">
              Installment {formatTzs(Math.round(estimateInstallment(r)))}
            </div>
          </div>
        )
      },
      exportValue: (r) => {
        const credit = creditFor(r)
        return credit ? `Cash flow ${credit.cashFlow} / installment ${Math.round(estimateInstallment(r))}` : 'Skipped'
      },
    },
    {
      accessor: 'status',
      header: 'Approval',
      render: (r) => (
        <div>
          <DecisionBadge r={r} />
          <div className="mt-1.5">
            <LevelBar r={r} />
          </div>
        </div>
      ),
      exportValue: (r) => STATUS[r.status].label,
    },
    {
      accessor: 'submittedAt',
      header: 'Waiting',
      render: (r) => {
        const late = r.awaiting && waitingDays(r) > LATE_AFTER_DAYS
        return (
          <div>
            <div className={`whitespace-nowrap text-sm ${late ? 'font-medium text-amber-600' : 'text-gray-800'}`}>
              {r.awaiting ? `${waitingDays(r)} days` : '—'}
            </div>
            <div className="whitespace-nowrap text-xs text-gray-500">
              Submitted {dayjs(r.submittedAt ?? r.created).format('MMM D, YYYY')}
            </div>
          </div>
        )
      },
      exportValue: (r) => r.submittedAt ?? r.created,
    },
    {
      // the row menu; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      width: 80,
      align: 'right',
      render: (r) => (
        // stop the click so the row doesn't also open the drawer
        <div onClick={(e) => e.stopPropagation()}>
          <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${r.applicationNo}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<AppIcon name={r.mine ? 'gavel' : 'eye'} />}
                onClick={() => open(r)}
              >
                {r.mine ? 'Review and decide' : 'View details'}
              </Menu.Item>
              <Menu.Item
                leftSection={<AppIcon name="file-text" />}
                onClick={() => navigate(`/loan-applications/${r.id}`)}
              >
                Open application
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout
      title="Approvals"
      subtitle="Applications waiting for an approval decision"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Loans' }, { label: 'Approvals' }]}
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color={notice.color}
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name={notice.color === 'green' ? 'circle-check' : 'circle-x'} />}
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
          <div className="mb-3 max-w-full overflow-x-auto">
            <SegmentedControl
              size="xs"
              value={tab}
              onChange={(v) => setTab(v as TabKey)}
              data={[
                { value: 'awaiting', label: `Awaiting decision (${awaiting.length})` },
                { value: 'mine', label: `Needs my decision (${mine.length})` },
                { value: 'decided', label: `Decided (${decided.length})` },
                { value: 'all', label: `All (${queue.length})` },
              ]}
            />
          </div>

          <CustomTable<Row>
            size="md"
            data={tabData[tab]}
            columns={columns}
            searchInput
            searchPlaceholder="Search application"
            searchKeys={['applicationNo', 'applicantName', 'loanOfficer']}
            filters={{ status: statusOptions, submittedAt: 'date' }}
            // oldest first, so the applications waiting longest are at the top
            defaultSort={{ accessor: 'submittedAt', direction: 'asc' }}
            noRecordText={TAB_EMPTY[tab]}
            onRowClick={(row) => open(row)}
            exportCsv
            exportFileName="approvals"
            print
            printTitle="Approvals"
          />
        </div>
      </div>

      <ReviewDrawer row={selected} onClose={close} onApprove={approve} onReject={reject} />
    </DashboardLayout>
  )
}