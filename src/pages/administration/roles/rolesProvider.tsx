import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../../auth/authContext'
import type { Permission } from '../../../api/schemas'
import { ADMIN_ROLE, RolesContext, type RolesContextValue } from './rolesContext'
import { MODULES, SAMPLE_ROLES, permits, type Permissions, type Role } from './rolesData'

// bump the version if the shape of a role changes, old saved data is then ignored
const ROLES_KEY = 'fundora-roles-v2'

const clone = (list: Role[]): Role[] =>
  list.map((r) => ({
    ...r,
    permissions: Object.fromEntries(Object.entries(r.permissions).map(([k, v]) => [k, [...v]])),
  }))

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRole(value: unknown): value is Role {
  if (!isRecord(value)) return false
  const { id, name, description, level, system, permissions, created } = value
  return (
    typeof id === 'number' &&
    typeof name === 'string' &&
    typeof description === 'string' &&
    (level === null || typeof level === 'string') &&
    typeof system === 'boolean' &&
    typeof created === 'string' &&
    isRecord(permissions) &&
    Object.values(permissions).every((list) => Array.isArray(list) && list.every((a) => typeof a === 'string'))
  )
}

function loadRoles(): Role[] {
  try {
    const stored = window.localStorage.getItem(ROLES_KEY)
    if (!stored) return clone(SAMPLE_ROLES)
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return clone(SAMPLE_ROLES)

    const valid = parsed.filter(isRole)
    if (valid.length === 0) return clone(SAMPLE_ROLES)

    // a system role must never be missing, the approval chain looks them up by name
    const missing = SAMPLE_ROLES.filter((s) => s.system && !valid.some((r) => r.system && r.name === s.name))
    return [...clone(missing), ...valid]
  } catch {
    return clone(SAMPLE_ROLES)
  }
}

// the API sends one row per grant { area, page, action }, the UI checks the 'area' and 'area.page' keys
function toPermissions(grants: Permission[]): Permissions {
  const out: Permissions = {}
  grants.forEach((g) => {
    const key = g.page ? `${g.area}.${g.page}` : g.area
    const list = out[key] ?? (out[key] = [])
    if (!list.includes(g.action)) list.push(g.action)
  })
  return out
}

export function RolesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [roles, setRoles] = useState<Role[]>(loadRoles)

  // every edit made on the Roles page is saved, so a refresh keeps it
  useEffect(() => {
    try {
      window.localStorage.setItem(ROLES_KEY, JSON.stringify(roles))
    } catch {
      // storage can be full or blocked, the app still works for this session
    }
  }, [roles])

  const resetRoles = useCallback(() => setRoles(clone(SAMPLE_ROLES)), [])

  // the signed-in user's role comes from the login response, not from the local roles list
  const currentRole = useMemo(() => (user?.role ? { name: user.role } : null), [user])

  // what that role may do, from the database
  const permissions = useMemo(() => toPermissions(user?.permissions ?? []), [user])

  const can = useCallback(
    (area?: string | null, action = 'view', page?: string) => {
      if (!area) return true // open to everyone
      if (!currentRole) return false // a user with no role
      if (currentRole.name === ADMIN_ROLE) return true // Admin never gets locked out of the UI
      return permits(permissions, area, action, page)
    },
    [currentRole, permissions],
  )

  // development only: for the Admin, who holds the full catalogue, list what the UI asks for
  // and the database does not have. A key listed here hides that page or widget for other roles.
  useEffect(() => {
    if (!import.meta.env.DEV || user?.role !== ADMIN_ROLE || user.permissions.length === 0) return
    const have = new Set(user.permissions.map((g) => `${g.area}.${g.page ?? '*'}.${g.action}`))
    const missing = MODULES.flatMap((m) =>
      (m.pages ?? [{ key: '*', actions: m.actions }]).flatMap((p) =>
        p.actions
          .filter((a) => !have.has(`${m.key}.${p.key}.${a}`) && !have.has(`${m.key}.*.${a}`))
          .map((a) => `${m.key}.${p.key}.${a}`),
      ),
    )
    if (missing.length > 0) console.warn('The UI asks for permissions the database does not have:', missing)
  }, [user])

  const value = useMemo<RolesContextValue>(
    () => ({ roles, setRoles, resetRoles, currentRole, can }),
    [roles, resetRoles, currentRole, can],
  )

  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>
}