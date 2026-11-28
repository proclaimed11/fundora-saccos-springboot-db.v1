import { AppIcon, stepIcon } from '../../components/appIcon'
import { useState } from 'react'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { defaultContent, printContract, valuesFor } from './contractTemplate'
import { Alert, Badge, Button, Stepper, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import { fileUrl } from '../../api/applicants'
import type { WfContract, WfCredit, WfLoan } from '../../api/loanApplications'
import {
  RANK,
  STATUS,
  estimateInstallment,
  methodLabel,
  scheduleFor,
  totalRepayable,
  type ApplicationStatus,
  type InstallmentRow,
  type LoanApplication,
} from './loanApplicationsData'
import { useNavigate } from 'react-router-dom'

/* ---------- the application as the page shows it, built from the API by the page ---------- */

export type ViewGuarantor = { id: number; name: string; phone: string; idNumber: string; address: string; verified: boolean }

export type ViewCollateral = {
  id: number
  type: string
  description: string
  value: number
  verified: boolean
  documentNumber: string
  documentFileName: string
  documentPath: string
}

export type ViewLevel = {
  levelNo: number
  levelName: string
  role: string
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  by: string
  comments: string
  date: string
}

export type ViewHistory = { from: string; to: string; date: string; by: string; remarks: string }

export type ApplicationView = {
  application: LoanApplication
  guarantors: ViewGuarantor[]
  collaterals: ViewCollateral[]
  credit: (WfCredit & { assessedByName: string }) | null
  levels: ViewLevel[]
  /** the hierarchy this loan follows: its own (approvePolicyId) or, when none was saved, the default */
  hierarchy: { name: string; ownPolicy: boolean } | null
  contract: WfContract | null
  loan: WfLoan | null
  /** oldest first */
  history: ViewHistory[]
  /** set when the workflow (credit, approvals, contract, loan, history) could not be loaded */
  workflowError: string | null
}

/* ---------- small helpers ---------- */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value || '-'}</span>
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

// shown in place of a part that comes from the workflow when that call failed
function WorkflowMissing({ error }: { error: string }) {
  return (
    <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
      <Text size="sm">This part could not be loaded. {error}</Text>
    </Alert>
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

const words = (v: string) => {
  const s = v.replace(/_/g, ' ').toLowerCase()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '-'
}

function Pill({ value }: { value: string }) {
  return (
    <Badge variant="light" color={PILL_COLOR[value] ?? 'gray'} radius="sm" size="sm">
      {words(value)}
    </Badge>
  )
}

// an application status from the API, with its label and colour when the app knows it
function StatusBadge({ value, size = 'sm', outline = false }: { value: string; size?: 'xs' | 'sm'; outline?: boolean }) {
  const known = STATUS[value as ApplicationStatus]
  return (
    <Badge variant={outline ? 'outline' : 'light'} color={outline ? 'gray' : (known?.color ?? 'gray')} radius="sm" size={size}>
      {known?.label ?? words(value)}
    </Badge>
  )
}

const dateText = (v: string) => (v ? dayjs(v).format('MMM D, YYYY') : '-')

const HISTORY_ICON: Record<string, string> = {
  DRAFT: 'pen-line',
  SUBMITTED: 'file-text',
  CREDIT_APPROVED: 'calculator',
  PENDING_APPROVAL: 'hourglass',
  APPROVED: 'square-check',
  REJECTED: 'circle-x',
  CANCELLED: 'circle-x',
  CONTRACT_GENERATED: 'pen-line',
  CONTRACT_SIGNED: 'file-check',
  LOAN_CREATED: 'banknote',
}

// newest first
function Timeline({ view, limit }: { view: ApplicationView; limit?: number }) {
  if (view.workflowError) return <WorkflowMissing error={view.workflowError} />
  const events = [...view.history].reverse().slice(0, limit)
  if (events.length === 0) return <Empty>No activity has been recorded yet.</Empty>
  return (
    <ul className="space-y-4">
      {events.map((e, i) => (
        <li key={`${e.to}-${e.date}-${i}`} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <AppIcon name={HISTORY_ICON[e.to] ?? 'info'} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3">
              <span className="text-sm font-medium text-gray-800">
                {STATUS[e.to as ApplicationStatus]?.label ?? words(e.to)}
              </span>
              <span className="shrink-0 text-xs text-gray-400">{dateText(e.date)}</span>
            </div>
            <div className="text-xs text-gray-500">
              {e.by ? `By ${e.by}` : 'By the system'}
              {e.remarks ? ` · ${e.remarks}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------- tabs ---------- */

export function OverviewTab({ view }: { view: ApplicationView }) {
  const a = view.application
  const tiles = [
    { label: 'Requested amount', value: formatTzs(a.requestedAmount) },
    { label: 'Est. monthly installment', value: formatTzs(Math.round(estimateInstallment(a))) },
    { label: 'Est. total repayable', value: formatTzs(Math.round(totalRepayable(a))) },
  ]

  return (
    <div className="space-y-6">
      <Stepper
        active={STATUS[a.status].step}
        size="xs"
        color={a.status === 'REJECTED' ? 'red' : 'brand'}
        className={`app-stepper${a.status === 'REJECTED' ? ' app-stepper-danger' : ''}`}
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
          <Field label="Interest method" value={methodLabel(a.interestMethod)} />
          <Field label="Interest rate" value={`${a.interestRate}% per year`} />
          <Field label="Tenure" value={`${a.tenure} months`} />
          <Field label="Penalty rate" value={`${a.penaltyRate}%`} />
        </div>
        <div>
          <SectionTitle>Recent activity</SectionTitle>
          <div className="mt-3">
            <Timeline view={view} limit={3} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function RequirementsTab({ view }: { view: ApplicationView }) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  const a = view.application
  const { guarantors, collaterals, credit } = view
  const installment = Math.round(estimateInstallment(a))
  const totalValue = collaterals.reduce((sum, c) => sum + c.value, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <SectionTitle>{guarantors.length > 1 ? `Guarantors (${guarantors.length})` : 'Guarantors'}</SectionTitle>
          {!a.guarantorRequired ? (
            <Empty>A guarantor is not required for this application.</Empty>
          ) : guarantors.length === 0 ? (
            <Empty>No guarantor has been added.</Empty>
          ) : (
            <ul className="mt-2 space-y-2">
              {guarantors.map((g) => (
                <li key={g.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                  <AppIcon name="user-round" className="w-6 text-center text-xl text-gray-400" size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">{g.name || '-'}</div>
                    <div className="truncate text-xs text-gray-500">
                      {[g.phone, g.idNumber && `NIDA ${g.idNumber}`, g.address].filter(Boolean).join(' · ') || '-'}
                    </div>
                  </div>
                  <Pill value={g.verified ? 'VERIFIED' : 'PENDING'} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>{collaterals.length > 1 ? `Collateral (${collaterals.length} assets)` : 'Collateral'}</SectionTitle>
          {!a.collateralRequired ? (
            <Empty>Collateral is not required for this application.</Empty>
          ) : collaterals.length === 0 ? (
            <Empty>No collateral has been added.</Empty>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {collaterals.map((c) => (
                  <li key={c.id} className="rounded-md border border-gray-200 px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <AppIcon name="shield" className="w-6 text-center text-xl text-gray-400" size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800">{c.type || '-'}</div>
                        <div className="truncate text-xs text-gray-500">
                          {c.description || '-'} · {formatTzs(c.value)}
                        </div>
                      </div>
                      <Pill value={c.verified ? 'VERIFIED' : 'PENDING'} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 text-xs">
                      <AppIcon name="file-text" className={c.documentPath ? 'text-gray-400' : 'text-gray-300'} />
                      {c.documentPath || c.documentNumber ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-gray-600">
                            {[c.documentFileName, c.documentNumber && `No. ${c.documentNumber}`].filter(Boolean).join(' · ')}
                          </span>
                          {c.documentPath && (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="brand"
                              onClick={() =>
                                setViewing({
                                  title: `${c.type} document`,
                                  fileName: c.documentFileName,
                                  subtitle: a.applicationNo,
                                  notes: c.description,
                                  url: fileUrl(c.documentPath),
                                })
                              }
                            >
                              View
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">No document recorded</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Total value</span>
                <span className="font-medium text-gray-800">
                  {formatTzs(totalValue)}{' '}
                  {a.requestedAmount > 0 && (
                    <span className="text-xs font-normal text-gray-500">
                      ({Math.round((totalValue / a.requestedAmount) * 100)}% of the loan)
                    </span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <SectionTitle>Credit assessment</SectionTitle>
        {view.workflowError ? (
          <WorkflowMissing error={view.workflowError} />
        ) : !credit ? (
          <Empty>
            {a.creditAssessmentRequired
              ? 'The credit assessment has not run yet.'
              : 'Credit assessment is switched off for this application.'}
          </Empty>
        ) : (
          <div className="space-y-3">
            {credit.decision === 'REJECT' && (
              <Alert color="red" variant="light" title="Credit assessment failed" icon={<AppIcon name="circle-x" />}>
                <Text size="sm">The application was rejected and did not go to approval.</Text>
              </Alert>
            )}
            <div>
              <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
                <span className="text-gray-500">Decision</span>
                {credit.decision ? <Pill value={credit.decision} /> : <span className="text-gray-800">-</span>}
              </div>
              {a.creditAssessmentRequired && (
                <>
                  <Field label="Monthly income" value={credit.income === null ? '' : formatTzs(credit.income)} />
                  <Field label="Monthly expenses" value={credit.expenses === null ? '' : formatTzs(credit.expenses)} />
                  <Field label="Cash flow" value={credit.cashFlow === null ? '' : formatTzs(credit.cashFlow)} />
                  <Field
                    label="Existing debt"
                    value={credit.totalExistingDebt === null ? '' : formatTzs(credit.totalExistingDebt)}
                  />
                  <Field label="Pending payments" value={credit.hasPendingPayments ? 'Yes' : 'No'} />
                  <Field label="Est. monthly installment" value={formatTzs(installment)} />
                </>
              )}
              <Field label="Assessed by" value={credit.assessedByName} />
              <Field label="Assessed on" value={dateText(credit.assessedAt)} />
              <Field label="Notes" value={credit.notes} />
            </div>
          </div>
        )}
      </div>

      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

// only applications that reached the approval stage appear on the Approvals page
const reachedApproval = (s: ApplicationStatus) => s !== 'REJECTED' && s !== 'CANCELLED' && RANK[s] >= 2

export function ApprovalsTab({ view }: { view: ApplicationView }) {
  const navigate = useNavigate()
  const a = view.application
  const inApprovalStage = reachedApproval(a.status)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>Approval hierarchy</SectionTitle>
          {/* which hierarchy this loan follows, and whether it was saved on the loan or comes from the default */}
          {view.hierarchy && (
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Text size="sm" fw={600} className="text-brand">
                {view.hierarchy.name}
              </Text>
              <Badge size="xs" radius="sm" variant="light" color={view.hierarchy.ownPolicy ? 'brand' : 'gray'}>
                {view.hierarchy.ownPolicy ? 'Set on this loan' : 'Default hierarchy'}
              </Badge>
            </div>
          )}
          <p className="mb-3 text-xs text-gray-500">
            Each level must approve in order. A rejection at any level stops the application.
          </p>
        </div>
        {inApprovalStage && (
          <Button
            size="xs"
            variant="default"
            leftSection={<AppIcon name="external-link" />}
            onClick={() => navigate(`/loan-approvals?review=${a.id}`)}
          >
            Open in Approvals
          </Button>
        )}
      </div>

      {!inApprovalStage && (
        <p className="mb-3 text-xs text-gray-400">This application has not reached the approval stage yet.</p>
      )}

      {view.workflowError ? (
        <WorkflowMissing error={view.workflowError} />
      ) : view.levels.length === 0 ? (
        <Empty>No approval levels are set up. They are managed on the Approval hierarchy page.</Empty>
      ) : (
        <ul className="space-y-2">
          {view.levels.map((l) => (
            <li key={l.levelNo} className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                {l.levelNo}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800">{l.levelName}</div>
                <div className="text-xs text-gray-500">Required role: {l.role || '-'}</div>
                {l.by && (
                  <div className="mt-1 text-xs text-gray-500">
                    {l.by}
                    {l.date ? ` · ${dateText(l.date)}` : ''}
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
  )
}

export function ContractTab({ view }: { view: ApplicationView }) {
  const a = view.application
  const contract = view.contract

  if (view.workflowError) return <WorkflowMissing error={view.workflowError} />
  if (!contract) {
    return (
      <Empty>
        {a.status === 'APPROVED'
          ? 'The application is approved. The contract is generated from the Contracts page.'
          : 'A contract is created once the application is approved.'}
      </Empty>
    )
  }

  const print = () =>
    printContract(
      defaultContent(a),
      valuesFor(a),
      contract.contractNo,
      dayjs(contract.generatedAt || undefined).format('MMMM D, YYYY'),
    )

  // 3 means every contract step is done
  const step = ({ GENERATED: 1, SENT: 2, SIGNED: 3 } as Record<string, number>)[contract.status] ?? 0

  const hint =
    contract.status === 'GENERATED'
      ? 'Next step: send the contract to the borrower by email.'
      : contract.status === 'SENT'
        ? 'Waiting for the borrower to print, sign and return it. Then upload the signed copy.'
        : contract.status === 'SIGNED'
          ? a.status === 'LOAN_CREATED'
            ? 'The loan has been created.'
            : 'The signed copy is on file. Next step: create the loan.'
          : ''

  return (
    <div className="space-y-6">
      <Stepper active={step} size="xs" color="brand">
        <Stepper.Step label="Generated" />
        <Stepper.Step label="Sent" />
        <Stepper.Step label="Signed" />
      </Stepper>

      {hint && (
        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="sm">{hint}</Text>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Contract</SectionTitle>
          <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
            <span className="text-gray-500">Status</span>
            <Pill value={contract.status} />
          </div>
          <Field label="Contract number" value={contract.contractNo} />
          <Field label="Principal" value={formatTzs(contract.finalAmount ?? a.requestedAmount)} />
          <Field label="Generated" value={dateText(contract.generatedAt)} />
          <Field label="Sent to borrower" value={contract.sentAt ? dateText(contract.sentAt) : 'Not yet'} />
          <Field label="Signed" value={contract.signedAt ? dateText(contract.signedAt) : 'Not yet'} />
        </div>

        <div>
          <SectionTitle>Documents</SectionTitle>
          <ul className="mt-2 space-y-2">
            <li className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
              <AppIcon name="file-text" className="text-xl text-gray-400" size={20} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800">Loan contract</div>
                <div className="truncate text-xs text-gray-500">{contract.contractNo}</div>
              </div>
              <Button size="xs" variant="subtle" color="brand" leftSection={<AppIcon name="printer" />} onClick={print}>
                Print
              </Button>
            </li>
            <li
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
                contract.signedAt ? 'border-gray-200' : 'border-dashed border-gray-200'
              }`}
            >
              <AppIcon name="file-image" className={`text-xl ${contract.signedAt ? 'text-gray-400' : 'text-gray-300'}`} size={20} />
              <div className="min-w-0 flex-1 text-xs text-gray-500">
                {contract.signedAt ? `Signed copy on file since ${dateText(contract.signedAt)}` : 'Signed copy not uploaded yet'}
              </div>
            </li>
          </ul>
        </div>
      </div>
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

export function ScheduleTab({ view }: { view: ApplicationView }) {
  const a = view.application
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        This is an estimate from the requested terms. The real schedule is generated when the loan is disbursed.
      </p>
      <CustomTable<InstallmentRow>
        size="sm"
        data={scheduleFor(a)}
        columns={scheduleColumns}
        pagination={false}
        defaultSort={null}
        exportCsv
        exportFileName={`${a.applicationNo}-schedule`}
      />
    </div>
  )
}

export function ActivityTab({ view }: { view: ApplicationView }) {
  return <Timeline view={view} />
}

/* ---------- workflow ---------- */

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

export function WorkflowTab({ view }: { view: ApplicationView }) {
  const navigate = useNavigate()
  const a = view.application
  const { guarantors, collaterals, credit, levels, contract, loan, history } = view

  const gVerified = guarantors.filter((g) => g.verified).length
  const cVerified = collaterals.filter((c) => c.verified).length
  const approved = levels.filter((x) => x.decision === 'APPROVED').length
  const rejectedLevel = levels.find((x) => x.decision === 'REJECTED')
  const inApproval = reachedApproval(a.status)
  const missing = view.workflowError !== null

  return (
    <div className="space-y-6">
      {view.workflowError && <WorkflowMissing error={view.workflowError} />}

      {/* one card per part of the origination */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon="user-round"
          title="Guarantors"
          value={a.guarantorRequired ? `${gVerified} of ${guarantors.length} verified` : 'Not required'}
          sub={a.guarantorRequired ? guarantors.map((g) => g.name).join(', ') || 'None added' : 'Skipped for this application'}
          tone={!a.guarantorRequired ? 'gray' : guarantors.length > 0 && gVerified === guarantors.length ? 'green' : 'yellow'}
        />
        <SummaryCard
          icon="shield"
          title="Collateral"
          value={a.collateralRequired ? `${cVerified} of ${collaterals.length} verified` : 'Not required'}
          sub={a.collateralRequired ? collaterals.map((c) => c.type).join(', ') || 'None added' : 'Skipped for this application'}
          tone={!a.collateralRequired ? 'gray' : collaterals.length > 0 && cVerified === collaterals.length ? 'green' : 'yellow'}
        />
        <SummaryCard
          icon="calculator"
          title="Credit assessment"
          value={
            missing
              ? 'Unknown'
              : credit
                ? credit.decision === 'REJECT'
                  ? 'Rejected'
                  : credit.decision === 'APPROVE'
                    ? 'Approved'
                    : 'Recorded'
                : a.creditAssessmentRequired
                  ? 'Not run yet'
                  : 'Switched off'
          }
          sub={
            credit
              ? `${credit.cashFlow !== null ? `Cash flow ${formatTzs(credit.cashFlow)}` : 'No figures'}${credit.assessedByName ? ` · by ${credit.assessedByName}` : ''}`
              : 'Runs when the application is submitted'
          }
          tone={credit ? (credit.decision === 'REJECT' ? 'red' : 'green') : 'gray'}
        />
        <SummaryCard
          icon="square-check"
          title="Approvals"
          value={
            missing
              ? 'Unknown'
              : rejectedLevel
                ? `Rejected at level ${rejectedLevel.levelNo}`
                : inApproval
                  ? `${approved} of ${levels.length} levels`
                  : 'Not started'
          }
          sub={rejectedLevel?.comments || levels.map((x) => x.levelName).join(' → ') || '-'}
          tone={rejectedLevel ? 'red' : levels.length > 0 && approved === levels.length ? 'green' : inApproval ? 'yellow' : 'gray'}
        />
        <SummaryCard
          icon="pen-line"
          title="Contract"
          value={missing ? 'Unknown' : contract ? words(contract.status) : 'Not created'}
          sub={contract ? contract.contractNo : 'Created after approval'}
          tone={contract ? (contract.status === 'SIGNED' ? 'green' : 'yellow') : 'gray'}
        />
        <SummaryCard
          icon="hand-coins"
          title="Loan"
          value={missing ? 'Unknown' : loan ? loan.loanNo || `#${loan.id}` : 'Not created'}
          sub={
            loan
              ? `${loan.principal !== null ? formatTzs(loan.principal) : ''}${loan.disbursementDate ? ` · disbursed ${dateText(loan.disbursementDate)}` : ` · ${words(loan.status)}`}`
              : 'Created from the signed contract'
          }
          tone={loan ? 'green' : 'gray'}
        />
      </div>

      {/* the application itself */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Application</SectionTitle>
          <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
            <span className="text-gray-500">Status</span>
            <StatusBadge value={a.status} />
          </div>
          <Field label="Application number" value={a.applicationNo} />
          <Field label="Applicant" value={a.applicantName} />
          <Field label="Loan officer" value={a.loanOfficer} />
          <Field label="Requested amount" value={formatTzs(a.requestedAmount)} />
          <Field label="Terms" value={`${a.interestRate}% p.a. · ${methodLabel(a.interestMethod)} · ${a.tenure} months`} />
        </div>

        <div>
          <SectionTitle>Approval levels</SectionTitle>
          {levels.length === 0 ? (
            <Empty>No approval levels are set up.</Empty>
          ) : (
            <ul className="mt-1 space-y-2">
              {levels.map((x) => (
                <li key={x.levelNo} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {x.levelNo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">{x.levelName}</div>
                    <div className="truncate text-xs text-gray-500">
                      {x.by ? `${x.by} · ` : ''}
                      {x.role}
                    </div>
                  </div>
                  <Pill value={x.decision} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* the full status history */}
      {!missing && (
        <div>
          <SectionTitle>{`Status history (${history.length})`}</SectionTitle>
          <p className="mb-3 text-xs text-gray-500">Every move the application made, oldest first.</p>
          {history.length === 0 ? (
            <Empty>No status change has been recorded yet.</Empty>
          ) : (
            <ol>
              {history.map((h, i) => {
                const stopped = h.to === 'REJECTED' || h.to === 'CANCELLED'
                return (
                  <li key={`${h.to}-${i}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                          stopped ? 'bg-red-100 text-red-600' : 'bg-brand text-white'
                        }`}
                      >
                        <AppIcon name={stopped ? 'x' : 'check'} />
                      </span>
                      {i < history.length - 1 && <span className="my-1 w-px flex-1 bg-gray-200" />}
                    </div>
                    <div className="flex flex-1 items-start justify-between gap-3 pb-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-800">
                          {h.from && (
                            <>
                              <StatusBadge value={h.from} size="xs" outline />
                              <AppIcon name="chevron-right" className="text-gray-400" size={12} />
                            </>
                          )}
                          <StatusBadge value={h.to} />
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {h.by ? `By ${h.by}` : 'By the system'}
                          {h.remarks ? ` · ${h.remarks}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">{dateText(h.date)}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

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
