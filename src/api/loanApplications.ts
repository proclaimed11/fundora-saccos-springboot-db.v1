import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from './client'
import { queryClient } from './queryClient'

// Loan application drafts: "Loan Application Process Tracking" in the API document.
// A draft is created by /start, updated by /progress after each wizard step, resumed by /latest
// and locked by /finalize. The raw CRUD under /api/loan-applications lists and deletes them.

/* ---------- the row ---------- */

const money = z.union([z.number(), z.string()]).nullish()
const toNumber = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

const applicationRowSchema = z.object({
  id: z.number(),
  applicationNo: z.string().nullish(),
  // the links come back as ids or as nested objects, depending on the backend model
  applicantId: z.number().nullish(),
  applicant: z.object({ id: z.number() }).nullish(),
  loanOfficerId: z.number().nullish(),
  loanOfficer: z.object({ id: z.number() }).nullish(),
  requestedAmount: money,
  interestMethod: z.string().nullish(),
  interestRate: money,
  tenure: z.number().nullish(),
  penaltyRate: money,
  guarantorRequired: z.boolean().nullish(),
  collateralRequired: z.boolean().nullish(),
  creditAssessmentRequired: z.boolean().nullish(),
  status: z.string().nullish(),
  currentStage: z.string().nullish(),
  finalized: z.boolean().nullish(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  submittedAt: z.string().nullish(),
})

type ApplicationRow = z.infer<typeof applicationRowSchema>

export type LoanDraft = {
  id: number
  applicationNo: string
  applicantId: number
  loanOfficerId: number | null
  requestedAmount: number | null
  interestMethod: 'FLAT' | 'REDUCING' | null
  interestRate: number | null
  tenure: number | null
  penaltyRate: number | null
  guarantorRequired: boolean
  collateralRequired: boolean
  creditAssessmentRequired: boolean
  status: string
  /** the wizard stage to reopen on, e.g. LOAN_DETAILS */
  currentStage: string
  finalized: boolean
  updatedAt: string
  /** yyyy-MM-dd */
  createdAt: string
  submittedAt: string | null
}

const toDraft = (r: ApplicationRow): LoanDraft => {
  const method = (r.interestMethod ?? '').toUpperCase()
  return {
    id: r.id,
    applicationNo: r.applicationNo ?? '',
    applicantId: r.applicantId ?? r.applicant?.id ?? 0,
    loanOfficerId: r.loanOfficerId ?? r.loanOfficer?.id ?? null,
    requestedAmount: toNumber(r.requestedAmount),
    interestMethod: method === 'FLAT' || method === 'REDUCING' ? method : null,
    interestRate: toNumber(r.interestRate),
    tenure: r.tenure ?? null,
    penaltyRate: toNumber(r.penaltyRate),
    guarantorRequired: r.guarantorRequired ?? false,
    collateralRequired: r.collateralRequired ?? false,
    creditAssessmentRequired: r.creditAssessmentRequired ?? false,
    status: (r.status ?? '').toUpperCase(),
    currentStage: (r.currentStage ?? '').toUpperCase(),
    finalized: r.finalized ?? false,
    updatedAt: r.updatedAt ?? r.createdAt ?? '',
    createdAt: (r.createdAt ?? '').slice(0, 10),
    submittedAt: r.submittedAt ?? null,
  }
}

// the workflow endpoints answer { success, message, data: {...} }
const wrapped = z.object({ message: z.string().optional(), data: applicationRowSchema })
const listSchema = z.union([z.array(applicationRowSchema), z.object({ data: z.array(applicationRowSchema) })])

export const loanApplicationKeys = {
  all: ['loan-applications'] as const,
  latest: (applicantId: number) => ['loan-applications', 'latest', applicantId] as const,
}

const refresh = () => queryClient.invalidateQueries({ queryKey: loanApplicationKeys.all })

/* ---------- POST /api/loan-applications/start ---------- */

export async function startLoanApplication(body: { applicantId: number; loanOfficerId: number }) {
  const res = await api('/api/loan-applications/start', { method: 'POST', body, schema: wrapped })
  void refresh()
  return toDraft(res.data)
}

/* ---------- PUT /api/loan-applications/{id}/progress ---------- */

export type ProgressBody = {
  currentStage: string
  loanOfficerId?: number
  requestedAmount?: number
  interestMethod?: 'FLAT' | 'REDUCING'
  interestRate?: number
  tenure?: number
  penaltyRate?: number
  guarantorRequired?: boolean
  collateralRequired?: boolean
  creditAssessmentRequired?: boolean
}

// "Any provided fields are updated", so fields still empty in the form are simply left out
export async function saveLoanProgress(id: number, body: ProgressBody) {
  const res = await api(`/api/loan-applications/${id}/progress`, { method: 'PUT', body, schema: wrapped })
  void refresh()
  return toDraft(res.data)
}

/* ---------- GET /api/loan-applications/latest?applicantId= ---------- */

// "No in-progress application found" comes back as success: false, which is an answer, not a failure
// /latest may answer only a summary (id, status, currentStage, finalized), so it is used to find WHICH draft,
// and the full row (amount, terms, required switches...) is read with GET /api/loan-applications/{id}
export async function getLatestLoanApplication(applicantId: number): Promise<LoanDraft | null> {
  let summary: LoanDraft
  try {
    const res = await api(`/api/loan-applications/latest?applicantId=${applicantId}`, { schema: wrapped })
    summary = toDraft(res.data)
  } catch (err) {
    if (err instanceof ApiError && /no in-progress/i.test(err.message)) return null
    throw err
  }
  const full = await getLoanApplication(summary.id)
  // the stage and status of /latest win if the full row leaves them out
  return {
    ...full,
    applicantId: full.applicantId || summary.applicantId || applicantId,
    currentStage: full.currentStage || summary.currentStage,
    status: full.status || summary.status,
  }
}

export const useLatestLoanApplication = (applicantId: number, enabled: boolean) =>
  useQuery({
    queryKey: loanApplicationKeys.latest(applicantId),
    queryFn: () => getLatestLoanApplication(applicantId),
    enabled: enabled && applicantId > 0,
    // a draft can change on another screen, so it is read fresh every time the wizard asks
    staleTime: 0,
  })

/* ---------- GET /api/loan-applications (raw CRUD): every application, and the open drafts ---------- */

const listKey = [...loanApplicationKeys.all, 'list'] as const

const getLoanApplications = async () => {
  const res = await api('/api/loan-applications', { schema: listSchema })
  return (Array.isArray(res) ? res : res.data).map(toDraft)
}

// the Loan applications table
export const useLoanApplications = () => useQuery({ queryKey: listKey, queryFn: getLoanApplications })

// the same cached list, only the unfinished drafts
export const useLoanDrafts = () =>
  useQuery({
    queryKey: listKey,
    queryFn: getLoanApplications,
    select: (list) =>
      list
        .filter((d) => !d.finalized && d.status === 'DRAFT')
        .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)),
  })

/* ---------- DELETE /api/loan-applications/{id} (raw CRUD): discard a draft ---------- */

export async function deleteLoanApplication(id: number) {
  await api(`/api/loan-applications/${id}`, { method: 'DELETE' })
  void refresh()
}

/* ---------- guarantors and collateral of a draft ---------- */
// Created with the raw CRUD (POST /api/guarantors, /api/collaterals with applicationId), verified with
// /api/loan-origination/applications/{id}/.../verify. Field names follow the tables in dbTables.txt.

const link = z.object({ id: z.number() }).nullish()
const listOf = <T extends z.ZodTypeAny>(row: T) => z.union([z.array(row), z.object({ data: z.array(row) })])
const rowsOf = <T,>(res: T[] | { data: T[] }) => (Array.isArray(res) ? res : res.data)
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

// a write answers the row, or { data: row }; only its id is needed
const savedId = (res: unknown): number => {
  const r = asRecord(res)
  const id = asRecord(r.data).id ?? r.id
  if (typeof id !== 'number') throw new ApiError('The server did not return the saved record.', 500)
  return id
}

// PUT replaces the whole row, so the saved row is read first and only the form's fields change
async function putMerged(path: string, changes: Record<string, unknown>) {
  const raw = asRecord(await api<unknown>(path))
  const current = asRecord(raw.data ?? raw)
  return api<unknown>(path, { method: 'PUT', body: { ...current, ...changes } })
}

const guarantorRowSchema = z.object({
  id: z.number(),
  applicationId: z.number().nullish(),
  application: link,
  fullName: z.string().nullish(),
  phone: z.string().nullish(),
  idNumber: z.string().nullish(),
  address: z.string().nullish(),
  email: z.string().nullish(),
  locationName: z.string().nullish(),
  locationPin: z.string().nullish(),
  status: z.string().nullish(),
})

const guarantorCheckSchema = z.object({
  id: z.number(),
  guarantorId: z.number().nullish(),
  guarantor: link,
  idVerified: z.boolean().nullish(),
  exposureVerified: z.boolean().nullish(),
  remarks: z.string().nullish(),
})

const collateralRowSchema = z.object({
  id: z.number(),
  applicationId: z.number().nullish(),
  application: link,
  collateralType: z.string().nullish(),
  description: z.string().nullish(),
  estimatedValue: money,
  status: z.string().nullish(),
})

const collateralCheckSchema = z.object({
  id: z.number(),
  collateralId: z.number().nullish(),
  collateral: link,
  ownershipVerified: z.boolean().nullish(),
  existingPledgeVerified: z.boolean().nullish(),
  remarks: z.string().nullish(),
})

const collateralDocSchema = z.object({
  id: z.number(),
  collateralId: z.number().nullish(),
  collateral: link,
  documentType: z.string().nullish(),
  documentNumber: z.string().nullish(),
  filePath: z.string().nullish(),
})

export type SavedGuarantor = {
  id: number
  fullName: string
  phone: string
  idNumber: string
  address: string
  email: string
  locationName: string
  locationPin: string
  idVerified: boolean
  exposureVerified: boolean
}

export type SavedCollateral = {
  id: number
  collateralType: string
  description: string
  estimatedValue: number | null
  ownershipVerified: boolean
  existingPledgeVerified: boolean
  remarks: string
  documentId: number | null
  documentNumber: string
  /** the file name from the stored path, the file itself is not on the server */
  documentFileName: string
  documentPath: string
}

// the latest verification of each record, by the record's id
const latestBy = <T extends { id: number }>(rows: T[], owner: (r: T) => number) => {
  const out = new Map<number, T>()
  for (const r of [...rows].sort((a, b) => a.id - b.id)) out.set(owner(r), r)
  return out
}

// GET /api/guarantors (+ /api/guarantor-verifications for the ticks), this application's rows
export async function getDraftGuarantors(applicationId: number): Promise<SavedGuarantor[]> {
  const [rows, checks] = await Promise.all([
    api('/api/guarantors', { schema: listOf(guarantorRowSchema) }),
    // the ticks are optional: a failed read keeps the guarantors and shows them unticked
    api('/api/guarantor-verifications', { schema: listOf(guarantorCheckSchema) }).catch(() => []),
  ])
  const last = latestBy(rowsOf(checks), (c) => c.guarantorId ?? c.guarantor?.id ?? 0)
  return rowsOf(rows)
    .filter((g) => (g.applicationId ?? g.application?.id) === applicationId)
    .sort((a, b) => a.id - b.id)
    .map((g) => {
      const check = last.get(g.id)
      const verified = (g.status ?? '').toUpperCase() === 'VERIFIED'
      return {
        id: g.id,
        fullName: g.fullName ?? '',
        phone: g.phone ?? '',
        idNumber: g.idNumber ?? '',
        address: g.address ?? '',
        email: g.email ?? '',
        locationName: g.locationName ?? '',
        locationPin: g.locationPin ?? '',
        idVerified: check?.idVerified ?? verified,
        exposureVerified: check?.exposureVerified ?? verified,
      }
    })
}

// GET /api/collaterals (+ verifications and documents), this application's rows
export async function getDraftCollaterals(applicationId: number): Promise<SavedCollateral[]> {
  const [rows, checks, docs] = await Promise.all([
    api('/api/collaterals', { schema: listOf(collateralRowSchema) }),
    api('/api/collateral-verifications', { schema: listOf(collateralCheckSchema) }).catch(() => []),
    api('/api/collateral-documents', { schema: listOf(collateralDocSchema) }).catch(() => []),
  ])
  const last = latestBy(rowsOf(checks), (c) => c.collateralId ?? c.collateral?.id ?? 0)
  const doc = latestBy(rowsOf(docs), (d) => d.collateralId ?? d.collateral?.id ?? 0)
  return rowsOf(rows)
    .filter((c) => (c.applicationId ?? c.application?.id) === applicationId)
    .sort((a, b) => a.id - b.id)
    .map((c) => {
      const check = last.get(c.id)
      const d = doc.get(c.id)
      const verified = (c.status ?? '').toUpperCase() === 'VERIFIED'
      const path = d?.filePath ?? ''
      return {
        id: c.id,
        collateralType: c.collateralType ?? '',
        description: c.description ?? '',
        estimatedValue: toNumber(c.estimatedValue),
        ownershipVerified: check?.ownershipVerified ?? verified,
        existingPledgeVerified: check?.existingPledgeVerified ?? verified,
        remarks: check?.remarks ?? '',
        documentId: d?.id ?? null,
        documentNumber: d?.documentNumber ?? '',
        documentFileName: path ? (path.split('/').pop() ?? '') : '',
        documentPath: path,
      }
    })
}

// gps_location is left out: the API doc does not say how a map point is sent
export type GuarantorFields = {
  fullName: string
  phone: string
  idNumber: string
  address: string
  email: string
  locationName: string
  locationPin: string
}

// POST /api/guarantors, or PUT /api/guarantors/{id}; answers the guarantor's id
export async function saveGuarantor(applicationId: number, id: number | null, f: GuarantorFields) {
  const changes = { ...f, applicationId, application: { id: applicationId } }
  if (id !== null) {
    await putMerged(`/api/guarantors/${id}`, changes)
    return id
  }
  return savedId(await api<unknown>('/api/guarantors', { method: 'POST', body: changes }))
}

export const deleteGuarantor = (id: number) => api<unknown>(`/api/guarantors/${id}`, { method: 'DELETE' })

// POST /api/loan-origination/applications/{applicationId}/guarantors/{guarantorId}/verify
export const verifyGuarantor = (
  applicationId: number,
  guarantorId: number,
  body: { idVerified: boolean; exposureVerified: boolean; verifiedBy: number; remarks: string },
) =>
  api<unknown>(`/api/loan-origination/applications/${applicationId}/guarantors/${guarantorId}/verify`, {
    method: 'POST',
    body,
  })

export type CollateralFields = { collateralType: string; description: string; estimatedValue: number }

// POST /api/collaterals, or PUT /api/collaterals/{id}; answers the asset's id
export async function saveCollateral(applicationId: number, id: number | null, f: CollateralFields) {
  const changes = { ...f, applicationId, application: { id: applicationId } }
  if (id !== null) {
    await putMerged(`/api/collaterals/${id}`, changes)
    return id
  }
  return savedId(await api<unknown>('/api/collaterals', { method: 'POST', body: changes }))
}

export const deleteCollateral = (id: number) => api<unknown>(`/api/collaterals/${id}`, { method: 'DELETE' })

export type CollateralDocFields = { documentType: string; documentNumber: string; filePath: string }

// POST /api/collateral-documents, or PUT /api/collateral-documents/{id}; only the record, the API takes no files
export async function saveCollateralDocument(collateralId: number, id: number | null, f: CollateralDocFields) {
  const changes = { ...f, collateralId, collateral: { id: collateralId } }
  if (id !== null) {
    await putMerged(`/api/collateral-documents/${id}`, changes)
    return id
  }
  return savedId(await api<unknown>('/api/collateral-documents', { method: 'POST', body: { ...changes, verified: false } }))
}

// POST /api/loan-origination/applications/{applicationId}/collaterals/{collateralId}/verify
export const verifyCollateral = (
  applicationId: number,
  collateralId: number,
  body: { ownershipVerified: boolean; existingPledgeVerified: boolean; verifiedBy: number; remarks: string },
) =>
  api<unknown>(`/api/loan-origination/applications/${applicationId}/collaterals/${collateralId}/verify`, {
    method: 'POST',
    body,
  })

/* ---------- GET /api/loans (raw CRUD): the applicant's unfinished loans ---------- */

const loanRowSchema = z.object({
  id: z.number(),
  loanNo: z.string().nullish(),
  applicantId: z.number().nullish(),
  applicant: link,
  status: z.string().nullish(),
  principalAmount: money,
  outstandingPrincipal: money,
  outstandingInterest: money,
  outstandingPenalty: money,
  overdueDays: z.number().nullish(),
})

// the statuses that count as "not completed": being repaid, created but not paid out yet, or written off
// unpaid. CLOSED (fully paid) does not count.
export const UNFINISHED_LOAN_STATUSES = ['ACTIVE', 'PENDING_DISBURSEMENT', 'WRITTEN_OFF']

export type UnfinishedLoan = {
  id: number
  loanNo: string
  status: string
  principal: number
  /** principal + interest + penalty still owed */
  outstanding: number
  overdueDays: number
}

export type ApplicantLoan = UnfinishedLoan & { applicationId: number | null; createdAt: string }

const loanExtraSchema = z.object({
  applicationId: z.number().nullish(),
  application: link,
  createdAt: z.string().nullish(),
  disbursementDate: z.string().nullish(),
})

// GET /api/loans once for all applicants; each hook below filters the same cached list
const getAllLoans = async () => {
  const res = await api('/api/loans', { schema: listOf(loanRowSchema.merge(loanExtraSchema)) })
  return rowsOf(res).map((l) => ({
    applicantId: l.applicantId ?? l.applicant?.id ?? 0,
    loan: {
      id: l.id,
      loanNo: l.loanNo ?? `#${l.id}`,
      status: (l.status ?? '').toUpperCase(),
      principal: toNumber(l.principalAmount) ?? 0,
      outstanding:
        (toNumber(l.outstandingPrincipal) ?? 0) + (toNumber(l.outstandingInterest) ?? 0) + (toNumber(l.outstandingPenalty) ?? 0),
      overdueDays: l.overdueDays ?? 0,
      applicationId: l.applicationId ?? l.application?.id ?? null,
      createdAt: (l.disbursementDate ?? l.createdAt ?? '').slice(0, 10),
    } satisfies ApplicantLoan,
  }))
}
const loansKey = ['loans', 'all'] as const

// every loan of the applicant, any status (the applicant's Loans tab)
export const useApplicantLoans = (applicantId: number) =>
  useQuery({
    queryKey: loansKey,
    queryFn: getAllLoans,
    enabled: applicantId > 0,
    select: (list): ApplicantLoan[] => list.filter((x) => x.applicantId === applicantId).map((x) => x.loan),
  })

// only the ones not completed (the pending-payments default, and blocking a new application)
export const useUnfinishedLoans = (applicantId: number) =>
  useQuery({
    queryKey: loansKey,
    queryFn: getAllLoans,
    enabled: applicantId > 0,
    select: (list): UnfinishedLoan[] =>
      list
        .filter((x) => x.applicantId === applicantId && UNFINISHED_LOAN_STATUSES.includes(x.loan.status))
        .map((x) => x.loan),
  })

// application statuses that mean a request is still going through the process (not a draft, not finished)
export const IN_PROGRESS_APPLICATION_STATUSES = [
  'SUBMITTED',
  'CREDIT_APPROVED',
  'PENDING_APPROVAL',
  'APPROVED',
  'CONTRACT_GENERATED',
  'CONTRACT_SIGNED',
]

/* ---------- POST /api/loan-origination/applications/{applicationId}/credit-assessment ---------- */

const assessmentSchema = z.object({
  message: z.string().optional(),
  data: z
    .object({ decision: z.string().nullish(), cashFlow: money })
    .passthrough()
    .nullish(),
})

export type CreditAssessmentBody =
  | { income: number; expenses: number; hasPendingPayments: boolean; assessedBy: number; notes: string }
  // when the application has creditAssessmentRequired: false, the backend approves without figures
  | { assessedBy: number; notes: string }

/** decision is null when the answer did not say, the application status then tells */
export type CreditAssessmentResult = { decision: 'APPROVE' | 'REJECT' | null; cashFlow: number | null; message: string }

// Runs after the application is submitted. APPROVE moves it to CREDIT_APPROVED, REJECT to REJECTED.
// Needs every required guarantor and asset VERIFIED first, otherwise the backend refuses.
export async function runCreditAssessment(applicationId: number, body: CreditAssessmentBody) {
  const res = await api(`/api/loan-origination/applications/${applicationId}/credit-assessment`, {
    method: 'POST',
    body,
    schema: assessmentSchema,
  })
  void refresh()
  // the decision is in data, or only in the message ("Credit assessment recorded: APPROVE")
  const said = `${res.data?.decision ?? ''} ${res.message ?? ''}`.toUpperCase()
  const decision = /\bREJECT/.test(said) ? 'REJECT' : /\bAPPROVE/.test(said) ? 'APPROVE' : null
  return {
    decision,
    cashFlow: toNumber(res.data?.cashFlow),
    message: res.message ?? '',
  } satisfies CreditAssessmentResult
}

/* ---------- one application and its whole workflow, for the application page ---------- */

// GET /api/loan-applications/{id} (raw CRUD)
export async function getLoanApplication(id: number): Promise<LoanDraft> {
  const raw = await api<unknown>(`/api/loan-applications/${id}`)
  if (raw === null || raw === undefined || raw === '') throw new ApiError('Loan application not found', 404)
  const parsed = applicationRowSchema.safeParse(asRecord(raw).data ?? raw)
  if (!parsed.success) throw new ApiError('The server sent a loan application this app cannot read.', 500)
  return toDraft(parsed.data)
}

export type WfCredit = {
  decision: 'APPROVE' | 'REJECT' | null
  income: number | null
  expenses: number | null
  cashFlow: number | null
  totalExistingDebt: number | null
  hasPendingPayments: boolean
  notes: string
  assessedBy: number | null
  assessedAt: string
}
export type WfApproval = {
  id: number
  levelId: number | null
  levelNo: number | null
  decision: string
  approverId: number | null
  comments: string
  decidedAt: string
}
export type WfContract = {
  id: number
  contractNo: string
  status: string
  finalAmount: number | null
  generatedAt: string
  sentAt: string
  signedAt: string
}
export type WfLoan = { id: number; loanNo: string; status: string; principal: number | null; disbursementDate: string }
export type WfHistory = { id: number; from: string; to: string; changedBy: number | null; remarks: string; changedAt: string }

export type ApplicationWorkflow = {
  credit: WfCredit | null
  approvals: WfApproval[]
  contract: WfContract | null
  loan: WfLoan | null
  history: WfHistory[]
}

// the workflow answer's field names are not in the API document, so each part is read under the likely names
const pick = (r: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k]
  return undefined
}
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(asRecord) : v ? [asRecord(v)] : [])
const str = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const idOf = (v: unknown) => num(asRecord(v).id ?? v)

// GET /api/loan-origination/applications/{id}/workflow
export async function getApplicationWorkflow(id: number): Promise<ApplicationWorkflow> {
  const raw = asRecord(await api<unknown>(`/api/loan-origination/applications/${id}/workflow`))
  const d = asRecord(raw.data ?? raw)

  // the latest credit assessment
  const credits = arr(pick(d, 'creditAssessments', 'creditAssessment', 'credit'))
  const c = credits.sort((a, b) => (num(a.id) ?? 0) - (num(b.id) ?? 0)).pop()
  const said = str(c?.decision).toUpperCase()

  const contractRaw = arr(pick(d, 'contract', 'latestContract', 'loanContract', 'contracts')).pop()
  const loanRaw = arr(pick(d, 'loan', 'createdLoan', 'loans')).pop()

  return {
    credit: c
      ? {
          decision: said.includes('REJECT') ? 'REJECT' : said.includes('APPROVE') ? 'APPROVE' : null,
          income: num(c.income),
          expenses: num(c.expenses),
          cashFlow: num(c.cashFlow),
          totalExistingDebt: num(c.totalExistingDebt),
          hasPendingPayments: c.hasPendingPayments === true,
          notes: str(pick(c, 'assessmentNotes', 'notes')),
          assessedBy: idOf(pick(c, 'assessedBy', 'assessedById')),
          assessedAt: str(c.assessedAt),
        }
      : null,
    approvals: arr(pick(d, 'approvals')).map((a) => {
      const level = asRecord(pick(a, 'approvalLevel', 'level'))
      return {
        id: num(a.id) ?? 0,
        levelId: num(pick(a, 'approvalLevelId', 'levelId')) ?? num(level.id),
        levelNo: num(pick(a, 'levelNo')) ?? num(level.levelNo),
        decision: str(a.decision).toUpperCase(),
        approverId: idOf(pick(a, 'approverId', 'approver')),
        comments: str(a.comments),
        decidedAt: str(a.decidedAt),
      }
    }),
    contract: contractRaw
      ? {
          id: num(contractRaw.id) ?? 0,
          contractNo: str(contractRaw.contractNo),
          status: str(contractRaw.status).toUpperCase(),
          finalAmount: num(contractRaw.finalAmount),
          generatedAt: str(contractRaw.generatedAt),
          sentAt: str(contractRaw.sentAt),
          signedAt: str(contractRaw.signedAt),
        }
      : null,
    loan: loanRaw
      ? {
          id: num(loanRaw.id) ?? 0,
          loanNo: str(loanRaw.loanNo),
          status: str(loanRaw.status).toUpperCase(),
          principal: num(loanRaw.principalAmount),
          disbursementDate: str(loanRaw.disbursementDate),
        }
      : null,
    history: arr(pick(d, 'statusHistory', 'statusHistories', 'history', 'applicationStatusHistories'))
      .map((h) => ({
        id: num(h.id) ?? 0,
        from: str(h.oldStatus).toUpperCase(),
        to: str(h.newStatus).toUpperCase(),
        changedBy: idOf(h.changedBy),
        remarks: str(h.remarks),
        changedAt: str(h.changedAt),
      }))
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt) || a.id - b.id),
  }
}

export type ApprovalLevel = { id: number; levelNo: number; levelName: string; requiredRole: string }

// GET /api/approval-hierarchys/default, then /{id}/levels: the levels every application goes through, in order
export async function getApprovalLevels(): Promise<ApprovalLevel[]> {
  const h = asRecord(await api<unknown>('/api/approval-hierarchys/default'))
  const hierarchyId = num(asRecord(h.data ?? h).id)
  if (hierarchyId === null) return []
  const raw = await api<unknown>(`/api/approval-hierarchys/${hierarchyId}/levels`)
  const list = Array.isArray(raw) ? raw : arr(asRecord(raw).data)
  return list
    .map(asRecord)
    .filter((l) => l.isActive !== false)
    .map((l) => ({
      id: num(l.id) ?? 0,
      levelNo: num(l.levelNo) ?? 0,
      levelName: str(l.levelName),
      requiredRole: str(l.requiredRole),
    }))
    .sort((a, b) => a.levelNo - b.levelNo)
}

/* ---------- approvals: GET /api/approvals and the approve / reject decisions ---------- */

export type ApprovalDecision = {
  id: number
  applicationId: number
  levelId: number | null
  /** APPROVED or REJECTED */
  decision: string
  approverId: number | null
  comments: string
  decidedAt: string
}

const approvalsKey = ['approvals'] as const

// every decision made so far (raw CRUD, read-only use): one row per application and level
export const useApprovalDecisions = () =>
  useQuery({
    queryKey: approvalsKey,
    queryFn: async (): Promise<ApprovalDecision[]> => {
      const raw = await api<unknown>('/api/approvals')
      const list = Array.isArray(raw) ? raw : arr(asRecord(raw).data)
      return list
        .map(asRecord)
        .map((a) => ({
          id: num(a.id) ?? 0,
          applicationId: num(pick(a, 'applicationId')) ?? num(asRecord(a.application).id) ?? 0,
          levelId: num(pick(a, 'approvalLevelId', 'levelId')) ?? num(asRecord(pick(a, 'approvalLevel', 'level')).id),
          decision: str(a.decision).toUpperCase(),
          approverId: idOf(pick(a, 'approverId', 'approver')),
          comments: str(a.comments),
          decidedAt: str(a.decidedAt),
        }))
        .filter((a) => a.id > 0)
        .sort((a, b) => a.id - b.id)
    },
  })

// POST /api/loan-origination/applications/{id}/approve or /reject { approverId, comments }.
// The backend decides the application's current level and checks the approver's role against it
export async function decideApplication(
  id: number,
  decision: 'approve' | 'reject',
  body: { approverId: number; comments: string },
) {
  try {
    await api<unknown>(`/api/loan-origination/applications/${id}/${decision}`, { method: 'POST', body })
  } finally {
    // the list and each application's own reads (record, workflow...) are all under 'loan-applications'
    void refresh()
    void queryClient.invalidateQueries({ queryKey: approvalsKey })
  }
}

/* ---------- POST /api/loan-applications/{id}/finalize ---------- */

export async function finalizeLoanApplication(id: number) {
  const res = await api(`/api/loan-applications/${id}/finalize`, { method: 'POST', schema: wrapped })
  void refresh()
  return toDraft(res.data)
}
