const KEY = 'pt_session_started'

// written when a session starts, so the 12 hour limit counts from sign-in and survives a refresh
export const markSessionStart = () => {
  try {
    window.localStorage.setItem(KEY, String(Date.now()))
  } catch {
    // storage blocked, the idle timer still works
  }
}

export const clearSessionStart = () => {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

// a session from before this existed has no start time, so it starts counting now
export function sessionStart(): number {
  try {
    const saved = Number(window.localStorage.getItem(KEY))
    if (saved) return saved
    const now = Date.now()
    window.localStorage.setItem(KEY, String(now))
    return now
  } catch {
    return Date.now()
  }
}