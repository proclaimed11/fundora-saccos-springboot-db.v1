import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Switch, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import { useAuth } from '../../auth/authContext'
import { initials } from '../applicants/applicantsData'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

// the session limits from the API (GET /api/security/settings)
const IDLE_MINUTES = 30
const ABSOLUTE_HOURS = 12

type Notice = { text: string; color: 'green' | 'blue' | 'red' } | null

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="sm" fw={600} mb={4}>
      {children}
    </Text>
  )
}

export function MyAccountPage() {
const { logout, user } = useAuth()
const account = {
  name: user?.name ?? '',
  username: user?.username ?? '',
  email: user?.email || 'Not available',
  role: user?.role ?? 'No role',
}

  // UI only: the switch changes for this session, nothing is saved yet
  const [twoFactor, setTwoFactor] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const confirmToggle = () => {
    // TODO: POST /api/auth/2fa/toggle { enabled: !twoFactor } (needs the session token)
    const next = !twoFactor
    setTwoFactor(next)
    setNotice({
      color: next ? 'green' : 'blue',
      text: next
        ? 'Two-factor authentication enabled. You will get an emailed code at every sign-in.'
        : 'Two-factor authentication disabled. You only need your password to sign in.',
    })
    setConfirmOpen(false)
  }

  return (
    <DashboardLayout
      title="My Account"
      subtitle="Your profile and sign-in protection"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'My Account' }]}
      actions={
        <Button size="xs" color="red" variant="light" leftSection={<AppIcon name="log-out" />} onClick={logout}>
          Sign out
        </Button>
      }
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color={notice.color}
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name={notice.color === 'green' ? 'circle-check' : notice.color === 'red' ? 'circle-x' : 'info'} />}
          >
            <Text size="sm">{notice.text}</Text>
          </Alert>
        )}

        {!twoFactor && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <Text size="sm">
              Two-factor sign-in is off for your account. Turn it on so a password alone is not enough to get in.
            </Text>
          </Alert>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* profile summary */}
          <div className={`${CARD} p-5`}>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-subtle text-xl font-medium text-brand-dark">
                {initials(account.name)}
              </div>
              <div className="mt-3 text-base font-medium text-gray-800">{account.name}</div>
              <div className="text-xs text-gray-500">@{account.username}</div>
              <div className="mt-3 flex gap-2">
                <Badge variant="light" color="blue" radius="sm" size="sm">
                  {account.role}
                </Badge>
                <Badge variant="outline" color={twoFactor ? 'green' : 'gray'} radius="sm" size="sm">
                  2FA {twoFactor ? 'on' : 'off'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* details */}
            <div className={`${CARD} p-5`}>
              <SectionTitle>Account details</SectionTitle>
              <Field label="Full name" value={account.name} />
              <Field label="Username" value={account.username} />
              <Field label="Email" value={account.email} />
              <Field label="Role" value={account.role} />
              <p className="mt-2 text-xs text-gray-500">
                These details are managed by an administrator on the Users page.
              </p>
            </div>

            {/* two-factor */}
            <div className={`${CARD} p-5`}>
              <SectionTitle>Two-factor sign-in</SectionTitle>
              <div className="mt-2 flex items-start justify-between gap-4 rounded-md border border-gray-200 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <AppIcon name="shield" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">Emailed sign-in code</div>
                    <div className="text-xs text-gray-500">
                      After your password you enter a 6-digit code sent to {account.email}. The code expires in 5
                      minutes and works once.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={twoFactor}
                  onChange={() => setConfirmOpen(true)}
                  aria-label="Two-factor authentication"
                />
              </div>
            </div>

            {/* sessions */}
            <div className={`${CARD} p-5`}>
              <SectionTitle>Your session</SectionTitle>
              <ul className="mt-2 space-y-2">
                {[
                  { icon: 'clock', text: `You are signed out after ${IDLE_MINUTES} minutes without activity.` },
                  { icon: 'hourglass', text: `No session lasts longer than ${ABSOLUTE_HOURS} hours, whatever the activity.` },
                ].map((r) => (
                  <li
                    key={r.icon}
                    className="flex items-start gap-2.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    <AppIcon name={r.icon} className="mt-0.5 shrink-0 text-gray-400" />
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>

            {/* password */}
            <div className={`${CARD} p-5`}>
              <SectionTitle>Password</SectionTitle>
              <Alert color="blue" variant="light" icon={<AppIcon name="key-round" />} mt="xs">
                <Text size="xs">
                  To change your password, sign out and use Forgot password on the sign-in page. A reset code is emailed
                  to you.
                </Text>
              </Alert>
            </div>
          </div>
        </div>
      </div>

      <ContractConfirmDialog
        opened={confirmOpen}
        title={twoFactor ? 'Turn off two-factor' : 'Turn on two-factor'}
        message={
          twoFactor
            ? 'Turn off two-factor sign-in? You will only need your password to sign in.'
            : 'Turn on two-factor sign-in? You will get an emailed code at every sign-in.'
        }
        confirmLabel={twoFactor ? 'Turn off' : 'Turn on'}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmToggle}
      />
    </DashboardLayout>
  )
}