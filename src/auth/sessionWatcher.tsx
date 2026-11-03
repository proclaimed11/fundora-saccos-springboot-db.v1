import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal, Text } from '@mantine/core'
import { AppIcon } from '../components/appIcon'
import { fetchSessionLimits, pingSession } from '../api/session'
import { sessionStart } from './sessionClock'
import { useAuth } from './authContext'

// used until the API answers, and if it never does (the same defaults as the backend)
const DEFAULT_IDLE_MINUTES = 30
const DEFAULT_ABSOLUTE_HOURS = 12

const WARN_MS = 2 * 60_000
// real activity tells the server at most this often, the idle limit used here is shortened by the same amount
// so the browser never expires later than the server does
const KEEPALIVE_MS = 60_000

// open the app with ?sessiondemo=1 (a full reload) and stay still for 30 seconds to see the warning
const DEMO = { idle: 45_000, absolute: 10 * 60_000, warn: 15_000 }

const ACTIVITY = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

type Limits = { idle: number; absolute: number; warn: number }
type Warning = { ms: number; reason: 'idle' | 'absolute' }

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SessionWatcher() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const demo = useState(() => new URLSearchParams(window.location.search).has('sessiondemo'))[0]
  const [warning, setWarning] = useState<Warning | null>(null)

  const settings = useQuery({
    queryKey: ['session-limits'],
    queryFn: fetchSessionLimits,
    staleTime: Infinity,
    retry: false,
  })

  const limits: Limits = demo
    ? DEMO
    : {
        idle: Math.max(
          ((settings.data?.idleTimeoutMinutes ?? DEFAULT_IDLE_MINUTES) * 60_000) - KEEPALIVE_MS,
          WARN_MS + 5_000,
        ),
        absolute: (settings.data?.absoluteTimeoutHours ?? DEFAULT_ABSOLUTE_HOURS) * 3_600_000,
        warn: WARN_MS,
      }

  // the timer reads the latest limits without being restarted when they arrive
  const limitsRef = useRef(limits)
  useEffect(() => {
    limitsRef.current = limits
  })

  const lastActive = useRef(Date.now())
  const lastPing = useRef(Date.now())
  const warned = useRef(false)
  // counts from sign-in, so it survives a page refresh
  const started = useRef(sessionStart())
  const expire = useRef(() => {})

  useEffect(() => {
    expire.current = () => {
      navigate('/session-expired', { replace: true })
      logout()
    }
  })

  // tells the server the user is still here. A 401 is handled by the API client, which ends the session.
  const ping = () => {
    lastPing.current = Date.now()
    return pingSession().catch(() => {})
  }

  // any activity restarts the idle timer, but not once the warning is showing
  useEffect(() => {
    if (demo) return
    const mark = () => {
      if (warned.current) return
      const now = Date.now()
      lastActive.current = now
      if (now - lastPing.current >= KEEPALIVE_MS) void ping()
    }
    ACTIVITY.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    return () => ACTIVITY.forEach((e) => window.removeEventListener(e, mark))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo])

  // the demo has no server pings, it only shows the warning
  useEffect(() => {
    if (!demo) return
    const mark = () => {
      if (!warned.current) lastActive.current = Date.now()
    }
    ACTIVITY.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    return () => ACTIVITY.forEach((e) => window.removeEventListener(e, mark))
  }, [demo])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const l = limitsRef.current
      const idleLeft = l.idle - (now - lastActive.current)
      const absoluteLeft = l.absolute - (now - started.current)
      const ms = Math.min(idleLeft, absoluteLeft)

      if (ms <= 0) {
        expire.current()
        return
      }
      const show = ms <= l.warn
      warned.current = show
      setWarning(show ? { ms, reason: absoluteLeft < idleLeft ? 'absolute' : 'idle' } : null)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  const stay = async () => {
    // the server's idle timer must be reset too, not only the one in the browser
    if (!demo) await ping()
    warned.current = false
    lastActive.current = Date.now()
    setWarning(null)
  }

  return (
    <Modal
      opened={warning !== null}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      size="sm"
      title="Your session is about to end"
    >
      {warning && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-50 text-yellow-600">
            <AppIcon name="clock" size={24} strokeWidth={1.5} />
          </div>
          <div className="text-3xl font-semibold tracking-wide text-gray-800">{clock(warning.ms)}</div>
          <Text size="sm" c="dimmed">
            {warning.reason === 'idle'
              ? 'You have been inactive for a while. For your safety you will be signed out when the timer reaches zero.'
              : 'You have reached the longest a session can last. It cannot be extended, so save your work and sign in again.'}
          </Text>
          <div className="flex justify-center gap-2">
            <Button size="xs" variant="default" onClick={() => logout()}>
              Sign out now
            </Button>
            {warning.reason === 'idle' && (
              <Button size="xs" leftSection={<AppIcon name="check" />} onClick={stay}>
                Stay signed in
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}