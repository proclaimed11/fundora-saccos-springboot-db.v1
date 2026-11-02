import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, Text } from '@mantine/core'
import { AppIcon } from '../components/appIcon'
import { SAMPLE_SETTINGS } from '../pages/administration/security/securityData'
import { useAuth } from './authContext'
import { tokenStore } from '../api/token'

// TODO: the limits come from GET /api/security/settings
const NORMAL = {
  idle: SAMPLE_SETTINGS.idleTimeoutMinutes * 60_000,
  absolute: SAMPLE_SETTINGS.absoluteTimeoutHours * 3_600_000,
  warn: 2 * 60_000,
}

// open the app with ?sessiondemo=1 (a full reload) and stay still for 30 seconds to see the warning
const DEMO = { idle: 45_000, absolute: 10 * 60_000, warn: 15_000 }

const ACTIVITY = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

type Warning = { ms: number; reason: 'idle' | 'absolute' }

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SessionWatcher() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [limits] = useState(() =>
    new URLSearchParams(window.location.search).has('sessiondemo') ? DEMO : NORMAL,
  )
  const [warning, setWarning] = useState<Warning | null>(null)

  const lastActive = useRef(Date.now())
  const warned = useRef(false)
  // the 12 hour limit counts from sign-in, so it survives a page refresh
  const started = useRef(tokenStore.startedAt() ?? Date.now())
  const expire = useRef(() => {})

  useEffect(() => {
    expire.current = () => {
      navigate('/session-expired', { replace: true })
      logout()
    }
  })

  // any activity restarts the idle timer, but not once the warning is showing
  useEffect(() => {
    const mark = () => {
      if (!warned.current) lastActive.current = Date.now()
    }
    ACTIVITY.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    return () => ACTIVITY.forEach((e) => window.removeEventListener(e, mark))
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const idleLeft = limits.idle - (now - lastActive.current)
      const absoluteLeft = limits.absolute - (now - started.current)
      const ms = Math.min(idleLeft, absoluteLeft)

      if (ms <= 0) {
        expire.current()
        return
      }
      const show = ms <= limits.warn
      warned.current = show
      setWarning(show ? { ms, reason: absoluteLeft < idleLeft ? 'absolute' : 'idle' } : null)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [limits])

  const stay = () => {
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