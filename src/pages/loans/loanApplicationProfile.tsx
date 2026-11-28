import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Tabs, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { CustomTabs } from '../../components/customTabs'
import { ErrorState, LoadingState } from '../../components/pageState'
import { formatTzs } from '../../utils/format'
import { ApiError } from '../../api/client'
import { useApplicants } from '../../api/applicants'
import { useUserNames } from '../../api/users'
import {
  deleteLoanApplication,
  getApplicationWorkflow,
  getDraftCollaterals,
  getDraftGuarantors,
  getLoanApplication,
  type LoanDraft,
} from '../../api/loanApplications'
import { STATUS, methodLabel, type ApplicationStatus, type LoanApplication } from './loanApplicationsData'
import {
  ActivityTab,
  ApprovalsTab,
  ContractTab,
  OverviewTab,
  RequirementsTab,
  ScheduleTab,
  WorkflowTab,
  type ApplicationView,
  type ViewLevel,
} from './loanApplicationProfileTabs'
import { usePageAccess } from '../auth/usePageAccess'
import { useApprovalChains } from '../../api/approvalHierarchy'
import { notifications } from '@mantine/notifications'
import { ContractConfirmDialog } from './contractDialogs'

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

// a backend row -> the shape the tabs use; names come from the applicants and users lists
function toApplication(d: LoanDraft, applicantName: string, officerName: string): LoanApplication {
  const status: ApplicationStatus =
    d.status in STATUS ? (d.status as ApplicationStatus) : d.finalized ? 'SUBMITTED' : 'DRAFT'
  return {
    id: d.id,
    applicationNo: d.applicationNo || `#${d.id}`,
    applicantId: d.applicantId,
    applicantName,
    loanOfficer: officerName,
    requestedAmount: d.requestedAmount ?? 0,
    interestMethod: d.interestMethod ?? 'REDUCING',
    interestRate: d.interestRate ?? 0,
    tenure: d.tenure ?? 0,
    penaltyRate: d.penaltyRate ?? 0,
    guarantorRequired: d.guarantorRequired,
    collateralRequired: d.collateralRequired,
    creditAssessmentRequired: d.creditAssessmentRequired,
    status,
    currentStage: d.currentStage || 'APPLICANT',
    created: d.createdAt,
    submittedAt: d.submittedAt,
  }
}

export function LoanApplicationProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<string | null>('overview')
  const { canEdit, canDelete } = usePageAccess('loans', 'applications')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const appId = Number(id)
  const validId = Number.isInteger(appId) && appId > 0

  // GET /api/loan-applications/{id}
  const appQuery = useQuery({
    queryKey: ['loan-applications', appId, 'record'],
    queryFn: () => getLoanApplication(appId),
    enabled: validId,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })
  // GET /api/guarantors and /api/collaterals (with their checks and documents) for this application
  const guarantorsQuery = useQuery({
    queryKey: ['loan-applications', appId, 'guarantors'],
    queryFn: () => getDraftGuarantors(appId),
    enabled: validId,
  })
  const collateralsQuery = useQuery({
    queryKey: ['loan-applications', appId, 'collaterals'],
    queryFn: () => getDraftCollaterals(appId),
    enabled: validId,
  })
  // GET /api/loan-origination/applications/{id}/workflow: credit, approvals, contract, loan, status history
  const workflowQuery = useQuery({
    queryKey: ['loan-applications', appId, 'workflow'],
    queryFn: () => getApplicationWorkflow(appId),
    enabled: validId,
  })
  // GET /api/approval-hierarchys + their levels: the loan follows its own hierarchy (approvePolicyId), else the default
  const chains = useApprovalChains()

  const { data: applicants = [] } = useApplicants()
  const names = useUserNames()
  const userName = (uid: number | null) => (uid === null ? '' : (names.get(uid) ?? `User #${uid}`))

  const crumbs = (last: string) => [
    { label: 'Home', to: '/' },
    { label: 'Loan applications', to: '/loan-applications' },
    { label: last },
  ]

  const notFound =
    !validId || (appQuery.error instanceof ApiError && appQuery.error.status === 404)
  if (notFound) {
    return (
      <DashboardLayout title="Application not found" breadcrumbs={crumbs('Not found')}>
        <div className={`${CARD} p-6`}>
          <Text size="sm">We couldn&apos;t find that loan application.</Text>
          <Button mt="md" size="xs" variant="default" onClick={() => navigate('/loan-applications')}>
            Back to applications
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  const loading =
    appQuery.isLoading || guarantorsQuery.isLoading || collateralsQuery.isLoading || workflowQuery.isLoading
  const loadError = appQuery.error ?? guarantorsQuery.error ?? collateralsQuery.error
  if (loading || loadError || !appQuery.data) {
    return (
      <DashboardLayout title="Loan application" breadcrumbs={crumbs('Loading')}>
        <div className={`${CARD} p-6`}>
          {loadError ? (
            <ErrorState
              message={loadError.message}
              onRetry={() => {
                void appQuery.refetch()
                void guarantorsQuery.refetch()
                void collateralsQuery.refetch()
              }}
            />
          ) : (
            <LoadingState rows={6} />
          )}
        </div>
      </DashboardLayout>
    )
  }

  /* ---------- the view every tab reads ---------- */

  const d = appQuery.data
  const application = toApplication(
    d,
    applicants.find((a) => a.id === d.applicantId)?.name ?? `Applicant #${d.applicantId}`,
    userName(d.loanOfficerId) || '-',
  )
  const wf = workflowQuery.data
  const approvals = wf?.approvals ?? []

  // every level of the hierarchy, with the decision taken there (if any)
  const levels: ViewLevel[] = chains.chainOf(d.approvePolicyId).map((l) => {
    const a = approvals.find((x) => x.levelId === l.id || x.levelNo === l.levelNo)
    const decision = a?.decision.includes('REJECT') ? 'REJECTED' : a?.decision.includes('APPROV') ? 'APPROVED' : 'PENDING'
    return {
      levelNo: l.levelNo,
      levelName: l.levelName,
      role: l.requiredRole,
      decision,
      by: a ? userName(a.approverId) : '',
      comments: a?.comments ?? '',
      date: a?.decidedAt ?? '',
    }
  })

  const view: ApplicationView = {
    application,
    guarantors: (guarantorsQuery.data ?? []).map((g) => ({
      id: g.id,
      name: g.fullName,
      phone: g.phone,
      idNumber: g.idNumber,
      address: g.address,
      verified: g.idVerified && g.exposureVerified,
    })),
    collaterals: (collateralsQuery.data ?? []).map((c) => ({
      id: c.id,
      type: c.collateralType,
      description: c.description,
      value: c.estimatedValue ?? 0,
      verified: c.ownershipVerified && c.existingPledgeVerified,
      documentNumber: c.documentNumber,
      documentFileName: c.documentFileName,
      documentPath: c.documentPath,
    })),
    credit: wf?.credit ? { ...wf.credit, assessedByName: userName(wf.credit.assessedBy) } : null,
    levels,
    hierarchy: (() => {
      const h = chains.hierarchyOf(d.approvePolicyId)
      // "own" only when the saved id is the hierarchy actually used (an inactive one falls back to the default)
      return h ? { name: h.name, ownPolicy: d.approvePolicyId !== null && h.id === d.approvePolicyId } : null
    })(),
    contract: wf?.contract ?? null,
    loan: wf?.loan ?? null,
    history: (wf?.history ?? []).map((h) => ({
      from: h.from,
      to: h.to,
      date: h.changedAt,
      by: userName(h.changedBy),
      remarks: h.remarks,
    })),
    workflowError: workflowQuery.error ? workflowQuery.error.message : null,
  }

  const status = STATUS[application.status]
  const contract = view.contract

  // removes its guarantors, collateral and documents, then DELETE /api/loan-applications/{id}
  const removeApplication = async () => {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteLoanApplication(application.id)
      notifications.show({
        color: 'red',
        title: 'Application deleted',
        message: `${application.applicationNo} was deleted.`,
        icon: <AppIcon name="trash-2" size={16} />,
      })
      navigate('/loan-applications', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the application. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const details = [
    {
      icon: 'percent',
      label: 'Interest',
      value: `${application.interestRate}% p.a. · ${methodLabel(application.interestMethod)}`,
    },
    { icon: 'calendar', label: 'Tenure', value: `${application.tenure} months` },
    { icon: 'hand-coins', label: 'Loan officer', value: application.loanOfficer },
    // which approval hierarchy this loan follows (its own, or the default when none was set)
    {
      icon: 'square-check',
      label: 'Approval hierarchy',
      value: `${chains.hierarchyOf(d.approvePolicyId)?.name ?? '-'}${
        chains.hierarchyOf(d.approvePolicyId)?.id === d.approvePolicyId ? '' : ' (default)'
      }`,
    },
    { icon: 'calendar-days', label: 'Created', value: application.created ? dayjs(application.created).format('MMM D, YYYY') : '-' },
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
      breadcrumbs={crumbs(application.applicationNo)}
      actions={
        <>
          <Button
            size="xs"
            variant="default"
            leftSection={<AppIcon name="user-round" />}
            onClick={() => navigate(`/applicants/${application.applicantId}`)}
          >
            View applicant
          </Button>
          {/* a draft is finished in the wizard; once submitted it is locked */}
          {canEdit && application.status === 'DRAFT' && (
            <Button
              size="xs"
              leftSection={<AppIcon name="pencil" />}
              onClick={() => navigate(`/loan-applications/new?applicantId=${application.applicantId}`)}
            >
              Continue application
            </Button>
          )}
          {canDelete && (
            <Button
              size="xs"
              color="red"
              leftSection={<AppIcon name="trash-2" />}
              onClick={() => {
                setDeleteError(null)
                setDeleteOpen(true)
              }}
            >
              Delete application
            </Button>
          )}
        </>
      }
    >
      <ContractConfirmDialog
        opened={deleteOpen}
        title={deleteError ? 'Could not delete application' : 'Delete application'}
        message={
          deleteError ??
          `${application.applicationNo} and its guarantors and collateral will be permanently deleted.`
        }
        confirmLabel={deleting ? 'Deleting…' : deleteError ? 'Try again' : 'Delete application'}
        danger={!deleteError}
        onClose={() => {
          if (deleting) return
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        onConfirm={() => void removeApplication()}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* application summary */}
        <div className={`${CARD} p-5`}>
          <div className="flex flex-col items-center border-b border-gray-100 pb-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-subtle text-2xl text-brand-dark">
              <AppIcon name="file-text" size={28} strokeWidth={1.25} />
            </div>
            <div className="mt-3 text-lg font-medium text-gray-800">{formatTzs(application.requestedAmount)}</div>
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
          </div>

          <ul className="space-y-3 pt-4">
            {details.map((x) => (
              <li key={x.label} className="flex items-start gap-3 text-sm text-gray-700">
                <AppIcon name={x.icon} className="mt-0.5 w-4 text-center text-gray-400" />
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-400">{x.label}</div>
                  <div className="break-words">{x.value}</div>
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
                <OverviewTab view={view} />
              </Tabs.Panel>
              <Tabs.Panel value="workflow">
                <WorkflowTab view={view} />
              </Tabs.Panel>
              <Tabs.Panel value="requirements">
                <RequirementsTab view={view} />
              </Tabs.Panel>
              <Tabs.Panel value="approvals">
                <ApprovalsTab view={view} />
              </Tabs.Panel>
              <Tabs.Panel value="contract">
                <ContractTab view={view} />
              </Tabs.Panel>
              <Tabs.Panel value="schedule">
                <ScheduleTab view={view} />
              </Tabs.Panel>
              <Tabs.Panel value="activity">
                <ActivityTab view={view} />
              </Tabs.Panel>
            </div>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  )
}
