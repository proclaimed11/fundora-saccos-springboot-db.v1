import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setUnauthorizedHandler } from '../api/client'
import { tokenStore } from '../api/token'
import { loginRequest, logoutRequest } from '../api/auth'

export type AuthUser = {
  id: number
  username: string
  /** display name, built from the username until the API returns one */
  name: string
  email: string
  /** role name from the API, must match a role name on the Roles page */
  role: string | null
}

type AuthContextValue = {
  isAuthenticated: boolean
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const USER_KEY = 'pt_user'

const toName = (username: string) => username.charAt(0).toUpperCase() + username.slice(1)

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => tokenStore.get())
  const [user, setUser] = useState<AuthUser | null>(loadUser)

  const clear = () => {
    tokenStore.clear()
    localStorage.removeItem(USER_KEY)
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

  const login = async (email: string, password: string) => {
    const res = await loginRequest(email.trim(), password)

    // 2FA is not supported in this screen yet
    if (!res.token) {
      throw new Error(
        res.requiresTwoFactor
          ? 'This account uses two-factor sign-in, which is not available yet.'
          : 'The server did not return a session token.',
      )
    }

    const next: AuthUser = {
      id: res.userId,
      username: res.username,
      name: toName(res.username),
      email: res.email ?? email.trim(),
      role: res.role ?? null,
    }

    tokenStore.set(res.token)
    localStorage.setItem(USER_KEY, JSON.stringify(next))
    setToken(res.token)
    setUser(next)
  }

  const logout = () => {
    // fire the request first, it reads the token as it starts
    if (tokenStore.get()) logoutRequest().catch(() => {})
    clear()
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token && !!user, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}