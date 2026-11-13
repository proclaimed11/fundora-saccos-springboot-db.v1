import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useAuth } from '../../../auth/authContext'
import { ADMIN_ROLE, RolesContext, type RolesContextValue } from './rolesContext'
import { MODULES, permits, toPermissions } from './rolesData'

export function RolesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  // the signed-in user's role comes from the login response
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

  // development only: lists what the UI asks for and the database does not have
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

  const value = useMemo<RolesContextValue>(() => ({ currentRole, can }), [currentRole, can])

  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>
}