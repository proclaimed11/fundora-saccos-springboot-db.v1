import { AppIcon } from '../../components/appIcon'
import { Badge, Button } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { PageState } from '../../components/pageState'
import { useNavigate } from 'react-router-dom'
import { usePageAccess } from '../auth/usePageAccess'
import { useApplicants } from '../../api/applicants'
import { STATUS, type Applicant, type ApplicantStatus } from './applicantsData'

// dropdown options for the Status header filter
const statusOptions = (Object.keys(STATUS) as ApplicantStatus[]).map((s) => ({
  value: s,
  label: STATUS[s].label,
}))

// dropdown options for the Type header filter (values are the true/false text of isReturning)
const typeOptions = [
  { value: 'true', label: 'Returning' },
  { value: 'false', label: 'New' },
]

function StatusBadge({ status }: { status: ApplicantStatus }) {
  return (
    <Badge variant="light" color={STATUS[status].color} radius="sm" size="sm">
      {STATUS[status].label}
    </Badge>
  )
}

export function Applicants() {
  const navigate = useNavigate()
  const { canCreate, canDelete } = usePageAccess('applicants', 'applicants')

  // GET /api/applicants
  const { data = [], isLoading, error, refetch } = useApplicants()

  const count = (s: ApplicantStatus) => data.filter((a) => a.status === s).length

  // here `color` is the icon color
  const stats = [
    { label: 'Total Applicants', value: data.length, icon: 'users', color: '#45bdfc' },
    { label: 'Pending OTP', value: count('PENDING_OTP'), icon: 'hourglass', color: '#8e44ad' },
    { label: 'Pending KYC', value: count('PENDING_KYC'), icon: 'contact-round', color: '#e08a1e' },
    { label: 'KYC Approved', value: count('KYC_APPROVED'), icon: 'circle-check', color: 'var(--app-brand)' },
    { label: 'Rejected', value: count('REJECTED'), icon: 'circle-x', color: '#ef4444' },
  ]

  const columns: CustomTableColumn<Applicant>[] = [
    {
      accessor: 'name',
      header: 'Applicant',
      render: (a) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{a.name}</div>
          <div className="truncate text-xs text-gray-500">{a.applicantNo}</div>
        </div>
      ),
    },
    {
      accessor: 'phone',
      header: 'Contact',
      render: (a) => (
        <div>
          <div className="text-xs text-gray-800">{a.phone}</div>
          <div className="text-[11px] text-gray-500">{a.email}</div>
        </div>
      ),
    },
    {
      accessor: 'occupation',
      header: 'Occupation',
      render: (a) => (
        <div>
          <div className="text-xs text-gray-800">{a.occupation || '—'}</div>
          <div className="text-[11px] text-gray-500">{a.location}</div>
        </div>
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (a) => <StatusBadge status={a.status} />,
    },
    {
      accessor: 'isReturning',
      header: 'Type',
      render: (a) => (
        <Badge variant="outline" color={a.isReturning ? 'brand' : 'gray'} radius="sm" size="sm">
          {a.isReturning ? 'Returning' : 'New'}
        </Badge>
      ),
      exportValue: (a) => (a.isReturning ? 'Returning' : 'New'),
    },
    {
      accessor: 'registered',
      header: 'Registered',
      type: 'date',
    },
  ]

  return (
    <DashboardLayout
      title="Applicants"
      subtitle="Manage all applicants"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Applicants' }]}
      actions={
        canCreate ? (
          <Button size="xs" leftSection={<AppIcon name="user-round-plus" />} onClick={() => navigate('/applicants/new')}>
            New applicant
          </Button>
        ) : undefined
      }
    >
      <PageState loading={isLoading} error={error?.message ?? null} onRetry={() => void refetch()}>
        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        {/* row 2: table in a plain card, no heading */}
        <div className="mt-4 rounded-md bg-white p-4 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
          <CustomTable<Applicant>
            size="md"
            data={data}
            columns={columns}
            searchInput
            searchPlaceholder="Search applicant"
            searchKeys={['name', 'applicantNo', 'phone']}
            filters={{ status: statusOptions, isReturning: typeOptions, registered: 'date' }}
            selectCheckbox={canDelete}
            // TODO: DELETE /api/applicants/{id} for each selected row
            onDelete={canDelete ? () => {} : undefined}
            defaultSort={{ accessor: 'registered', direction: 'desc' }}
            noRecordText="No applicants yet"
            onRowClick={(row) => navigate(`/applicants/${row.id}`)}
            exportCsv
            exportFileName="applicants"
            print
            printTitle="Applicants"
          />
        </div>
      </PageState>
    </DashboardLayout>
  )
}