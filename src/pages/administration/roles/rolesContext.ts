import { createContext, useContext } from 'react'

// the system role that always sees everything, so nobody can lock themselves out
export const ADMIN_ROLE = 'Admin'

export type RolesContextValue = {
  /** the role of the signed-in user, taken from the login response. Null when the user has no role */
  currentRole: { name: string } | null
  /** The one permission check used everywhere. Admin passes every check. */
  can: (area?: string | null, action?: string, page?: string) => boolean
}

export const RolesContext = createContext<RolesContextValue | null>(null)

export function useRoles() {
  const context = useContext(RolesContext)
  if (!context) throw new Error('useRoles must be used within RolesProvider')
  return context
}