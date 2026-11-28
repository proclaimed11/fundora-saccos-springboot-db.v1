import { AppIcon } from '../appIcon'
import { Menu, ScrollArea, Text, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { visibleSections, type NavSection } from './navItems'
import { useRoles } from '../../pages/administration/roles/rolesContext'
import { useApplicants } from '../../api/applicants'
import { useAwaitingApprovals } from '../../api/loanApplications'
import { useAuth } from '../../auth/authContext'

// the number of applicants waiting for a KYC decision, from GET /api/applicants (shared with the pages' cache)
function useKycPendingCount() {
  const { data = [] } = useApplicants()
  return data.filter((a) => a.status === 'PENDING_KYC').length
}

// the applications waiting at a level that the signed-in user's role decides ("Needs my decision" on the Approvals page)
function useMyApprovalsCount() {
  const { user } = useAuth()
  const { rows } = useAwaitingApprovals()
  const role = user?.role?.trim()
  return role ? rows.filter((r) => r.requiredRole.trim() === role).length : 0
}

// Each count is its own component so its requests only run for roles that can see that link
function KycPendingCount({ collapsed, open }: { collapsed: boolean; open: boolean }) {
  return <CountPill count={useKycPendingCount()} what="waiting for KYC review" collapsed={collapsed} open={open} />
}

function ApprovalsMineCount({ collapsed, open }: { collapsed: boolean; open: boolean }) {
  return <CountPill count={useMyApprovalsCount()} what="waiting for your approval" collapsed={collapsed} open={open} />
}

// a red dot on a closed section's header while one of its links has something waiting
function KycDot() {
  return useKycPendingCount() > 0 ? <SectionDot /> : null
}
function ApprovalsDot() {
  return useMyApprovalsCount() > 0 ? <SectionDot /> : null
}
function SectionDot() {
  return <span aria-label="Has items waiting" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
}

/* ---------- the icon rail: one icon per main nav, its sub navs in a menu beside it ---------- */

// the red count shown next to a link inside the rail menu
function KycMenuCount() {
  const n = useKycPendingCount()
  return n > 0 ? <MenuCount n={n} /> : null
}
function ApprovalsMenuCount() {
  const n = useMyApprovalsCount()
  return n > 0 ? <MenuCount n={n} /> : null
}
function MenuCount({ n }: { n: number }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
      {n > 99 ? '99+' : n}
    </span>
  )
}

function RailSection({
  section,
  active,
  onChange,
  className,
}: {
  section: NavSection
  active: string
  onChange: (key: string) => void
  className: string
}) {
  const keys = section.items.map((i) => i.key)
  const here = keys.includes(active)
  return (
    // the menu takes the sidebar's colours (dark or light), see .rail-menu in src/index.css
    <Menu
      trigger="click-hover"
      position="right-start"
      offset={8}
      shadow="md"
      width={210}
      withinPortal
      openDelay={60}
      closeDelay={150}
      classNames={{ dropdown: 'rail-menu', item: 'rail-menu__item', label: 'rail-menu__label' }}
    >
      <Menu.Target>
        <UnstyledButton
          aria-label={section.label}
          title={section.label}
          className={`group relative flex w-full items-center justify-center py-[5px] transition-colors hover:bg-sidebar-highlight ${
            here ? 'bg-sidebar-highlight' : ''
          } ${className}`}
        >
          <span
            className={`sidebar-icon-box relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
              here ? 'sidebar-icon-box--active' : ''
            }`}
          >
            <AppIcon
              name={section.icon ?? 'file'}
              strokeWidth={1.5}
              className={`w-4 ${here ? 'text-white' : 'text-sidebar-text'}`}
            />
            {/* a red dot while a link inside has items waiting */}
            {(keys.includes('kyc-review') || keys.includes('approvals')) && (
              <span className="absolute -right-1 -top-1">
                {keys.includes('kyc-review') && <KycDot />}
                {keys.includes('approvals') && <ApprovalsDot />}
              </span>
            )}
          </span>
          {here && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-sidebar-indicator" />}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{section.label}</Menu.Label>
        {section.items.map((item) => {
          const isActive = item.key === active
          return (
            <Menu.Item
              key={item.key}
              onClick={() => onChange(item.key)}
              aria-current={isActive ? 'page' : undefined}
              leftSection={
                <span className={`rail-menu__dot block rounded-full ${isActive ? 'rail-menu__dot--active' : ''}`} />
              }
              rightSection={
                item.key === 'kyc-review' ? <KycMenuCount /> : item.key === 'approvals' ? <ApprovalsMenuCount /> : null
              }
              className={isActive ? 'rail-menu__item--active' : ''}
            >
              {item.label}
            </Menu.Item>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}

/* ---------- folding sections ---------- */

// a role that sees this many links or fewer keeps every section open: folding a short list only adds clicks
const FOLD_FROM_ITEMS = 9
const sectionOf = (sections: NavSection[], key: string) => sections.find((s) => s.items.some((i) => i.key === key))

// the red count pill at the end of a menu row (a dot on the icon when the sidebar is collapsed)
function CountPill({ count, what, collapsed, open }: { count: number; what: string; collapsed: boolean; open: boolean }) {
  if (count === 0) return null

  const label = count > 99 ? '99+' : String(count)
  return (
    <>
      {/* full sidebar: a pill at the end of the row */}
      <span
        aria-label={`${count} ${what}`}
        className={`ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white ${
          collapsed ? 'lg:hidden' : ''
        } ${!open ? 'max-lg:hidden' : ''}`}
      >
        {label}
      </span>
      {/* icon-only rail: a small dot on the icon instead */}
      {(collapsed || !open) && (
        <span
          aria-hidden="true"
          className={`absolute left-1/2 top-1.5 ml-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-sidebar-background ${
            collapsed ? 'hidden lg:block' : 'hidden max-lg:block'
          }`}
        />
      )}
    </>
  )
}

type SidebarProps = {
  active: string
  onChange: (key: string) => void
  /** mobile drawer state, ignored on large screens */
  open: boolean
  onClose: () => void
  /** icon-only rail, large screens only */
  collapsed: boolean
}

export function Sidebar({
  active,
  onChange,
  open,
  onClose,
  collapsed,
}: SidebarProps) {
  const { can } = useRoles()

  // only the sections and items the current role may see
  const sections = visibleSections(can)

  // Folding: only for roles with a long menu, and only sections with 2+ links.
  const foldingOn = sections.reduce((n, s) => n + s.items.length, 0) >= FOLD_FROM_ITEMS
  // Moving to a page opens only the section that holds it and closes the others (a page outside every
  // foldable section, like Dashboard, closes them all). The + / − still opens or closes any section by hand.
  const onlyCurrent = (key: string): Record<string, boolean> => {
    const current = sectionOf(sections, key)
    return current ? { [current.label]: true } : {}
  }
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => onlyCurrent(active))
  const [lastActive, setLastActive] = useState(active)
  if (active !== lastActive) {
    setLastActive(active)
    setOpenSections(onlyCurrent(active))
  }
  const toggleSection = (label: string) => setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }))
  // the full sidebar (labels shown): large screens when not collapsed, small screens when the drawer is open
  const expandedOnly = `${collapsed ? 'lg:hidden' : ''} ${!open ? 'max-lg:hidden' : ''}`
  // the opposite: only on the icon rail
  const railOnly = `${!collapsed ? 'lg:hidden' : ''} ${open ? 'max-lg:hidden' : ''}`

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
            ? 'fixed bottom-0 left-0 top-12 z-40 w-[13.25rem]'
            : 'relative z-20 h-full w-14'
        // a very faint shadow, only to the right: clip-path cuts it off at the top and bottom edges (none on the header)
        } flex shrink-0 flex-col overflow-hidden rounded-tr-[6px] bg-sidebar-background shadow-[2px_0_8px_rgba(15,23,42,0.04)] [clip-path:inset(0_-16px_0_0)] transition-[width,transform] duration-200 lg:relative lg:inset-auto lg:z-20 lg:h-full lg:translate-x-0 ${
          // open width (was 13.5rem, 12.75rem, 12.7rem); the header's logo area in dashboardHeader.tsx uses the same value
          collapsed ? 'lg:w-14' : 'lg:w-[13.25rem]'
        }`}
      >
        {/* thin scrollbar that only appears while scrolling */}
        <ScrollArea
          type="scroll"
          scrollbarSize={6}
          scrollHideDelay={600}
          className="min-h-0 flex-1"
          styles={{
            scrollbar: { background: 'transparent' },
            // the scroll thumb in the theme colour, softened so it stays subtle
            thumb: { background: 'color-mix(in srgb, var(--app-brand) 55%, transparent)' },
          }}
        >
          <nav className="flex flex-col pb-4">
            {sections.map((section, index) => {
              const foldable = foldingOn && section.items.length >= 2
              const isOpen = !foldable || !!openSections[section.label]
              const keys = section.items.map((i) => i.key)
              // the group label (Overview, Operations...) goes above the first visible section of each group
              const startsGroup = index === 0 || sections[index - 1].group !== section.group
              return (
              // groups are set apart by space and their label (no lines in the full sidebar)
              <div key={section.label} className={startsGroup ? 'mt-5 first:mt-2' : ''}>
                {startsGroup && (
                  <>
                    {/* small uppercase label in the full sidebar, a thin divider on the icon rail */}
                    <Text
                      className={`px-5 pb-2 text-[11.5px] font-[600] uppercase tracking-[0.06em] text-sidebar-text ${expandedOnly}`}
                    >
                      {section.group}
                    </Text>
                    {(collapsed || !open) && (
                      <div
                        className={`mx-3 mb-1 border-t border-sidebar-border ${
                          collapsed ? 'hidden lg:block' : 'hidden max-lg:block'
                        }`}
                      />
                    )}
                  </>
                )}
                {/* A foldable section is a main nav: its own icon, the 13.5px label, a red dot while closed if a link
                    inside has items waiting, and a chevron that turns down when open. Other sections show their
                    links directly under the group label */}
                {foldable && (
                  <UnstyledButton
                    onClick={() => toggleSection(section.label)}
                    aria-expanded={isOpen}
                    className={`group flex w-full items-center gap-3 px-5 py-[5px] text-left text-sidebar-text transition-colors hover:bg-sidebar-highlight hover:text-sidebar-highlight-text ${expandedOnly}`}
                  >
                    <span className="sidebar-icon-box flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                      <AppIcon name={section.icon ?? 'file'} strokeWidth={1.5} className="w-4 opacity-90" />
                    </span>
                    <Text
                      size="14px"
                      fw={keys.includes(active) ? 400 : 300}
                      className={`flex-1 ${keys.includes(active) ? 'opacity-100' : 'opacity-90'}`}
                    >
                      {section.label}
                    </Text>
                    {!isOpen && keys.includes('kyc-review') && <KycDot />}
                    {!isOpen && keys.includes('approvals') && <ApprovalsDot />}
                    {/* + to open, − when open (a half turn as it swaps) */}
                    <AppIcon
                      name={isOpen ? 'minus' : 'plus'}
                      size={13}
                      strokeWidth={1.25}
                      className={`shrink-0 opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                    />
                  </UnstyledButton>
                )}

                {/* the icon rail: the same main nav icon as the full sidebar; hovering or clicking it opens its sub navs
                    in a small menu beside it */}
                {foldable && (
                  <RailSection
                    section={section}
                    active={active}
                    onChange={onChange}
                    className={railOnly}
                  />
                )}

                {/* the links: a closed section hides them only in the full sidebar; on the icon rail a foldable
                    section's links live in its menu instead, plain sections (Dashboard, Reports) show theirs */}
                <div
                  className={`grid grid-rows-[1fr] transition-[grid-template-rows,visibility] duration-200 ${
                    foldable ? expandedOnly : ''
                  } ${
                    isOpen
                      ? ''
                      : `${!collapsed ? 'lg:invisible lg:grid-rows-[0fr]' : ''} ${open ? 'max-lg:invisible max-lg:grid-rows-[0fr]' : ''}`
                  }`}
                >
                <div className="min-h-0 overflow-hidden">
                {section.items.map((item, itemIndex) => {
                  const isActive = item.key === active
                  const isLastItem = itemIndex === section.items.length - 1
                  return (
                    <UnstyledButton
                      key={item.key}
                      onClick={() => onChange(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      title={item.label}
                      // a sub nav (inside a foldable section) is indented under its main nav and a bit tighter
                      className={`group relative ml-0 flex w-full items-center rounded-none text-left transition-colors ${
                        foldable ? 'gap-2 py-[7px] pl-16 pr-5' : 'gap-3 px-5 py-[5px]'
                      } ${
                        collapsed ? 'lg:justify-center lg:px-0' : ''
                      } ${!open ? 'max-lg:justify-center max-lg:px-0' : ''} ${
                        isActive
                          ? 'bg-sidebar-highlight text-sidebar-highlight-text'
                          : 'text-sidebar-text hover:bg-sidebar-highlight hover:text-sidebar-highlight-text'
                      }`}
                    >
                      {/* sub navs in the full sidebar: an indented line (48px in, past the main nav's icon) with a dot on it for
                          each link, like a mini stepper (src/index.css .sub-nav-line / .sub-nav-dot). The last link's
                          line stops at its dot */}
                      {foldable && (
                        <>
                          <span
                            aria-hidden="true"
                            className={`sub-nav-line absolute left-[47.5px] top-0 w-px ${isLastItem ? 'h-1/2' : 'h-full'} ${expandedOnly}`}
                          />
                          <span
                            aria-hidden="true"
                            className={`sub-nav-dot absolute left-12 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                              isActive ? 'sub-nav-dot--active' : ''
                            } ${expandedOnly}`}
                          />
                        </>
                      )}
                      {/* the icon: always for main navs; for sub navs only on the icon rail, where there is no text */}
                      <span
                        // a small raised chip (src/index.css .sidebar-icon-box); the active one is filled with the brand
                        className={`sidebar-icon-box flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          foldable ? railOnly : ''
                        } ${isActive ? 'sidebar-icon-box--active' : ''}`}
                      >
                        <AppIcon
                          name={item.icon}
                          // a thinner line inside the small chip (default 2)
                          strokeWidth={1.5}
                          className={`w-4 text-center opacity-90 ${
                            isActive
                              ? 'text-white'
                              : 'text-sidebar-text group-hover:text-sidebar-highlight-text'
                          }`}
                        />
                      </span>
                      <Text
                        // sub navs inside a foldable section are one step smaller than the main navs
                        size={foldable ? '13.5px' : '14px'}
                        className={`font-light ${
                          isActive
                            ? 'text-sidebar-highlight-text opacity-100'
                            : 'text-sidebar-text opacity-90 group-hover:text-sidebar-highlight-text group-hover:opacity-100'
                        } ${collapsed ? 'lg:hidden' : ''} ${!open ? 'max-lg:hidden' : ''}`}
                      >
                        {item.label}
                      </Text>
                      {item.key === 'kyc-review' && <KycPendingCount collapsed={collapsed} open={open} />}
                      {item.key === 'approvals' && <ApprovalsMineCount collapsed={collapsed} open={open} />}
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
                </div>
              </div>
              )
            })}
          </nav>
        </ScrollArea>
      </aside>
    </>
  )
}