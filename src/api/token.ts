const TOKEN_KEY = 'pt_token'
const STARTED_KEY = 'pt_session_started'

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  // saving a token also marks the moment this sign-in began
  set(token: string) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
      window.localStorage.setItem(STARTED_KEY, String(Date.now()))
    } catch {
      // storage blocked, the session only lasts until the page is refreshed
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
      window.localStorage.removeItem(STARTED_KEY)
    } catch {
      // nothing to clear
    }
  },
  // when this sign-in began, the 12 hour limit counts from here
  startedAt(): number | null {
    try {
      const n = Number(window.localStorage.getItem(STARTED_KEY))
      return n > 0 ? n : null
    } catch {
      return null
    }
  },
}