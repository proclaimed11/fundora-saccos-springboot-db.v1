import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { api } from './client'
import { queryClient } from './queryClient'
import type {
  ApplicantAccount,
  ApplicantDocument,
  ExistingDebt,
  FinancialProfile,
} from '../pages/applicants/applicantsData'

// The records an applicant has besides the applicant row itself. These are raw CRUD modules: the API document
// lists them but not their fields, so the fields below follow the database tables (dbTables.txt), camelCased.
// Each GET returns the whole table, so one applicant's rows are filtered out here, like the identifications.

/* ---------- shared readers ---------- */

// numeric(38,2) columns can arrive as a number or a string
const money = z.union([z.number(), z.string()]).nullish()
const toNumber = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v))

// the link to the applicant comes back as applicantId or as a nested applicant object
const owner = { applicantId: z.number().nullish(), applicant: z.object({ id: z.number() }).nullish() }
const ownerOf = (r: { applicantId?: number | null; applicant?: { id: number } | null }) =>
  r.applicantId ?? r.applicant?.id ?? 0

// writes send both spellings of the link, the backend ignores the one its model does not have
const ownerBody = (applicantId: number) => ({ applicantId, applicant: { id: applicantId } })

// a list is a plain array, or wrapped as { data: [...] }
const listOf = <T extends z.ZodTypeAny>(row: T) => z.union([z.array(row), z.object({ data: z.array(row) })])
const rowsOf = <T,>(res: T[] | { data: T[] }) => (Array.isArray(res) ? res : res.data)

const now = () => dayjs().format('YYYY-MM-DDTHH:mm:ss')
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '')

/* ---------- onboarding status: GET /api/onboarding/{applicantId}/status ---------- */

const onboardingStatusSchema = z.object({
  id: z.number(),
  applicantNo: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  status: z.string().nullish(),
  nationality: z.string().nullish(),
  occupation: z.string().nullish(),
  isReturning: z.boolean().nullish(),
})

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>

// public like the other onboarding calls. Only a summary: use GET /api/applicants/{id} for the full record.
export const getOnboardingStatus = (applicantId: number) =>
  api(`/api/onboarding/${applicantId}/status`, { schema: onboardingStatusSchema, public: true })

export const useOnboardingStatus = (applicantId: number) =>
  useQuery({
    queryKey: ['applicants', applicantId, 'onboarding-status'],
    queryFn: () => getOnboardingStatus(applicantId),
    enabled: applicantId > 0,
  })

/* ---------- KYC history: GET /api/kyc-verifications ---------- */

// no table listing for kyc_verification, so the fields come from the /kyc/decision response in the API document
const kycRowSchema = z.object({
  id: z.number(),
  ...owner,
  status: z.string().nullish(),
  verificationType: z.string().nullish(),
  remarks: z.string().nullish(),
  verifiedBy: z.number().nullish(),
  verifiedAt: z.string().nullish(),
  createdAt: z.string().nullish(),
  expiresAt: z.string().nullish(),
})

export type KycVerification = {
  id: number
  applicantId: number
  status: 'APPROVED' | 'REJECTED'
  verificationType: 'FULL_KYC' | 'RETURNING_CHECK'
  remarks: string
  /** user id, the name is looked up from the users list */
  verifiedBy: number | null
  /** yyyy-MM-dd */
  date: string
  /** yyyy-MM-dd, an approval is valid for 12 months */
  expiresAt: string | null
}

const toKyc = (r: z.infer<typeof kycRowSchema>): KycVerification => ({
  id: r.id,
  applicantId: ownerOf(r),
  status: (r.status ?? '').toUpperCase() === 'APPROVED' ? 'APPROVED' : 'REJECTED',
  verificationType: (r.verificationType ?? '').toUpperCase() === 'FULL_KYC' ? 'FULL_KYC' : 'RETURNING_CHECK',
  remarks: r.remarks ?? '',
  verifiedBy: r.verifiedBy ?? null,
  date: day(r.verifiedAt ?? r.createdAt),
  expiresAt: r.expiresAt ? day(r.expiresAt) : null,
})

const kycKey = ['kyc-verifications'] as const

// newest first
export const useKycHistory = (applicantId: number) =>
  useQuery({
    queryKey: kycKey,
    queryFn: async () => rowsOf(await api('/api/kyc-verifications', { schema: listOf(kycRowSchema) })).map(toKyc),
    select: (list) =>
      list.filter((k) => k.applicantId === applicantId).sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id),
  })

/* ---------- documents: /api/applicant-documents ---------- */

// the table stores codes (registration writes ID_SCAN), the screens show labels
const DOC_CODES: Record<string, string> = {
  'NIDA document': 'NIDA',
  'ID scan': 'ID_SCAN',
  'TIN certificate': 'TIN',
  'Proof of address': 'PROOF_OF_ADDRESS',
  'Passport photo': 'PASSPORT_PHOTO',
  Other: 'OTHER',
}
const docLabel = (code: string | null | undefined) =>
  Object.keys(DOC_CODES).find((label) => DOC_CODES[label] === (code ?? '').toUpperCase()) ?? 'Other'

const documentRowSchema = z.object({
  id: z.number(),
  ...owner,
  documentType: z.string().nullish(),
  fileName: z.string().nullish(),
  filePath: z.string().nullish(),
  mimeType: z.string().nullish(),
  uploadedAt: z.string().nullish(),
  uploadedBy: z.number().nullish(),
  verified: z.boolean().nullish(),
})

export type DocumentRecord = Omit<ApplicantDocument, 'uploadedBy'> & {
  applicantId: number
  /** user id, null for files saved at registration */
  uploadedBy: number | null
  filePath: string
}

const toDocument = (r: z.infer<typeof documentRowSchema>): DocumentRecord => ({
  id: r.id,
  applicantId: ownerOf(r),
  type: docLabel(r.documentType),
  fileName: r.fileName ?? r.filePath?.split('/').pop() ?? '',
  filePath: r.filePath ?? '',
  // the table has no size or notes columns
  sizeKb: 0,
  notes: '',
  uploaded: day(r.uploadedAt),
  uploadedBy: r.uploadedBy ?? null,
})

const documentsKey = ['applicant-documents'] as const

const getDocuments = async () =>
  rowsOf(await api('/api/applicant-documents', { schema: listOf(documentRowSchema) })).map(toDocument)

// the whole table, used by the KYC review queue
export const useAllApplicantDocuments = () => useQuery({ queryKey: documentsKey, queryFn: getDocuments })

// one applicant's rows, from the same cached list
export const useApplicantDocuments = (applicantId: number) =>
  useQuery({
    queryKey: documentsKey,
    queryFn: getDocuments,
    select: (list) => list.filter((d) => d.applicantId === applicantId),
  })

export type DocumentSave = {
  applicantId: number
  /** set when replacing */
  id?: number
  type: string
  fileName: string
  mimeType: string
  uploadedBy: number
}

// TODO: the API has no file upload for applicant documents yet, so only the record is saved and the
// path is where the file is expected to live, the same convention registration uses
export function useSaveDocument() {
  return useMutation({
    mutationFn: ({ id, applicantId, type, fileName, mimeType, uploadedBy }: DocumentSave) =>
      api<unknown>(id ? `/api/applicant-documents/${id}` : '/api/applicant-documents', {
        method: id ? 'PUT' : 'POST',
        body: {
          ...(id ? { id } : {}),
          ...ownerBody(applicantId),
          documentType: DOC_CODES[type] ?? 'OTHER',
          fileName,
          filePath: `/uploads/${fileName}`,
          mimeType,
          uploadedAt: now(),
          uploadedBy,
          verified: false,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsKey }),
  })
}

export function useDeleteDocument() {
  return useMutation({
    mutationFn: (id: number) => api<unknown>(`/api/applicant-documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsKey }),
  })
}

/* ---------- financial profile: /api/financial-profiles ---------- */

const profileRowSchema = z.object({
  id: z.number(),
  ...owner,
  assessedAt: z.string().nullish(),
  incomeSource: z.string().nullish(),
  monthlyCashFlow: money,
  monthlyExpenses: money,
  monthlyIncome: money,
  remarks: z.string().nullish(),
})

export type ProfileRecord = FinancialProfile & { id: number; applicantId: number; assessedAt: string }

// The table has income_source and remarks but no employer or dependants columns:
// the employment type goes in income_source, the employer in remarks, and dependants are not stored.
const toProfile = (r: z.infer<typeof profileRowSchema>): ProfileRecord => ({
  id: r.id,
  applicantId: ownerOf(r),
  assessedAt: r.assessedAt ?? '',
  employmentType: r.incomeSource ?? '',
  employer: r.remarks ?? '',
  monthlyIncome: toNumber(r.monthlyIncome),
  monthlyExpenses: toNumber(r.monthlyExpenses),
  dependants: 0,
})

const profilesKey = ['financial-profiles'] as const

// an applicant should have one profile, the latest assessment wins if there are more
export const useFinancialProfile = (applicantId: number) =>
  useQuery({
    queryKey: profilesKey,
    queryFn: async () =>
      rowsOf(await api('/api/financial-profiles', { schema: listOf(profileRowSchema) })).map(toProfile),
    select: (list) =>
      list
        .filter((p) => p.applicantId === applicantId)
        .sort((x, y) => y.assessedAt.localeCompare(x.assessedAt) || y.id - x.id)[0] ?? null,
  })

export function useSaveFinancialProfile() {
  return useMutation({
    mutationFn: ({ id, applicantId, profile }: { id?: number; applicantId: number; profile: FinancialProfile }) =>
      api<unknown>(id ? `/api/financial-profiles/${id}` : '/api/financial-profiles', {
        method: id ? 'PUT' : 'POST',
        body: {
          ...(id ? { id } : {}),
          ...ownerBody(applicantId),
          assessedAt: now(),
          incomeSource: profile.employmentType,
          remarks: profile.employer,
          monthlyIncome: profile.monthlyIncome,
          monthlyExpenses: profile.monthlyExpenses,
          monthlyCashFlow: profile.monthlyIncome - profile.monthlyExpenses,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profilesKey }),
  })
}

/* ---------- existing debts: /api/existing-debts ---------- */

const debtRowSchema = z.object({
  id: z.number(),
  ...owner,
  createdAt: z.string().nullish(),
  creditor: z.string().nullish(),
  dueDate: z.string().nullish(),
  monthlyPayment: money,
  outstandingAmount: money,
  status: z.string().nullish(),
})

type DebtRow = z.infer<typeof debtRowSchema>
export type DebtRecord = ExistingDebt & { applicantId: number; raw: DebtRow }

const toDebt = (r: DebtRow): DebtRecord => ({
  id: r.id,
  applicantId: ownerOf(r),
  lender: r.creditor ?? '',
  balance: toNumber(r.outstandingAmount),
  monthly: toNumber(r.monthlyPayment),
  raw: r,
})

const debtsKey = ['existing-debts'] as const

export const useExistingDebts = (applicantId: number) =>
  useQuery({
    queryKey: debtsKey,
    queryFn: async () => rowsOf(await api('/api/existing-debts', { schema: listOf(debtRowSchema) })).map(toDebt),
    // a paid-off debt no longer counts
    select: (list) =>
      list.filter((d) => d.applicantId === applicantId && (d.raw.status ?? 'ACTIVE').toUpperCase() !== 'CLOSED'),
  })

export function useSaveDebt() {
  return useMutation({
    // an edit keeps the columns the dialog does not show (createdAt, dueDate, status)
    mutationFn: ({ current, applicantId, debt }: { current?: DebtRecord; applicantId: number; debt: Omit<ExistingDebt, 'id'> }) =>
      api<unknown>(current ? `/api/existing-debts/${current.id}` : '/api/existing-debts', {
        method: current ? 'PUT' : 'POST',
        body: {
          ...(current ? current.raw : { createdAt: now(), status: 'ACTIVE', dueDate: null }),
          ...ownerBody(applicantId),
          creditor: debt.lender,
          outstandingAmount: debt.balance,
          monthlyPayment: debt.monthly,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtsKey }),
  })
}

export function useDeleteDebt() {
  return useMutation({
    mutationFn: (id: number) => api<unknown>(`/api/existing-debts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtsKey }),
  })
}

/* ---------- member accounts: /api/member-accounts ---------- */

const accountRowSchema = z.object({
  id: z.number(),
  ...owner,
  accountNumber: z.string().nullish(),
  accountType: z.string().nullish(),
  bankName: z.string().nullish(),
  createdAt: z.string().nullish(),
  mobileNumber: z.string().nullish(),
  status: z.string().nullish(),
})

type AccountRow = z.infer<typeof accountRowSchema>
export type AccountRecord = ApplicantAccount & { applicantId: number; raw: AccountRow }

// The table has no "primary" column, so the primary account is the one whose status is PRIMARY,
// the others are ACTIVE. With none marked, the oldest account counts as primary.
const PRIMARY = 'PRIMARY'

const toAccount = (r: AccountRow): AccountRecord => {
  const bank = (r.accountType ?? '').toUpperCase().includes('BANK')
  return {
    id: r.id,
    applicantId: ownerOf(r),
    method: bank ? 'BANK_TRANSFER' : 'MOBILE_MONEY',
    provider: r.bankName ?? '',
    number: (bank ? r.accountNumber : (r.mobileNumber ?? r.accountNumber)) ?? '',
    primary: (r.status ?? '').toUpperCase() === PRIMARY,
    raw: r,
  }
}

const accountsKey = ['member-accounts'] as const

export const useMemberAccounts = (applicantId: number) =>
  useQuery({
    queryKey: accountsKey,
    queryFn: async () =>
      rowsOf(await api('/api/member-accounts', { schema: listOf(accountRowSchema) })).map(toAccount),
    select: (list) => {
      const mine = list
        .filter((a) => a.applicantId === applicantId && (a.raw.status ?? '').toUpperCase() !== 'CLOSED')
        .sort((x, y) => x.id - y.id)
      return mine.some((a) => a.primary) ? mine : mine.map((a, i) => ({ ...a, primary: i === 0 }))
    },
  })

const accountBody = (applicantId: number, a: Omit<ApplicantAccount, 'id'>, raw?: AccountRow) => ({
  ...(raw ?? { createdAt: now() }),
  ...ownerBody(applicantId),
  accountType: a.method,
  bankName: a.provider,
  accountNumber: a.number,
  mobileNumber: a.method === 'MOBILE_MONEY' ? a.number : null,
  status: a.primary ? PRIMARY : 'ACTIVE',
})

const putAccount = (applicantId: number, a: AccountRecord, primary: boolean) =>
  api<unknown>(`/api/member-accounts/${a.id}`, {
    method: 'PUT',
    body: accountBody(applicantId, { ...a, primary }, a.raw),
  })

// saves one account; when it becomes primary, the old primary is demoted first
export function useSaveAccount() {
  return useMutation({
    mutationFn: async ({
      current,
      applicantId,
      account,
      others,
    }: {
      current?: AccountRecord
      applicantId: number
      account: Omit<ApplicantAccount, 'id'>
      /** the applicant's other accounts */
      others: AccountRecord[]
    }) => {
      if (account.primary) {
        for (const o of others.filter((o) => o.primary)) await putAccount(applicantId, o, false)
      }
      return api<unknown>(current ? `/api/member-accounts/${current.id}` : '/api/member-accounts', {
        method: current ? 'PUT' : 'POST',
        body: accountBody(applicantId, account, current?.raw),
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  })
}

export function useDeleteAccount() {
  return useMutation({
    // when the primary one goes, the next remaining account takes over
    mutationFn: async ({ target, applicantId, next }: { target: AccountRecord; applicantId: number; next?: AccountRecord }) => {
      await api<unknown>(`/api/member-accounts/${target.id}`, { method: 'DELETE' })
      if (target.primary && next) await putAccount(applicantId, next, true)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  })
}
