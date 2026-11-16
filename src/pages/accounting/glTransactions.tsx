import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import { CURRENT_USER, JournalPreview } from '../loans/disbursementDialog'
import { SAMPLE_DISBURSEMENTS, type JournalLine } from '../loans/loanApplicationsData'
import { JournalEntryDialog, type JournalEntryInput } from './journalEntryDialog'
import {
  ACCOUNT_TYPE,
  GL_TYPE,
  GL_TYPES,
  SAMPLE_ACCOUNTS,
  SAMPLE_GL_TRANSACTIONS,
  trialBalanceFor,
  type GlEntry,
  type GlTransaction,
  type GlTransactionType,
  type TrialBalanceRow,
} from './accountingData'
import { usePageAccess } from '../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'transactions' | 'trial'
type TypeFilter = GlTransactionType | 'ALL'
type Notice = { text: string; viewId?: number } | null

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

function TypeBadge({ type }: { type: GlTransactionType }) {
  return (
    <Badge variant="light" color={GL_TYPE[type].color} radius="sm" size="sm">
      {GL_TYPE[type].label}
    </Badge>
  )
}

// "Dr CASH" and "Cr LOAN_RECEIVABLE, INTEREST_INCOME" for the table
function summaryOf(t: GlTransaction) {
  const codes = (side: 'DEBIT' | 'CREDIT') =>
    [...new Set(t.entries.filter((e) => e.entryType === side).map((e) => e.accountCode))].join(', ')
  return { debit: codes('DEBIT'), credit: codes('CREDIT') }
}

// one compact card per transaction type: it is the summary and the filter at the same time
type TypeCardProps = {
  type: GlTransactionType
  count: number
  total: number
  selected: boolean
  onClick: () => void
}

function TypeCard({ type, count, total, selected, onClick }: TypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
        selected ? 'border-brand ring-2 ring-brand' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GL_TYPE[type].hex }} aria-hidden="true" />
          <span className="text-xs font-semibold text-gray-700">{GL_TYPE[type].label}</span>
        </div>
        <span className="text-lg font-semibold leading-none text-gray-800">{count}</span>
      </div>
      <div className="mt-1.5 truncate text-xs text-gray-500">{formatTzs(total)}</div>
    </button>
  )
}

/* ---------- transaction drawer ---------- */

type DrawerProps = {
  transaction: GlTransaction
  onOpenLoan: (t: GlTransaction) => void
  onOpenPayment: (t: GlTransaction) => void
  onOpenAccount: (code: string) => void
}

function TransactionDrawerBody({ transaction: t, onOpenLoan, onOpenPayment, onOpenAccount }: DrawerProps) {
  const isOther = t.transactionType === 'OTHER'

  const lines: JournalLine[] = t.entries.map((e) => ({
    side: e.entryType,
    code: e.accountCode,
    name: e.accountName,
    amount: e.amount,
  }))

  const tiles = [
    { label: 'Total amount', value: formatTzs(t.totalAmount) },
    { label: 'Entries', value: String(t.entries.length) },
    { label: 'Posted on', value: dayjs(t.date).format('MMM D, YYYY') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={t.transactionType} />
        <Badge variant="light" color="green" radius="sm" size="sm">
          Posted
        </Badge>
        <Text size="xs" c="dimmed">
          {t.transactionNo}
          {t.loanNo ? ` · ${t.loanNo}` : ''}
        </Text>
      </div>

      {isOther && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-xs text-gray-500">Description</div>
          <div className="mt-0.5 text-sm font-medium text-gray-800">{t.description}</div>
        </div>
      )}

      <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />}>
        <Text size="sm">
          A posted transaction is final. A mistake is fixed with a reversing entry, never by editing this one.
        </Text>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{x.label}</div>
            <div className="text-base font-medium text-gray-800">{x.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>Journal entry</SectionTitle>
        <JournalPreview lines={lines} />
      </div>

      <div>
        <SectionTitle>Entries</SectionTitle>
        <ul className="mt-2 space-y-2">
          {t.entries.map((e: GlEntry) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
              <Badge variant="light" color={e.entryType === 'DEBIT' ? 'blue' : 'orange'} radius="sm" size="sm">
                {e.entryType === 'DEBIT' ? 'Debit' : 'Credit'}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800">{e.description}</div>
                <button
                  type="button"
                  className="text-xs text-brand-dark hover:underline"
                  onClick={() => onOpenAccount(e.accountCode)}
                >
                  {e.accountCode}
                </button>
              </div>
              <span className="shrink-0 text-sm font-medium text-gray-800">{formatTzs(e.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <SectionTitle>Transaction details</SectionTitle>
        <Field label="Transaction number" value={t.transactionNo} />
        <Field label="Type" value={GL_TYPE[t.transactionType].label} />
        <Field label="Description" value={t.description || '-'} />
        {!isOther && <Field label="Borrower" value={t.borrower} />}
        {!isOther && <Field label="Loan" value={t.loanNo} />}
        {t.paymentId !== null && <Field label="Payment" value={`#${t.paymentId}`} />}
        <Field label="Status" value="Posted" />
        <Field label="Posted by" value={t.postedBy} />
      </div>

      <div className="flex flex-wrap gap-2">
        {t.loanId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => onOpenLoan(t)}>
            View loan
          </Button>
        )}
        {t.paymentId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="credit-card" />} onClick={() => onOpenPayment(t)}>
            View payment
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function GlTransactionsPage() {
  const navigate = useNavigate()
  const { canCreate } = usePageAccess('accounting', 'gl-transactions')
  const [params, setParams] = useSearchParams()

  const [tab, setTab] = useState<TabKey>('transactions')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [entryOpen, setEntryOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  // UI only: the sample ledger plus the entries made in this session, nothing is saved yet
  const [transactions, setTransactions] = useState<GlTransaction[]>(SAMPLE_GL_TRANSACTIONS)
  const all = transactions

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  // /gl-transactions?account=CASH shows only the transactions that touch that account
  // /gl-transactions?view=3 opens the drawer for transaction 3
  const accountFilter = params.get('account')
  const viewParam = params.get('view')

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
    setParams(next, { replace: true })
  }

  const selected = viewParam ? (all.find((t) => String(t.id) === viewParam) ?? null) : null

  const visible = all.filter(
    (t) =>
      (typeFilter === 'ALL' || t.transactionType === typeFilter) &&
      (!accountFilter || t.entries.some((e) => e.accountCode === accountFilter)),
  )

  const allEntries = all.flatMap((t) => t.entries)
  const totalDebit = allEntries.filter((e) => e.entryType === 'DEBIT').reduce((s, e) => s + e.amount, 0)
  const totalCredit = allEntries.filter((e) => e.entryType === 'CREDIT').reduce((s, e) => s + e.amount, 0)
  const balanced = totalDebit === totalCredit
  const thisMonth = all.filter((t) => dayjs(t.date).isSame(dayjs(), 'month'))

  const typeTotals = GL_TYPES.map((type) => {
    const list = all.filter((t) => t.transactionType === type)
    return { type, count: list.length, total: list.reduce((s, t) => s + t.totalAmount, 0) }
  })

  // the trial balance covers the same ledger
  const trialRows: TrialBalanceRow[] = trialBalanceFor(all).sort((a, b) => a.accountCode.localeCompare(b.accountCode))

  // disbursements that were recorded but not posted to the ledger yet
  const pending = Object.values(SAMPLE_DISBURSEMENTS).filter((d) => d.glStatus === 'PENDING')

  // here `color` is the icon color
  const stats = [
    { label: 'Transactions Posted', value: all.length, icon: 'book', color: '#45bdfc' },
    { label: 'Posted This Month', value: thisMonth.length, icon: 'calendar-check', color: '#0077b5' },
    { label: 'Total Posted', value: formatTzs(totalDebit), icon: 'banknote', color: '#8e44ad' },
    { label: 'Trial Balance', value: balanced ? 'Balanced' : 'Not balanced', icon: 'scale', color: balanced ? 'var(--app-brand)' : '#ef4444' },
  ]

  const pickType = (t: GlTransactionType) => setTypeFilter((current) => (current === t ? 'ALL' : t))

  const clearFilters = () => {
    setTypeFilter('ALL')
    update({ account: null })
  }

  // a trial balance row shows that account's transactions
  const showAccount = (code: string) => {
    update({ account: code, view: null })
    setTypeFilter('ALL')
    setTab('transactions')
  }

  const filterLabel = [
    typeFilter === 'ALL' ? 'All transactions' : `${GL_TYPE[typeFilter].label} transactions`,
    accountFilter ? `on ${accountFilter}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  /* ---------- actions ---------- */

  const createEntry = (input: JournalEntryInput) => {
    // TODO: needs a new endpoint, see the note in the dialog. The API only posts loan events today.
    const id = Math.max(0, ...transactions.map((t) => t.id)) + 1
    let entryId = Math.max(0, ...transactions.flatMap((t) => t.entries.map((e) => e.id))) + 1

    const entries: GlEntry[] = input.lines.map((l) => ({
      id: entryId++,
      glTransactionId: id,
      accountCode: l.accountCode,
      accountName: SAMPLE_ACCOUNTS.find((a) => a.accountCode === l.accountCode)?.accountName ?? l.accountCode,
      entryType: l.entryType,
      amount: l.amount,
      description: input.description,
    }))

    const created: GlTransaction = {
      id,
      transactionNo: `GLT-${String(id).padStart(5, '0')}`,
      transactionType: 'OTHER',
      loanId: null,
      loanNo: '',
      borrower: '',
      paymentId: null,
      totalAmount: entries.filter((e) => e.entryType === 'DEBIT').reduce((s, e) => s + e.amount, 0),
      status: 'POSTED',
      date: input.date,
      postedBy: CURRENT_USER,
      description: input.description,
      entries,
    }

    setTransactions((list) => [created, ...list])
    setNotice({ text: `${created.transactionNo} was posted: ${formatTzs(created.totalAmount)}. ${input.description}`, viewId: id })
    setTab('transactions')
    setTypeFilter('ALL')
    setEntryOpen(false)
  }

  /* ---------- columns ---------- */

  const columns: CustomTableColumn<GlTransaction>[] = [
    {
      accessor: 'transactionNo',
      header: 'Transaction',
      render: (t) => (
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-semibold text-gray-800">{t.transactionNo}</div>
          <div className="truncate text-xs text-gray-500">
            {t.transactionType === 'OTHER' ? 'Not linked to a loan' : `${t.loanNo} · ${t.borrower}`}
          </div>
        </div>
      ),
      exportValue: (t) =>
        t.transactionType === 'OTHER' ? t.transactionNo : `${t.transactionNo} (${t.loanNo}, ${t.borrower})`,
    },
    {
      accessor: 'transactionType',
      header: 'Type',
      sortable: false,
      width: 140,
      render: (t) => (
        <span className="whitespace-nowrap">
          <TypeBadge type={t.transactionType} />
        </span>
      ),
      exportValue: (t) => GL_TYPE[t.transactionType].label,
    },
    {
      // only an Other entry has a description, every other type shows a dash
      accessor: 'description',
      header: 'Description',
      render: (t) =>
        t.transactionType === 'OTHER' && t.description ? (
          <div className="max-w-[260px] truncate text-sm text-gray-800" title={t.description}>
            {t.description}
          </div>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        ),
      exportValue: (t) => t.description || '-',
    },
    {
      accessor: 'entries',
      header: 'Journal',
      sortable: false,
      render: (t) => {
        const s = summaryOf(t)
        return (
          <div className="min-w-0">
            <div className="truncate text-xs text-gray-800">
              <span className="mr-1 font-semibold text-blue-600">Dr</span>
              {s.debit}
            </div>
            <div className="truncate text-xs text-gray-500">
              <span className="mr-1 font-semibold text-orange-600">Cr</span>
              {s.credit}
            </div>
          </div>
        )
      },
      exportValue: (t) => {
        const s = summaryOf(t)
        return `Dr ${s.debit} / Cr ${s.credit}`
      },
    },
    {
      accessor: 'totalAmount',
      header: 'Amount',
      render: (t) => <span className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(t.totalAmount)}</span>,
      exportValue: (t) => t.totalAmount,
    },
    { accessor: 'date', header: 'Date', type: 'date' },
    {
      accessor: 'status',
      header: 'Status',
      sortable: false,
      render: () => (
        <Badge variant="light" color="green" radius="sm" size="sm">
          Posted
        </Badge>
      ),
      exportValue: () => 'Posted',
    },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (t) => (
        // stop the click so the row doesn't also open the drawer
        <div onClick={(e) => e.stopPropagation()}>
          <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${t.transactionNo}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item fw={500} leftSection={<AppIcon name="eye" />} onClick={() => update({ view: String(t.id) })}>
                View entries
              </Menu.Item>
              {(t.loanId !== null || t.paymentId !== null) && <Menu.Divider />}
              {t.loanId !== null && (
                <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${t.loanId}`)}>
                  View loan
                </Menu.Item>
              )}
              {t.paymentId !== null && (
                <Menu.Item leftSection={<AppIcon name="credit-card" />} onClick={() => navigate(`/payments?view=${t.paymentId}`)}>
                  View payment
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  const trialColumns: CustomTableColumn<TrialBalanceRow>[] = [
    {
      accessor: 'accountCode',
      header: 'Account',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-semibold text-gray-800">{r.accountCode}</div>
          <div className="truncate text-xs text-gray-500">{r.accountName}</div>
        </div>
      ),
      exportValue: (r) => `${r.accountCode} (${r.accountName})`,
    },
    {
      accessor: 'accountType',
      header: 'Type',
      sortable: false,
      render: (r) => (
        <Badge variant="light" color={ACCOUNT_TYPE[r.accountType].color} radius="sm" size="sm">
          {ACCOUNT_TYPE[r.accountType].label}
        </Badge>
      ),
      exportValue: (r) => ACCOUNT_TYPE[r.accountType].label,
    },
    {
      accessor: 'totalDebit',
      header: 'Total debit',
      render: (r) => <span className="whitespace-nowrap text-sm text-gray-800">{r.totalDebit > 0 ? formatTzs(r.totalDebit) : '—'}</span>,
      exportValue: (r) => r.totalDebit,
    },
    {
      accessor: 'totalCredit',
      header: 'Total credit',
      render: (r) => <span className="whitespace-nowrap text-sm text-gray-800">{r.totalCredit > 0 ? formatTzs(r.totalCredit) : '—'}</span>,
      exportValue: (r) => r.totalCredit,
    },
    {
      accessor: 'netBalance',
      header: 'Net balance',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(Math.abs(r.netBalance))}</div>
          <div className="text-xs text-gray-500">{r.netBalance === 0 ? 'Nil' : r.netBalance > 0 ? 'Debit' : 'Credit'}</div>
        </div>
      ),
      exportValue: (r) => r.netBalance,
    },
  ]

  return (
    <DashboardLayout
      title="GL Transactions"
      subtitle="Every double-entry posting, from loan events and from other entries made by hand"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Accounting' }, { label: 'GL Transactions' }]}
      actions={
        <>
          <Button size="xs" variant="default" leftSection={<AppIcon name="list-ordered" />} onClick={() => navigate('/chart-of-accounts')}>
            Chart of accounts
          </Button>
          {canCreate && (
            <Button size="xs" leftSection={<AppIcon name="plus" />} onClick={() => setEntryOpen(true)}>
              New journal entry
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {notice && (
          <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">{notice.text}</Text>
              {notice.viewId && (
                <Button
                  size="compact-xs"
                  onClick={() => {
                    update({ view: String(notice.viewId) })
                    setNotice(null)
                  }}
                >
                  View entries
                </Button>
              )}
            </div>
          </Alert>
        )}

        {pending.length > 0 && (
          <Alert color="orange" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {pending.length} {pending.length === 1 ? 'disbursement was' : 'disbursements were'} recorded but{' '}
                {pending.length === 1 ? 'is' : 'are'} not posted to the ledger yet.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => navigate(`/loan-disbursements?view=${pending[0].applicationId}`)}>
                Open disbursement
              </Button>
            </div>
          </Alert>
        )}

        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        {/* row 2: the transaction types, they summarise the ledger and filter the table */}
        {tab === 'transactions' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {typeTotals.map((t) => (
              <TypeCard
                key={t.type}
                type={t.type}
                count={t.count}
                total={t.total}
                selected={typeFilter === t.type}
                onClick={() => pickType(t.type)}
              />
            ))}
          </div>
        )}

        {/* row 3: table in a plain card */}
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CustomTabs
              ariaLabel="Accounting tabs"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'transactions', label: `Transactions (${all.length})` },
                { value: 'trial', label: `Trial balance (${trialRows.length})` },
              ]}
            />

            {tab === 'transactions' && (typeFilter !== 'ALL' || accountFilter) && (
              <Button size="compact-xs" variant="subtle" color="gray" onClick={clearFilters}>
                Clear filter
              </Button>
            )}
          </div>

          {tab === 'transactions' ? (
            <>
              <Text size="xs" c="dimmed" mb="xs">
                {filterLabel} · showing {visible.length} of {all.length} · Posted entries cannot be edited
              </Text>

              <CustomTable<GlTransaction>
                size="md"
                data={visible}
                columns={columns}
                searchInput
                searchPlaceholder="Search transaction, loan, borrower or description"
                searchKeys={['transactionNo', 'loanNo', 'borrower', 'description']}
                filters={{ date: 'date' }}
                // the newest postings first
                defaultSort={{ accessor: 'date', direction: 'desc' }}
                noRecordText="No transactions match this filter"
                onRowClick={(row) => update({ view: String(row.id) })}
                exportCsv
                exportFileName="gl-transactions"
                print
                printTitle="GL Transactions"
              />
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-gray-50 px-4 py-3">
                <Badge variant="light" color={balanced ? 'green' : 'red'} radius="sm" size="sm">
                  {balanced ? 'Balanced' : 'Not balanced'}
                </Badge>
                <span className="text-sm text-gray-700">
                  Total debit <span className="font-medium">{formatTzs(totalDebit)}</span>
                </span>
                <span className="text-sm text-gray-700">
                  Total credit <span className="font-medium">{formatTzs(totalCredit)}</span>
                </span>
                <Text size="xs" c="dimmed" className="sm:ml-auto">
                  Built from posted entries only, so it differs from the account balances on the chart. Click an account
                  to see its transactions.
                </Text>
              </div>

              <CustomTable<TrialBalanceRow>
                size="md"
                data={trialRows}
                columns={trialColumns}
                searchInput
                searchPlaceholder="Search account"
                searchKeys={['accountCode', 'accountName']}
                defaultSort={{ accessor: 'accountCode', direction: 'asc' }}
                noRecordText="No entries have been posted yet"
                onRowClick={(row) => showAccount(row.accountCode)}
                exportCsv
                exportFileName="gl-trial-balance"
                print
                printTitle="GL Trial Balance"
              />
            </>
          )}
        </div>
      </div>

      {/* transaction drawer */}
      <Drawer opened={!!selected} onClose={() => update({ view: null })} position="right" size="lg" title={selected?.transactionNo ?? ''}>
        {selected && (
          <TransactionDrawerBody
            transaction={selected}
            onOpenLoan={(t) => navigate(`/loans/${t.loanId}`)}
            onOpenPayment={(t) => navigate(`/payments?view=${t.paymentId}`)}
            onOpenAccount={(code) => showAccount(code)}
          />
        )}
      </Drawer>

      <JournalEntryDialog
        opened={entryOpen}
        accounts={SAMPLE_ACCOUNTS}
        onClose={() => setEntryOpen(false)}
        onSubmit={createEntry}
      />
    </DashboardLayout>
  )
}