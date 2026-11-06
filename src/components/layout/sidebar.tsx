import { AppIcon } from '../appIcon'
import { ActionIcon, Menu, ScrollArea, Text, UnstyledButton } from '@mantine/core'
import { visibleSections } from './navItems'
import { useRoles } from '../../pages/administration/roles/rolesContext'
import { initials } from '../../pages/applicants/applicantsData'

type SidebarUser = { name: string; role: string }

type SidebarProps = {
  active: string
  onChange: (key: string) => void
  /** mobile drawer state, ignored on large screens */
  open: boolean
  onClose: () => void
  /** icon-only rail, large screens only */
  collapsed: boolean
  user: SidebarUser
  onSettings?: () => void
  onLogout?: () => void
}

export function Sidebar({
  active,
  onChange,
  open,
  onClose,
  collapsed,
  user,
  onSettings,
  onLogout,
}: SidebarProps) {
    const { can } = useRoles()

  // only the sections and items the current role may see
  const sections = visibleSections(can)

  return (
    <>
      {/* backdrop, small screens only */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 top-12 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Keep an icon rail visible on mobile; open it as a drawer on demand. */}
      <aside
        className={`${
          open
            ? 'fixed bottom-0 left-0 top-12 z-40 w-56'
            : 'relative z-20 h-full w-14'
        } flex shrink-0 flex-col overflow-hidden bg-sidebar-background shadow-[4px_0_12px_rgba(15,23,42,0.10)] transition-[width,transform] duration-200 lg:relative lg:inset-auto lg:z-20 lg:h-full lg:translate-x-0 ${
          collapsed ? 'lg:w-14' : 'lg:w-56'
        }`}
      >
        {/* user */}
        <div
          className={`relative flex shrink-0 flex-col items-center border-b border-sidebar-border px-4 py-4 text-center ${
            collapsed ? 'lg:px-1 lg:py-3' : ''
          } ${!open ? 'max-lg:px-1 max-lg:py-3' : ''}`}
        >
          <div className="relative">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full bg-sidebar-avatar text-lg font-medium text-brand ring-1 ring-brand/30 ${
                collapsed ? 'lg:h-9 lg:w-9 lg:text-sm' : ''
              } ${!open ? 'max-lg:mt-3 max-lg:h-9 max-lg:w-9 max-lg:text-sm' : ''}`}
            >
              {initials(user.name)}
            </div>
            <Menu position="bottom-end" shadow="md" width={220} withArrow>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  className="absolute -right-1 -top-1 z-10 rounded-full bg-sidebar-background text-sidebar-text ring-1 ring-sidebar-border hover:bg-sidebar-highlight hover:text-sidebar-highlight-text"
                  aria-label="Account settings menu"
                >
                  <AppIcon name="settings" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown className="sidebar-account-menu">
                <Menu.Item
                  className="sidebar-account-menu-item"
                  leftSection={<AppIcon name="circle-user-round" />}
                  onClick={onSettings}
                >
                  Profile
                </Menu.Item>

                <Menu.Divider className="sidebar-account-menu-divider" />
                <Menu.Item
                  className="sidebar-account-menu-item sidebar-account-menu-logout"
                  color="red"
                  leftSection={<AppIcon name="log-out" />}
                  onClick={onLogout}
                >
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
          <div className={`${collapsed ? 'lg:hidden' : ''} ${!open ? 'max-lg:hidden' : ''}`}>
            <div className="mt-2 text-sm font-medium text-sidebar-text">{user.name}</div>
            <div className="text-xs text-sidebar-muted">{user.role}</div>
          </div>
        </div>

        {/* thin scrollbar that only appears while scrolling */}
        <ScrollArea
          type="scroll"
          scrollbarSize={6}
          scrollHideDelay={600}
          className="min-h-0 flex-1"
          styles={{
            scrollbar: { background: 'transparent' },
            thumb: { background: 'var(--color-sidebar-highlight)' },
          }}
        >
          <nav className="flex flex-col pb-4">
            {sections.map((section) => (
              <div key={section.label} className="mt-3 first:mt-2">
                {/* group label, replaced by a thin divider when the rail is collapsed */}
                <Text
                  size="xs"
                  className={`px-5 pb-1 text-sidebar-muted ${
                    collapsed ? 'lg:hidden' : ''
                  } ${!open ? 'max-lg:hidden' : ''}`}
                >
                  {section.label}
                </Text>
                {(collapsed || !open) && (
                  <div
                    className={`mx-3 mb-1 border-t border-sidebar-border ${
                      collapsed ? 'hidden lg:block' : 'hidden max-lg:block'
                    }`}
                  />
                )}

                {section.items.map((item) => {
                  const isActive = item.key === active
                  return (
                    <UnstyledButton
                      key={item.key}
                      onClick={() => onChange(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      title={item.label}
                      className={`group relative ml-0 flex w-full items-center gap-3 rounded-none px-5 py-2 text-left transition-colors ${
                        collapsed ? 'lg:justify-center lg:px-0' : ''
                      } ${!open ? 'max-lg:justify-center max-lg:px-0' : ''} ${
                        isActive
                          ? 'bg-sidebar-highlight text-sidebar-highlight-text'
                          : 'text-sidebar-text hover:bg-sidebar-highlight hover:text-sidebar-highlight-text'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          isActive
                            ? 'border-transparent bg-brand'
                            : 'border-sidebar-border bg-transparent group-hover:border-transparent group-hover:bg-white/40'
                        }`}
                      >
                        <AppIcon
                          name={item.icon}
                          className={`w-4 text-center opacity-90 ${
                            isActive
                              ? 'text-white'
                              : 'text-sidebar-text group-hover:text-sidebar-highlight-text'
                          }`}
                        />
                      </span>
                      <Text
                        size="sm"
                        className={`font-light ${
                          isActive
                            ? 'text-sidebar-highlight-text opacity-100'
                            : 'text-sidebar-text opacity-90 group-hover:text-sidebar-highlight-text group-hover:opacity-100'
                        } ${collapsed ? 'lg:hidden' : ''} ${!open ? 'max-lg:hidden' : ''}`}
                      >
                        {item.label}
                      </Text>
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-1 bg-sidebar-indicator"
                        />
                      )}
                    </UnstyledButton>
                  )
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  )
}