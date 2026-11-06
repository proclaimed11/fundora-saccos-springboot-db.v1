import { useNavigate } from 'react-router-dom'
import { Badge, Button, Text } from '@mantine/core'
import { AppIcon } from '../appIcon'
import { visibleSections } from '../layout/navItems'
import { useRoles } from '../../pages/administration/roles/rolesContext'
import { useAuth } from '../../auth/authContext'
import { SAMPLE_NOTIFICATIONS } from '../../pages/administration/notifications/notificationsData'
import { initials } from '../../pages/applicants/applicantsData'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

// Dashboard is where the user already is, and Notifications is shown on its own button
const HIDDEN = ['dashboard', 'notifications']

// an icon for each sidebar section
const SECTION_ICON: Record<string, string> = {
  Applicants: 'users',
  Loans: 'hand-coins',
  Repayments: 'credit-card',
  Collections: 'phone',
  Accounting: 'book',
  Reports: 'file-chart-column',
  Administration: 'settings',
}

// shown when a role has no dashboard widgets
export function HomeFallback() {
  const navigate = useNavigate()
  const { can, currentRole } = useRoles()
  const { logout, user } = useAuth()

  // the same sections and pages the sidebar shows for this role
  const sections = visibleSections(can)
    .map((s) => ({ ...s, items: s.items.filter((i) => !HIDDEN.includes(i.key)) }))
    .filter((s) => s.items.length > 0)

  // SAMPLE ONLY: the same sample notifications as the Notifications page
  const unread = SAMPLE_NOTIFICATIONS.filter((n) => n.status === 'SENT').length

  /* ---------- no pages at all, or no role ---------- */

  if (sections.length === 0) {
    const noRole = !currentRole
    return (
      <div className={`${CARD} mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-subtle text-brand-dark">
          <AppIcon name="lock-keyhole" size={30} strokeWidth={1.25} />
        </div>
        <div className="mt-4 text-lg font-semibold text-gray-800">
          {noRole ? 'Your account has no role yet' : 'Your role has no access yet'}
        </div>
        <Text size="sm" c="dimmed" mt={6} maw={420}>
          {noRole
            ? 'You are signed in, but you cannot open any page until you are given a role.'
            : `The ${currentRole.name} role has no pages or dashboard widgets yet.`}
        </Text>
        <div className="mt-4 flex items-start gap-2 rounded-md bg-gray-50 px-4 py-3 text-left">
          <AppIcon name="info" className="mt-0.5 shrink-0 text-gray-400" />
          <Text size="xs" c="dimmed">
            Ask an Admin to check your role on the Users page. Once it is set, sign in again or refresh this page.
          </Text>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button size="xs" variant="default" leftSection={<AppIcon name="circle-user-round" />} onClick={() => navigate('/account')}>
            My account
          </Button>
          <Button size="xs" color="red" variant="light" leftSection={<AppIcon name="log-out" />} onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  /* ---------- has pages but no dashboard widgets ---------- */

  const pageCount = sections.reduce((n, s) => n + s.items.length, 0)

  return (
    <div className="space-y-4">
      {/* welcome */}
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-5`}>
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-lg font-medium text-brand-dark">
            {initials(user?.name ?? 'U')}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-gray-800">
              Welcome back {user?.name ?? 'there'}!
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {currentRole && (
                <Badge variant="light" color="brand" radius="sm" size="sm">
                  {currentRole.name}
                </Badge>
              )}
              <Text size="xs" c="dimmed">
                You can open {pageCount} {pageCount === 1 ? 'page' : 'pages'}. Pick one to get started.
              </Text>
            </div>
          </div>
        </div>

        <Button
          size="xs"
          variant="default"
          leftSection={<AppIcon name="bell" />}
          rightSection={
            unread > 0 ? (
              <Badge size="xs" circle color="brand">
                {unread}
              </Badge>
            ) : undefined
          }
          onClick={() => navigate('/notifications')}
        >
          Notifications
        </Button>
      </div>

      {/* the pages this role can open */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <section key={section.label} className={`${CARD} p-4`}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand-dark">
                <AppIcon name={SECTION_ICON[section.label] ?? 'file'} size={20} strokeWidth={1.25} />
              </div>
              <div className="min-w-0 flex-1">
                <Text size="sm" fw={600}>
                  {section.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {section.items.length} {section.items.length === 1 ? 'page' : 'pages'}
                </Text>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="group flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors group-hover:bg-brand group-hover:text-white">
                    <AppIcon name={item.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{item.label}</span>
                  <AppIcon
                    name="chevron-right"
                    className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Text size="xs" c="dimmed" ta="center">
        Missing a page you need? Ask an Admin to update your role on the Users page.
      </Text>
    </div>
  )
}