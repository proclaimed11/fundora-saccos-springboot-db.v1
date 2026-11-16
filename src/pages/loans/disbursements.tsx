import { AppIcon } from '../../components/appIcon'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import { DisbursementDialog, JournalPreview, type DisbursementInput } from './disbursementDialog'
import {
  COMPANY_ACCOUNTS,
  METHOD_LABEL,
  SAMPLE_DISBURSEMENTS,
  applications,
  contractFor,
  estimateInstallment,
  journalFor,
  memberAccountsFor,
  methodLabel,
  type CompanyAccount,
  type DisbursementRecord,
  type LoanApplication,
} from './loanApplicationsData'
import { printVoucher } from './printDocs'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { Can } from '../auth/requirePermission'
import { usePageAccess } from '../auth/usePageAccess'

// our own rule, the API has no deadline: warn when a created loan waits longer than this
const LATE_AFTER_DAYS = 3

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type Stage = 'PENDING' | 'DISBURSED'
type TabKey = 'pending' | 'disbursed' | 'gl' | 'all'

type Row = LoanApplication & {
  stage: Stage
  record: DisbursementRecord | null
  /** days since the loan was created */
  waiting: number
}

const TAB_EMPTY: Record<TabKey, string> = {
  pending: 'No loans are waiting for disbursement',
  disbursed: 'Nothing has been disbursed yet',
  gl: 'Every disbursement is posted to the ledger',
  all: 'No loans have been created yet',
}

/* ---------- small pieces ---------- */

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

function StageBadge({ row }: { row: Row }) {
  return row.stage === 'PENDING' ? (
    <Badge variant="light" color="yellow" radius="sm" size="sm">
      Pending disbursement
    </Badge>
  ) : (
    <Badge variant="light" color="green" radius="sm" size="sm">
      Disbursed
    </Badge>
  )
}

function GlBadge({ record }: { record: DisbursementRecord }) {
  return record.glStatus === 'POSTED' ? (
    <Badge variant="outline" color="gray" radius="sm" size="sm">
      Posted to ledger
    </Badge>
  ) : (
    <Badge variant="light" color="orange" radius="sm" size="sm">
      Ledger posting pending
    </Badge>
  )
}

/* ---------- details drawer ---------- */

type DrawerProps = {
  row: Row
  accounts: CompanyAccount[]
  onDisburse: (r: Row) => void
  onPostGl: (r: Row) => void
  onOpenApplication: (r: Row) => void
}

function DrawerBody({ row: r, accounts, onDisburse, onPostGl, onOpenApplication }: DrawerProps) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  const record = r.record
  const source = record ? accounts.find((x) => x.id === record.sourceAccountId) : undefined
  const member = record ? memberAccountsFor(r.applicantId).find((x) => x.id === record.memberAccountId) : undefined
  const installment = Math.round(estimateInstallment(r))
  const firstDue = dayjs(record?.date ?? undefined).add(1, 'month')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge row={r} />
        {record && <GlBadge record={record} />}
        <Text size="xs" c="dimmed">
          {r.applicationNo} · Loan officer {r.loanOfficer}
        </Text>
      </div>

      {/* next step */}
      {r.stage === 'PENDING' ? (
        <div className="rounded-md border border-brand/20 bg-brand-subtle p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Next step</div>
          <p className="mt-1 text-sm text-gray-700">
            The loan is created and waiting. Send {formatTzs(r.requestedAmount)} to {r.applicantName}, then record
            where it was paid from and where it went.
          </p>
          <div className="mt-3">
            <Can area="loans" page="disbursements" action="create">
              <Button
                size="xs"
                leftSection={<AppIcon name="banknote" />}
                onClick={() => onDisburse(r)}
              >
                Record disbursement
              </Button>
            </Can>
          </div>
        </div>
      ) : (
        record?.glStatus === 'PENDING' && (
          <Alert color="orange" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">The loan is disbursed, but the ledger entry has not been posted yet.</Text>
              <Can area="loans" page="disbursements" action="create">
                <Button size="compact-xs" onClick={() => onPostGl(r)}>
                  Post to ledger
                </Button>
              </Can>
            </div>
          </Alert>
        )
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Principal', value: formatTzs(r.requestedAmount) },
          { label: 'Est. monthly installment', value: formatTzs(installment) },
          { label: record ? 'First installment due' : 'Tenure', value: record ? firstDue.format('MMM D, YYYY') : `${r.tenure} months` },
        ].map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      {record ? (
        <>
          <div>
            <SectionTitle>Journal entry</SectionTitle>
            <JournalPreview lines={journalFor(record.amount, source)} />
          </div>

          <div>
            <SectionTitle>Payment details</SectionTitle>
            <Field label="Paid from" value={source?.name ?? '—'} />
            <Field label="Paid to" value={member ? `${member.label} · ${member.detail}` : '—'} />
            <Field label="Method" value={METHOD_LABEL[record.method]} />
            <Field label="Reference" value={record.reference || 'None (cash)'} />
            <Field label="Date sent" value={dayjs(record.date).format('MMM D, YYYY')} />
            <Field label="Processed by" value={record.processedBy} />
            <Field label="Approved by" value={record.approvedBy} />
            {record.notes && <Field label="Notes" value={record.notes} />}
          </div>

          <div>
            <SectionTitle>Documents</SectionTitle>
            <ul className="mt-2 space-y-2">
              {record.proofName ? (
                <li className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                  <AppIcon name="file-text" className="text-xl text-gray-400"  size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">Proof of payment</div>
                    <div className="truncate text-xs text-gray-500">{record.proofName}</div>
                  </div>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="brand"
                    onClick={() =>
                      setViewing({
                        title: 'Proof of payment',
                        fileName: record.proofName!,
                        subtitle: `${r.applicantName} · ${dayjs(record.date).format('MMM D, YYYY')}`,
                      })
                    }
                  >
                    View
                  </Button>
                </li>
              ) : (
                <li className="rounded-md border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500">
                  No proof of payment uploaded
                </li>
              )}
              <li className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                <AppIcon name="file-text" className="text-xl text-gray-400"  size={20} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">Disbursement voucher</div>
                  <div className="truncate text-xs text-gray-500">{record.reference || r.applicationNo}-voucher.pdf</div>
                </div>
                {/* inactive for now: no click handler until the voucher is built */}
              <Button
                size="compact-xs"
                variant="subtle"
                color="brand"
                leftSection={<AppIcon name="printer" />}
                onClick={() => printVoucher(r, record, source, member)}
              >
                Print
              </Button>
              </li>
            </ul>
          </div>
        </>
      ) : (
        <div>
          <SectionTitle>Loan terms</SectionTitle>
          <Field label="Interest" value={`${r.interestRate}% per year · ${methodLabel(r.interestMethod)}`} />
          <Field label="Tenure" value={`${r.tenure} months`} />
          <Field label="Penalty rate" value={`${r.penaltyRate}%`} />
          <Field label="Waiting" value={r.waiting <= 0 ? 'Created today' : `${r.waiting} days since creation`} />
        </div>
      )}

      <Button
        size="xs"
        variant="default"
        leftSection={<AppIcon name="external-link" />}
        onClick={() => onOpenApplication(r)}
      >
        View full application
      </Button>

            <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

/* ---------- page ---------- */

type Notice = { text: string; viewId?: number } | null

export function DisbursementsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { canCreate } = usePageAccess('loans', 'disbursements')

  const location = useLocation()
    // a loan created in this session on the Contracts page, not in the sample data yet
  const [createdId] = useState<number | undefined>(
    () => (location.state as { createdId?: number } | null)?.createdId,
    )
    const source = useMemo(
    () => applications.map((a) => (a.id === createdId ? { ...a, status: 'LOAN_CREATED' as const } : a)),
    [createdId],
  )

  // UI only: recorded disbursements and account balances change for this session, nothing is saved yet
  const [records, setRecords] = useState<Record<number, DisbursementRecord>>(SAMPLE_DISBURSEMENTS)
  const [accounts, setAccounts] = useState<CompanyAccount[]>(COMPANY_ACCOUNTS)
  const [notice, setNotice] = useState<Notice>(null)
  const [tab, setTab] = useState<TabKey>('pending')

  // /loan-disbursements?disburse=12 opens the dialog for application 12
    const [dialogId, setDialogId] = useState<number | null>(() => {
    const id = Number(params.get('disburse'))
    const known = source.some((a) => a.id === id && a.status === 'LOAN_CREATED')
    return known && !SAMPLE_DISBURSEMENTS[id] ? id : null
    })

    const rows: Row[] = useMemo(
    () =>
        source
        .filter((a) => a.status === 'LOAN_CREATED')
        .map((a) => {
            const record = records[a.id] ?? null
            const since = contractFor(a)?.signed ?? a.created
            return {
            ...a,
            record,
            stage: record ? ('DISBURSED' as const) : ('PENDING' as const),
            waiting: dayjs().diff(dayjs(since), 'day'),
            }
        }),
    [records, source],
    )

  const pending = rows.filter((r) => r.stage === 'PENDING')
  const disbursed = rows.filter((r) => r.stage === 'DISBURSED')
  const glPending = disbursed.filter((r) => r.record?.glStatus === 'PENDING')
  const today = dayjs().format('YYYY-MM-DD')
  const todayRows = disbursed.filter((r) => r.record?.date === today)
  const late = pending.filter((r) => r.waiting > LATE_AFTER_DAYS)

  const tabData: Record<TabKey, Row[]> = { pending, disbursed, gl: glPending, all: rows }

  const sum = (list: Row[]) => list.reduce((s, r) => s + r.requestedAmount, 0)

  // here `color` is the icon color
  const stats = [
    { label: 'Pending Disbursement', value: pending.length, icon: 'hourglass', color: '#e08a1e' },
    { label: 'Disbursed', value: disbursed.length, icon: 'banknote', color: 'var(--app-brand)' },
    { label: 'Recorded Today', value: todayRows.length, icon: 'calendar-check', color: '#0077b5' },
    { label: 'Ledger Posting Pending', value: glPending.length, icon: 'arrow-left-right', color: '#8e44ad' },
    { label: `Waiting Over ${LATE_AFTER_DAYS} Days`, value: late.length, icon: 'clock', color: '#ef4444' },
  ]

  // /loan-disbursements?view=1 opens the details drawer for application 1
  const viewId = params.get('view')
  const selected = viewId ? (rows.find((r) => String(r.id) === viewId) ?? null) : null
  const openView = (id: number) => setParams({ view: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const dialogRow = dialogId ? rows.find((r) => r.id === dialogId) : undefined

  const openDialog = (r: Row) => {
    if (!canCreate) return
    setDialogId(r.id)
  } 
  const closeDialog = () => {
    setDialogId(null)
    if (params.get('disburse')) setParams({}, { replace: true })
  }

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const record = (input: DisbursementInput) => {
    if (!dialogRow) return
    // TODO: POST /api/disbursement/loans/{loanId}/disburse
    //       { accountId: memberAccountId, amount, paymentMethod, referenceNumber, approvedBy, processedBy }
    //       then POST /api/gl-workflow/disbursements/{disbursementId}/post
    //       The source account, the date and the proof upload are not in the API yet.
    const created: DisbursementRecord = {
      id: Date.now(),
      applicationId: dialogRow.id,
      glStatus: 'POSTED',
      ...input,
    }
    setRecords((r) => ({ ...r, [dialogRow.id]: created }))
    setAccounts((list) =>
      list.map((x) => (x.id === input.sourceAccountId ? { ...x, balance: x.balance - input.amount } : x)),
    )
    setNotice({
      text: `${formatTzs(input.amount)} recorded for ${dialogRow.applicantName}. The loan is now active and its repayment schedule is created.`,
      viewId: dialogRow.id,
    })
    setTab('disbursed')
    closeDialog()
  }

  const postGl = (r: Row) => {
    if (!r.record) return
    // TODO: POST /api/gl-workflow/disbursements/{disbursementId}/post (safe to retry, it never posts twice)
    setRecords((all) => ({ ...all, [r.id]: { ...r.record!, glStatus: 'POSTED' } }))
    setNotice({ text: `The ledger entry for ${r.applicantName} is posted.` })
  }

  const usedReferences = Object.values(records)
    .map((r) => r.reference)
    .filter(Boolean)

  const accountName = (id: number) => accounts.find((x) => x.id === id)?.name ?? '—'

  const columns: CustomTableColumn<Row>[] = [
    {
      accessor: 'applicantName',
      header: 'Borrower',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.applicantName}</div>
          <div className="truncate text-xs text-gray-500">{r.applicationNo}</div>
        </div>
      ),
      exportValue: (r) => `${r.applicationNo} (${r.applicantName})`,
    },
    {
      accessor: 'requestedAmount',
      header: 'Amount',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.requestedAmount)}</div>
          <div className="text-xs text-gray-500">
            {r.tenure} months · {methodLabel(r.interestMethod)}
          </div>
        </div>
      ),
      exportValue: (r) => r.requestedAmount,
    },
    {
      accessor: 'stage',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <div className="space-y-1">
          <StageBadge row={r} />
          {r.record && (
            <div>
              <GlBadge record={r.record} />
            </div>
          )}
        </div>
      ),
      exportValue: (r) => (r.stage === 'PENDING' ? 'Pending disbursement' : 'Disbursed'),
    },
    {
      // accessor only carries the column, the content is built from the disbursement record
      accessor: 'currentStage',
      header: 'Paid from → to',
      sortable: false,
      render: (r) => {
        if (!r.record) return <span className="text-xs text-gray-400">Not recorded yet</span>
        const to = memberAccountsFor(r.applicantId).find((x) => x.id === r.record!.memberAccountId)
        return (
          <div>
            <div className="max-w-[220px] truncate text-sm text-gray-800">{accountName(r.record.sourceAccountId)}</div>
            <div className="max-w-[220px] truncate text-xs text-gray-500">
              → {to ? `${to.label} · ${to.detail}` : '—'}
            </div>
          </div>
        )
      },
      exportValue: (r) => (r.record ? accountName(r.record.sourceAccountId) : ''),
    },
    {
      accessor: 'waiting',
      header: 'Date',
      render: (r) => {
        if (r.record) {
          return (
            <div>
              <div className="whitespace-nowrap text-sm text-gray-800">{dayjs(r.record.date).format('MMM D, YYYY')}</div>
              <div className="whitespace-nowrap text-xs text-gray-500">{r.record.reference || 'Cash'}</div>
            </div>
          )
        }
        const isLate = r.waiting > LATE_AFTER_DAYS
        return (
          <div>
            <div className={`whitespace-nowrap text-sm ${isLate ? 'font-medium text-amber-600' : 'text-gray-800'}`}>
              {isLate && <AppIcon name="triangle-alert" className="mr-1" />}
              {r.waiting <= 0 ? 'Created today' : `Waiting ${r.waiting} days`}
            </div>
            <div className="whitespace-nowrap text-xs text-gray-500">Loan created</div>
          </div>
        )
      },
      exportValue: (r) => r.record?.date ?? '',
    },
    {
    // the ⋮ menu holds every action; "id" is only used as the accessor
    accessor: 'id',
    header: 'Actions',
    sortable: false,
    align: 'right',
    width: 80,
    render: (r) => (
        // stop the click so the row doesn't also open the drawer
        <div onClick={(e) => e.stopPropagation()}>
        <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
            <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Actions for ${r.applicationNo}`}
            >
                <AppIcon name="ellipsis-vertical" />
            </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
            {/* the main action for this stage */}
            {r.stage === 'PENDING' && canCreate && (
                <Menu.Item
                fw={500}
                leftSection={<AppIcon name="banknote" />}
                onClick={() => openDialog(r)}
                >
                Disburse
                </Menu.Item>
            )}

            {/* disbursed, but the ledger entry failed to post */}
            {r.stage === 'DISBURSED' && r.record?.glStatus === 'PENDING' && canCreate && (
                <Menu.Item
                fw={500}
                leftSection={<AppIcon name="arrow-left-right" />}
                onClick={() => postGl(r)}
                >
                Post to ledger
                </Menu.Item>
            )}

            {/* the divider only shows when there is a main action above it */}
            {(canCreate && (r.stage === 'PENDING' || r.record?.glStatus === 'PENDING')) && <Menu.Divider />}

            <Menu.Item
                leftSection={<AppIcon name="eye" />}
                onClick={() => openView(r.id)}
            >
                View details
            </Menu.Item>
            <Menu.Item
                leftSection={<AppIcon name="file-text" />}
                onClick={() => navigate(`/loan-applications/${r.id}`)}
            >
                Open application
            </Menu.Item>
            </Menu.Dropdown>
        </Menu>
        </div>
    ),
    },
  ]

  return (
    <DashboardLayout
      title="Disbursements"
      subtitle="Record the money paid out for each created loan"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Loans' }, { label: 'Disbursements' }]}
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color="green"
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name="circle-check" />}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">{notice.text}</Text>
              {notice.viewId && (
                <Button
                  size="compact-xs"
                  onClick={() => {
                    openView(notice.viewId!)
                    setNotice(null)
                  }}
                >
                  View details
                </Button>
              )}
            </div>
          </Alert>
        )}

        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        {/* row 2: table in a plain card */}
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CustomTabs
              ariaLabel="Disbursement filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'pending', label: `Pending (${pending.length})` },
                { value: 'disbursed', label: `Disbursed (${disbursed.length})` },
                { value: 'gl', label: `Ledger pending (${glPending.length})` },
                { value: 'all', label: `All (${rows.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              To disburse {formatTzs(sum(pending))} · Disbursed today {formatTzs(sum(todayRows))}
            </Text>
          </div>

          <CustomTable<Row>
            size="md"
            data={tabData[tab]}
            columns={columns}
            searchInput
            searchPlaceholder="Search borrower or application"
            searchKeys={['applicationNo', 'applicantName', 'loanOfficer']}
            // loans waiting longest first
            defaultSort={{ accessor: 'waiting', direction: 'desc' }}
            noRecordText={TAB_EMPTY[tab]}
            onRowClick={(row) => openView(row.id)}
            exportCsv
            exportFileName="disbursements"
            print
            printTitle="Disbursements"
          />
        </div>
      </div>

      {/* details drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.applicantName ?? ''}>
        {selected && (
          <DrawerBody
            row={selected}
            accounts={accounts}
            onDisburse={(r) => {
              closeView()
              openDialog(r)
            }}
            onPostGl={postGl}
            onOpenApplication={(r) => navigate(`/loan-applications/${r.id}`)}
          />
        )}
      </Drawer>

      <DisbursementDialog
        opened={!!dialogRow}
        application={dialogRow ?? null}
        accounts={accounts}
        usedReferences={usedReferences}
        onClose={closeDialog}
        onSubmit={record}
      />
    </DashboardLayout>
  )
}