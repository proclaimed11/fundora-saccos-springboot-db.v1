import { AppIcon, stepIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Stepper, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { formatTzs } from '../../utils/format'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import {
  REQUIRED_DOCUMENTS,
  STATUS,
  type Applicant,
  type ApplicantAccount,
  type FinancialProfile,
  type ActivityEvent
} from './applicantsData'
import { useNavigate } from 'react-router-dom'
import { useApplicantLoans, useLoanApplications } from '../../api/loanApplications'
import { STATUS as LOAN_STATUS, type ApplicationStatus } from '../loans/loanApplicationsData'
import { MemberAccountDialog, type AccountInput } from './memberAccountDialog'
import { DebtDialog, FinancialProfileDialog, type DebtInput } from './financialDialogs'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { DocumentDialog, isImage, sizeText, type DocumentInput } from './documentDialogs'
import { Can } from '../auth/requirePermission'
import { IdentificationSection } from './identificationSection'
import { ErrorState, LoadingState } from '../../components/pageState'
import { fileUrl, useApplicantHistory, useIdentifications } from '../../api/applicants'
import {
  useApplicantDocuments,
  useDeleteAccount,
  useDeleteDebt,
  useDeleteDocument,
  useExistingDebts,
  useFinancialProfile,
  useKycHistory,
  useMemberAccounts,
  useSaveAccount,
  useSaveDocument,
  useSaveDebt,
  useSaveFinancialProfile,
  type DocumentRecord,
} from '../../api/applicantRecords'
import { useUserNames } from '../../api/users'
import { useAuth } from '../../auth/authContext'

// the message of a failed save, shown in a red alert
const failText = (err: unknown) => (err instanceof Error ? err.message : 'Could not save. Please try again.')

function FailAlert({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null
  return (
    <Alert color="red" variant="light" withCloseButton onClose={onClose} icon={<AppIcon name="circle-x" />}>
      <Text size="sm">{text}</Text>
    </Alert>
  )
}

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
  PERSONAL_DETAILS: { title: 'Personal details saved', icon: 'user-round' },
  ADDRESS_DETAILS: { title: 'Address saved', icon: 'map-pin' },
  IDENTITY_VERIFICATION: { title: 'Identity saved', icon: 'file-user' },
  OTP_VERIFIED: { title: 'OTP verified', icon: 'shield' },
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
  const reachedOn = (...statuses: string[]) => {
    const row = [...(history.data ?? [])].reverse().find((h) => statuses.includes(h.newStatus ?? ''))
    return row?.changedAt ? dayjs(row.changedAt).format('MMM D, YYYY') : undefined
  }

  // GET /api/loan-applications and /api/loans
  const loanRows = useApplicantLoanRows(applicant.id)
  const active = loanRows.rows.filter((r) => r.kind === 'Loan' && r.status === 'ACTIVE')
  const outstanding = loanRows.rows.reduce((sum, r) => sum + (r.kind === 'Loan' ? (r.outstanding ?? 0) : 0), 0)
  const shown = (v: string | number) => (loanRows.loading ? '…' : loanRows.error ? '-' : v)

  const tiles = [
    { label: 'Applications', value: shown(loanRows.rows.filter((r) => r.kind === 'Application').length) },
    { label: 'Active loans', value: shown(active.length) },
    { label: 'Outstanding', value: shown(formatTzs(outstanding)) },
  ]

  return (
    <div className="space-y-6">
      <Stepper
        active={STATUS[applicant.status].step}
        size="xs"
        color={applicant.status === 'REJECTED' ? 'red' : 'brand'}
        className={`app-stepper${applicant.status === 'REJECTED' ? ' app-stepper-danger' : ''}`}
      >
        <Stepper.Step label="Registered" description={reachedOn('IDENTITY_VERIFICATION', 'PENDING_OTP')} {...stepIcon('user-round-plus')} />
        <Stepper.Step label="OTP verified" description={reachedOn('OTP_VERIFIED', 'PENDING_KYC')} {...stepIcon('key-round')} />
        <Stepper.Step label="KYC approved" description={reachedOn('KYC_APPROVED')} {...stepIcon('shield')} />
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
  const { user } = useAuth()
  const names = useUserNames()
  // GET /api/kyc-verifications, newest first
  const kyc = useKycHistory(applicant.id)
  const history = kyc.data ?? []
  // GET /api/applicant-documents
  const documents = useApplicantDocuments(applicant.id)
  const docs = documents.data ?? []
  // registration keeps the NIDA file on the identification row, not as a document
  const { data: ids = [] } = useIdentifications(applicant.id)
  const saveDoc = useSaveDocument()
  const deleteDoc = useDeleteDocument()

  const [dialog, setDialog] = useState<DocDialog>(null)
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // the file picked in this session, the API stores only the record so it cannot send it back
  const [files, setFiles] = useState<Record<string, File>>({})

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const target = dialog && typeof dialog === 'object' ? docs.find((d) => d.id === dialog.id) : undefined
  const hasNida = ids.some((i) => i.type === 'NIDA')
  const missing = REQUIRED_DOCUMENTS.filter(
    (t) => !docs.some((d) => d.type === t) && !(t === 'NIDA document' && hasNida),
  )
  const validUntil = history.find((r) => r.status === 'APPROVED')?.expiresAt ?? null
  const userName = (id: number | null) => (id === null ? 'Registration' : (names.get(id) ?? `User #${id}`))

  // the NIDA/TIN files saved at registration sit on the identification rows, so they are listed here too.
  // View only: changing them would go through the identification, not the documents.
  const registrationFiles = ids
    .filter((i) => i.documentPath)
    .map((i) => ({
      id: i.id,
      type: `${i.type} document`,
      fileName: (i.documentPath as string).split('/').pop() ?? '',
      path: i.documentPath as string,
    }))
  const documentCount = registrationFiles.length + docs.length

  const viewDocument = (d: DocumentRecord) =>
    setViewing({
      title: d.type,
      fileName: d.fileName,
      subtitle: `Uploaded${d.uploaded ? ` ${dayjs(d.uploaded).format('MMM D, YYYY')}` : ''} by ${userName(d.uploadedBy)}`,
      notes: d.notes,
      // a file picked in this visit shows straight away, otherwise the backend serves the stored one
      file: files[d.fileName] ?? null,
      url: d.filePath ? fileUrl(d.filePath) : null,
    })

  const save = async (input: DocumentInput) => {
    if (!user || saveDoc.isPending) return
    setFailure(null)
    try {
      // POST /api/applicant-documents, or PUT /api/applicant-documents/{id} when replacing
      await saveDoc.mutateAsync({
        id: dialog === 'add' ? undefined : target?.id,
        applicantId: applicant.id,
        type: input.type,
        fileName: input.fileName,
        mimeType: input.file?.type ?? '',
        uploadedBy: user.id,
      })
      if (input.file) setFiles((f) => ({ ...f, [input.fileName]: input.file as File }))
      setNotice(dialog === 'add' ? `${input.type} was uploaded.` : `${target?.type ?? input.type} was replaced.`)
    } catch (err) {
      setFailure(failText(err))
    }
    setDialog(null)
  }

  const remove = async () => {
    if (!target || REQUIRED_DOCUMENTS.includes(target.type) || deleteDoc.isPending) return
    setFailure(null)
    try {
      // DELETE /api/applicant-documents/{id}
      await deleteDoc.mutateAsync(target.id)
      setNotice(`${target.type} was removed.`)
    } catch (err) {
      setFailure(failText(err))
    }
    setDialog(null)
  }

  return (
    <div className="space-y-6">
      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
          <Text size="sm">{notice}</Text>
        </Alert>
      )}
      <FailAlert text={failure} onClose={() => setFailure(null)} />

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
          {applicant.status === 'KYC_APPROVED' && validUntil && (
            <Field label="Valid until" value={dayjs(validUntil).format('MMM D, YYYY')} />
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
            <SectionTitle>{`Documents (${documentCount})`}</SectionTitle>
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

          {documents.isLoading ? (
            <LoadingState rows={2} />
          ) : documents.error ? (
            <ErrorState compact message={documents.error.message} onRetry={() => void documents.refetch()} />
          ) : documentCount === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
              No documents have been uploaded.
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {registrationFiles.map((f) => (
                <li key={`id-${f.id}`} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                  <AppIcon name={isImage(f.fileName) ? 'file-image' : 'file-text'} className="text-gray-400" size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{f.type}</span>
                      {REQUIRED_DOCUMENTS.includes(f.type) && (
                        <Badge variant="outline" color="gray" radius="sm" size="xs">
                          Required
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-gray-500">{f.fileName} · From registration</div>
                  </div>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="brand"
                    onClick={() =>
                      setViewing({
                        title: f.type,
                        fileName: f.fileName,
                        subtitle: 'Saved at registration',
                        url: fileUrl(f.path),
                      })
                    }
                  >
                    View
                  </Button>
                </li>
              ))}
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
                      {d.fileName}
                      {d.sizeKb > 0 ? ` · ${sizeText(d.sizeKb)}` : ''}
                      {d.uploaded ? ` · ${dayjs(d.uploaded).format('MMM D, YYYY')}` : ''}
                    </div>
                  </div>
                  <Button size="xs" variant="subtle" color="brand" onClick={() => viewDocument(d)}>
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
        {kyc.isLoading ? (
          <LoadingState rows={2} />
        ) : kyc.error ? (
          <ErrorState compact message={kyc.error.message} onRetry={() => void kyc.refetch()} />
        ) : history.length === 0 ? (
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
                      {r.date ? dayjs(r.date).format('MMM D, YYYY') : 'Date not recorded'}
                      {r.verifiedBy !== null ? ` · by ${userName(r.verifiedBy)}` : ''}
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
        document={
          typeof dialog === 'object' && dialog?.kind === 'replace' && target
            ? { ...target, uploadedBy: userName(target.uploadedBy) }
            : null
        }
        existingTypes={docs.map((d) => d.type)}
        onClose={() => setDialog(null)}
        onSubmit={save}
      />

      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />

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
  // GET /api/financial-profiles and /api/existing-debts (debts with other lenders, declared by the applicant;
  // the credit assessment reads the same records)
  const profileQuery = useFinancialProfile(applicant.id)
  const profile = profileQuery.data ?? null
  const debtsQuery = useExistingDebts(applicant.id)
  const debts = debtsQuery.data ?? []
  const saveProfileMutation = useSaveFinancialProfile()
  const saveDebtMutation = useSaveDebt()
  const deleteDebtMutation = useDeleteDebt()

  const [dialog, setDialog] = useState<FinancialDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

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

  // runs one save, shows the outcome and closes the dialog
  const run = async (work: () => Promise<unknown>, done: string) => {
    setFailure(null)
    try {
      await work()
      setNotice(done)
    } catch (err) {
      setFailure(failText(err))
    }
    setDialog(null)
  }

  const saveProfile = (input: FinancialProfile) => {
    if (saveProfileMutation.isPending) return
    // POST /api/financial-profiles, or PUT /api/financial-profiles/{id}
    void run(
      () => saveProfileMutation.mutateAsync({ id: profile?.id, applicantId: applicant.id, profile: input }),
      'The financial profile was saved.',
    )
  }

  const saveDebt = (input: DebtInput) => {
    if (saveDebtMutation.isPending) return
    const adding = dialog === 'debt-add'
    if (!adding && !debtDialog) return
    // POST /api/existing-debts, or PUT /api/existing-debts/{id}
    void run(
      () => saveDebtMutation.mutateAsync({ current: adding ? undefined : debtDialog, applicantId: applicant.id, debt: input }),
      adding ? `The debt with ${input.lender} was added.` : `The debt with ${input.lender} was updated.`,
    )
  }

  const removeDebt = () => {
    if (!debtDialog || deleteDebtMutation.isPending) return
    // DELETE /api/existing-debts/{id}
    void run(() => deleteDebtMutation.mutateAsync(debtDialog.id), `The debt with ${debtDialog.lender} was removed.`)
  }

  const tiles = [
    { label: 'Monthly cash flow', value: profile ? formatTzs(cashFlow) : '—' },
    { label: 'Debt payments per month', value: formatTzs(totalMonthly) },
    { label: 'Left after debts', value: profile ? formatTzs(afterDebts) : '—', warn: !!profile && afterDebts < 0 },
  ]

  if (profileQuery.isLoading || debtsQuery.isLoading) return <LoadingState rows={4} />
  const loadError = profileQuery.error ?? debtsQuery.error
  if (loadError)
    return (
      <ErrorState
        message={loadError.message}
        onRetry={() => {
          void profileQuery.refetch()
          void debtsQuery.refetch()
        }}
      />
    )

  return (
    <div className="space-y-6">
      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
          <Text size="sm">{notice}</Text>
        </Alert>
      )}
      <FailAlert text={failure} onClose={() => setFailure(null)} />

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

          {/* captured at registration (applicant.occupation); changed with Edit on the profile, not here */}
          <Field label="Occupation" value={applicant.occupation || '-'} />

          {profile ? (
            <>
              <Field label="Monthly income" value={formatTzs(profile.monthlyIncome)} />
              <Field label="Monthly expenses" value={formatTzs(profile.monthlyExpenses)} />
              {/* employment type, employer and dependants are not shown: the financial_profile table has no columns for them */}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
              No financial profile has been added yet.
            </div>
          )}
        </div>

        {/* existing debts with other lenders, declared by the applicant */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionTitle>{`Existing debts (${debts.length})`}</SectionTitle>
            <Button size="xs" variant="default" leftSection={<AppIcon name="plus" />} onClick={() => setDialog('debt-add')}>
              Add debt
            </Button>
          </div>
          <Text size="xs" c="dimmed" mb={6}>
            Loans with other lenders, as declared by the applicant. Used in the credit assessment.
          </Text>

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

      <FinancialProfileDialog
        opened={dialog === 'profile'}
        profile={profile}
        onClose={() => setDialog(null)}
        onSubmit={saveProfile}
      />
    </div>
  )
}

type AccountDialog = 'add' | { kind: 'edit' | 'remove'; id: number } | null

export function AccountsTab({ applicant }: { applicant: Applicant }) {
  // GET /api/member-accounts
  const accountsQuery = useMemberAccounts(applicant.id)
  const accounts = accountsQuery.data ?? []
  const saveAccount = useSaveAccount()
  const deleteAccount = useDeleteAccount()
  const busy = saveAccount.isPending || deleteAccount.isPending

  const [dialog, setDialog] = useState<AccountDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const target = dialog && typeof dialog === 'object' ? accounts.find((a) => a.id === dialog.id) : undefined
  const label = (a: ApplicantAccount) => `${a.provider} ${a.number}`

  // runs one save, shows the outcome and closes the dialog
  const run = async (work: () => Promise<unknown>, done: string) => {
    setFailure(null)
    try {
      await work()
      setNotice(done)
    } catch (err) {
      setFailure(failText(err))
    }
    setDialog(null)
  }

  const save = (input: AccountInput) => {
    if (busy) return
    const adding = dialog === 'add'
    if (!adding && !target) return
    // the first account is always the primary one, and the primary one stays primary on edit
    const primary = input.primary || (adding ? accounts.length === 0 : !!target?.primary)
    const others = accounts.filter((a) => a.id !== target?.id)
    // POST /api/member-accounts, or PUT /api/member-accounts/{id}; a new primary demotes the old one first
    void run(
      () =>
        saveAccount.mutateAsync({
          current: adding ? undefined : target,
          applicantId: applicant.id,
          account: { ...input, primary },
          others,
        }),
      adding ? `${input.provider} was added.` : `${input.provider} was updated.`,
    )
  }

  const makePrimary = (a: ApplicantAccount) => {
    const current = accounts.find((x) => x.id === a.id)
    if (!current || busy) return
    // PUT /api/member-accounts/{id} for the old and the new primary account
    void run(
      () =>
        saveAccount.mutateAsync({
          current,
          applicantId: applicant.id,
          account: { ...current, primary: true },
          others: accounts.filter((x) => x.id !== a.id),
        }),
      `${label(a)} is now the primary account.`,
    )
  }

  const remove = () => {
    if (!target || busy) return
    // DELETE /api/member-accounts/{id}; if it was primary, the first remaining account takes over
    const next = accounts.find((a) => a.id !== target.id)
    void run(
      () => deleteAccount.mutateAsync({ target, applicantId: applicant.id, next }),
      `${label(target)} was removed.`,
    )
  }

  if (accountsQuery.isLoading) return <LoadingState rows={3} />
  if (accountsQuery.error)
    return <ErrorState message={accountsQuery.error.message} onRetry={() => void accountsQuery.refetch()} />

  return (
    <div className="space-y-4">
      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />}>
          <Text size="sm">{notice}</Text>
        </Alert>
      )}
      <FailAlert text={failure} onClose={() => setFailure(null)} />

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

/* ---------- the applicant's loan applications and loans (GET /api/loan-applications and /api/loans) ---------- */

type LoanRow = {
  key: string
  kind: 'Application' | 'Loan'
  ref: string
  amount: number
  /** still owed, loans only */
  outstanding: number | null
  status: string
  statusLabel: string
  color: string
  date: string
  to: string
}

const LOAN_STATE: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'green' },
  PENDING_DISBURSEMENT: { label: 'Awaiting payout', color: 'yellow' },
  CLOSED: { label: 'Closed', color: 'gray' },
  WRITTEN_OFF: { label: 'Written off', color: 'red' },
}

const wordsOf = (v: string) => {
  const s = v.replace(/_/g, ' ').toLowerCase()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '-'
}

function useApplicantLoanRows(applicantId: number) {
  const applications = useLoanApplications()
  const loans = useApplicantLoans(applicantId)
  const rows: LoanRow[] = [
    ...(applications.data ?? [])
      .filter((a) => a.applicantId === applicantId)
      .map((a) => {
        const known = LOAN_STATUS[a.status as ApplicationStatus]
        return {
          key: `app-${a.id}`,
          kind: 'Application' as const,
          ref: a.applicationNo || `#${a.id}`,
          amount: a.requestedAmount ?? 0,
          outstanding: null,
          status: a.status,
          statusLabel: known?.label ?? wordsOf(a.status),
          color: known?.color ?? 'gray',
          date: (a.submittedAt ?? a.createdAt ?? '').slice(0, 10),
          // a draft continues in the wizard, the rest open the application page
          to: a.status === 'DRAFT' ? `/loan-applications/new?applicantId=${applicantId}` : `/loan-applications/${a.id}`,
        }
      }),
    ...(loans.data ?? []).map((l) => ({
      key: `loan-${l.id}`,
      kind: 'Loan' as const,
      ref: l.loanNo,
      amount: l.principal,
      outstanding: l.outstanding,
      status: l.status,
      statusLabel: LOAN_STATE[l.status]?.label ?? wordsOf(l.status),
      color: LOAN_STATE[l.status]?.color ?? 'gray',
      date: l.createdAt,
      to: `/loans/${l.id}`,
    })),
  ]
  return {
    rows,
    loading: applications.isLoading || loans.isLoading,
    error: applications.error ?? loans.error,
    refetch: () => {
      void applications.refetch()
      void loans.refetch()
    },
  }
}

const loanColumns: CustomTableColumn<LoanRow>[] = [
  { accessor: 'ref', header: 'Reference' },
  {
    accessor: 'kind',
    header: 'Type',
    render: (r) => (
      <Badge variant="outline" color={r.kind === 'Loan' ? 'brand' : 'gray'} radius="sm" size="sm">
        {r.kind}
      </Badge>
    ),
  },
  { accessor: 'amount', header: 'Amount', render: (r) => <Text size="sm">{formatTzs(r.amount)}</Text>, exportValue: (r) => r.amount },
  {
    accessor: 'outstanding',
    header: 'Still owed',
    render: (r) => <Text size="sm">{r.outstanding === null ? '-' : formatTzs(r.outstanding)}</Text>,
    exportValue: (r) => r.outstanding ?? '',
  },
  {
    accessor: 'statusLabel',
    header: 'Status',
    render: (r) => (
      <Badge variant="light" color={r.color} radius="sm" size="sm">
        {r.statusLabel}
      </Badge>
    ),
  },
  { accessor: 'date', header: 'Date', type: 'date' },
]

export function LoansTab({ applicant }: { applicant: Applicant }) {
  const navigate = useNavigate()
  const { rows, loading, error, refetch } = useApplicantLoanRows(applicant.id)

  if (error) return <ErrorState compact message={error.message} onRetry={refetch} />
  return (
    <CustomTable<LoanRow>
      size="sm"
      loading={loading}
      data={rows}
      columns={loanColumns}
      pagination={false}
      defaultSort={{ accessor: 'date', direction: 'desc' }}
      onRowClick={(r) => navigate(r.to)}
      noRecordText="No loans or applications yet"
    />
  )
}

export function ActivityTab({ applicant }: { applicant: Applicant }) {
  return <Timeline applicant={applicant} />
}