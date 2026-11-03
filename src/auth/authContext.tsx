import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setUnauthorizedHandler } from '../api/client'
import { tokenStore } from '../api/token'
import { loginRequest, logoutRequest, toggleTwoFactorRequest, verifyTwoFactorRequest } from '../api/auth'
import { getUserRequest } from '../api/users'
import type { LoginResponse } from '../api/schemas'
import { setCurrentUser } from './currentUser'
import { clearSessionStart, markSessionStart } from './sessionClock'

export type AuthUser = {
  id: number
  username: string
  /** display name, built from the username until the API returns one */
  name: string
  email: string
  phone: string
  /** role name from the API, must match a role name on the Roles page */
  role: string | null
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

const toName = (username: string) => username.charAt(0).toUpperCase() + username.slice(1)

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    // a user saved before newer fields existed has no such field, so it gets a default
    const saved = JSON.parse(raw) as Omit<AuthUser, 'twoFactor' | 'phone'> & {
      twoFactor?: boolean
      phone?: string
    }
    return { ...saved, twoFactor: saved.twoFactor ?? false, phone: saved.phone ?? '' }
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
    clearSessionStart()
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

  // the login answer has no email, phone or two-factor state, so they come from the user record.
  // If it fails, the sign-in still works without them (a 401 is handled by the client).
  const loadProfile = async (userId: number) => {
    try {
      const profile = await getUserRequest(userId)
      const current = loadUser()
      if (!current || current.id !== userId) return
      saveUser({
        ...current,
        email: profile.email ?? current.email,
        phone: profile.phone ?? current.phone,
        twoFactor: profile.isTwoFactorEnabled ?? profile.twoFactorEnabled ?? current.twoFactor,
      })
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
    saveUser({
      id: res.userId,
      username: res.username,
      name: toName(res.username),
      email: res.email ?? '',
      phone: '',
      role: res.role ?? null,
      twoFactor,
    })
    void loadProfile(res.userId)
  }

  const login = async (username: string, password: string): Promise<LoginResult> => {
    const res = await loginRequest(username.trim(), password)

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