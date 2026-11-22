import { useState } from 'react'
import { AppIcon } from '../../components/appIcon'
import { Alert, Badge, Button, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { useApplicants } from '../../api/applicants'
import { useUserNames } from '../../api/users'
import { deleteLoanApplication, useLoanApplications, useLoanDrafts, type LoanDraft } from '../../api/loanApplications'
import { useNavigate } from 'react-router-dom'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import {
  RANK,
  STATUS,
  methodLabel,
  type ApplicationStatus,
  type LoanApplication,
} from './loanApplicationsData'

// a backend row -> the shape the table and its filters use; names are joined from the applicants and users lists
function toRow(d: LoanDraft, applicantName: string, officerName: string): LoanApplication {
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

const statusOptions = (Object.keys(STATUS) as ApplicationStatus[]).map((s) => ({
  value: s,
  label: STATUS[s].label,
}))

const methodOptions = [
  { value: 'FLAT', label: 'Flat' },
  { value: 'REDUCING', label: 'Reducing balance' },
]

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="light" color={STATUS[status].color} radius="sm" size="sm">
      {STATUS[status].label}
    </Badge>
  )
}

export function LoanApplications() {
  const navigate = useNavigate()
  // GET /api/loan-applications: unfinished drafts saved by the wizard ("Save draft and exit" or any step)
  const { data: drafts = [] } = useLoanDrafts()
  const { data: applicantList = [] } = useApplicants()
  const nameOf = (id: number) => applicantList.find((a) => a.id === id)?.name ?? `Applicant #${id}`
  const userNames = useUserNames()

  // GET /api/loan-applications: the table and the numbers above it
  const listQuery = useLoanApplications()
  const applications: LoanApplication[] = (listQuery.data ?? []).map((d) =>
    toRow(
      d,
      nameOf(d.applicantId),
      d.loanOfficerId ? (userNames.get(d.loanOfficerId) ?? `User #${d.loanOfficerId}`) : '—',
    ),
  )
  const count = (test: (s: ApplicationStatus) => boolean) => applications.filter((a) => test(a.status)).length
  // here `color` is the icon color
  const stats = [
    { label: 'Total Applications', value: applications.length, icon: 'file-text', color: '#45bdfc' },
    { label: 'Drafts', value: count((s) => s === 'DRAFT'), icon: 'pen-line', color: '#868e96' },
    { label: 'In Review', value: count((s) => ['SUBMITTED', 'CREDIT_APPROVED', 'PENDING_APPROVAL'].includes(s)), icon: 'hourglass', color: '#e08a1e' },
    { label: 'Approved', value: count((s) => s !== 'REJECTED' && RANK[s] >= 3), icon: 'circle-check', color: 'var(--app-brand)' },
    { label: 'Rejected', value: count((s) => s === 'REJECTED'), icon: 'circle-x', color: '#ef4444' },
  ]

  // Delete selected: DELETE /api/loan-applications/{id} for each one
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteRows = async (rows: LoanApplication[]) => {
    setDeleteError(null)
    const results = await Promise.allSettled(rows.map((r) => deleteLoanApplication(r.id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      setDeleteError(
        `${failed} of ${rows.length} ${rows.length === 1 ? 'application' : 'applications'} could not be deleted. Please try again.`,
      )
    }
  }
  const [discarding, setDiscarding] = useState<number | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  // DELETE /api/loan-applications/{id}
  const discardDraft = async (id: number) => {
    setDiscarding(id)
    setDraftError(null)
    try {
      await deleteLoanApplication(id)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Could not discard the draft. Please try again.')
    } finally {
      setDiscarding(null)
    }
  }

  const columns: CustomTableColumn<LoanApplication>[] = [
    {
      accessor: 'applicationNo',
      header: 'Application',
      render: (a) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{a.applicationNo}</div>
          <div className="truncate text-xs text-gray-500">{a.applicantName}</div>
        </div>
      ),
      exportValue: (a) => `${a.applicationNo} (${a.applicantName})`,
    },
    {
      accessor: 'requestedAmount',
      header: 'Amount',
      render: (a) => (
        <div>
          <div className="text-xs font-medium text-gray-800">{formatTzs(a.requestedAmount)}</div>
          <div className="text-[11px] text-gray-500">{a.tenure} months</div>
        </div>
      ),
      exportValue: (a) => a.requestedAmount,
    },
    {
      accessor: 'interestMethod',
      header: 'Terms',
      render: (a) => (
        <div>
          <div className="text-xs text-gray-800">{a.interestRate}% p.a.</div>
          <div className="text-[11px] text-gray-500">{methodLabel(a.interestMethod)}</div>
        </div>
      ),
      exportValue: (a) => `${a.interestRate}% ${a.interestMethod}, ${a.tenure} months`,
    },
    {
      accessor: 'loanOfficer',
      header: 'Loan officer',
      render: (a) => <div className="text-xs text-gray-800">{a.loanOfficer}</div>,
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (a) => (
        <div>
          <StatusBadge status={a.status} />
          {a.status === 'DRAFT' && (
            <div className="mt-0.5 text-[11px] text-gray-500">
              Stage: {a.currentStage.replace('_', ' ').toLowerCase()}
            </div>
          )}
        </div>
      ),
      exportValue: (a) => STATUS[a.status].label,
    },
    {
      accessor: 'created',
      header: 'Created',
      type: 'date',
    },
  ]

  return (
    <DashboardLayout
      title="Loan Applications"
      subtitle="Manage all loan applications"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Loan-Applications' }]}
      actions={
        // inactive for now: no click handler until the wizard is built
        <Button
          size="xs"
          leftSection={<AppIcon name="plus" />}
          onClick={() => navigate('/loan-applications/new')}
        >
          New application
        </Button>
      }
    >

    {drafts.length > 0 && (
        <Alert
          color="blue"
          variant="light"
          icon={<AppIcon name="pencil" />}
          title={`${drafts.length} saved ${drafts.length === 1 ? 'draft' : 'drafts'}`}
          mb="md"
        >
          {draftError && (
            <Text size="xs" c="red" mb={6}>
              {draftError}
            </Text>
          )}
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm">
                  {d.applicationNo || `#${d.id}`} · {nameOf(d.applicantId)} · stopped at{' '}
                  {(d.currentStage || 'APPLICANT').replace(/_/g, ' ').toLowerCase()}
                  {d.updatedAt ? ` · saved ${dayjs(d.updatedAt).format('MMM D, h:mm A')}` : ''}
                </Text>
                <div className="flex gap-2">
                  <Button
                    size="compact-xs"
                    disabled={discarding !== null}
                    onClick={() => navigate(`/loan-applications/new?applicantId=${d.applicantId}`)}
                  >
                    Resume
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="default"
                    loading={discarding === d.id}
                    disabled={discarding !== null && discarding !== d.id}
                    onClick={() => void discardDraft(d.id)}
                  >
                    Discard
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Alert>
      )}


      {/* row 1: key numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((s) => (
          <StatWidget key={s.label} {...s} />
        ))}
      </div>

      {/* row 2: table in a plain card */}
      <div className="mt-4 rounded-md bg-white p-4 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
        {listQuery.error && (
          <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />} mb="md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">Could not load the loan applications. {listQuery.error.message}</Text>
              <Button size="compact-xs" variant="light" color="red" onClick={() => void listQuery.refetch()}>
                Try again
              </Button>
            </div>
          </Alert>
        )}
        {deleteError && (
          <Alert color="red" variant="light" withCloseButton onClose={() => setDeleteError(null)} icon={<AppIcon name="circle-x" />} mb="md">
            <Text size="sm">{deleteError}</Text>
          </Alert>
        )}
        <CustomTable<LoanApplication>
          size="md"
          loading={listQuery.isLoading}
          noRecordText="No loan applications yet"
          data={applications}
          columns={columns}
          searchInput
          searchPlaceholder="Search application"
          searchKeys={['applicationNo', 'applicantName', 'loanOfficer']}
          filters={{ status: statusOptions, interestMethod: methodOptions, created: 'date' }}
          selectCheckbox
          confirmModal
          confirmHeading="Delete selected loan applications?"
          confirmBody="The selected loan applications will be deleted. This action cannot be undone."
          onDelete={(rows) => void deleteRows(rows)}
          defaultSort={{ accessor: 'created', direction: 'desc' }}
          // a draft continues in the wizard; the others open the application page (still sample data for now)
          onRowClick={(row) =>
            navigate(
              row.status === 'DRAFT'
                ? `/loan-applications/new?applicantId=${row.applicantId}`
                : `/loan-applications/${row.id}`,
            )
          }
          exportCsv
          exportFileName="loan-applications"
          print
          printTitle="Loan Applications"
        />
      </div>
    </DashboardLayout>
  )
}