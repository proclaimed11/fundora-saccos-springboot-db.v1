import { z } from 'zod'
import { useQuery, useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { ApiError, api } from './client'
import { queryClient } from './queryClient'
import { messageResponseSchema, type MessageResponse } from './schemas'
import { STATUS, fullName, type Applicant, type ApplicantStatus } from '../pages/applicants/applicantsData'

/* ---------- reading applicants: GET /api/applicants (raw CRUD) ---------- */

// the columns of the applicant table. The JSON name of a boolean depends on how the backend declares it,
// so both isReturning and returning are accepted. Fields not listed here (gpsLocation...) are dropped.
const applicantRowSchema = z.object({
  id: z.number(),
  applicantNo: z.string().nullish(),
  firstName: z.string().nullish(),
  middleName: z.string().nullish(),
  lastName: z.string().nullish(),
  gender: z.string().nullish(),
  dateOfBirth: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  address: z.string().nullish(),
  occupation: z.string().nullish(),
  locationName: z.string().nullish(),
  locationPin: z.string().nullish(),
  nationality: z.string().nullish(),
  status: z.string().nullish(),
  isReturning: z.boolean().nullish(),
  returning: z.boolean().nullish(),
  createdAt: z.string().nullish(),
})

type ApplicantRow = z.infer<typeof applicantRowSchema>

// the list is a plain array, or wrapped as { data: [...] }
const applicantListSchema = z.union([
  z.array(applicantRowSchema),
  z.object({ data: z.array(applicantRowSchema) }),
])

// MALE -> Male, the forms use this spelling
const titleCase = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '')

const STATUSES = Object.keys(STATUS)

// the table row -> the shape every applicant screen already uses
export function toApplicant(r: ApplicantRow): Applicant {
  const firstName = r.firstName ?? ''
  const middleName = r.middleName ?? ''
  const lastName = r.lastName ?? ''
  return {
    id: r.id,
    applicantNo: r.applicantNo ?? '',
    name: fullName({ firstName, middleName, lastName }),
    firstName,
    middleName,
    lastName,
    gender: titleCase(r.gender ?? ''),
    dateOfBirth: r.dateOfBirth ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    address: r.address ?? '',
    occupation: r.occupation ?? '',
    location: r.locationName ?? '',
    locationPin: r.locationPin ?? '',
    nationality: r.nationality ?? '',
    // a status this app does not know is treated as the first stage instead of breaking the page
    status: r.status && STATUSES.includes(r.status) ? (r.status as ApplicantStatus) : 'PENDING_OTP',
    isReturning: r.isReturning ?? r.returning ?? false,
    registered: r.createdAt ? dayjs(r.createdAt).format('YYYY-MM-DD') : '',
  }
}

export async function getApplicants(): Promise<Applicant[]> {
  const res = await api('/api/applicants', { schema: applicantListSchema })
  return (Array.isArray(res) ? res : res.data).map(toApplicant)
}

export async function getApplicant(id: number): Promise<Applicant> {
  const raw = await api<unknown>(`/api/applicants/${id}`)

  // an id that does not exist can come back as a 404 (handled by the client) or as an empty body
  if (raw === null || raw === undefined || raw === '') throw new ApiError('Applicant not found', 404)

  const body = (raw as { data?: unknown }).data ?? raw
  const parsed = applicantRowSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('The server sent an applicant record this app cannot read.', 500)
  return toApplicant(parsed.data)
}

export const applicantKeys = {
  all: ['applicants'] as const,
  one: (id: number) => ['applicants', id] as const,
  // starts with ['applicants'], so every mutation below that refreshes the applicants refreshes this too
  history: (id: number) => ['applicants', id, 'history'] as const,
}

export const useApplicants = () => useQuery({ queryKey: applicantKeys.all, queryFn: getApplicants })

// the id comes from the address bar, so it can be anything
export function useApplicant(id: string | undefined) {
  const n = Number(id)
  const valid = Number.isInteger(n) && n > 0
  return useQuery({ queryKey: applicantKeys.one(n), queryFn: () => getApplicant(n), enabled: valid })
}

// registering and verifying change the list, so the cached copy is thrown away
const refreshApplicants = () => void queryClient.invalidateQueries({ queryKey: applicantKeys.all })

/* ---------- onboarding ---------- */

// POST /api/onboarding/register answers { success, message, data: { id, applicantNo, status, ... } }
const registerResponseSchema = z.object({
  message: z.string().optional(),
  data: z.object({
    id: z.number(),
    applicantNo: z.string(),
    status: z.string(),
  }),
})

export type RegisterResponse = z.infer<typeof registerResponseSchema>

export type RegisterBody = {
  firstName: string
  middleName: string
  lastName: string
  /** the table stores MALE or FEMALE */
  gender: string
  /** yyyy-MM-dd */
  dateOfBirth: string
  phone: string
  email: string
  address: string
  nationality: string
  occupation: string
  locationName: string
  locationPin: string
  isReturning: boolean
  nidaNumber: string
  nidaDocumentPath: string
  /** optional, left out when empty */
  tinNumber?: string
  idScanFilePath: string
  idScanFileName: string
  idScanMimeType: string
}

// the onboarding endpoints are public, so they never carry a token
export const registerApplicantRequest = (body: RegisterBody) =>
  api<RegisterResponse>('/api/onboarding/register', {
    method: 'POST',
    body,
    schema: registerResponseSchema,
    public: true,
  }).then((res) => {
    refreshApplicants()
    return res
  })

export const sendOtpRequest = (applicantId: number, destination: string) =>
  api<MessageResponse>('/api/onboarding/otp/send', {
    method: 'POST',
    body: { applicantId, channel: 'EMAIL', destination },
    schema: messageResponseSchema,
    public: true,
  })

export const verifyOtpRequest = (applicantId: number, code: string) =>
  api<MessageResponse>('/api/onboarding/otp/verify', {
    method: 'POST',
    body: { applicantId, code },
    schema: messageResponseSchema,
    public: true,
  }).then((res) => {
    refreshApplicants()
    return res
  })

  /* ---------- small reader ---------- */

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/* ---------- identification: GET /api/applicant-identifications (raw CRUD) ---------- */

const identificationRowSchema = z.object({
  id: z.number(),
  applicantId: z.number().nullish(),
  applicant: z.object({ id: z.number() }).nullish(),
  idType: z.string().nullish(),
  idNumber: z.string().nullish(),
  verified: z.boolean().nullish(),
  verifiedAt: z.string().nullish(),
  verifiedBy: z.number().nullish(),
})

type IdentificationRow = z.infer<typeof identificationRowSchema>

const identificationListSchema = z.union([
  z.array(identificationRowSchema),
  z.object({ data: z.array(identificationRowSchema) }),
])

export type Identification = {
  id: number
  applicantId: number
  /** NIDA or TIN, upper-cased */
  type: string
  number: string
  verified: boolean
  /** the user id from the table, the name is looked up from the users list */
  verifiedBy: number | null
  verifiedAt: string | null
}

const toIdentification = (r: IdentificationRow): Identification => ({
  id: r.id,
  applicantId: r.applicantId ?? r.applicant?.id ?? 0,
  type: (r.idType ?? '').toUpperCase(),
  number: r.idNumber ?? '',
  verified: r.verified ?? false,
  verifiedBy: r.verifiedBy ?? null,
  verifiedAt: r.verifiedAt ? r.verifiedAt.slice(0, 10) : null,
})

export async function getIdentifications(): Promise<Identification[]> {
  const res = await api('/api/applicant-identifications', { schema: identificationListSchema })
  return (Array.isArray(res) ? res : res.data).map(toIdentification)
}

export const identificationKeys = { all: ['identifications'] as const }

// the whole table, used by the KYC review page
export const useAllIdentifications = () =>
  useQuery({ queryKey: identificationKeys.all, queryFn: getIdentifications })

// one applicant's rows, from the same cached list
export const useIdentifications = (applicantId: number) =>
  useQuery({
    queryKey: identificationKeys.all,
    queryFn: getIdentifications,
    select: (list) => list.filter((i) => i.applicantId === applicantId),
  })

// POST /api/onboarding/identification/verify
export function useVerifyIdentification() {
  return useMutation({
    mutationFn: (body: { identificationId: number; verifiedBy: number }) =>
      api<MessageResponse>('/api/onboarding/identification/verify', {
        method: 'POST',
        body,
        schema: messageResponseSchema,
      }),
    // returning the promise makes the caller wait until the list is fresh
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identificationKeys.all }),
  })
}

/* ---------- KYC ---------- */

const kycResultSchema = z.object({
  message: z.string().optional(),
  data: z
    .object({ id: z.number().optional(), status: z.string().optional(), expiresAt: z.string().nullish() })
    .nullish(),
})

export type KycResult = z.infer<typeof kycResultSchema>

export type KycDecisionBody = {
  applicantId: number
  status: 'APPROVED' | 'REJECTED'
  remarks: string
  verifiedBy: number
}

// POST /api/onboarding/kyc/decision, the applicant becomes KYC_APPROVED or REJECTED
export function useKycDecision() {
  return useMutation({
    mutationFn: (body: KycDecisionBody) =>
      api<KycResult>('/api/onboarding/kyc/decision', { method: 'POST', body, schema: kycResultSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicantKeys.all }),
  })
}

// POST /api/onboarding/kyc/check-returning/{id}. "No valid existing KYC found" comes back as success: false,
// which the client turns into an ApiError, so the dialog reads the message to tell it from a real failure
export const checkReturningKycRequest = (applicantId: number) =>
  api<KycResult>(`/api/onboarding/kyc/check-returning/${applicantId}`, {
    method: 'POST',
    schema: kycResultSchema,
  }).then((res) => {
    refreshApplicants()
    return res
  })

/* ---------- status history: GET /api/applicant-status-historys/applicant/{id} ---------- */

const historyRowSchema = z.object({
  id: z.number(),
  oldStatus: z.string().nullish(),
  newStatus: z.string().nullish(),
  changedBy: z.number().nullish(),
  remarks: z.string().nullish(),
  changedAt: z.string().nullish(),
})

export type StatusHistory = z.infer<typeof historyRowSchema>

const historyListSchema = z.union([z.array(historyRowSchema), z.object({ data: z.array(historyRowSchema) })])

export async function getApplicantHistory(id: number): Promise<StatusHistory[]> {
  const res = await api(`/api/applicant-status-historys/applicant/${id}`, { schema: historyListSchema })
  return Array.isArray(res) ? res : res.data
}

export const useApplicantHistory = (id: number) =>
  useQuery({ queryKey: applicantKeys.history(id), queryFn: () => getApplicantHistory(id) })

/* ---------- edit: PUT /api/applicants/{id} ---------- */

export type ApplicantEdit = {
  firstName: string
  middleName: string
  lastName: string
  /** Male or Female, sent as MALE or FEMALE */
  gender: string
  /** yyyy-MM-dd */
  dateOfBirth: string
  phone: string
  email: string
  address: string
  nationality: string
  occupation: string
  locationName: string
  locationPin: string
  isReturning: boolean
}

// The PUT does not merge, so the saved row is read first and sent back with only the edited fields changed.
// That keeps createdAt, gpsLocation, status and anything else the form does not show.
export async function updateApplicantRequest(id: number, edit: ApplicantEdit) {
  const raw = asRecord(await api<unknown>(`/api/applicants/${id}`))
  const current = asRecord(raw.data ?? raw)
  if (Object.keys(current).length === 0) throw new ApiError('Applicant not found', 404)

  const { isReturning, ...rest } = edit
  // the JSON name of the boolean depends on the backend, use the one the row already has
  const flag = 'returning' in current && !('isReturning' in current) ? 'returning' : 'isReturning'

  return api<unknown>(`/api/applicants/${id}`, {
    method: 'PUT',
    body: {
      ...current,
      ...rest,
      gender: rest.gender.toUpperCase(),
      dateOfBirth: dayjs(rest.dateOfBirth).format('YYYY-MM-DD'),
      [flag]: isReturning,
    },
  })
}

export function useUpdateApplicant() {
  return useMutation({
    mutationFn: ({ id, edit }: { id: number; edit: ApplicantEdit }) => updateApplicantRequest(id, edit),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicantKeys.all }),
  })
}