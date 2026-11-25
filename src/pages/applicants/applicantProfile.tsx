import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { notifications } from '@mantine/notifications'
import { Alert, Badge, Button, Tabs, Text, Tooltip } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { CustomTabs } from '../../components/customTabs'
import { STATUS, initials, stageActions } from './applicantsData'
import { ApiError } from '../../api/client'
import { ErrorState, LoadingState } from '../../components/pageState'
import {
  AccountsTab,
  ActivityTab,
  FinancialTab,
  KycTab,
  LoansTab,
  OverviewTab,
} from './applicantProfileTabs'
import { KycDecisionDialog } from './applicantKYCDecisionDialog'
import { ApplicantEditDialog, type ApplicantEditInput } from './applicantEditDialog'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import { RecheckKycDialog } from './kycRecheckDialog'
import { SendOtpDialog } from './otpDialog'
import { usePageAccess } from '../auth/usePageAccess'
import { useApplicant, useUpdateApplicant, useDeleteApplicant } from '../../api/applicants'
import {
  IN_PROGRESS_APPLICATION_STATUSES,
  useLoanApplications,
  useUnfinishedLoans,
} from '../../api/loanApplications'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'kyc', label: 'KYC and documents' },
  { value: 'financial', label: 'Financial' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'loans', label: 'Loans' },
  { value: 'activity', label: 'Activity' },
]

export function ApplicantProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<string | null>('overview')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recheckOpen, setRecheckOpen] = useState(false)
  const [otpOpen, setOtpOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const updateApplicant = useUpdateApplicant()
  const deleteApplicant = useDeleteApplicant()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // success banner fades away on its own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  // GET /api/applicants/{id}, a decision, a verified code or an edit refreshes it
  const { data: applicant, isLoading, error, refetch } = useApplicant(id)

  const { canEdit, canDelete } = usePageAccess('applicants', 'applicants')
  const { canApprove: canDecideKyc } = usePageAccess('applicants', 'kyc-review')
  const { canCreate: canStartLoan } = usePageAccess('loans', 'applications')

  // GET /api/loan-applications and /api/loans: what decides the loan button at the top
  const applicantId = Number(id) || 0
  const applicationsQuery = useLoanApplications()
  const unfinishedQuery = useUnfinishedLoans(applicantId)
  const myApplications = (applicationsQuery.data ?? []).filter((a) => a.applicantId === applicantId)
  const draft = myApplications.find((a) => !a.finalized && a.status === 'DRAFT')
  const inProgress = myApplications.find((a) => IN_PROGRESS_APPLICATION_STATUSES.includes(a.status))
  const unfinishedLoan = (unfinishedQuery.data ?? [])[0]
  const loanCheckLoading = applicationsQuery.isLoading || unfinishedQuery.isLoading
  // why a new application cannot be started, or null when it can
  const blockedReason = inProgress
    ? `Application ${inProgress.applicationNo || `#${inProgress.id}`} is still in progress.`
    : unfinishedLoan
      ? `Loan ${unfinishedLoan.loanNo} is not completed yet.`
      : applicationsQuery.error || unfinishedQuery.error
        ? 'Could not check the applicant’s loans. Refresh the page to try again.'
        : null

  const crumbs = [
    { label: 'Home', to: '/' },
    { label: 'Applicants', to: '/applicants' },
    { label: 'Applicant' },
  ]

  if (isLoading) {
    return (
      <DashboardLayout title="Applicant" breadcrumbs={crumbs}>
        <LoadingState />
      </DashboardLayout>
    )
  }

  // a failed call is not the same as an applicant that does not exist
  if (error && !(error instanceof ApiError && error.status === 404)) {
    return (
      <DashboardLayout title="Applicant" breadcrumbs={crumbs}>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </DashboardLayout>
    )
  }

  if (!applicant) {
    return (
      <DashboardLayout
        title="Applicant not found"
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Applicants', to: '/applicants' },
          { label: 'Not found' },
        ]}
      >
        <div className={`${CARD} p-6`}>
          <Text size="sm">We couldn't find that applicant.</Text>
          <Button mt="md" size="xs" variant="default" onClick={() => navigate('/applicants')}>
            Back to applicants
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  const allowed = (label: string) =>
    label === 'Review KYC' ? canDecideKyc : label === 'Start loan application' ? canStartLoan : canEdit

  const saveEdit = async (input: ApplicantEditInput) => {
    setEditError(null)
    try {
      // PUT /api/applicants/{id}
      await updateApplicant.mutateAsync({
        id: applicant.id,
        edit: {
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth,
          phone: input.phone,
          email: input.email,
          address: input.address,
          nationality: input.nationality,
          occupation: input.occupation,
          locationName: input.location,
          locationPin: input.locationPin,
          isReturning: input.isReturning,
        },
      })
      notifications.show({
        color: 'brand',
        title: 'Details updated',
        message: `${input.name}'s details were saved.`,
        icon: <AppIcon name="check" size={16} />,
      })
      setEditOpen(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save the changes. Please try again.')
    }
  }

  // the buttons shown depend on the stage, each one opens its own dialog
  const runStage = (label: string) => {
    if (label === 'Review KYC') setReviewOpen(true)
    else if (label === 'Re-check KYC') setRecheckOpen(true)
    else if (label === 'Send OTP') setOtpOpen(true)
    else if (label === 'Continue registration') navigate(`/applicants/new?applicantId=${applicant.id}`)
    else if (label === 'Start loan application') navigate(`/loan-applications/new?applicantId=${applicant.id}`)
  }

  const removeApplicant = async () => {
    if (deleteApplicant.isPending) return
    setDeleteError(null)
    try {
      await deleteApplicant.mutateAsync(applicant.id)
      setDeleteOpen(false)
      navigate('/applicants', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the applicant.')
    }
  }

  const status = STATUS[applicant.status]
  const details = [
    { icon: 'phone', value: applicant.phone },
    { icon: 'mail', value: applicant.email },
    { icon: 'map-pin', value: applicant.location },
    { icon: 'flag', value: applicant.nationality },
    { icon: 'calendar-days', value: applicant.registered ? `Registered ${dayjs(applicant.registered).format('MMM D, YYYY')}` : '' },
  ]

  return (
    <DashboardLayout
      title={applicant.name}
      subtitle={applicant.applicantNo}
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: 'Applicants', to: '/applicants' },
        { label: applicant.name },
      ]}
      actions={

        <>
          {canEdit && (
            <Button
              size="xs"
              variant="default"
              leftSection={<AppIcon name="pen-line" />}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
          )}

          {stageActions(applicant).filter((x) => allowed(x.label)).map((x) => {
            if (x.label !== 'Start loan application') {
              return (
                <Button key={x.label} size="xs" leftSection={<AppIcon name={x.icon} />} onClick={() => runStage(x.label)}>
                  {x.label}
                </Button>
              )
            }
            // an unfinished draft is continued instead of starting another one
            if (draft) {
              return (
                <Button
                  key="continue-application"
                  size="xs"
                  leftSection={<AppIcon name="pencil" />}
                  onClick={() => navigate(`/loan-applications/new?applicantId=${applicant.id}`)}
                >
                  Continue application
                </Button>
              )
            }
            // an application in progress or a loan not completed blocks a new one; the reason shows on hover
            const blocked = loanCheckLoading || blockedReason !== null
            return (
              <Tooltip
                key={x.label}
                label={loanCheckLoading ? 'Checking the applicant’s loans…' : (blockedReason ?? '')}
                disabled={!blocked}
                withArrow
                multiline
                maw={260}
              >
                <span>
                  <Button
                    size="xs"
                    leftSection={<AppIcon name={x.icon} />}
                    disabled={blocked}
                    loading={loanCheckLoading}
                    onClick={() => runStage(x.label)}
                  >
                    {x.label}
                  </Button>
                </span>
              </Tooltip>
            )
          })}
          {canDelete && (
            <Button
              size="xs"
              color="red"
              leftSection={<AppIcon name="trash" />}
              onClick={() => {
                setDeleteError(null)
                setDeleteOpen(true)
              }}
            >
              Delete profile
            </Button>
          )}
        </>
      }
    >
      {notice && (
        <Alert
          color="green"
          variant="light"
          withCloseButton
          onClose={() => setNotice(null)}
          icon={<AppIcon name="circle-check" />}
          mb="md"
        >
          <Text size="sm">{notice}</Text>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* profile summary */}
        <div className={`${CARD} p-5`}>
          <div className="flex flex-col items-center border-b border-gray-100 pb-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-subtle text-xl font-medium text-brand-dark">
              {initials(applicant.name)}
            </div>
            <div className="mt-3 text-base font-medium text-gray-800">{applicant.name}</div>
            <div className="text-xs text-gray-500">{applicant.occupation}</div>
            <div className="mt-3 flex gap-2">
              <Badge variant="light" color={status.color} radius="sm" size="sm">
                {status.label}
              </Badge>
              <Badge variant="outline" color={applicant.isReturning ? 'brand' : 'gray'} radius="sm" size="sm">
                {applicant.isReturning ? 'Returning' : 'New'}
              </Badge>
            </div>
          </div>

          <ul className="space-y-3 pt-4">
            {details.map((d) => (
              <li key={d.icon} className="flex items-start gap-3 text-sm text-gray-700">
                <AppIcon name={d.icon} className="mt-0.5 w-4 text-center text-gray-400" />
                {/* a detail the applicant has not given yet shows a dash */}
                <span className="min-w-0 break-words">{d.value.trim() || '-'}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* tabs */}
        <div className={CARD}>
          <Tabs value={tab} onChange={setTab} color="brand">
            <CustomTabs
              ariaLabel="Applicant profile tabs"
              className="w-fit px-3 py-3"
              tabs={TABS}
              value={tab ?? 'overview'}
              onChange={setTab}
            />

            <div className="p-5">
              <Tabs.Panel value="overview">
                <OverviewTab applicant={applicant} />
              </Tabs.Panel>
              <Tabs.Panel value="kyc">
                <KycTab
                  applicant={applicant}
                  onReview={canDecideKyc ? () => setReviewOpen(true) : undefined}
                  onRecheck={canEdit ? () => setRecheckOpen(true) : undefined}
                />
              </Tabs.Panel>
              <Tabs.Panel value="financial">
                <FinancialTab applicant={applicant} />
              </Tabs.Panel>
              <Tabs.Panel value="accounts">
                <AccountsTab applicant={applicant} />
              </Tabs.Panel>
              <Tabs.Panel value="loans">
                <LoansTab applicant={applicant} />
              </Tabs.Panel>
              <Tabs.Panel value="activity">
                <ActivityTab applicant={applicant} />
              </Tabs.Panel>
            </div>
          </Tabs>
        </div>
      </div>

      {/* the dialog shows the "KYC approved / rejected" notification itself */}
      <KycDecisionDialog applicant={reviewOpen ? applicant : null} onClose={() => setReviewOpen(false)} />

      <RecheckKycDialog applicant={recheckOpen ? applicant : null} onClose={() => setRecheckOpen(false)} />

      <SendOtpDialog
        applicant={otpOpen ? applicant : null}
        onClose={() => setOtpOpen(false)}
        onVerified={(a) => {
          setNotice(`${a.name} was verified. They are now pending KYC review.`)
          setOtpOpen(false)
        }}
      />

      <ApplicantEditDialog
        opened={editOpen}
        applicant={applicant}
        saving={updateApplicant.isPending}
        serverError={editError}
        onClose={() => {
          setEditOpen(false)
          setEditError(null)
        }}
        onSubmit={saveEdit}
      />

      <ContractConfirmDialog
        opened={deleteOpen}
        title={deleteError ? 'Could not delete profile' : 'Delete profile'}
        message={
          deleteError ??
          `Delete ${applicant.name} (${applicant.applicantNo})? This action cannot be undone.`
        }
        confirmLabel={deleteError ? 'Try again' : 'Delete profile'}
        danger={!deleteError}
        onClose={() => {
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        onConfirm={removeApplicant}
      />
    </DashboardLayout>
  )
}