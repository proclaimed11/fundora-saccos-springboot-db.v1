import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import { SAMPLE_SETTINGS } from '../pages/administration/security/securityData'

const settingsSchema = z.object({
  data: z.object({
    minPasswordLength: z.number(),
    idleTimeoutMinutes: z.number(),
    absoluteTimeoutHours: z.number(),
    otpExpiryMinutes: z.number(),
  }),
})

export const getSecuritySettings = async () =>
  (await api('/api/security/settings', { schema: settingsSchema })).data

// the sample values show until the server answers, and stay if it fails
export function useSecuritySettings() {
  return useQuery({
    queryKey: ['security-settings'],
    queryFn: getSecuritySettings,
    placeholderData: SAMPLE_SETTINGS,
    staleTime: 5 * 60_000,
  })
}