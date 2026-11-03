import { AppIcon } from '../../../components/appIcon'
import { useEffect, useState } from 'react'
import { Alert, Button, Modal, PasswordInput, Select, SimpleGrid, Text, TextInput } from '@mantine/core'
import { roleStyle, type User } from './usersData'

const EMAIL = /^\S+@\S+\.\S+$/
const PHONE = /^0\d{9}$/

/* ---------- new / edit user ---------- */

export type UserInput = {
  name: string
  username: string
  email: string
  phone: string
  role: string
  password: string
}

type UserDialogProps = {
  opened: boolean
  /** null means a new user is being created */
  user: User | null
  existingUsernames: string[]
  /** role names loaded from GET /api/roles */
  roleNames: string[]
  saving?: boolean
  /** a message from the API, shown inside the dialog */
  serverError?: string | null
  onClose: () => void
  onSubmit: (input: UserInput) => void
}

type Errors = Partial<Record<'username' | 'email' | 'phone' | 'role' | 'password', string>>

export function UserDialog({
  opened,
  user,
  existingUsernames,
  roleNames,
  saving = false,
  serverError,
  onClose,
  onSubmit,
}: UserDialogProps) {
  const editing = user !== null
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!opened) return
    // the full name has no column yet, so it always starts empty
    setName('')
    setUsername(user?.username ?? '')
    setEmail(user?.email ?? '')
    setPhone(user?.phone ?? '')
    setRole(user?.role ?? null)
    setPassword('')
    setErrors({})
  }, [opened, user])

  const clear = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const submit = () => {
    const found: Errors = {}
    const u = username.trim().toLowerCase()

    if (!u) found.username = 'Enter a username'
    else if (existingUsernames.some((x) => x !== user?.username && x === u)) found.username = 'This username is already used'
    if (!email.trim()) found.email = 'Enter an email address'
    else if (!EMAIL.test(email.trim())) found.email = 'Enter a valid email address'
    if (!phone.trim()) found.phone = 'Enter a phone number'
    else if (!PHONE.test(phone.trim())) found.phone = 'Enter 10 digits starting with 0'
    if (!role) found.role = 'Select a role'
    if (!editing && password.length < 8) found.password = 'Use at least 8 characters'

    setErrors(found)
    if (Object.keys(found).length > 0 || !role) return

    onSubmit({ name: name.trim(), username: u, email: email.trim(), phone: phone.trim(), role, password })
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit user' : 'New user'} centered>
      <div className="space-y-4">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Full name (optional)"
            description="Not saved yet, there is no name field in the API"
            placeholder="Asha Mrema"
            size="sm"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput label="Username" placeholder="asha" size="sm" value={username}
            onChange={(e) => { setUsername(e.currentTarget.value); clear('username') }} error={errors.username} />
          <TextInput label="Email" placeholder="asha@fundora.co.tz" size="sm" value={email}
            onChange={(e) => { setEmail(e.currentTarget.value); clear('email') }} error={errors.email} />
          <TextInput label="Phone" placeholder="0713222111" size="sm" maxLength={10} inputMode="tel" value={phone}
            onChange={(e) => { setPhone(e.currentTarget.value); clear('phone') }} error={errors.phone} />
        </SimpleGrid>

        <Select
          label="Role"
          description={role ? roleStyle(role).level : 'The role decides what this user can do'}
          placeholder="Select role"
          size="sm"
          data={roleNames}
          allowDeselect={false}
          value={role}
          onChange={(v) => { setRole(v); clear('role') }}
          error={errors.role}
        />

        {!editing && (
          <PasswordInput
            label="Temporary password"
            description="At least 8 characters. The user should change it after the first sign-in."
            size="sm"
            value={password}
            onChange={(e) => { setPassword(e.currentTarget.value); clear('password') }}
            error={errors.password}
          />
        )}

        {serverError && (
          <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
            <Text size="sm">{serverError}</Text>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="xs" loading={saving} leftSection={<AppIcon name="check" />} onClick={submit}>
            {editing ? 'Save changes' : 'Create user'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- reset password ---------- */

type ResetProps = {
  opened: boolean
  userName: string
  saving?: boolean
  serverError?: string | null
  onClose: () => void
  /** gets the new plain password */
  onSubmit: (password: string) => void
}

export function ResetPasswordDialog({ opened, userName, saving = false, serverError, onClose, onSubmit }: ResetProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()

  const close = () => {
    setPassword('')
    setConfirm('')
    setError(undefined)
    onClose()
  }

  const submit = () => {
    if (password.length < 8) return setError('Use at least 8 characters')
    if (password !== confirm) return setError('The two passwords do not match')
    setError(undefined)
    onSubmit(password)
  }

  // the fields are emptied once the dialog is closed from outside after a success
  useEffect(() => {
    if (!opened) {
      setPassword('')
      setConfirm('')
      setError(undefined)
    }
  }, [opened])

  return (
    <Modal opened={opened} onClose={close} title="Reset password" centered>
      <div className="space-y-4">
        <Text size="sm">
          Set a new password for <span className="font-medium">{userName}</span>.
        </Text>
        <PasswordInput label="New password" size="sm" value={password}
          onChange={(e) => { setPassword(e.currentTarget.value); setError(undefined) }} />
        <PasswordInput label="Confirm password" size="sm" value={confirm}
          onChange={(e) => { setConfirm(e.currentTarget.value); setError(undefined) }} error={error} />
        {serverError && (
          <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
            <Text size="sm">{serverError}</Text>
          </Alert>
        )}
        <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
          <Text size="xs">The user must sign in with the new password.</Text>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close} disabled={saving}>Cancel</Button>
          <Button size="xs" loading={saving} leftSection={<AppIcon name="key-round" />} onClick={submit}>Reset password</Button>
        </div>
      </div>
    </Modal>
  )
}