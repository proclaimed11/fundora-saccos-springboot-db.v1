import { AppIcon } from '../../components/appIcon'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Text, TextInput } from '@mantine/core'
import { AuthLayout } from './authLayout'
import { forgotPasswordSchema } from '../../api/schemas'
import { forgotPasswordRequest } from '../../api/auth'
import { validateForm } from '../../utils/zodErrors'

type LocationState = { email?: string } | null

export function ForgotPassword() {
  const navigate = useNavigate()
  const state = useLocation().state as LocationState

  const [email, setEmail] = useState(state?.email ?? '')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  // the message the API answered with, set once the code has been sent
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(undefined)

    const result = validateForm<{ email: string }>(forgotPasswordSchema, { email })
    if (result.errors) {
      setError(result.errors.email)
      return
    }

    setLoading(true)
    try {
      const res = await forgotPasswordRequest(result.data.email)
      setEmail(result.data.email)
      setSentMessage(res.message)
    } catch (err) {
      // for example "Email not found", or the network error from the client
      setError(err instanceof Error ? err.message : 'Could not send the code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const sent = sentMessage !== null

  return (
    <AuthLayout>
      <div className="w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle text-brand-dark">
            <AppIcon name="key-round" size={24} strokeWidth={1.5} />
          </div>
          <Text size="md" fw={600} mt="sm">
            Forgot your password?
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {sent
              ? 'Check your inbox for the reset code.'
              : 'Enter your email and we will send you a 6-digit code to reset it.'}
          </Text>
        </div>

        {sent ? (
          <div className="space-y-4">
            <Alert color="green" variant="light" icon={<AppIcon name="circle-check" />}>
              <Text size="sm">{sentMessage}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                The code expires in 5 minutes and works once.
              </Text>
            </Alert>

            <Button
              fullWidth
              leftSection={<AppIcon name="mail" />}
              onClick={() => navigate('/reset-password', { state: { email } })}
            >
              I have the code
            </Button>

            <Button
              fullWidth
              variant="subtle"
              color="gray"
              onClick={() => {
                setSentMessage(null)
                setError(undefined)
              }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <TextInput
              label="Email"
              placeholder="you@fundora.co.tz"
              type="email"
              autoComplete="email"
              autoFocus
              leftSection={<AppIcon name="mail" />}
              value={email}
              onChange={(e) => {
                setEmail(e.currentTarget.value)
                setError(undefined)
              }}
              error={error}
            />

            <Button type="submit" fullWidth loading={loading}>
              Send reset code
            </Button>
          </form>
        )}

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
    </AuthLayout>
  )
}