import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Role } from './rolesData'

// the system role that always sees everything, so nobody can lock themselves out
export const ADMIN_ROLE = 'Admin'

export type RolesContextValue = {
  roles: Role[]
  setRoles: Dispatch<SetStateAction<Role[]>>
  /** back to the sample roles (also clears stale localStorage) */
  resetRoles: () => void

  /** the role of the signed-in user, taken from the login response. Null when the user has no role */
  currentRole: { name: string } | null

  /**
   * The one permission check used everywhere (sidebar, search, route guards, later buttons).
   * An area of null/undefined means "open to everyone".
   * Without a page it asks "anywhere in the area", with a page it asks about that page only.
   * Admin passes every check.
   */
  can: (area?: string | null, action?: string, page?: string) => boolean
}

export const RolesContext = createContext<RolesContextValue | null>(null)

export function useRoles() {
  const context = useContext(RolesContext)
  if (!context) {
    throw new Error('useRoles must be used within RolesProvider')
  }
  return context
}