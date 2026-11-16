import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Alert, Badge, Button, Tabs, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import {
  RANK,
  STATUS,
  applications,
  collateralsFor,
  contractFor,
  estimateInstallment,
  existingLoansFor,
  guarantorsFor,
  methodLabel,
  type LoanApplication,
} from './loanApplicationsData'
import {
  ActivityTab,
  ApprovalsTab,
  ContractTab,
  OverviewTab,
  RequirementsTab,
  ScheduleTab,
  WorkflowTab,
} from './loanApplicationProfileTabs'
import { SignedContractDialog } from './contractDialogs'
import { CreditAssessmentDialog, type CreditResult } from './creditAssessmentDialog'
import { COLLATERAL_CHECKS, GUARANTOR_CHECKS, VerifyDialog } from './verifyDialogs'
import { RemarksDialog } from '../collections/collectionDialogs'
import { CURRENT_USER } from './disbursementDialog'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'approvals', label: 'Approvals' },
  { value: 'contract', label: 'Contract' },
  { value: 'schedule', label: 'Repayment estimate' },
  { value: 'activity', label: 'Activity' },
]

const today = () => dayjs().format('YYYY-MM-DD')

type Notice = { text: string; color: 'green' | 'red' | 'blue' } | null

export function LoanApplicationProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<string | null>('overview')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [verifying, setVerifying] = useState<{ kind: 'guarantor' | 'collateral'; id: number } | null>(null)
  // UI only: what was verified in this session, nothing is saved yet
  const [verifiedG, setVerifiedG] = useState<number[]>([])
  const [verifiedC, setVerifiedC] = useState<number[]>([])
  const [notice, setNotice] = useState<Notice>(null)
  // UI only: actions change the application for this session, nothing is saved yet
  const [changes, setChanges] = useState<Partial<LoanApplication>>({})
  const { canEdit } = usePageAccess('loans', 'applications')   // with the other hooks, before the early return

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const base = applications.find((a) => String(a.id) === id)
  const application = base ? { ...base, ...changes } : undefined

  if (!application) {
    return (
      <DashboardLayout
        title="Application not found"
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Loan applications', to: '/loan-applications' },
          { label: 'Not found' },
        ]}
      >
        <div className={`${CARD} p-6`}>
          <Text size="sm">We couldn't find that loan application.</Text>
          <Button mt="md" size="xs" variant="default" onClick={() => navigate('/loan-applications')}>
            Back to applications
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  const status = STATUS[application.status]
  const contract = contractFor(application)

  /* ---------- what still needs checking ---------- */

  const guarantors = guarantorsFor(application)
  const collaterals = collateralsFor(application)
  const pendingG = guarantors.filter((g) => g.status !== 'VERIFIED' && !verifiedG.includes(g.id))
  const pendingC = collaterals.filter((c) => c.status !== 'VERIFIED' && !verifiedC.includes(c.id))
  const unverified = pendingG.length + pendingC.length
  const submitted = application.status === 'SUBMITTED'
  const creditRequired = application.creditAssessmentRequired
  const installment = Math.round(estimateInstallment(application))

  // our own rule, the API has no cancel: allowed until the signed contract is on file
  const canCancel =
    application.status !== 'REJECTED' && application.status !== 'CANCELLED' && RANK[application.status] < 5

  const vG = verifying?.kind === 'guarantor' ? guarantors.find((g) => g.id === verifying.id) : undefined
  const vC = verifying?.kind === 'collateral' ? collaterals.find((c) => c.id === verifying.id) : undefined

  /* ---------- actions ---------- */

  const apply = (patch: Partial<LoanApplication>, nextTab = 'contract') => {
    setChanges((c) => ({ ...c, ...patch }))
    setUploadOpen(false)
    setTab(nextTab) // show the result of the action
  }

  const confirmVerified = () => {
    if (!verifying) return
    // TODO: POST /api/loan-origination/applications/{applicationId}/guarantors/{guarantorId}/verify
    //       { idVerified, exposureVerified, verifiedBy, remarks }
    //       or .../collaterals/{collateralId}/verify { ownershipVerified, existingPledgeVerified, verifiedBy, remarks }
    if (verifying.kind === 'guarantor') {
      setVerifiedG((list) => [...list, verifying.id])
      setNotice({ color: 'green', text: `${vG?.name ?? 'The guarantor'} was verified.` })
    } else {
      setVerifiedC((list) => [...list, verifying.id])
      setNotice({ color: 'green', text: `The ${vC?.type.toLowerCase() ?? 'asset'} was verified.` })
    }
    setVerifying(null)
  }

  const finishCredit = (result: CreditResult | null) => {
    setCreditOpen(false)

    // credit assessment switched off: the API moves the application straight to CREDIT_APPROVED
    if (!result) {
      apply({ status: 'CREDIT_APPROVED' }, 'approvals')
      setNotice({ color: 'green', text: 'Credit assessment is switched off, so the application moved on to approval.' })
      return
    }

    // the API rejects when the applicant still has an unpaid loan
    const unpaid = existingLoansFor(application.applicantId).some((l) => l.outstanding > 0)
    const final: CreditResult = unpaid
      ? { ...result, decision: 'REJECT', notes: 'The applicant still has an unpaid loan, so a new loan cannot be issued.' }
      : result

    apply(
      {
        credit: { ...final, assessedBy: CURRENT_USER },
        status: final.decision === 'APPROVE' ? 'CREDIT_APPROVED' : 'REJECTED',
      },
      'requirements',
    )
    setNotice(
      final.decision === 'APPROVE'
        ? { color: 'green', text: 'Credit assessment approved. The application now waits for approval.' }
        : { color: 'red', text: 'Credit assessment failed. The application was rejected.' },
    )
  }

  const cancelApplication = (remarks: string) => {
    // TODO: the API has no cancel endpoint yet, it needs a status update on /api/loan-applications/{id}
    apply({ status: 'CANCELLED', cancelReason: remarks, cancelledAt: today() }, 'activity')
    setNotice({ color: 'blue', text: `${application.applicationNo} was cancelled.` })
    setCancelOpen(false)
  }

  const details = [
    {
      icon: 'percent',
      label: 'Interest',
      value: `${application.interestRate}% p.a. · ${methodLabel(application.interestMethod)}`,
    },
    { icon: 'calendar', label: 'Tenure', value: `${application.tenure} months` },
    { icon: 'hand-coins', label: 'Loan officer', value: application.loanOfficer },
    { icon: 'calendar-days', label: 'Created', value: dayjs(application.created).format('MMM D, YYYY') },
    {
      icon: 'send',
      label: 'Submitted',
      value: application.submittedAt ? dayjs(application.submittedAt).format('MMM D, YYYY') : 'Not yet',
    },
  ]

  return (
    <DashboardLayout
      title={application.applicationNo}
      subtitle={application.applicantName}
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: 'Loan applications', to: '/loan-applications' },
        { label: application.applicationNo },
      ]}
      actions={
        <>
          {submitted && canEdit && (
            <Button
              size="xs"
              disabled={unverified > 0}
              leftSection={<AppIcon name="calculator" />}
              onClick={() => setCreditOpen(true)}
            >
              {creditRequired ? 'Run credit assessment' : 'Continue to approval'}
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            leftSection={<AppIcon name="user-round" />}
            onClick={() => navigate(`/applicants/${application.applicantId}`)}
          >
            View applicant
          </Button>
          {canEdit && (
          <Button
            size="xs"
            leftSection={<AppIcon name="pencil" />}
            onClick={() => navigate(`/loan-applications/new?applicantId=${application.applicantId}`)}
          >
            Continue application
          </Button>
          )}
          {canEdit && canCancel && (
            <Button size="xs" color="red" leftSection={<AppIcon name="x" />} onClick={() => setCancelOpen(true)}>
              Cancel application
            </Button>
          )}
        </>
      }
    >
      {notice && (
        <Alert
          color={notice.color}
          variant="light"
          withCloseButton
          onClose={() => setNotice(null)}
          icon={<AppIcon name={notice.color === 'green' ? 'circle-check' : notice.color === 'red' ? 'circle-x' : 'info'} />}
          mb="md"
        >
          <Text size="sm">{notice.text}</Text>
        </Alert>
      )}

      {/* what to do next while the application is waiting for its checks */}
      {submitted && (
        <Alert
          color={unverified > 0 ? 'yellow' : 'blue'}
          variant="light"
          icon={<AppIcon name={unverified > 0 ? 'triangle-alert' : 'info'} />}
          mb="md"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm">
              {unverified > 0
                ? `Verify ${pendingG.length} ${pendingG.length === 1 ? 'guarantor' : 'guarantors'} and ${pendingC.length} ${pendingC.length === 1 ? 'asset' : 'assets'} first. The credit assessment can only run once everything required is verified.`
                : creditRequired
                  ? 'Every check is done. Run the credit assessment to continue.'
                  : 'Credit assessment is switched off for this application. Continue to approval.'}
            </Text>
            {unverified > 0 && (
              <Button size="compact-xs" variant="default" onClick={() => setTab('requirements')}>
                Open requirements
              </Button>
            )}
          </div>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* application summary */}
        <div className={`${CARD} p-5`}>
          <div className="flex flex-col items-center border-b border-gray-100 pb-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-subtle text-2xl text-brand-dark">
              <AppIcon name="file-text" size={28} strokeWidth={1.25} />
            </div>
            <div className="mt-3 text-lg font-medium text-gray-800">
              {formatTzs(application.requestedAmount)}
            </div>
            <button
              type="button"
              className="text-xs text-brand-dark hover:underline"
              onClick={() => navigate(`/applicants/${application.applicantId}`)}
            >
              {application.applicantName}
            </button>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Badge variant="light" color={status.color} radius="sm" size="sm">
                {status.label}
              </Badge>
              <Badge variant="outline" color="gray" radius="sm" size="sm">
                {methodLabel(application.interestMethod)}
              </Badge>
            </div>
            {contract && (
              <div className="mt-2 text-[11px] text-gray-500">
                Contract: {contract.status.charAt(0) + contract.status.slice(1).toLowerCase()}
              </div>
            )}
            {application.status === 'DRAFT' && (
              <div className="mt-2 text-[11px] text-gray-500">
                Stopped at: {application.currentStage.replaceAll('_', ' ').toLowerCase()}
              </div>
            )}
            {application.status === 'CANCELLED' && application.cancelReason && (
              <div className="mt-2 text-[11px] text-gray-500">Reason: {application.cancelReason}</div>
            )}
          </div>

          <ul className="space-y-3 pt-4">
            {details.map((d) => (
              <li key={d.label} className="flex items-start gap-3 text-sm text-gray-700">
                <AppIcon name={d.icon} className="mt-0.5 w-4 text-center text-gray-400" />
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-400">{d.label}</div>
                  <div className="break-words">{d.value}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* tabs */}
        <div className={CARD}>
          <Tabs value={tab} onChange={setTab} color="brand">
            <CustomTabs
              ariaLabel="Loan application tabs"
              className="w-fit px-3 py-3"
              tabs={TABS}
              value={tab ?? 'overview'}
              onChange={setTab}
            />

            <div className="p-5">
              <Tabs.Panel value="overview">
                <OverviewTab application={application} />
              </Tabs.Panel>
              <Tabs.Panel value="workflow">
                <WorkflowTab
                  application={application}
                  verifiedGuarantors={verifiedG}
                  verifiedCollaterals={verifiedC}
                />
              </Tabs.Panel>
              <Tabs.Panel value="requirements">
                <RequirementsTab
                  application={application}
                  verifiedGuarantors={verifiedG}
                  verifiedCollaterals={verifiedC}
                  onVerifyGuarantor={canEdit ? (gid) => setVerifying({ kind: 'guarantor', id: gid }) : undefined}
                  onVerifyCollateral={canEdit ? (cid) => setVerifying({ kind: 'collateral', id: cid }) : undefined}
                />
              </Tabs.Panel>
              <Tabs.Panel value="approvals">
                <ApprovalsTab application={application} />
              </Tabs.Panel>
              <Tabs.Panel value="contract">
                <ContractTab application={application} onUploadSigned={canEdit ? () => setUploadOpen(true) : undefined} />
              </Tabs.Panel>
              <Tabs.Panel value="schedule">
                <ScheduleTab application={application} />
              </Tabs.Panel>
              <Tabs.Panel value="activity">
                <ActivityTab application={application} />
              </Tabs.Panel>
            </div>
          </Tabs>
        </div>
      </div>

      {/* opened from the Upload signed contract button in the Contract tab */}
      <SignedContractDialog
        opened={uploadOpen}
        contractNo={contract?.contractNo ?? ''}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => apply({ status: 'CONTRACT_SIGNED', contractSignedAt: today() })}
      />

      <CreditAssessmentDialog
        opened={creditOpen}
        required={creditRequired}
        applicantName={application.applicantName}
        installment={installment}
        onClose={() => setCreditOpen(false)}
        onDone={finishCredit}
      />

      <VerifyDialog
        opened={!!verifying && !!(vG || vC)}
        title={verifying?.kind === 'guarantor' ? 'Verify guarantor' : 'Verify collateral'}
        subject={vG ? `${vG.name} (${vG.relationship})` : vC ? `${vC.type}: ${vC.description}` : ''}
        checks={verifying?.kind === 'guarantor' ? GUARANTOR_CHECKS : COLLATERAL_CHECKS}
        onClose={() => setVerifying(null)}
        onVerified={confirmVerified}
      />

      <RemarksDialog
        opened={cancelOpen}
        title="Cancel application"
        message={`Cancel ${application.applicationNo} for ${application.applicantName}? It stops here and cannot be continued. Say why.`}
        confirmLabel="Cancel application"
        color="red"
        placeholder="The borrower withdrew the request"
        onClose={() => setCancelOpen(false)}
        onSubmit={cancelApplication}
      />
    </DashboardLayout>
  )
}