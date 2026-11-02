const TOKEN_KEY = 'pt_token'

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // storage blocked, the session only lasts until the page is refreshed
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      // nothing to clear
    }
  },
}