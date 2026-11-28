import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Modal, Skeleton, Text, Textarea } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { PageState } from '../../components/pageState'
import { formatTzs } from '../../utils/format'
import {
  STATUS,
  estimateInstallment,
  methodLabel,
  totalRepayable,
  type ApplicationStatus,
  type LoanApplication,
} from './loanApplicationsData'
import { usePageAccess } from '../auth/usePageAccess'
import { useAuth } from '../../auth/authContext'
import { useApplicants } from '../../api/applicants'
import { useUserNames } from '../../api/users'
import { useApprovalChains, type ChainLevel } from '../../api/approvalHierarchy'
import {
  decideApplication,
  getApplicationWorkflow,
  getDraftCollaterals,
  getDraftGuarantors,
  useApprovalDecisions,
  useLoanApplications,
  type ApprovalDecision,
  type LoanDraft,
} from '../../api/loanApplications'

// our own rule, the API has no deadline: highlight applications waiting longer than this
const LATE_AFTER_DAYS = 7

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

/* ---------- one application, seen from the approval stage ---------- */

type LevelRow = {
  levelId: number
  levelNo: number
  levelName: string
  role: string
  decision: 'APPROVED' | 'REJECTED' | 'PENDING'
  /** who decided, with the date */
  by: string | null
  comments: string | null
}

type Row = LoanApplication & {
  levels: LevelRow[]
  /** the level that decides next, null when nothing is waiting */
  current: LevelRow | null
  awaiting: boolean
  /** the logged-in user's role matches the current level */
  mine: boolean
  rejected: boolean
  /** every level signed off */
  approved: boolean
}

// a rejection must explain itself, the API keeps the comment with the decision
const MIN_REJECT_COMMENT = 5
const MAX_COMMENT = 500

// the history once wrote "APPROVE" where the status list says "APPROVED"; both mean the same
const normalizeStatus = (s: string): ApplicationStatus => {
  const up = s.toUpperCase()
  const fixed = up === 'APPROVE' ? 'APPROVED' : up === 'REJECT' ? 'REJECTED' : up
  return (fixed in STATUS ? fixed : 'SUBMITTED') as ApplicationStatus
}

type Context = {
  decisions: ApprovalDecision[]
  /** the active levels, in order, of the hierarchy an application follows: its approvePolicyId, else the default */
  chainOf: (policyId: number | null) => ChainLevel[]
  /** every level of every hierarchy, to name the levels of past decisions */
  levelById: Map<number, { levelNo: number; levelName: string; requiredRole: string }>
  applicantName: (id: number) => string
  userName: (id: number | null) => string
  role: string | null
}

function toRow(d: LoanDraft, ctx: Context): Row | null {
  const status = normalizeStatus(d.status)
  const decided = ctx.decisions.filter((x) => x.applicationId === d.id)
  const inStage = status === 'CREDIT_APPROVED' || status === 'PENDING_APPROVAL'
  // only applications that reached the approval stage are listed here
  if (!inStage && decided.length === 0) return null

  const fromDecision = (x: ApprovalDecision): LevelRow => {
    const l = x.levelId !== null ? ctx.levelById.get(x.levelId) : undefined
    return {
      levelId: x.levelId ?? 0,
      levelNo: l?.levelNo ?? 0,
      levelName: l?.levelName ?? 'Level',
      role: l?.requiredRole ?? '—',
      decision: x.decision.includes('REJECT') ? 'REJECTED' : 'APPROVED',
      by: `${ctx.userName(x.approverId)}${x.decidedAt ? ` · ${dayjs(x.decidedAt).format('MMM D, YYYY')}` : ''}`,
      comments: x.comments || null,
    }
  }

  // waiting: the current chain, with the decisions already made filled in;
  // decided: the decisions as they were made
  const levels: LevelRow[] = inStage
    ? ctx.chainOf(d.approvePolicyId).map((l) => {
        const x = decided.find((dec) => dec.levelId === l.id)
        return x
          ? { ...fromDecision(x), levelNo: l.levelNo, levelName: l.levelName, role: l.requiredRole }
          : {
              levelId: l.id,
              levelNo: l.levelNo,
              levelName: l.levelName,
              role: l.requiredRole,
              decision: 'PENDING' as const,
              by: null,
              comments: null,
            }
      })
    : decided.map(fromDecision)

  const rejected = levels.some((l) => l.decision === 'REJECTED')
  const current = inStage && !rejected ? (levels.find((l) => l.decision === 'PENDING') ?? null) : null
  const awaiting = current !== null
  const approved = !inStage && !rejected && status !== 'REJECTED' && levels.some((l) => l.decision === 'APPROVED')

  return {
    id: d.id,
    applicationNo: d.applicationNo || `#${d.id}`,
    applicantId: d.applicantId,
    applicantName: ctx.applicantName(d.applicantId),
    loanOfficer: d.loanOfficerId ? ctx.userName(d.loanOfficerId) : '—',
    requestedAmount: d.requestedAmount ?? 0,
    interestMethod: d.interestMethod ?? 'REDUCING',
    interestRate: d.interestRate ?? 0,
    tenure: d.tenure ?? 0,
    penaltyRate: d.penaltyRate ?? 0,
    guarantorRequired: d.guarantorRequired,
    collateralRequired: d.collateralRequired,
    creditAssessmentRequired: d.creditAssessmentRequired,
    status: rejected ? 'REJECTED' : status,
    currentStage: d.currentStage || 'APPROVAL',
    created: d.createdAt,
    submittedAt: d.submittedAt,
    levels,
    current,
    awaiting,
    mine: awaiting && !!current && ctx.role !== null && current.role.trim() === ctx.role.trim(),
    rejected,
    approved,
  }
}

const waitingDays = (a: LoanApplication) => dayjs().diff(dayjs(a.submittedAt || a.created), 'day')

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

const PILL_COLOR: Record<string, string> = { APPROVED: 'green', PENDING: 'gray', REJECTED: 'red' }

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
  if (r.levels.length === 0) {
    return <div className="text-xs text-gray-400">No approval level set up</div>
  }
  const rejected = r.levels.find((l) => l.decision === 'REJECTED')

  const text = r.current
    ? `Level ${r.current.levelNo} of ${r.levels.length} · ${r.current.levelName}`
    : rejected
      ? `Rejected at ${rejected.levelName}`
      : `${r.levels.length} ${r.levels.length === 1 ? 'level' : 'levels'} approved`

  return (
    <div>
      <div className="flex w-28 gap-0.5" aria-hidden="true">
        {r.levels.map((l, i) => (
          <span
            key={`${l.levelId}-${i}`}
            className={`h-1.5 flex-1 rounded-full ${
              l.decision === 'APPROVED'
                ? 'bg-brand'
                : l.decision === 'REJECTED'
                  ? 'bg-red-400'
                  : r.current?.levelId === l.levelId
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
  onDecide: (r: Row, decision: 'approve' | 'reject', comments: string) => Promise<void>
}

// the comment box with the Approve and Reject buttons. The drawer gives it a new key for every level,
// so the text starts empty each time
function DecisionForm({
  row: r,
  onDecide,
}: {
  row: Row
  onDecide: (decision: 'approve' | 'reject', comments: string) => Promise<void>
}) {
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const text = comments.trim()
  const isLast = r.current !== null && r.levels.indexOf(r.current) === r.levels.length - 1

  // rejecting needs a reason, so check it before asking "are you sure"
  const askReject = () => {
    if (text.length < MIN_REJECT_COMMENT) {
      setError(`Explain why you are rejecting this application (at least ${MIN_REJECT_COMMENT} characters)`)
      return
    }
    setConfirming(true)
  }

  const decide = async (decision: 'approve' | 'reject') => {
    if (busy) return
    setConfirming(false)
    setSaveError(null)
    setBusy(decision)
    try {
      await onDecide(decision, text)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the decision. Please try again.')
    } finally {
      setBusy(null)
    }
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
        disabled={busy !== null}
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
          This is the last level. Approving it makes the application Approved, ready for its contract.
        </Text>
      )}
      {saveError && (
        <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
          <Text size="sm">{saveError}</Text>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="xs"
          color="red"
          variant="light"
          leftSection={<AppIcon name="x" />}
          loading={busy === 'reject'}
          disabled={busy === 'approve'}
          onClick={askReject}
        >
          Reject
        </Button>
        <Button
          size="xs"
          leftSection={<AppIcon name="check" />}
          loading={busy === 'approve'}
          disabled={busy === 'reject'}
          onClick={() => void decide('approve')}
        >
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
            <Button size="xs" color="red" leftSection={<AppIcon name="x" />} onClick={() => void decide('reject')}>
              Reject application
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function ReviewDrawer({ row, onClose, onDecide }: DrawerProps) {
  const navigate = useNavigate()
  const { canApprove } = usePageAccess('loans', 'approvals')
  const id = row?.id ?? 0

  // the same reads (and cache) as the application page
  const workflowQuery = useQuery({
    queryKey: ['loan-applications', id, 'workflow'],
    queryFn: () => getApplicationWorkflow(id),
    enabled: id > 0,
  })
  const guarantorsQuery = useQuery({
    queryKey: ['loan-applications', id, 'guarantors'],
    queryFn: () => getDraftGuarantors(id),
    enabled: id > 0 && !!row?.guarantorRequired,
  })
  const collateralsQuery = useQuery({
    queryKey: ['loan-applications', id, 'collaterals'],
    queryFn: () => getDraftCollaterals(id),
    enabled: id > 0 && !!row?.collateralRequired,
  })

  if (!row) {
    return <Drawer opened={false} onClose={onClose} />
  }

  const r = row
  const installment = Math.round(estimateInstallment(r))
  const credit = workflowQuery.data?.credit ?? null
  const guarantors = guarantorsQuery.data ?? []
  const collaterals = collateralsQuery.data ?? []
  const collateralValue = collaterals.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0)
  const loadingChecks = workflowQuery.isPending || (r.guarantorRequired && guarantorsQuery.isPending) || (r.collateralRequired && collateralsQuery.isPending)

  const tiles = [
    { label: 'Requested amount', value: formatTzs(r.requestedAmount) },
    { label: 'Est. monthly installment', value: r.tenure > 0 ? formatTzs(installment) : '—' },
    { label: 'Est. total repayable', value: r.tenure > 0 ? formatTzs(Math.round(totalRepayable(r))) : '—' },
  ]

  return (
    <Drawer opened onClose={onClose} position="right" size="lg" title={r.applicantName}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge r={r} />
          <Text size="xs" c="dimmed">
            {r.applicationNo} · Recorded by {r.loanOfficer}
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
          {loadingChecks ? (
            <div className="space-y-2 pt-1">
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} />
            </div>
          ) : (
            <>
              <Field
                label="Guarantors"
                value={
                  r.guarantorRequired
                    ? `${guarantors.filter((g) => g.idVerified && g.exposureVerified).length} of ${guarantors.length} verified`
                    : 'Not required'
                }
              />
              <Field
                label="Collateral"
                value={
                  r.collateralRequired
                    ? `${collaterals.length} ${collaterals.length === 1 ? 'asset' : 'assets'} · ${formatTzs(collateralValue)}${
                        r.requestedAmount > 0 ? ` (${Math.round((collateralValue / r.requestedAmount) * 100)}% of the loan)` : ''
                      }`
                    : 'Not required'
                }
              />
              <Field
                label="Credit assessment"
                value={
                  credit
                    ? `${credit.decision === 'APPROVE' ? 'Approved' : credit.decision === 'REJECT' ? 'Denied' : 'Done'}${
                        credit.cashFlow !== null ? ` · cash flow ${formatTzs(credit.cashFlow)}` : ''
                      }`
                    : r.creditAssessmentRequired
                      ? 'Not run yet'
                      : 'Switched off'
                }
              />
            </>
          )}
        </div>

        <div>
          <SectionTitle>Approval levels</SectionTitle>
          <p className="mb-3 text-xs text-gray-500">
            Each level must approve in order. A rejection at any level stops the application.
          </p>
          {r.levels.length === 0 ? (
            <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
              <Text size="sm">
                The hierarchy in use has no active level, so nobody can decide this application. Add a level on the
                Approval Hierarchy page.
              </Text>
            </Alert>
          ) : (
            <ul className="space-y-2">
              {r.levels.map((l, i) => (
                <li
                  key={`${l.levelId}-${i}`}
                  className={`flex items-start gap-3 rounded-md border px-3 py-3 ${
                    r.current?.levelId === l.levelId ? 'border-brand bg-brand-subtle' : 'border-gray-200'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                    {l.levelNo || i + 1}
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
          )}
        </div>

        {/* the decision, only while the application is waiting */}
        {r.current && (
          <div className="space-y-3 border-t border-gray-200 pt-5">
            <SectionTitle>{`Your decision · Level ${r.current.levelNo}: ${r.current.levelName}`}</SectionTitle>
            {r.mine && canApprove ? (
              <DecisionForm
                key={`${r.id}-${r.current.levelId}`}
                row={r}
                onDecide={(decision, comments) => onDecide(r, decision, comments)}
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

  // GET /api/loan-applications, /api/approvals, every hierarchy and level: each application follows its own
  // hierarchy (approvePolicyId, API v5) or the default; every level also names the levels of past decisions
  const listQuery = useLoanApplications()
  const decisionsQuery = useApprovalDecisions()
  const chains = useApprovalChains()
  const { data: applicantList = [] } = useApplicants()
  // GET /api/users is Admin-only; without it the names fall back to "User #id"
  const userNames = useUserNames()

  const ctx: Context = {
    decisions: decisionsQuery.data ?? [],
    chainOf: chains.chainOf,
    levelById: new Map(chains.levels.map((l) => [l.id, l])),
    applicantName: (id) => applicantList.find((a) => a.id === id)?.name ?? `Applicant #${id}`,
    userName: (id) => (id === null ? '—' : id === user?.id ? 'You' : (userNames.get(id) ?? `User #${id}`)),
    role,
  }
  const rows = (listQuery.data ?? []).map((d) => toRow(d, ctx)).filter((r): r is Row => r !== null)

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

  // POST .../approve or .../reject; an error is thrown back to the form and shown there
  const decide = async (r: Row, decision: 'approve' | 'reject', comments: string) => {
    if (!user) throw new Error('Your user could not be read. Log out and back in, then try again.')
    const level = r.current
    const isLast = level !== null && r.levels.indexOf(level) === r.levels.length - 1
    await decideApplication(r.id, decision, { approverId: user.id, comments })
    close()
    // the result is a top-right toast (was a banner above the stats)
    if (decision === 'reject') {
      setTab('decided')
      notifications.show({
        color: 'red',
        title: 'Loan rejected',
        message: `${r.applicationNo} was rejected at ${level?.levelName ?? 'the current level'}.`,
        icon: <AppIcon name="circle-x" size={16} />,
      })
      return
    }
    const next = level ? r.levels[r.levels.indexOf(level) + 1] : undefined
    if (isLast) setTab('decided')
    notifications.show({
      color: 'brand',
      title: isLast ? 'Loan approved' : 'Level approved',
      message: isLast
        ? `${r.applicationNo} is fully approved and ready for its contract.`
        : `${r.applicationNo} now waits for ${next?.levelName ?? 'the next level'}.`,
      icon: <AppIcon name="circle-check" size={16} />,
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
      // the estimate from the loan terms; cash flow and the checks are in the drawer
      accessor: 'creditAssessmentRequired',
      header: 'Installment',
      sortable: false,
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm text-gray-800">
            {r.tenure > 0 ? formatTzs(Math.round(estimateInstallment(r))) : '—'}
          </div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            {r.creditAssessmentRequired ? 'Credit checked' : 'Credit check skipped'}
          </div>
        </div>
      ),
      exportValue: (r) => (r.tenure > 0 ? Math.round(estimateInstallment(r)) : ''),
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
              Submitted {dayjs(r.submittedAt || r.created).format('MMM D, YYYY')}
            </div>
          </div>
        )
      },
      exportValue: (r) => r.submittedAt || r.created,
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
              <Menu.Item leftSection={<AppIcon name={r.mine ? 'gavel' : 'eye'} />} onClick={() => open(r)}>
                {r.mine ? 'Review and decide' : 'View details'}
              </Menu.Item>
              <Menu.Item leftSection={<AppIcon name="file-text" />} onClick={() => navigate(`/loan-applications/${r.id}`)}>
                Open application
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  const loadError = listQuery.error ?? decisionsQuery.error ?? chains.error
  return (
    <DashboardLayout
      title="Approvals"
      subtitle="Applications waiting for an approval decision"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Loans' }, { label: 'Approvals' }]}
    >
      <PageState
        loading={listQuery.isPending || decisionsQuery.isPending || chains.isPending}
        error={loadError instanceof Error ? loadError.message : null}
        onRetry={() => {
          void listQuery.refetch()
          void decisionsQuery.refetch()
          void chains.refetch()
        }}
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
            <CustomTabs
              ariaLabel="Approval filters"
              className="mb-3 w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'awaiting', label: `Awaiting decision (${awaiting.length})` },
                { value: 'mine', label: `Needs my decision (${mine.length})` },
                { value: 'decided', label: `Decided (${decided.length})` },
                { value: 'all', label: `All (${queue.length})` },
              ]}
            />

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
      </PageState>

      <ReviewDrawer row={selected} onClose={close} onDecide={decide} />
    </DashboardLayout>
  )
}
