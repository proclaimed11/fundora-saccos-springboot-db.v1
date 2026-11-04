import { z } from 'zod'
import { api } from './client'
import { messageResponseSchema, type MessageResponse } from './schemas'

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
  })