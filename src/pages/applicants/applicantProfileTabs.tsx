import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Stepper, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import {
  REQUIRED_DOCUMENTS,
  STATUS,
  accountsFor,
  debtsFor,
  documentsFor,
  financialFor,
  loansFor,
  kycHistoryFor,
  type Applicant,
  type ApplicantAccount,
  type ApplicantDocument,
  type ExistingDebt,
  type FinancialProfile,
  type LoanRow,
  type ActivityEvent
} from './applicantsData'
import { MemberAccountDialog, type AccountInput } from './memberAccountDialog'
import { DebtDialog, FinancialProfileDialog, type DebtInput } from './financialDialogs'
import { CURRENT_USER } from '../loans/disbursementDialog'
import { DocumentViewer } from '../../components/documentViewer'
import { DocumentDialog, isImage, sizeText, type DocumentInput } from './documentDialogs'
import { Can } from '../auth/requirePermission'
import { IdentificationSection } from './identificationSection'
import { ErrorState, LoadingState } from '../../components/pageState'
import { useApplicantHistory } from '../../api/applicants'
import { useUserNames } from '../../api/users'

/* ---------- small helpers ---------- */

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

// the label and icon for each status an applicant can move to
const STAGE_EVENT: Record<string, { title: string; icon: string }> = {
  PENDING_OTP: { title: 'Applicant registered', icon: 'user-round-plus' },
  PENDING_KYC: { title: 'OTP verified', icon: 'shield' },
  KYC_APPROVED: { title: 'KYC approved', icon: 'circle-check' },
  REJECTED: { title: 'KYC rejected', icon: 'circle-x' },
}

// SOME_STATUS -> Some status
const humanize = (text: string) => {
  const spaced = text.replace(/_/g, ' ').trim().toLowerCase()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Status changed'
}

function Timeline({ applicant, limit }: { applicant: Applicant; limit?: number }) {
  // GET /api/applicant-status-historys/applicant/{id}
  const history = useApplicantHistory(applicant.id)
  const names = useUserNames()

  if (history.isLoading) return <LoadingState rows={3} />
  if (history.error) {
    return <ErrorState compact message={history.error.message} onRetry={() => void history.refetch()} />
  }

  // newest first
  const rows = [...(history.data ?? [])].sort(
    (a, b) => (b.changedAt ?? '').localeCompare(a.changedAt ?? '') || b.id - a.id,
  )

  // an applicant registered before the history existed has no rows, so the registration is shown from the record
  const events: ActivityEvent[] =
    rows.length === 0
      ? [{ title: 'Applicant registered', detail: `Application number ${applicant.applicantNo}`, date: applicant.registered, icon: 'user-round-plus' }]
      : rows.map((r) => {
          const info = STAGE_EVENT[r.newStatus ?? ''] ?? { title: humanize(r.newStatus ?? ''), icon: 'clipboard' }
          const who = r.changedBy != null ? `by ${names.get(r.changedBy) ?? `User #${r.changedBy}`}` : ''
          const detail =
            [r.remarks, who].filter(Boolean).join(' · ') || (r.oldStatus ? `${r.oldStatus} → ${r.newStatus}` : '')
          return { title: info.title, detail, date: r.changedAt ?? '', icon: info.icon }
        })

  return (
    <ul className="space-y-4">
      {events.slice(0, limit).map((e, i) => (
        <li key={`${e.title}-${i}`} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <AppIcon name={e.icon} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3">
              <span className="text-sm font-medium text-gray-800">{e.title}</span>
              <span className="shrink-0 text-xs text-gray-400">{e.date ? dayjs(e.date).format('MMM D, YYYY') : ''}</span>
            </div>
            <div className="text-xs text-gray-500">{e.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------- tabs ---------- */

export function OverviewTab({ applicant }: { applicant: Applicant }) {
  const history = useApplicantHistory(applicant.id)
  // the date the applicant reached a status, the latest one if it happened twice
  const reachedOn = (status: string) => {
    const row = [...(history.data ?? [])].reverse().find((h) => h.newStatus === status)
    return row?.changedAt ? dayjs(row.changedAt).format('MMM D, YYYY') : undefined
  }

  const loans = loansFor(applicant)
  const active = loans.filter((l) => l.status === 'Active')
  const outstanding = active.reduce((sum, l) => sum + l.outstanding, 0)

  const tiles = [
    { label: 'Applications', value: loans.length },
    { label: 'Active loans', value: active.length },
    { label: 'Outstanding', value: formatTzs(outstanding) },
  ]

  return (
    <div className="space-y-6">
      <Stepper
        active={STATUS[applicant.status].step}
        size="xs"
        color={applicant.status === 'REJECTED' ? 'red' : 'brand'}
      >
        <Stepper.Step label="Registered" description={reachedOn('PENDING_OTP')} />
        <Stepper.Step label="OTP verified" description={reachedOn('PENDING_KYC')} />
        <Stepper.Step label="KYC approved" description={reachedOn('KYC_APPROVED')} />
      </Stepper>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-xl font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>Recent activity</SectionTitle>
        <div className="mt-3">
          <Timeline applicant={applicant} limit={3} />
        </div>
      </div>
    </div>
  )
}

type DocDialog = 'add' | { kind: 'replace' | 'remove'; id: number } | null

export function KycTab({
  applicant,
  onReview,
  onRecheck,
}: {
  applicant: Applicant
  onReview?: () => void
  onRecheck?: () => void
}) {
  const approvedOn = dayjs(applicant.registered).add(1, 'day')
  const history = kycHistoryFor(applicant)

  // UI only: changes made in this session, nothing is saved yet
  const [docs, setDocs] = useState<ApplicantDocument[]>(() => documentsFor(applicant))
  const [dialog, setDialog] = useState<DocDialog>(null)
  const [viewing, setViewing] = useState<ApplicantDocument | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const target = dialog && typeof dialog === 'object' ? docs.find((d) => d.id === dialog.id) : undefined
  const missing = REQUIRED_DOCUMENTS.filter((t) => !docs.some((d) => d.type === t))

  const save = (input: DocumentInput) => {
    const today = dayjs().format('YYYY-MM-DD')
    if (dialog === 'add') {
      const id = Math.max(0, ...docs.map((d) => d.id)) + 1
      setDocs((list) => [...list, { id, ...input, uploaded: today, uploadedBy: CURRENT_USER }])
      setNotice(`${input.type} was uploaded.`)
    } else if (target) {
      setDocs((list) =>
        list.map((d) => (d.id === target.id ? { ...d, ...input, uploaded: today, uploadedBy: CURRENT_USER } : d)),
      )
      setNotice(`${target.type} was replaced.`)
    }
    setDialog(null)
  }

  const remove = () => {
    if (!target || REQUIRED_DOCUMENTS.includes(target.type)) return
    // TODO: DELETE /api/applicant-documents/{id}
    setDocs((list) => list.filter((d) => d.id !== target.id))
    setNotice(`${target.type} was removed.`)
    setDialog(null)
  }

  return (
    <div className="space-y-6">
      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
          <Text size="sm">{notice}</Text>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>KYC status</SectionTitle>
          <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm">
            <span className="text-gray-500">Status</span>
            <Badge variant="light" color={STATUS[applicant.status].color} radius="sm" size="sm">
              {STATUS[applicant.status].label}
            </Badge>
          </div>
          <Field label="Type" value={applicant.isReturning ? 'Returning' : 'New'} />
          {applicant.status === 'KYC_APPROVED' && (
            <Field label="Valid until" value={approvedOn.add(12, 'month').format('MMM D, YYYY')} />
          )}

          <IdentificationSection applicant={applicant} />

          {(applicant.status === 'PENDING_KYC' || (applicant.isReturning && applicant.status !== 'REJECTED')) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {applicant.status === 'PENDING_KYC' && onReview && (
                <Button size="xs" leftSection={<AppIcon name="contact-round" />} onClick={onReview}>
                  Review KYC
                </Button>
              )}
              {/* {applicant.isReturning && applicant.status !== 'REJECTED' && onRecheck && (
                <Button size="xs" variant="default" leftSection={<AppIcon name="refresh-cw" />} onClick={onRecheck}>
                  Re-check KYC
                </Button>
              )} */}
              {applicant.isReturning && onRecheck && (
                  <Button size="xs" variant="default" leftSection={<AppIcon name="refresh-cw" />} onClick={onRecheck}>
                    Re-check KYC
                  </Button>
                )}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionTitle>{`Documents (${docs.length})`}</SectionTitle>
            <Can area="applicants" page="applicants" action="edit">
              <Button size="xs" variant="default" leftSection={<AppIcon name="upload" />} onClick={() => setDialog('add')}>
                Upload
              </Button>
            </Can>
          </div>

          {missing.length > 0 && (
            <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />} mb="xs">
              <Text size="xs">Required document missing: {missing.join(', ')}.</Text>
            </Alert>
          )}

          {docs.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
              No documents have been uploaded.
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                  <AppIcon name={isImage(d.fileName) ? 'file-image' : 'file-text'} className="text-gray-400" size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{d.type}</span>
                      {REQUIRED_DOCUMENTS.includes(d.type) && (
                        <Badge variant="outline" color="gray" radius="sm" size="xs">
                          Required
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {d.fileName} · {sizeText(d.sizeKb)} · {dayjs(d.uploaded).format('MMM D, YYYY')}
                    </div>
                  </div>
                  <Button size="xs" variant="subtle" color="brand" onClick={() => setViewing(d)}>
                    View
                  </Button>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Replace ${d.type}`} onClick={() => setDialog({ kind: 'replace', id: d.id })}>
                    <AppIcon name="refresh-cw" />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    disabled={REQUIRED_DOCUMENTS.includes(d.type)}
                    title={REQUIRED_DOCUMENTS.includes(d.type) ? 'Required documents can only be replaced' : undefined}
                    aria-label={`Remove ${d.type}`}
                    onClick={() => setDialog({ kind: 'remove', id: d.id })}
                  >
                    <AppIcon name="trash" />
                  </ActionIcon>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

            <div>
        <SectionTitle>{`KYC history (${history.length})`}</SectionTitle>
        {history.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
            No KYC decision has been recorded yet.
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((r) => {
              const expired =
                r.status === 'APPROVED' && r.expiresAt !== null && dayjs(r.expiresAt).isBefore(dayjs(), 'day')
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <AppIcon name={r.status === 'APPROVED' ? 'circle-check' : 'circle-x'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {r.verificationType === 'FULL_KYC' ? 'Full KYC' : 'Returning check'}
                      </span>
                      <Badge variant="light" color={r.status === 'APPROVED' ? 'green' : 'red'} radius="sm" size="sm">
                        {r.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                      </Badge>
                      {r.status === 'APPROVED' && (
                        <Badge variant="outline" color={expired ? 'gray' : 'brand'} radius="sm" size="sm">
                          {expired ? 'Expired' : 'Valid'}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {dayjs(r.date).format('MMM D, YYYY')} · by {r.verifiedBy}
                      {r.expiresAt ? ` · until ${dayjs(r.expiresAt).format('MMM D, YYYY')}` : ''}
                    </div>
                    {r.remarks && <div className="mt-0.5 text-xs text-gray-600">"{r.remarks}"</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <DocumentDialog
        opened={dialog === 'add' || (typeof dialog === 'object' && dialog?.kind === 'replace')}
        document={typeof dialog === 'object' && dialog?.kind === 'replace' ? (target ?? null) : null}
        existingTypes={docs.map((d) => d.type)}
        onClose={() => setDialog(null)}
        onSubmit={save}
      />

      <DocumentViewer
        document={
          viewing
            ? {
                title: viewing.type,
                fileName: viewing.fileName,
                subtitle: `Uploaded ${dayjs(viewing.uploaded).format('MMM D, YYYY')} by ${viewing.uploadedBy}`,
                notes: viewing.notes,
                file: viewing.file,
              }
            : null
        }
        onClose={() => setViewing(null)}
      />

      <ContractConfirmDialog
        opened={typeof dialog === 'object' && dialog?.kind === 'remove' && !!target}
        title="Remove document"
        message={`Remove the ${target?.type ?? 'document'} (${target?.fileName ?? ''})? This cannot be undone.`}
        confirmLabel="Remove document"
        onClose={() => setDialog(null)}
        onConfirm={remove}
      />
    </div>
  )
}

type FinancialDialog = 'profile' | 'debt-add' | { kind: 'debt-edit' | 'debt-remove'; id: number } | null

export function FinancialTab({ applicant }: { applicant: Applicant }) {
  // UI only: changes made in this session, nothing is saved yet
  const [profile, setProfile] = useState<FinancialProfile | null>(() => financialFor(applicant))
  const [debts, setDebts] = useState<ExistingDebt[]>(() => debtsFor(applicant))
  const [dialog, setDialog] = useState<FinancialDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const debtDialog = dialog && typeof dialog === 'object' ? debts.find((d) => d.id === dialog.id) : undefined

  const totalBalance = debts.reduce((s, d) => s + d.balance, 0)
  const totalMonthly = debts.reduce((s, d) => s + d.monthly, 0)
  const cashFlow = profile ? profile.monthlyIncome - profile.monthlyExpenses : 0
  const afterDebts = cashFlow - totalMonthly

  const saveProfile = (input: FinancialProfile) => {
    // TODO: POST or PUT /api/financial-profiles
    setProfile(input)
    setNotice('The financial profile was saved.')
    setDialog(null)
  }

  const saveDebt = (input: DebtInput) => {
    // TODO: POST /api/existing-debts, or PUT /api/existing-debts/{id}
    if (dialog === 'debt-add') {
      const id = Math.max(0, ...debts.map((d) => d.id)) + 1
      setDebts((list) => [...list, { id, ...input }])
      setNotice(`The debt with ${input.lender} was added.`)
    } else if (debtDialog) {
      setDebts((list) => list.map((d) => (d.id === debtDialog.id ? { ...d, ...input } : d)))
      setNotice(`The debt with ${input.lender} was updated.`)
    }
    setDialog(null)
  }

  const removeDebt = () => {
    if (!debtDialog) return
    // TODO: DELETE /api/existing-debts/{id}
    setDebts((list) => list.filter((d) => d.id !== debtDialog.id))
    setNotice(`The debt with ${debtDialog.lender} was removed.`)
    setDialog(null)
  }

  const tiles = [
    { label: 'Monthly cash flow', value: profile ? formatTzs(cashFlow) : '—' },
    { label: 'Debt payments per month', value: formatTzs(totalMonthly) },
    { label: 'Left after debts', value: profile ? formatTzs(afterDebts) : '—', warn: !!profile && afterDebts < 0 },
  ]

  return (
    <div className="space-y-6">
      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
          <Text size="sm">{notice}</Text>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className={`text-base font-medium ${t.warn ? 'text-red-600' : 'text-gray-800'}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* financial profile */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionTitle>Financial profile</SectionTitle>
            <Button
              size="xs"
              variant="default"
              leftSection={<AppIcon name={profile ? 'pencil' : 'plus'} />}
              onClick={() => setDialog('profile')}
            >
              {profile ? 'Edit' : 'Add profile'}
            </Button>
          </div>

          {profile ? (
            <>
              <Field label="Employment type" value={profile.employmentType} />
              <Field label="Employer" value={profile.employer || '—'} />
              <Field label="Monthly income" value={formatTzs(profile.monthlyIncome)} />
              <Field label="Monthly expenses" value={formatTzs(profile.monthlyExpenses)} />
              <Field label="Dependants" value={String(profile.dependants)} />
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
              No financial profile has been added yet.
            </div>
          )}
        </div>

        {/* existing debts */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionTitle>{`Existing debts (${debts.length})`}</SectionTitle>
            <Button size="xs" variant="default" leftSection={<AppIcon name="plus" />} onClick={() => setDialog('debt-add')}>
              Add debt
            </Button>
          </div>

          {debts.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
              No existing debts recorded.
            </div>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {debts.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800">{d.lender}</div>
                      <div className="text-xs text-gray-500">{formatTzs(d.monthly)} per month</div>
                    </div>
                    <span className="shrink-0 font-medium text-gray-800">{formatTzs(d.balance)}</span>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={`Edit debt with ${d.lender}`}
                      onClick={() => setDialog({ kind: 'debt-edit', id: d.id })}
                    >
                      <AppIcon name="pencil" />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label={`Remove debt with ${d.lender}`}
                      onClick={() => setDialog({ kind: 'debt-remove', id: d.id })}
                    >
                      <AppIcon name="trash" />
                    </ActionIcon>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Total owed</span>
                <span className="font-medium text-gray-800">{formatTzs(totalBalance)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <FinancialProfileDialog
        opened={dialog === 'profile'}
        profile={profile}
        onClose={() => setDialog(null)}
        onSubmit={saveProfile}
      />

      <DebtDialog
        opened={dialog === 'debt-add' || (typeof dialog === 'object' && dialog?.kind === 'debt-edit')}
        debt={typeof dialog === 'object' && dialog?.kind === 'debt-edit' ? (debtDialog ?? null) : null}
        onClose={() => setDialog(null)}
        onSubmit={saveDebt}
      />

      <ContractConfirmDialog
        opened={typeof dialog === 'object' && dialog?.kind === 'debt-remove' && !!debtDialog}
        title="Remove debt"
        message={`Remove the debt with ${debtDialog?.lender ?? 'this lender'}? It will no longer count in credit assessments.`}
        confirmLabel="Remove debt"
        onClose={() => setDialog(null)}
        onConfirm={removeDebt}
      />
    </div>
  )
}

type AccountDialog = 'add' | { kind: 'edit' | 'remove'; id: number } | null

export function AccountsTab({ applicant }: { applicant: Applicant }) {
  // UI only: changes made in this session, nothing is saved yet
  const [accounts, setAccounts] = useState<ApplicantAccount[]>(() => accountsFor(applicant))
  const [dialog, setDialog] = useState<AccountDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const target = dialog && typeof dialog === 'object' ? accounts.find((a) => a.id === dialog.id) : undefined
  const label = (a: ApplicantAccount) => `${a.provider} ${a.number}`

  const save = (input: AccountInput) => {
    // TODO: POST /api/member-accounts, or PUT /api/member-accounts/{id}
    if (dialog === 'add') {
      const id = Math.max(0, ...accounts.map((a) => a.id)) + 1
      // the first account is always the primary one
      const primary = input.primary || accounts.length === 0
      setAccounts((list) => [...list.map((a) => (primary ? { ...a, primary: false } : a)), { id, ...input, primary }])
      setNotice(`${input.provider} was added.`)
    } else if (target) {
      const primary = input.primary || target.primary
      setAccounts((list) =>
        list.map((a) => (a.id === target.id ? { ...a, ...input, primary } : primary ? { ...a, primary: false } : a)),
      )
      setNotice(`${input.provider} was updated.`)
    }
    setDialog(null)
  }

  const makePrimary = (a: ApplicantAccount) => {
    // TODO: PUT /api/member-accounts/{id} for the old and the new primary account
    setAccounts((list) => list.map((x) => ({ ...x, primary: x.id === a.id })))
    setNotice(`${label(a)} is now the primary account.`)
  }

  const remove = () => {
    if (!target) return
    // TODO: DELETE /api/member-accounts/{id}
    const rest = accounts.filter((a) => a.id !== target.id)
    // if the primary one is removed, the first remaining account takes over
    setAccounts(target.primary && rest.length > 0 ? rest.map((a, i) => ({ ...a, primary: i === 0 })) : rest)
    setNotice(`${label(target)} was removed.`)
    setDialog(null)
  }

  return (
    <div className="space-y-4">
      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
          <Text size="sm">{notice}</Text>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <SectionTitle>{`Member accounts (${accounts.length})`}</SectionTitle>
          <p className="text-xs text-gray-500">Accounts that approved loans are paid into.</p>
        </div>
        <Button size="xs" variant="default" leftSection={<AppIcon name="plus" />} onClick={() => setDialog('add')}>
          Add account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
          No account has been added yet. A loan cannot be disbursed until the borrower has one.
        </div>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-3">
              <AppIcon
                name={a.method === 'BANK_TRANSFER' ? 'landmark' : 'smartphone'}
                className="w-6 text-center text-xl text-gray-400"
                size={24}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800">{a.provider}</div>
                <div className="text-xs text-gray-500">
                  {a.method === 'BANK_TRANSFER' ? 'Bank account' : 'Mobile money'} · {a.number}
                </div>
              </div>
              {a.primary ? (
                <Badge variant="light" color="brand" radius="sm" size="sm">
                  Primary
                </Badge>
              ) : (
                <Button size="compact-xs" variant="subtle" color="brand" onClick={() => makePrimary(a)}>
                  Make primary
                </Button>
              )}
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Edit ${label(a)}`} onClick={() => setDialog({ kind: 'edit', id: a.id })}>
                <AppIcon name="pencil" />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Remove ${label(a)}`} onClick={() => setDialog({ kind: 'remove', id: a.id })}>
                <AppIcon name="trash" />
              </ActionIcon>
            </li>
          ))}
        </ul>
      )}

      <MemberAccountDialog
        opened={dialog === 'add' || (typeof dialog === 'object' && dialog?.kind === 'edit')}
        account={typeof dialog === 'object' && dialog?.kind === 'edit' ? (target ?? null) : null}
        existingNumbers={accounts.map((a) => a.number)}
        onClose={() => setDialog(null)}
        onSubmit={save}
      />

      <ContractConfirmDialog
        opened={typeof dialog === 'object' && dialog?.kind === 'remove' && !!target}
        title="Remove account"
        message={`Remove ${target ? label(target) : 'this account'}? It will no longer be offered when a loan is disbursed.`}
        confirmLabel="Remove account"
        onClose={() => setDialog(null)}
        onConfirm={remove}
      />
    </div>
  )
}

const loanColumns: CustomTableColumn<LoanRow>[] = [
  { accessor: 'ref', header: 'Reference' },
  { accessor: 'product', header: 'Product' },
  {
    accessor: 'amount',
    header: 'Amount',
    render: (r) => <Text size="sm">{formatTzs(r.amount)}</Text>,
  },
  {
    accessor: 'status',
    header: 'Status',
    render: (r) => (
      <Badge variant="light" color={r.status === 'Active' ? 'green' : 'yellow'} radius="sm" size="sm">
        {r.status}
      </Badge>
    ),
  },
  { accessor: 'date', header: 'Date', type: 'date' },
]

export function LoansTab({ applicant }: { applicant: Applicant }) {
  return (
    <CustomTable<LoanRow>
      size="sm"
      data={loansFor(applicant)}
      columns={loanColumns}
      pagination={false}
      defaultSort={{ accessor: 'date', direction: 'desc' }}
      noRecordText="No loans or applications yet"
    />
  )
}

export function ActivityTab({ applicant }: { applicant: Applicant }) {
  return <Timeline applicant={applicant} />
}