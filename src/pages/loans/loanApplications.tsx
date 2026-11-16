import { useState } from 'react'
import { AppIcon } from '../../components/appIcon'
import { Alert, Badge, Button, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { applicants } from '../applicants/applicantsData'
import { allDrafts, clearDraft } from './draftStore'
import { useNavigate } from 'react-router-dom'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import {
  RANK,
  STATUS,
  applications,
  methodLabel,
  type ApplicationStatus,
  type LoanApplication,
} from './loanApplicationsData'

const count = (test: (s: ApplicationStatus) => boolean) =>
  applications.filter((a) => test(a.status)).length

// here `color` is the icon color
const stats = [
  { label: 'Total Applications', value: applications.length, icon: 'file-text', color: '#45bdfc' },
  { label: 'Drafts', value: count((s) => s === 'DRAFT'), icon: 'pen-line', color: '#868e96' },
  { label: 'In Review', value: count((s) => ['SUBMITTED', 'CREDIT_APPROVED', 'PENDING_APPROVAL'].includes(s)), icon: 'hourglass', color: '#e08a1e' },
  { label: 'Approved', value: count((s) => s !== 'REJECTED' && RANK[s] >= 3), icon: 'circle-check', color: 'var(--app-brand)' },
  { label: 'Rejected', value: count((s) => s === 'REJECTED'), icon: 'circle-x', color: '#ef4444' },
]

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
  // UI only: drafts saved in this browser by "Save draft and exit"
  const [, refresh] = useState(0)
  const drafts = allDrafts()

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
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.applicantId} className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm">
                  {applicants.find((a) => String(a.id) === d.applicantId)?.name ?? 'Applicant'} · stopped at{' '}
                  {d.stepLabel} · saved {dayjs(d.savedAt).format('MMM D, h:mm A')}
                </Text>
                <div className="flex gap-2">
                  <Button
                    size="compact-xs"
                    onClick={() => navigate(`/loan-applications/new?applicantId=${d.applicantId}`)}
                  >
                    Resume
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => {
                      clearDraft(d.applicantId)
                      refresh((n) => n + 1)
                    }}
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
        <CustomTable<LoanApplication>
          size="md"
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
          onDelete={() => {}} // UI only for now
          defaultSort={{ accessor: 'created', direction: 'desc' }}
          onRowClick={(row) => navigate(`/loan-applications/${row.id}`)}
          exportCsv
          exportFileName="loan-applications"
          print
          printTitle="Loan Applications"
        />
      </div>
    </DashboardLayout>
  )
}