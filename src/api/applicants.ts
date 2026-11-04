import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
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