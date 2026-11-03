import { AppIcon } from '../../../components/appIcon'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, NumberInput, SimpleGrid, Text } from '@mantine/core'
import { DashboardLayout } from '../../../components/layout/dashboardLayout'
import { StatWidget } from '../../../components/statsWidgets'
import { SAMPLE_USERS } from '../users/usersData'
import { LIMITS, SAMPLE_SETTINGS, type SecuritySettings } from './securityData'
import { usePageAccess } from '../../auth/usePageAccess'
import { useSecuritySettings } from '../../../api/security'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type Values = { [K in keyof SecuritySettings]: number | '' }
type Errors = Partial<Record<keyof SecuritySettings, string>>
type Notice = { text: string; color: 'green' | 'blue' } | null

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="sm" fw={600} mb={4}>
      {children}
    </Text>
  )
}

const limitText = (key: keyof SecuritySettings) => `Between ${LIMITS[key].min} and ${LIMITS[key].max}`

export function SecurityPage() {
  const navigate = useNavigate()
  const { canEdit } = usePageAccess('administration', 'company-profile') // 'security' in security.tsx

  // UI only: the saved settings change for this session, nothing is stored yet
  const [saved, setSaved] = useState<SecuritySettings>(SAMPLE_SETTINGS)
  const [values, setValues] = useState<Values>({ ...SAMPLE_SETTINGS })
  const [errors, setErrors] = useState<Errors>({})
  const [notice, setNotice] = useState<Notice>(null)
  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const dirty = JSON.stringify(values) !== JSON.stringify(saved)

  const { data: serverSettings } = useSecuritySettings()

  // when the server values arrive, show them (unless there are unsaved edits)
  useEffect(() => {
    if (!serverSettings || dirty) return
    setSaved(serverSettings)
    setValues({ ...serverSettings })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSettings])

  // SAMPLE ONLY: the same sample users as the Users page
  const activeUsers = SAMPLE_USERS.filter((u) => u.active)
  const withTwoFactor = activeUsers.filter((u) => u.twoFactor)
  const adminsWithout = activeUsers.filter((u) => u.role === 'Admin' && !u.twoFactor)

  // here `color` is the icon color
  const stats = [
    { label: 'Minimum Password', value: `${saved.minPasswordLength} characters`, icon: 'lock-keyhole', color: '#8e44ad' },
    { label: 'Idle Timeout', value: `${saved.idleTimeoutMinutes} min`, icon: 'clock', color: '#e08a1e' },
    { label: 'Absolute Timeout', value: `${saved.absoluteTimeoutHours} hours`, icon: 'hourglass', color: '#0077b5' },
    { label: 'Two-factor On', value: `${withTwoFactor.length} of ${activeUsers.length}`, icon: 'shield', color: 'var(--app-brand)' },
  ]

  const num = (key: keyof SecuritySettings, suffix: string) => ({
    size: 'sm' as const,
    suffix,
    hideControls: true,
    allowNegative: false,
    allowDecimal: false,
    value: values[key],
    onChange: (v: string | number) => {
      setValues((x) => ({ ...x, [key]: v === '' ? '' : Number(v) }))
      setErrors((e) => ({ ...e, [key]: undefined }))
    },
    error: errors[key],
  })

  const discard = () => {
    setValues({ ...saved })
    setErrors({})
  }

  const save = () => {
    const found: Errors = {}

    ;(Object.keys(LIMITS) as (keyof SecuritySettings)[]).forEach((key) => {
      const v = values[key]
      const { min, max } = LIMITS[key]
      if (v === '') found[key] = 'Enter a value'
      else if (v < min || v > max) found[key] = `Use a value ${limitText(key).toLowerCase()}`
    })

    // a session that goes idle must be shorter than the longest a session can last
    if (!found.idleTimeoutMinutes && !found.absoluteTimeoutHours) {
      if ((values.idleTimeoutMinutes as number) >= (values.absoluteTimeoutHours as number) * 60) {
        found.idleTimeoutMinutes = 'The idle timeout must be shorter than the absolute timeout'
      }
    }

    setErrors(found)
    if (Object.keys(found).length > 0) return

    // TODO: PUT /api/security/settings { minPasswordLength, idleTimeoutMinutes, absoluteTimeoutHours, otpExpiryMinutes }
    //       The API only has GET today, it needs a save endpoint. The auth filter and password checks
    //       must read these values instead of the numbers built into the backend.
    const next = values as SecuritySettings
    setSaved(next)
    setValues({ ...next })
    setNotice({ color: 'green', text: 'The security settings were saved. They apply to new sign-ins and new passwords.' })
  }

  const idle = values.idleTimeoutMinutes === '' ? '…' : values.idleTimeoutMinutes
  const absolute = values.absoluteTimeoutHours === '' ? '…' : values.absoluteTimeoutHours
  const otp = values.otpExpiryMinutes === '' ? '…' : values.otpExpiryMinutes
  const minLength = values.minPasswordLength === '' ? '…' : values.minPasswordLength

  return (
    <DashboardLayout
      title="Security Settings"
      subtitle="Password rules, session limits and sign-in protection"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Security Settings' }]}
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color={notice.color}
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name="circle-check" />}
          >
            <Text size="sm">{notice.text}</Text>
          </Alert>
        )}

        {adminsWithout.length > 0 && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {adminsWithout.map((u) => u.name).join(', ')} {adminsWithout.length === 1 ? 'is an Admin' : 'are Admins'}{' '}
                without two-factor sign-in.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => navigate(`/users?user=${adminsWithout[0].id}`)}>
                Open user
              </Button>
            </div>
          </Alert>
        )}

        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* the form */}
          <div className="space-y-4">
            {!canEdit && (
              <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />}>
                <Text size="sm">Your role can view these settings but not change them.</Text>
              </Alert>
            )}
            <div className={`${CARD} p-5`}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-brand-dark">
                <AppIcon name="lock-keyhole" size={20} strokeWidth={1.25} />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-800">Security policy</div>
                <div className="text-xs text-gray-500">{dirty ? 'You have unsaved changes' : 'All changes saved'}</div>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <SectionTitle>Passwords</SectionTitle>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <NumberInput
                    label="Minimum password length"
                    description={limitText('minPasswordLength')}
                    {...num('minPasswordLength', ' characters')}
                  />
                </SimpleGrid>
              </div>

              <div>
                <SectionTitle>Sessions</SectionTitle>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <NumberInput
                    label="Idle timeout"
                    description="Signed out after this long with no activity"
                    {...num('idleTimeoutMinutes', ' minutes')}
                  />
                  <NumberInput
                    label="Absolute timeout"
                    description="Signed out this long after signing in, whatever the activity"
                    {...num('absoluteTimeoutHours', ' hours')}
                  />
                </SimpleGrid>
              </div>

              <div>
                <SectionTitle>Verification codes</SectionTitle>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <NumberInput
                    label="Code expiry"
                    description="Applies to sign-in, password reset and applicant OTP codes"
                    {...num('otpExpiryMinutes', ' minutes')}
                  />
                </SimpleGrid>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button size="xs" variant="default" disabled={!dirty || !canEdit} onClick={discard}>
                Discard changes
              </Button>
              <Button size="xs" disabled={!dirty || !canEdit} leftSection={<AppIcon name="check" />} onClick={save}>
                Save changes
              </Button>
            </div>
          </div>
          </div>

          <div className="space-y-4">
            {/* what it means for people, follows the form as you type */}
            <div className={`${CARD} p-4`}>
              <SectionTitle>What users will experience</SectionTitle>
              <ul className="mt-2 space-y-2">
                {[
                  { icon: 'lock-keyhole', text: `Passwords need at least ${minLength} characters.` },
                  { icon: 'clock', text: `A session ends after ${idle} minutes without activity.` },
                  { icon: 'hourglass', text: `Nobody stays signed in longer than ${absolute} hours.` },
                  { icon: 'mail', text: `Emailed codes stop working after ${otp} minutes and work once.` },
                ].map((r) => (
                  <li key={r.icon} className="flex items-start gap-2.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    <AppIcon name={r.icon} className="mt-0.5 shrink-0 text-gray-400" />
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>

            {/* two-factor, changed per user on the Users page */}
            <div className={`${CARD} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Two-factor sign-in</SectionTitle>
                <Button size="compact-xs" variant="default" onClick={() => navigate('/users')}>
                  Manage users
                </Button>
              </div>
              <p className="mb-2 text-xs text-gray-500">
                Two-factor is switched on per user. Turn it on or off from the Users page.
              </p>
              <ul className="space-y-2">
                {activeUsers.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-800">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.role ?? 'No role'}</div>
                    </div>
                    <Badge variant="outline" color={u.twoFactor ? 'green' : 'gray'} radius="sm" size="sm">
                      {u.twoFactor ? 'On' : 'Off'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}