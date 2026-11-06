import { AppIcon } from '../../components/appIcon'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, PasswordInput, Text, TextInput } from '@mantine/core'
import logo from '../../assets/logo.png'
import { loginSchema } from '../../api/schemas'
import { validateForm, type FieldErrors } from '../../utils/zodErrors'

type LoginProps = {
  /** called with the entered email and password, throw an Error to show a message */
  onLogin?: (email: string, password: string) => Promise<void> | void
}

type Values = { email: string; password: string }

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FieldErrors<Values>>({})
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const result = validateForm<Values>(loginSchema, { email, password })
    if (result.errors) {
      setErrors(result.errors)
      return
    }
    setErrors({})

    setLoading(true)
    try {
      await onLogin?.(result.data.email, result.data.password)
    } catch (err) {
      // for example "Invalid email or password"
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
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
          <Text size="sm" c="dimmed">
            Sign in to your account
          </Text>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextInput
            label="Email"
            placeholder="you@fundora.co.tz"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.currentTarget.value)
              setErrors((x) => ({ ...x, email: undefined }))
              setError(null)
            }}
            leftSection={<AppIcon name="mail" />}
            error={errors.email}
          />

          <div>
            <PasswordInput
              label="Password"
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.currentTarget.value)
                setErrors((x) => ({ ...x, password: undefined }))
                setError(null)
              }}
              leftSection={<AppIcon name="lock-keyhole" />}
              error={errors.password}
            />
            <div className="mt-1.5 text-right">
              <Link
                to="/forgot-password"
                className="text-xs text-brand-dark no-underline hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}

          <Button type="submit" fullWidth loading={loading}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}