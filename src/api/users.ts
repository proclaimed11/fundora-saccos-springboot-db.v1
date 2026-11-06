import { api } from './client'
import { userSchema, type UserRecord } from './schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { User } from '../pages/administration/users/usersData'
import { formatUserName } from '../utils/userName'
/* ---------- small readers, the response shape is not documented so nothing is trusted blindly ---------- */

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const bool = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback)

// the generic CRUD endpoints answer with a plain array, a wrapped one is accepted too
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : Array.isArray(rec(v).data) ? (rec(v).data as unknown[]) : [])

/* ---------- roles ---------- */

export type ApiRole = { id: number; name: string; description: string; isActive: boolean }

const toRole = (raw: unknown): ApiRole => {
  const r = rec(raw)
  return {
    id: num(r.id) ?? 0,
    name: str(r.name),
    description: str(r.description),
    isActive: bool(r.isActive ?? r.active, true),
  }
}

export const useApiRoles = () =>
  useQuery({
    queryKey: ['roles'],
    queryFn: async () => asList(await api<unknown>('/api/roles')).map(toRole),
  })

/* ---------- users ---------- */

// the date part of a date-time like 2026-09-30T11:04:21.243346
const day = (v: unknown) => {
  const s = str(v)
  return s ? s.slice(0, 10) : null
}

// turns one row of the users table into what the page shows. password_hash is never read.
export function toUser(raw: unknown, roles: ApiRole[]): User {
  const r = rec(raw)
  const roleObj = rec(r.role)
  const roleId = num(r.roleId) ?? num(r.role_id) ?? num(roleObj.id)
  const username = str(r.username)

  return {
    id: num(r.id) ?? 0,
    firstName: str(r.firstName ?? r.first_name),
    middleName: str(r.middleName ?? r.middle_name),
    lastName: str(r.lastName ?? r.last_name),
    name: formatUserName(
      {
        firstName: str(r.firstName ?? r.first_name),
        middleName: str(r.middleName ?? r.middle_name),
        lastName: str(r.lastName ?? r.last_name),
      },
      'Unknown',
    ),
    username,
    email: str(r.email),
    phone: str(r.phone),
    role: str(roleObj.name) || roles.find((x) => x.id === roleId)?.name || null,
    roleId,
    active: bool(r.isActive ?? r.active, true),
    twoFactor: bool(r.isTwoFactorEnabled ?? r.twoFactorEnabled),
    lastLogin: day(r.lastLoginAt),
    created: day(r.createdAt) ?? '',
  }
}

export type UserPayload = {
  username: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  phone: string
  roleId: number | null
  isActive: boolean
  isTwoFactorEnabled: boolean
  /** the PLAIN password, the API checks the length and hashes it. Leave it out to keep the old one. */
  passwordHash?: string
}

// the role goes both as roleId and as role: { id }, whichever the Spring model reads is used.
// Unknown fields are ignored by default, delete the one you do not need once you know.
const withRole = (p: UserPayload) => (p.roleId === null ? p : { ...p, role: { id: p.roleId } })

// a full body for PUT, built from the row so a change of one field does not blank the others
export const userBody = (u: User, patch: Partial<UserPayload> = {}) =>
  withRole({
    username: u.username,
    firstName: u.firstName ?? '',
    middleName: u.middleName ?? '',
    lastName: u.lastName ?? '',
    email: u.email,
    phone: u.phone,
    roleId: u.roleId ?? null,
    isActive: u.active,
    isTwoFactorEnabled: u.twoFactor,
    ...patch,
  })

export const useApiUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: async () => asList(await api<unknown>('/api/users')),
  })

export function useUserMutations() {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] })

  const create = useMutation({
    mutationFn: (payload: UserPayload) => api('/api/users', { method: 'POST', body: withRole(payload) }),
    onSuccess: refresh,
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReturnType<typeof userBody> }) =>
      api(`/api/users/${id}`, { method: 'PUT', body }),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })

  return { create, update, remove }
}

// raw CRUD, needs the session token
export const getUserRequest = (id: number) => api<UserRecord>(`/api/users/${id}`, { schema: userSchema })