import { api } from './client'

export type SessionLimits = { idleTimeoutMinutes: number; absoluteTimeoutHours: number }

const SAVED_KEY = 'fundora-session-limits-v1'

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

// GET /api/security/settings answers { success, message, data: { idleTimeoutMinutes, absoluteTimeoutHours, ... } }
export async function fetchSessionLimits(): Promise<Partial<SessionLimits>> {
  const res = rec(await api<unknown>('/api/security/settings'))
  const data = rec(res.data ?? res)
  const limits = {
    idleTimeoutMinutes: typeof data.idleTimeoutMinutes === 'number' ? data.idleTimeoutMinutes : undefined,
    absoluteTimeoutHours: typeof data.absoluteTimeoutHours === 'number' ? data.absoluteTimeoutHours : undefined,
  }

  // keep a copy, the session expired page has no token to ask the server with
  if (limits.idleTimeoutMinutes !== undefined && limits.absoluteTimeoutHours !== undefined) {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(limits))
    } catch {
      // storage blocked, the defaults are shown instead
    }
  }
  return limits
}

// the last limits the server gave, or the backend defaults
export function savedSessionLimits(): SessionLimits {
  try {
    const saved = rec(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? 'null'))
    if (typeof saved.idleTimeoutMinutes === 'number' && typeof saved.absoluteTimeoutHours === 'number') {
      return { idleTimeoutMinutes: saved.idleTimeoutMinutes, absoluteTimeoutHours: saved.absoluteTimeoutHours }
    }
  } catch {
    // fall through to the defaults
  }
  return { idleTimeoutMinutes: 30, absoluteTimeoutHours: 12 }
}

// any authenticated call counts as activity on the server, this one is small and read-only
export const pingSession = () => api<unknown>('/api/security/settings')