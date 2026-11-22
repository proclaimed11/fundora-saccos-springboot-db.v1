import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Badge, Button, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import type { Applicant } from './applicantsData'
import { PageState } from '../../components/pageState'
import { KycDecisionDialog } from './applicantKYCDecisionDialog'
import { usePageAccess } from '../auth/usePageAccess'
import { useAllIdentifications, useApplicants, usePendingKycSince } from '../../api/applicants'
import { useAllApplicantDocuments } from '../../api/applicantRecords'
import { isImage } from './documentDialogs'

type Row = Applicant & {
  nida: string
  /** null when there is no NIDA row on file */
  nidaVerified: boolean | null
  /** the files on record: the NIDA/TIN scans plus the applicant documents */
  docs: { name: string; fileName: string }[]
  /** the day the applicant reached Pending KYC, the registration day until the history has loaded */
  since: string
  waiting: number
}

const typeOptions = [
  { value: 'true', label: 'Returning' },
  { value: 'false', label: 'New' },
]

export function KycReview() {
  const navigate = useNavigate()
  const [reviewing, setReviewing] = useState<Row | null>(null)
  const { canApprove } = usePageAccess('applicants', 'kyc-review')

  // GET /api/applicants, the queue is the ones still waiting for a KYC decision
  const { data: all = [], isLoading, error, refetch } = useApplicants()
  // GET /api/applicant-identifications and /api/applicant-documents
  const { data: identifications = [] } = useAllIdentifications()
  const { data: documents = [] } = useAllApplicantDocuments()

  const pending = all.filter((a) => a.status === 'PENDING_KYC')
  // GET /api/applicant-status-historys/applicant/{id} for each one, the day the code was verified
  const pendingSince = usePendingKycSince(pending.map((a) => a.id))

  const rows: Row[] = pending.map((a) => {
    const ids = identifications.filter((i) => i.applicantId === a.id)
    const nida = ids.find((i) => i.type === 'NIDA')
    const fileOf = (path: string) => path.split('/').pop() ?? path
    const docs = [
      ...ids.filter((i) => i.documentPath).map((i) => ({ name: i.type, fileName: fileOf(i.documentPath as string) })),
      ...documents.filter((d) => d.applicantId === a.id).map((d) => ({ name: d.type, fileName: d.fileName })),
    ]
    const since = pendingSince[a.id] ?? a.registered
    return {
      ...a,
      nida: nida?.number || '—',
      nidaVerified: nida ? nida.verified : null,
      docs,
      since,
      waiting: dayjs().startOf('day').diff(dayjs(since), 'day'),
    }
  })

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
    {
      accessor: 'nida',
      header: 'NIDA number',
      render: (a) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-gray-700">{a.nida}</span>
          {a.nidaVerified !== null && (
            <Badge variant="light" color={a.nidaVerified ? 'green' : 'gray'} radius="sm" size="xs">
              {a.nidaVerified ? 'Verified' : 'Not verified'}
            </Badge>
          )}
        </div>
      ),
      exportValue: (a) => `${a.nida}${a.nidaVerified === null ? '' : a.nidaVerified ? ' (verified)' : ' (not verified)'}`,
    },
    {
      accessor: 'phone',
      header: 'Documents',
      sortable: false,
      render: (a) =>
        a.docs.length === 0 ? (
          <span className="text-xs text-red-500">None on file</span>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            {a.docs.map((d, i) => (
              <span key={`${d.name}-${i}`} className="whitespace-nowrap">
                <AppIcon name={isImage(d.fileName) ? 'file-image' : 'file-text'} className="mr-1 text-gray-400" />
                {d.name}
              </span>
            ))}
          </div>
        ),
      exportValue: (a) => a.docs.map((d) => d.name).join(', ') || 'None',
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

      <KycDecisionDialog applicant={reviewing} onClose={() => setReviewing(null)} />
    </DashboardLayout>
  )
}