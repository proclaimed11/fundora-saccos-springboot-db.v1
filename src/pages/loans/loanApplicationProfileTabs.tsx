import { AppIcon, stepIcon  } from '../../components/appIcon'
import { useState } from 'react'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { defaultContent, printContract, valuesFor } from './contractTemplate'
import { Alert, Badge, Button, Stepper, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import {
  LOANS,
  RANK,
  STATUS,
  activityFor,
  approvalsFor,
  collateralsFor,
  contractFor,
  creditFor,
  estimateInstallment,
  guarantorsFor,
  methodLabel,
  scheduleFor,
  totalRepayable,
  type ApplicationStatus,
  type InstallmentRow,
  type LoanApplication,
} from './loanApplicationsData'
import { useNavigate } from 'react-router-dom'

/* ---------- small helpers ---------- */

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

function Empty({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
      {children}
    </div>
  )
}

const PILL_COLOR: Record<string, string> = {
  VERIFIED: 'green',
  APPROVED: 'green',
  APPROVE: 'green',
  PENDING: 'gray',
  REJECTED: 'red',
  REJECT: 'red',
  GENERATED: 'violet',
  SENT: 'blue',
  SIGNED: 'teal',
}

function Pill({ value }: { value: string }) {
  return (
    <Badge variant="light" color={PILL_COLOR[value] ?? 'gray'} radius="sm" size="sm">
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </Badge>
  )
}

function Timeline({ application, limit }: { application: LoanApplication; limit?: number }) {
  const events = activityFor(application).slice(0, limit)
  return (
    <ul className="space-y-4">
      {events.map((e) => (
        <li key={e.title} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <AppIcon name={e.icon} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3">
              <span className="text-sm font-medium text-gray-800">{e.title}</span>
              <span className="shrink-0 text-xs text-gray-400">
                {dayjs(e.date).format('MMM D, YYYY')}
              </span>
            </div>
            <div className="text-xs text-gray-500">{e.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------- tabs ---------- */

export function OverviewTab({ application }: { application: LoanApplication }) {
  const tiles = [
    { label: 'Requested amount', value: formatTzs(application.requestedAmount) },
    { label: 'Est. monthly installment', value: formatTzs(Math.round(estimateInstallment(application))) },
    { label: 'Est. total repayable', value: formatTzs(Math.round(totalRepayable(application))) },
  ]

  return (
    <div className="space-y-6">
      <Stepper
        active={STATUS[application.status].step}
        size="xs"
        color={application.status === 'REJECTED' ? 'red' : 'brand'}
        className={`app-stepper${application.status === 'REJECTED' ? ' app-stepper-danger' : ''}`}
      >
        <Stepper.Step label="Submitted" {...stepIcon('file-text')} />
        <Stepper.Step label="Credit" {...stepIcon('calculator')} />
        <Stepper.Step label="Approval" {...stepIcon('square-check')} />
        <Stepper.Step label="Contract" {...stepIcon('pen-line')} />
        <Stepper.Step label="Loan" {...stepIcon('banknote')} />
      </Stepper>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-lg font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Loan terms</SectionTitle>
          <Field label="Interest method" value={methodLabel(application.interestMethod)} />
          <Field label="Interest rate" value={`${application.interestRate}% per year`} />
          <Field label="Tenure" value={`${application.tenure} months`} />
          <Field label="Penalty rate" value={`${application.penaltyRate}%`} />
        </div>
        <div>
          <SectionTitle>Recent activity</SectionTitle>
          <div className="mt-3">
            <Timeline application={application} limit={3} />
          </div>
        </div>
      </div>
    </div>
  )
}

type RequirementsProps = {
  application: LoanApplication
  /** ids verified in this session */
  verifiedGuarantors?: number[]
  verifiedCollaterals?: number[]
  onVerifyGuarantor?: (id: number) => void
  onVerifyCollateral?: (id: number) => void
}

export function RequirementsTab({
  application,
  verifiedGuarantors = [],
  verifiedCollaterals = [],
  onVerifyGuarantor,
  onVerifyCollateral,
}: RequirementsProps) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  const guarantors = guarantorsFor(application)
  const collaterals = collateralsFor(application)
  const credit = creditFor(application)
  const installment = Math.round(estimateInstallment(application))
  const totalValue = collaterals.reduce((sum, c) => sum + c.value, 0)
  const shortfall = credit ? Math.max(0, installment - credit.cashFlow) : 0
  // checks can only be done after submission and before the credit assessment
  const canVerify = application.status === 'SUBMITTED'

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <SectionTitle>{guarantors.length > 1 ? `Guarantors (${guarantors.length})` : 'Guarantors'}</SectionTitle>
          {!application.guarantorRequired ? (
            <Empty>A guarantor is not required for this application.</Empty>
          ) : guarantors.length === 0 ? (
            <Empty>No guarantor has been added yet.</Empty>
          ) : (
            <ul className="mt-2 space-y-2">
              {guarantors.map((g) => {
                const status = verifiedGuarantors.includes(g.id) ? 'VERIFIED' : g.status
                return (
                  <li key={g.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                    <AppIcon name="user-round" className="w-6 text-center text-xl text-gray-400" size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800">{g.name}</div>
                      <div className="text-xs text-gray-500">
                        {g.relationship} · {g.phone}
                      </div>
                    </div>
                    {canVerify && status === 'PENDING' && onVerifyGuarantor && (
                      <Button size="compact-xs" variant="light" onClick={() => onVerifyGuarantor(g.id)}>
                        Verify
                      </Button>
                    )}
                    <Pill value={status} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>{collaterals.length > 1 ? `Collateral (${collaterals.length} assets)` : 'Collateral'}</SectionTitle>
          {!application.collateralRequired ? (
            <Empty>Collateral is not required for this application.</Empty>
          ) : collaterals.length === 0 ? (
            <Empty>No collateral has been added yet.</Empty>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {collaterals.map((c) => {
                  const status = verifiedCollaterals.includes(c.id) ? 'VERIFIED' : c.status
                  return (
                    <li key={c.id} className="rounded-md border border-gray-200 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <AppIcon name="shield" className="w-6 text-center text-xl text-gray-400" size={24} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800">{c.type}</div>
                          <div className="truncate text-xs text-gray-500">
                            {c.description} · {formatTzs(c.value)}
                          </div>
                        </div>
                        {canVerify && status === 'PENDING' && onVerifyCollateral && (
                          <Button size="compact-xs" variant="light" onClick={() => onVerifyCollateral(c.id)}>
                            Verify
                          </Button>
                        )}
                        <Pill value={status} />
                      </div>
                      <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 text-xs">
                        <AppIcon name="file-text" className={c.document ? 'text-gray-400' : 'text-gray-300'} />
                        {c.document ? (
                          <>
                            <span className="min-w-0 flex-1 truncate text-gray-600">{c.document}</span>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="brand"
                              onClick={() =>
                                setViewing({
                                  title: `${c.type} document`,
                                  fileName: c.document!,
                                  subtitle: application.applicationNo,
                                  notes: c.description,
                                })
                              }
                            >
                              View
                            </Button>
                          </>
                        ) : (
                          <span className="text-gray-400">No document uploaded</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-2 flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Total value</span>
                <span className="font-medium text-gray-800">
                  {formatTzs(totalValue)}{' '}
                  <span className="text-xs font-normal text-gray-500">
                    ({Math.round((totalValue / application.requestedAmount) * 100)}% of the loan)
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <SectionTitle>Credit assessment</SectionTitle>
        {!application.creditAssessmentRequired ? (
          <Empty>Credit assessment is switched off for this application.</Empty>
        ) : !credit ? (
          <Empty>
            {canVerify
              ? 'The credit assessment has not been run yet. Use the button at the top of the page once everything is verified.'
              : 'The credit assessment has not been run yet.'}
          </Empty>
        ) : (
          <div className="space-y-3">
            {credit.decision === 'REJECT' && (
              <Alert
                color="red"
                variant="light"
                title="Credit assessment failed"
                icon={<AppIcon name="circle-x" />}
              >
                <Text size="sm">
                  {shortfall > 0
                    ? `Monthly cash flow of ${formatTzs(credit.cashFlow)} does not cover the estimated installment of ${formatTzs(installment)}. It is short by ${formatTzs(shortfall)}.`
                    : credit.notes}
                </Text>
                <Text size="sm" mt={6}>
                  The application was rejected and did not go to approval.
                </Text>
              </Alert>
            )}
            <div>
              <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
                <span className="text-gray-500">Decision</span>
                <Pill value={credit.decision} />
              </div>
              <Field label="Monthly income" value={formatTzs(credit.income)} />
              <Field label="Monthly expenses" value={formatTzs(credit.expenses)} />
              <Field label="Cash flow" value={formatTzs(credit.cashFlow)} />
              <Field label="Est. monthly installment" value={formatTzs(installment)} />
              <Field label="Assessed by" value={credit.assessedBy} />
              <Field label="Notes" value={credit.notes} />
            </div>
          </div>
        )}
      </div>

      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

export function ApprovalsTab({ application }: { application: LoanApplication }) {
  const navigate = useNavigate()
  const approvals = approvalsFor(application)

  // only applications that reached the approval stage appear on the Approvals page
  const inApprovalStage =
    application.status === 'CREDIT_APPROVED' ||
    application.status === 'PENDING_APPROVAL' ||
    (application.status !== 'REJECTED' && RANK[application.status] >= 3)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>Approval hierarchy</SectionTitle>
          <p className="mb-3 text-xs text-gray-500">
            Each level must approve in order. A rejection at any level stops the application.
          </p>
        </div>
        {inApprovalStage && (
          <Button
            size="xs"
            variant="default"
            leftSection={<AppIcon name="external-link" />}
            onClick={() => navigate(`/loan-approvals?review=${application.id}`)}
          >
            Open in Approvals
          </Button>
        )}
      </div>

      {!inApprovalStage && (
        <p className="mb-3 text-xs text-gray-400">This application has not reached the approval stage yet.</p>
      )}

      <ul className="space-y-2">
        {approvals.map((a) => (
          <li key={a.levelNo} className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
              {a.levelNo}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800">{a.levelName}</div>
              <div className="text-xs text-gray-500">Required role: {a.role}</div>
              {a.by && (
                <div className="mt-1 text-xs text-gray-500">
                  {a.by}
                  {a.comments ? ` · "${a.comments}"` : ''}
                </div>
              )}
            </div>
            <Pill value={a.decision} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ContractTab({
  application,
  onUploadSigned,
}: {
  application: LoanApplication
  onUploadSigned?: () => void
}) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  const contract = contractFor(application)

  if (!contract) {
    return (
      <Empty>
        {application.status === 'APPROVED'
          ? 'The application is approved. Use "Generate contract" to create the contract.'
          : 'A contract is created once the application is approved.'}
      </Empty>
    )
  }

  const print = () =>
    printContract(
      defaultContent(application),
      valuesFor(application),
      contract.contractNo,
      dayjs(contract.generated).format('MMMM D, YYYY'),
    )
  const signedOn = contract.signed ? dayjs(contract.signed).format('MMM D, YYYY') : ''

  // 3 means every contract step is done
  const step = { GENERATED: 1, SENT: 2, SIGNED: 3 }[contract.status]

  const hint = {
    GENERATED: 'Next step: send the contract to the borrower by email.',
    SENT: 'Waiting for the borrower to print, sign and return it. Then upload the signed copy.',
    SIGNED:
      application.status === 'LOAN_CREATED'
        ? 'The loan has been created.'
        : 'The signed copy is on file. Next step: create the loan.',
  }[contract.status]

  return (
    <div className="space-y-6">
      <Stepper active={step} size="xs" color="brand">
        <Stepper.Step label="Generated" />
        <Stepper.Step label="Sent" />
        <Stepper.Step label="Signed" />
      </Stepper>

      <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
        <Text size="sm">{hint}</Text>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Contract</SectionTitle>
          <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
            <span className="text-gray-500">Status</span>
            <Pill value={contract.status} />
          </div>
          <Field label="Contract number" value={contract.contractNo} />
          <Field label="Principal" value={formatTzs(application.requestedAmount)} />
          <Field label="Generated" value={dayjs(contract.generated).format('MMM D, YYYY')} />
          <Field
            label="Sent to borrower"
            value={contract.sent ? dayjs(contract.sent).format('MMM D, YYYY') : 'Not yet'}
          />
          <Field
            label="Signed"
            value={contract.signed ? dayjs(contract.signed).format('MMM D, YYYY') : 'Not yet'}
          />
        </div>

        <div>
          <SectionTitle>Documents</SectionTitle>
          <ul className="mt-2 space-y-2">
            <li className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
              <AppIcon name="file-text" className="text-xl text-gray-400" size={20} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800">Loan contract</div>
                <div className="truncate text-xs text-gray-500">{contract.contractNo}.pdf</div>
              </div>
              <Button
                size="xs"
                variant="subtle"
                color="brand"
                leftSection={<AppIcon name="printer" />}
                onClick={print}
              >
                Print
              </Button>
            </li>

            {contract.signed ? (
              <li className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                <AppIcon name="file-image" className="text-xl text-gray-400" size={20} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">Signed copy</div>
                  <div className="truncate text-xs text-gray-500">{contract.contractNo}-signed.pdf</div>
                </div>
                <Button
                  size="xs"
                  variant="subtle"
                  color="brand"
                  onClick={() =>
                    setViewing({
                      title: 'Signed copy',
                      fileName: `${contract.contractNo}-signed.pdf`,
                      subtitle: `Signed on ${signedOn}`,
                    })
                  }
                >
                  View
                </Button>
              </li>
            ) : (
              <li className="flex items-center gap-3 rounded-md border border-dashed border-gray-200 px-3 py-2.5">
                <AppIcon name="file-image" className="text-xl text-gray-300" size={20} />
                <div className="min-w-0 flex-1 text-xs text-gray-500">Signed copy not uploaded yet</div>
                {contract.status === 'SENT' && (
                  <Button
                    size="compact-xs"
                    leftSection={<AppIcon name="upload" />}
                    onClick={onUploadSigned}
                  >
                    Upload signed contract
                  </Button>
                )}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Document viewer added here */}
      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

const scheduleColumns: CustomTableColumn<InstallmentRow>[] = [
  { accessor: 'installmentNo', header: 'No.', width: 70 },
  { accessor: 'dueDate', header: 'Due date', type: 'date' },
  { accessor: 'principal', header: 'Principal', render: (r) => <Text size="sm">{formatTzs(r.principal)}</Text>, exportValue: (r) => r.principal },
  { accessor: 'interest', header: 'Interest', render: (r) => <Text size="sm">{formatTzs(r.interest)}</Text>, exportValue: (r) => r.interest },
  { accessor: 'total', header: 'Installment', render: (r) => <Text size="sm" fw={500}>{formatTzs(r.total)}</Text>, exportValue: (r) => r.total },
  { accessor: 'balance', header: 'Balance', render: (r) => <Text size="sm">{formatTzs(r.balance)}</Text>, exportValue: (r) => r.balance },
]

export function ScheduleTab({ application }: { application: LoanApplication }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        This is an estimate from the requested terms. The real schedule is generated when the loan is
        disbursed.
      </p>
      <CustomTable<InstallmentRow>
        size="sm"
        data={scheduleFor(application)}
        columns={scheduleColumns}
        pagination={false}
        defaultSort={null}
        exportCsv
        exportFileName={`${application.applicationNo}-schedule`}
      />
    </div>
  )
}

export function ActivityTab({ application }: { application: LoanApplication }) {
  return <Timeline application={application} />
}

/* ---------- workflow ---------- */

// the path an application takes, in order (the API keeps one status history row per move)
const WORKFLOW_PATH: { status: ApplicationStatus; offset: number; by: string }[] = [
  { status: 'SUBMITTED', offset: 0, by: 'Loan officer' },
  { status: 'CREDIT_APPROVED', offset: 1, by: 'Credit analyst' },
  { status: 'PENDING_APPROVAL', offset: 1, by: 'System' },
  { status: 'APPROVED', offset: 2, by: 'Approval committee' },
  { status: 'CONTRACT_GENERATED', offset: 3, by: 'Loan officer' },
  { status: 'CONTRACT_SIGNED', offset: 6, by: 'Loan officer' },
  { status: 'LOAN_CREATED', offset: 7, by: 'Loan officer' },
]

type HistoryRow = { from: ApplicationStatus | null; to: ApplicationStatus; date: string; by: string }

// SAMPLE ONLY: replaced by the statusHistory of GET /api/loan-origination/applications/{id}/workflow
function historyFor(a: LoanApplication): HistoryRow[] {
  const day = (n: number) => dayjs(a.created).add(n, 'day').format('YYYY-MM-DD')
  const rows: HistoryRow[] = []
  let previous: ApplicationStatus | null = null

  const push = (to: ApplicationStatus, offset: number, by: string) => {
    rows.push({ from: previous, to, date: day(offset), by })
    previous = to
  }

  if (a.status === 'DRAFT') {
    push('DRAFT', 0, a.loanOfficer)
    return rows
  }

  const stopped = a.status === 'REJECTED' || a.status === 'CANCELLED'
  const reached = stopped ? 0 : WORKFLOW_PATH.findIndex((p) => p.status === a.status)

  WORKFLOW_PATH.slice(0, reached + 1).forEach((p) => push(p.status, p.offset, p.by))

  if (stopped) {
    // a stopped application only ever got as far as submission
    if (rows.length === 0) push('SUBMITTED', 0, 'Loan officer')
    push(a.status, 1, a.status === 'CANCELLED' ? 'Staff' : 'System')
  }
  return rows
}

function SummaryCard({
  icon,
  title,
  value,
  sub,
  tone = 'gray',
}: {
  icon: string
  title: string
  value: string
  sub: string
  tone?: 'gray' | 'green' | 'yellow' | 'red'
}) {
  const ring = { gray: 'bg-gray-100 text-gray-500', green: 'bg-green-50 text-green-600', yellow: 'bg-yellow-50 text-yellow-600', red: 'bg-red-50 text-red-600' }[tone]
  return (
    <div className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ring}`}>
        <AppIcon name={icon} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{title}</div>
        <div className="text-sm font-medium text-gray-800">{value}</div>
        <div className="truncate text-xs text-gray-500">{sub}</div>
      </div>
    </div>
  )
}

type WorkflowProps = {
  application: LoanApplication
  /** ids verified in this session */
  verifiedGuarantors?: number[]
  verifiedCollaterals?: number[]
}

export function WorkflowTab({ application: a, verifiedGuarantors = [], verifiedCollaterals = [] }: WorkflowProps) {
  const navigate = useNavigate()

  const guarantors = guarantorsFor(a)
  const collaterals = collateralsFor(a)
  const credit = creditFor(a)
  const approvals = approvalsFor(a)
  const contract = contractFor(a)
  const loan = LOANS.find((l) => l.applicationId === a.id) ?? null
  const history = historyFor(a)

  const gVerified = guarantors.filter((g) => g.status === 'VERIFIED' || verifiedGuarantors.includes(g.id)).length
  const cVerified = collaterals.filter((c) => c.status === 'VERIFIED' || verifiedCollaterals.includes(c.id)).length
  const approved = approvals.filter((x) => x.decision === 'APPROVED').length
  const rejectedLevel = approvals.find((x) => x.decision === 'REJECTED')
  const inApproval = RANK[a.status] >= 2 && a.status !== 'REJECTED' && a.status !== 'CANCELLED'

  return (
    <div className="space-y-6">
      {/* one card per part of the origination */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon="user-round"
          title="Guarantors"
          value={a.guarantorRequired ? `${gVerified} of ${guarantors.length} verified` : 'Not required'}
          sub={a.guarantorRequired ? (guarantors.map((g) => g.name).join(', ') || 'None added yet') : 'Skipped for this application'}
          tone={!a.guarantorRequired ? 'gray' : guarantors.length > 0 && gVerified === guarantors.length ? 'green' : 'yellow'}
        />
        <SummaryCard
          icon="shield"
          title="Collateral"
          value={a.collateralRequired ? `${cVerified} of ${collaterals.length} verified` : 'Not required'}
          sub={a.collateralRequired ? (collaterals.map((c) => c.type).join(', ') || 'None added yet') : 'Skipped for this application'}
          tone={!a.collateralRequired ? 'gray' : collaterals.length > 0 && cVerified === collaterals.length ? 'green' : 'yellow'}
        />
        <SummaryCard
          icon="calculator"
          title="Credit assessment"
          value={!a.creditAssessmentRequired ? 'Switched off' : credit ? (credit.decision === 'APPROVE' ? 'Approved' : 'Denied') : 'Not run yet'}
          sub={credit ? `Cash flow ${formatTzs(credit.cashFlow)} · by ${credit.assessedBy}` : 'Runs after every check is verified'}
          tone={credit ? (credit.decision === 'APPROVE' ? 'green' : 'red') : 'gray'}
        />
        <SummaryCard
          icon="square-check"
          title="Approvals"
          value={rejectedLevel ? `Rejected at level ${rejectedLevel.levelNo}` : inApproval ? `${approved} of ${approvals.length} levels` : 'Not started'}
          sub={rejectedLevel?.comments ?? approvals.map((x) => x.levelName).join(' → ')}
          tone={rejectedLevel ? 'red' : approved === approvals.length ? 'green' : inApproval ? 'yellow' : 'gray'}
        />
        <SummaryCard
          icon="pen-line"
          title="Contract"
          value={contract ? contract.status.charAt(0) + contract.status.slice(1).toLowerCase() : 'Not created'}
          sub={contract ? contract.contractNo : 'Created after approval'}
          tone={contract ? (contract.status === 'SIGNED' ? 'green' : 'yellow') : 'gray'}
        />
        <SummaryCard
          icon="hand-coins"
          title="Loan"
          value={loan ? loan.loanNo : 'Not created'}
          sub={loan ? `${formatTzs(loan.principal)} · disbursed ${dayjs(loan.disbursed).format('MMM D, YYYY')}` : 'Created from the signed contract'}
          tone={loan ? 'green' : 'gray'}
        />
      </div>

      {/* the application itself */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Application</SectionTitle>
          <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
            <span className="text-gray-500">Status</span>
            <Badge variant="light" color={STATUS[a.status].color} radius="sm" size="sm">
              {STATUS[a.status].label}
            </Badge>
          </div>
          <Field label="Application number" value={a.applicationNo} />
          <Field label="Applicant" value={a.applicantName} />
          <Field label="Loan officer" value={a.loanOfficer} />
          <Field label="Requested amount" value={formatTzs(a.requestedAmount)} />
          <Field label="Terms" value={`${a.interestRate}% p.a. · ${methodLabel(a.interestMethod)} · ${a.tenure} months`} />
        </div>

        <div>
          <SectionTitle>Approval levels</SectionTitle>
          <ul className="mt-1 space-y-2">
            {approvals.map((x) => (
              <li key={x.levelNo} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                  {x.levelNo}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">{x.levelName}</div>
                  <div className="truncate text-xs text-gray-500">{x.by ? `${x.by} · ` : ''}{x.role}</div>
                </div>
                <Pill value={x.decision} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* the full status history */}
      <div>
        <SectionTitle>{`Status history (${history.length})`}</SectionTitle>
        <p className="mb-3 text-xs text-gray-500">Every move the application made, oldest first.</p>
        <ol>
          {history.map((h, i) => (
            <li key={`${h.to}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                    h.to === 'REJECTED' || h.to === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-brand text-white'
                  }`}
                >
                  {h.to === 'REJECTED' || h.to === 'CANCELLED' ? <AppIcon name="x" /> : <AppIcon name="check" />}
                </span>
                {i < history.length - 1 && <span className="my-1 w-px flex-1 bg-gray-200" />}
              </div>
              <div className="flex flex-1 items-start justify-between gap-3 pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-800">
                    {h.from && (
                      <>
                        <Badge variant="outline" color="gray" radius="sm" size="xs">
                          {STATUS[h.from].label}
                        </Badge>
                        <AppIcon name="chevron-right" className="text-gray-400" size={12} />
                      </>
                    )}
                    <Badge variant="light" color={STATUS[h.to].color} radius="sm" size="sm">
                      {STATUS[h.to].label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">By {h.by}</div>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{dayjs(h.date).format('MMM D, YYYY')}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {loan && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${loan.id}`)}>
            View loan
          </Button>
        )}
        <Button size="xs" variant="default" leftSection={<AppIcon name="user-round" />} onClick={() => navigate(`/applicants/${a.applicantId}`)}>
          View applicant
        </Button>
      </div>
    </div>
  )
}