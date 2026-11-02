import { AppIcon } from '../../components/appIcon'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert, Button, Text, TextInput } from '@mantine/core'
import logo from '../../assets/logo.png'
import { twoFactorSchema, type TwoFactorInput } from '../../api/schemas'
import { useAuth } from '../../auth/authContext'
import { validateForm } from '../../utils/zodErrors'

// the API says the emailed code expires after 5 minutes
const CODE_MINUTES = 5

// 300 -> "5:00"
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

type LocationState = { twoFactorToken?: string; message?: string; username?: string } | null

export function TwoFactor() {
  const { verifyTwoFactor } = useAuth()
  const state = useLocation().state as LocationState

  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(CODE_MINUTES * 60)
  // the sign-in attempt itself is gone, only signing in again helps
  const [sessionLost, setSessionLost] = useState(false)

  const expired = secondsLeft <= 0
  const blocked = expired || sessionLost

  // count down once a second until the code expires
  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (blocked || !state?.twoFactorToken) return

    const result = validateForm<TwoFactorInput>(twoFactorSchema, { code })
    if (result.errors) {
      setError(result.errors.code)
      return
    }

    setLoading(true)
    try {
      // on success the session is set and the route redirects to the dashboard
      await verifyTwoFactor(state.twoFactorToken, result.data.code)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not verify the code. Please try again.'
      const m = message.toLowerCase()
      if (m.includes('session')) {
        // "Invalid or expired two-factor session"
        setSessionLost(true)
      } else if (m.includes('expired')) {
        // "2FA code has expired"
        setSecondsLeft(0)
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-content-background p-4">
      <div className="w-full max-w-sm rounded-md border-t-4 border-brand bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <img
            src={logo}
            alt="Fundora Saccos"
            className="mx-auto mb-2 h-20 w-56 max-w-full object-cover"
          />
          <div className="mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle text-brand-dark">
            <AppIcon name="shield" size={24} strokeWidth={1.5} />
          </div>
          <Text size="md" fw={600} mt="sm">
            Two-factor verification
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {state?.message ?? 'A 6-digit code was sent to your email address.'}
          </Text>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          <TextInput
            label="6-digit code"
            placeholder="000000"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            disabled={blocked}
            styles={{ input: { letterSpacing: 8, textAlign: 'center', fontSize: 20 } }}
            value={code}
            onChange={(e) => {
              setCode(e.currentTarget.value.replace(/\D/g, ''))
              setError(undefined)
            }}
            error={error}
          />

          {blocked ? (
            <Alert color="red" variant="light" icon={<AppIcon name="clock" />}>
              <Text size="xs">
                {sessionLost
                  ? 'This sign-in attempt has ended. Go back to sign in to get a new code.'
                  : 'This code has expired. Go back to sign in to get a new one.'}
              </Text>
            </Alert>
          ) : (
            <Text size="xs" c="dimmed" ta="center">
              The code expires in{' '}
              <span className={`font-medium ${secondsLeft <= 60 ? 'text-red-600' : 'text-gray-700'}`}>
                {clock(secondsLeft)}
              </span>{' '}
              and works once.
            </Text>
          )}

          <Button type="submit" fullWidth loading={loading} disabled={blocked}>
            Verify and sign in
          </Button>
        </form>

        <div className="mt-5 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-xs text-brand-dark no-underline hover:underline"
          >
            <AppIcon name="arrow-left" size={12} />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}