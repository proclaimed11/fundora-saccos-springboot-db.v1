import type { ReactNode } from 'react'
import { ActionIcon, Avatar, Badge, Button, Menu, Text, UnstyledButton } from '@mantine/core'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import logo from '../../assets/logo.png'
import { AppIcon } from '../appIcon'
import { NavSearch } from './navSearch'
import { useAppTheme } from '../../theme/themeContext'
import { EVENT, SAMPLE_NOTIFICATIONS } from '../../pages/administration/notifications/notificationsData'
import { initials } from '../../pages/applicants/applicantsData'

export type Crumb = { label: string; to?: string }

export type DashboardHeaderProps = {
  title: string | string[]
  subtitle?: ReactNode
  breadcrumbs?: Crumb[]
  actions?: ReactNode
  collapsed: boolean
  onMenuClick: () => void
  onNavigate: (key: string) => void
  sidebar: ReactNode
  overlap?: boolean
  user: { name: string; role: string }
  onSettings?: () => void
  onLogout?: () => void
  children: ReactNode
}

const ICON_BTN = 'text-slate-700 hover:bg-emerald-950/5'

export function DashboardHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  collapsed,
  onMenuClick,
  onNavigate,
  sidebar,
  overlap = true,
  user,
  onSettings,
  onLogout,
  children,
}: DashboardHeaderProps) {
  const parts = Array.isArray(title) ? title : [title]
  const { headerStyle } = useAppTheme()
  const navigate = useNavigate()

  // the same sample data as the Notifications page, newest first
  const unread = SAMPLE_NOTIFICATIONS.filter((n) => n.status === 'SENT').sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  )
  const latest = unread.slice(0, 5)

  return (
    <div
      className={`${
        headerStyle === 'texture' ? 'texture-header-skin' : 'botanical-header-skin'
      } flex h-screen flex-col bg-gray-100`}
    >
      <header className="relative z-30 flex h-12 shrink-0 items-center text-slate-700">
        <div
          className={`relative flex shrink-0 items-center px-3 transition-[width] duration-200 lg:justify-start lg:px-4 ${
            collapsed ? 'lg:w-14 lg:justify-center lg:px-0' : 'lg:w-56'
          }`}
        >
          <img
            src={logo}
            alt="Company logo"
            className={`h-9 w-20 max-w-full object-cover transition-opacity sm:w-28 lg:w-32 ${
              collapsed ? 'lg:pointer-events-none lg:opacity-0' : ''
            }`}
          />
          <ActionIcon
            variant="subtle"
            size="lg"
            className={`absolute right-0 top-1/2 hidden -translate-y-1/2 ${ICON_BTN} lg:flex`}
            aria-label="Toggle sidebar"
            onClick={onMenuClick}
          >
            <AppIcon name="menu" />
          </ActionIcon>
        </div>

        <ActionIcon
          variant="subtle"
          size="md"
          className={`${ICON_BTN} lg:hidden`}
          aria-label="Toggle sidebar"
          onClick={onMenuClick}
        >
          <AppIcon name="menu" />
        </ActionIcon>

        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className={`min-w-0 flex-1 overflow-hidden px-2 ${
              collapsed
                ? 'xl:max-w-[calc(50vw_-_13.5rem)]'
                : 'xl:max-w-[calc(50vw_-_24rem)]'
            }`}
          >
            <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1
                return (
                  <li
                    key={`${crumb.label}-${i}`}
                    className={`flex min-w-0 items-center gap-1.5 ${
                      isLast ? 'flex-1' : 'shrink-0'
                    }`}
                  >
                    {i > 0 && (
                      <AppIcon name="chevron-right" className="shrink-0 text-slate-400" size={14} />
                    )}
                    {crumb.to && !isLast ? (
                      <Link
                        to={crumb.to}
                        className="inline-flex min-w-0 items-center text-slate-600 no-underline transition-colors hover:text-slate-900"
                      >
                        {i === 0 && <AppIcon name="home" className="mr-1 block shrink-0" size={14} />}
                        <span className="truncate">{crumb.label}</span>
                      </Link>
                    ) : (
                      <span
                        aria-current={isLast ? 'page' : undefined}
                        className={`min-w-0 truncate ${
                          isLast ? 'flex-1 font-medium text-slate-800' : 'text-slate-700'
                        }`}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}

        <div className="ml-auto flex min-w-0 shrink-0 items-center xl:absolute xl:left-1/2 xl:ml-0 xl:-translate-x-1/2">
          <NavSearch onNavigate={onNavigate} />
        </div>

        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0.5 px-1.5 sm:gap-1 sm:px-3">
          <Menu position="bottom-end" shadow="lg" width={340} withArrow>
            <Menu.Target>
              <UnstyledButton
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-slate-700 transition-colors hover:bg-emerald-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                aria-label="Notifications, 99+ unread"
              >
                <span className="relative inline-flex h-6 w-6 items-center justify-center">
                  <AppIcon name="bell" size={18} />
                  <Badge
                    size="xs"
                    color="red"
                    variant="filled"
                    radius="xl"
                    className="absolute -right-2 -top-1 z-10 min-w-7 border-2 border-white px-1 text-[9px] leading-none"
                  >
                    99+
                  </Badge>
                </span>
              </UnstyledButton>
            </Menu.Target>

            <Menu.Dropdown className="max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <AppIcon name="bell" size={17} />
                  </span>
                  <div className="min-w-0">
                    <Text size="sm" fw={600} className="text-slate-800">
                      Notifications
                    </Text>
                    <Text size="xs" className="text-slate-500">
                      You have 99+ unread notifications
                    </Text>
                  </div>
                </div>
                <Badge size="sm" variant="light" color="red" radius="xl">
                  99+
                </Badge>
              </div>

              {latest.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <AppIcon name="bell" size={18} />
                  </span>
                  <Text size="sm" fw={500} className="text-slate-700">You’re all caught up</Text>
                  <Text size="xs" className="mt-1 text-slate-500">New notifications will appear here.</Text>
                </div>
              ) : (
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto p-1.5">
                  {latest.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => navigate(`/notifications?view=${n.id}`)}
                      className="flex w-full gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                        <AppIcon name={EVENT[n.eventType].icon} size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Text size="xs" fw={600} className="text-slate-800">
                            {EVENT[n.eventType].label}
                          </Text>
                          <Text size="xs" className="shrink-0 text-slate-400">
                            {dayjs(n.sentAt).format('MMM D')}
                          </Text>
                        </div>
                        <Text size="xs" className="mt-1 line-clamp-2 leading-relaxed text-slate-600">
                          {n.message}
                        </Text>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 px-4 py-2 text-center">
                <Button component={Link} to="/notifications" size="compact-xs" variant="subtle">
                  View all notifications
                </Button>
              </div>
            </Menu.Dropdown>
          </Menu>

          <Menu position="bottom-end" shadow="md" width={220} withArrow>
            <Menu.Target>
              <UnstyledButton
                type="button"
                aria-label={`Account menu for ${user.name}`}
                title={user.name}
                className="ml-1 flex max-w-40 items-center gap-1 rounded-md p-1 text-left transition-colors hover:bg-emerald-950/5 sm:ml-2 sm:max-w-48 sm:gap-2"
              >
                <Avatar size="sm" radius="xl" color="brand" variant="light" className="shrink-0">
                  {initials(user.name)}
                </Avatar>
                <span className="min-w-0 max-w-[3.5rem] sm:max-w-32">
                  <Text size="xs" fw={500} truncate className="text-slate-800">
                    {user.name}
                  </Text>
                  <Text size="10px" truncate className="hidden text-slate-500 sm:block">
                    {user.role}
                  </Text>
                </span>
                <AppIcon name="chevron-down" size={14} className="hidden shrink-0 text-slate-500 sm:block" />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<AppIcon name="circle-user-round" />}
                onClick={onSettings}
              >
                Profile
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<AppIcon name="log-out" />}
                onClick={onLogout}
              >
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col overflow-auto">
          <div className="relative z-10 flex shrink-0 items-start justify-between gap-4 px-4 pb-11 pt-0">
            <div className="min-w-0">
              <Text size="md" c="dark.7" className="leading-none">
                {parts.map((part, i) => (
                  <span key={`${part}-${i}`}>
                    {i > 0 && <span className="mx-1.5 text-slate-400">/</span>}
                    <span className={i === parts.length - 1 ? 'font-semibold text-slate-800' : 'text-slate-600'}>
                      {part}
                    </span>
                  </span>
                ))}
              </Text>

              {subtitle && (
                <Text size="xs" c="dimmed" mt={6} className="truncate">
                  {subtitle}
                </Text>
              )}
            </div>

            {actions && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {actions}
              </div>
            )}
          </div>

          <div className="flex-1 bg-content-background">
            <main className={`relative z-10 px-4 pb-4 ${overlap ? '-mt-8' : 'mt-4'}`}>
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}