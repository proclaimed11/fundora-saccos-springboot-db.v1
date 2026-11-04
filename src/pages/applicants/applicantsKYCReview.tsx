import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Badge, Button, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { nidaFor, type Applicant } from './applicantsData'
import { PageState } from '../../components/pageState'
import { useApplicants } from '../../api/applicants'
import { KycDecisionDialog } from './applicantKYCDecisionDialog'
import { usePageAccess } from '../auth/usePageAccess'

type Row = Applicant & { nida: string; waiting: number }

const typeOptions = [
  { value: 'true', label: 'Returning' },
  { value: 'false', label: 'New' },
]

export function KycReview() {
  const navigate = useNavigate()
  const [reviewing, setReviewing] = useState<Row | null>(null)
  // UI only: decided applicants just leave the queue for this session
  const [decided, setDecided] = useState<number[]>([])
  const { canApprove } = usePageAccess('applicants', 'kyc-review')

    // GET /api/applicants, the queue is the ones still waiting for a KYC decision
  const { data: all = [], isLoading, error, refetch } = useApplicants()

  const rows: Row[] = all
    .filter((a) => a.status === 'PENDING_KYC' && !decided.includes(a.id))
    .map((a) => ({
      ...a,
      nida: nidaFor(a),
      waiting: dayjs().diff(a.registered, 'day'),
    }))

  const stats = [
    { label: 'Awaiting review', value: rows.length, icon: 'contact-round', color: '#e08a1e' },
    { label: 'Returning applicants', value: rows.filter((r) => r.isReturning).length, icon: 'refresh-cw', color: '#45bdfc' },
    { label: 'Waiting over 7 days', value: rows.filter((r) => r.waiting > 7).length, icon: 'clock', color: '#ef4444' },
  ]

  const columns: CustomTableColumn<Row>[] = [
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
    { accessor: 'nida', header: 'NIDA number' },
    {
      accessor: 'phone',
      header: 'Documents',
      sortable: false,
      render: () => (
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="whitespace-nowrap">
            <AppIcon name="file-text" className="mr-1 text-gray-400" />
            NIDA
          </span>
          <span className="whitespace-nowrap">
            <AppIcon name="file-image" className="mr-1 text-gray-400" />
            ID scan
          </span>
        </div>
      ),
      exportValue: () => 'NIDA, ID scan',
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
    { accessor: 'registered', header: 'Registered', type: 'date' },
    {
      accessor: 'waiting',
      header: 'Waiting',
      render: (a) => (
        <Text size="sm" c={a.waiting > 7 ? 'red' : undefined} fw={a.waiting > 7 ? 600 : 400}>
          {a.waiting} {a.waiting === 1 ? 'day' : 'days'}
        </Text>
      ),
      exportValue: (a) => `${a.waiting} days`,
    },
    {
      accessor: 'id',
      header: '',
      sortable: false,
      align: 'right',
      render: (a) =>
        canApprove ? (
          <Button size="compact-xs" leftSection={<AppIcon name="contact-round" />} onClick={(e) => { e.stopPropagation(); setReviewing(a) }}>
            Review
          </Button>
        ) : (
          <span className="text-xs text-gray-400">View only</span>
        ),
      exportValue: () => '',
    },
  ]

  return (
    <DashboardLayout
      title="KYC Review"
      subtitle="Applicants waiting for a KYC decision"
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: 'Applicants', to: '/applicants' },
        { label: 'KYC Review' },
      ]}
    >

      <PageState loading={isLoading} error={error?.message ?? null} onRetry={() => void refetch()}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <StatWidget key={s.label} {...s} />
        ))}
      </div>

      <div className="mt-4 rounded-md bg-white p-4 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
        <CustomTable<Row>
          size="md"
          data={rows}
          columns={columns}
          searchInput
          searchPlaceholder="Search applicant"
          searchKeys={['name', 'applicantNo', 'nida']}
          filters={{ isReturning: typeOptions, registered: 'date' }}
          defaultSort={{ accessor: 'waiting', direction: 'desc' }}
          onRowClick={(row) => navigate(`/applicants/${row.id}`)}
          exportCsv
          exportFileName="kyc-review"
          print
          printTitle="KYC review queue"
          noRecordText="No applicants are waiting for KYC review"
        />
      </div>
      </PageState>

      <KycDecisionDialog
        applicant={reviewing}
        onClose={() => setReviewing(null)}
        onDecided={(a) => setDecided((prev) => [...prev, a.id])}
      />
    </DashboardLayout>
  )
}