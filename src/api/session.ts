import { api } from './client'

export type SessionLimits = { idleTimeoutMinutes: number; absoluteTimeoutHours: number }

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

// GET /api/security/settings answers { success, message, data: { idleTimeoutMinutes, absoluteTimeoutHours, ... } }
export async function fetchSessionLimits(): Promise<Partial<SessionLimits>> {
  const res = rec(await api<unknown>('/api/security/settings'))
  const data = rec(res.data ?? res)
  return {
    idleTimeoutMinutes: typeof data.idleTimeoutMinutes === 'number' ? data.idleTimeoutMinutes : undefined,
    absoluteTimeoutHours: typeof data.absoluteTimeoutHours === 'number' ? data.absoluteTimeoutHours : undefined,
  }
}

// any authenticated call counts as activity on the server, this one is small and read-only
export const pingSession = () => api<unknown>('/api/security/settings')