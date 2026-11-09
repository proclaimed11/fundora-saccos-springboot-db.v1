import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getActiveKey, navItems } from './navItems'
import { useAuth } from '../../auth/authContext'
import { Sidebar } from './sidebar'
import { DashboardHeader, type DashboardHeaderProps } from './dashboardHeader'

type DashboardLayoutProps = Omit<
  DashboardHeaderProps,
  'collapsed' | 'onMenuClick' | 'onNavigate' | 'sidebar' | 'user' | 'onSettings' | 'onLogout'
> & {
  /** pull the page content up over the header, default true */
  overlap?: boolean
  onSettings?: () => void
  onLogout?: () => void
  children: ReactNode
}

export function DashboardLayout({
  title,
  breadcrumbs,
  subtitle,
  actions,
  overlap = true,
  onSettings,
  onLogout,
  children,
}: DashboardLayoutProps) {
    const { logout, user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false) // mobile drawer
  const [collapsed, setCollapsed] = useState(false) // desktop icon rail

  // the highlighted item comes from the URL, so refresh and back/forward stay correct
  const active = getActiveKey(pathname)

  const handleMenuClick = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((current) => !current)
      return
    }
    setMenuOpen((current) => !current)
  }

  const handleNavigate = (key: string) => {
    const item = navItems.find((i) => i.key === key)
    if (item) navigate(item.path)
    setMenuOpen(false)
  }

  return (
    <DashboardHeader
      title={title}
      breadcrumbs={breadcrumbs}
      subtitle={subtitle}
      actions={actions}
      collapsed={collapsed}
      onMenuClick={handleMenuClick}
      onNavigate={handleNavigate}
      user={{ name: user?.name ?? 'User', role: user?.role ?? 'No role' }}
      onSettings={onSettings ?? (() => navigate('/account'))}
      onLogout={onLogout ?? logout}
      overlap={overlap}
      sidebar={
        <Sidebar
          active={active}
          onChange={handleNavigate}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          collapsed={collapsed}
        />
      }
    >
      {children}
    </DashboardHeader>
  )
}