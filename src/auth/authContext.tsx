import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setUnauthorizedHandler } from '../api/client'
import { tokenStore } from '../api/token'
import { loginRequest, logoutRequest, rolePermissionsRequest, toggleTwoFactorRequest, verifyTwoFactorRequest } from '../api/auth'
import { getUserRequest } from '../api/users'
import type { LoginResponse, Permission, UserRecord } from '../api/schemas'
import { setCurrentUser } from './currentUser'
import { markSessionStart } from './sessionClock'
import { queryClient } from '../api/queryClient'
import { formatUserName } from '../utils/userName'

export type AuthUser = {
  id: number
  username: string
  firstName: string
  middleName: string
  lastName: string
  /** "First M. Last" from the users table, or a generic fallback when names are unavailable */
  name: string
  email: string
  phone: string
  /** role name from the API, must match a role name on the Roles page */
  role: string | null
  /** what the role may do, from role_permissions in the database */
  permissions: Permission[]
  /** from the user record, so it is true when two-factor is switched on for this account */
  twoFactor: boolean
}

// a sign-in either finishes, or needs the emailed code first
export type LoginResult =
  | { status: 'signed-in' }
  | { status: 'two-factor'; twoFactorToken: string; message: string; username: string }

type AuthContextValue = {
  isAuthenticated: boolean
  user: AuthUser | null
  login: (username: string, password: string) => Promise<LoginResult>
  verifyTwoFactor: (twoFactorToken: string, code: string) => Promise<void>
  /** turns two-factor on or off for the signed-in user, returns the API message */
  setTwoFactorEnabled: (enabled: boolean) => Promise<string>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const USER_KEY = 'pt_user'

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

// the user record may carry the role as a name, an object, or only as roleId
const roleNameOf = (role: unknown): string | null => {
  if (typeof role === 'string') return role || null
  const name = rec(role).name
  return typeof name === 'string' && name ? name : null
}

const roleIdOf = (profile: UserRecord): number | null => {
  if (typeof profile.roleId === 'number') return profile.roleId
  const id = rec(profile.role).id
  return typeof id === 'number' ? id : null
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    // a user saved before newer fields existed has no such field, so it gets a default
    const saved = JSON.parse(raw) as Partial<AuthUser> & { id: number; username: string }
    return {
      id: saved.id,
      username: saved.username,
      firstName: saved.firstName ?? '',
      middleName: saved.middleName ?? '',
      lastName: saved.lastName ?? '',
      name: formatUserName(saved, 'User'),
      email: saved.email ?? '',
      phone: saved.phone ?? '',
      role: saved.role ?? null,
      permissions: saved.permissions ?? [],
      twoFactor: saved.twoFactor ?? false,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => tokenStore.get())
  const [user, setUser] = useState<AuthUser | null>(loadUser)

  // the pages stamp actions with this name, keep it in step with the signed-in user
  setCurrentUser(user?.name ?? 'User')

  const clear = () => {
    tokenStore.clear()
    localStorage.removeItem(USER_KEY)
    queryClient.clear() // the next user must not see this user's cached data
    setToken(null)
    setUser(null)
  }

  // a 401 from a protected call ends the session and shows the session expired page
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!tokenStore.get()) return
      clear()
      navigate('/session-expired', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const saveUser = (next: AuthUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(next))
    setUser(next)
  }

  // asks the server again for the user record and the role's grants, so a change made by an
  // admin shows up after a refresh. If a call fails, the sign-in still works with what we have
  // (a 401 is handled by the client).
  const loadProfile = async (userId: number) => {
    try {
      const profile = await getUserRequest(userId)
      const current = loadUser()
      if (!current || current.id !== userId) return

      const parts = {
        firstName: profile.firstName ?? profile.first_name ?? current.firstName,
        middleName: profile.middleName ?? profile.middle_name ?? current.middleName,
        lastName: profile.lastName ?? profile.last_name ?? current.lastName,
      }
      saveUser({
        ...current,
        ...parts,
        name: formatUserName(parts, 'User'),
        email: profile.email ?? current.email,
        phone: profile.phone ?? current.phone,
        role: roleNameOf(profile.role) ?? current.role,
        twoFactor: profile.isTwoFactorEnabled ?? profile.twoFactorEnabled ?? current.twoFactor,
      })

      const roleId = roleIdOf(profile)
      if (roleId !== null) {
        const permissions = await rolePermissionsRequest(roleId)
        const latest = loadUser()
        if (latest && latest.id === userId) saveUser({ ...latest, permissions })
      }
    } catch {
      // keep what we have
    }
  }

  // after a refresh the saved user is used, so fetch the details again.
  // This also finds out early when the token is no longer valid.
  useEffect(() => {
    const saved = loadUser()
    if (tokenStore.get() && saved) void loadProfile(saved.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // both the plain login and the 2FA step end here
  const startSession = (res: LoginResponse, sessionToken: string, twoFactor: boolean) => {
    markSessionStart()
    tokenStore.set(sessionToken)
    setToken(sessionToken)

    const parts = {
      firstName: res.firstName ?? res.first_name ?? '',
      middleName: res.middleName ?? res.middle_name ?? '',
      lastName: res.lastName ?? res.last_name ?? '',
    }
    saveUser({
      id: res.userId,
      username: res.username,
      ...parts,
      name: formatUserName(parts, 'User'),
      email: res.email ?? '',
      phone: '',
      role: res.role ?? null,
      permissions: res.permissions ?? [],
      twoFactor,
    })
    void loadProfile(res.userId)
  }

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const res = await loginRequest(email.trim(), password)

    // 2FA is on: no token yet, the code was emailed and the twoFactorToken identifies this attempt
    if (res.requiresTwoFactor) {
      if (!res.twoFactorToken) throw new Error('The server did not return a two-factor session.')
      return {
        status: 'two-factor',
        twoFactorToken: res.twoFactorToken,
        message: res.message ?? 'A 2FA code was sent to your email.',
        username: res.username,
      }
    }

    if (!res.token) throw new Error('The server did not return a session token.')
    startSession(res, res.token, false)
    return { status: 'signed-in' }
  }

  const verifyTwoFactor = async (twoFactorToken: string, code: string) => {
    const res = await verifyTwoFactorRequest(twoFactorToken, code)
    if (!res.token) throw new Error('The server did not return a session token.')
    startSession(res, res.token, true)
  }

  const setTwoFactorEnabled = async (enabled: boolean) => {
    const res = await toggleTwoFactorRequest(enabled)
    if (user) saveUser({ ...user, twoFactor: enabled })
    return res.message
  }

  const logout = () => {
    // fire the request first, it reads the token as it starts
    if (tokenStore.get()) logoutRequest().catch(() => {})
    clear()
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!token && !!user, user, login, verifyTwoFactor, setTwoFactorEnabled, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}