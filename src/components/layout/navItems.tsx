export type NavItem = {
  key: string
  label: string
  icon: string
  path: string
  /** a MODULES key from rolesData.ts. No area = every role can see it */
  area?: string
  /** a page key inside that area, so a role can be given some pages of an area and not others */
  page?: string
}
// icon: shown on the section's own row when it folds (the main nav); its links then show no icon (the sub navs).
// group: the small grey label above a run of sections (Overview, Operations...), never the same word as a nav
export type NavSection = { label: string; group: string; icon?: string; items: NavItem[] }

export const navSections: NavSection[] = [
  {
    label: 'Main', group: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: 'gauge', path: '/' }],
  },
  {
    label: 'Applicants', group: 'Operations', icon: 'users',
    items: [
      { key: 'applicants', label: 'Applicants', icon: 'users', path: '/applicants', area: 'applicants', page: 'applicants' },
      { key: 'kyc-review', label: 'KYC Review', icon: 'contact-round', path: '/kyc-review', area: 'applicants', page: 'kyc-review' },
    ],
  },
  {
    label: 'Loans', group: 'Operations', icon: 'hand-coins',
    items: [
      { key: 'applications', label: 'Applications', icon: 'file-text', path: '/loan-applications', area: 'loans', page: 'applications' },
      { key: 'approvals', label: 'Approvals', icon: 'square-check', path: '/loan-approvals', area: 'loans', page: 'approvals' },
      { key: 'contracts', label: 'Contracts', icon: 'pen-line', path: '/loan-contracts', area: 'loans', page: 'contracts' },
      { key: 'disbursements', label: 'Disbursements', icon: 'banknote', path: '/loan-disbursements', area: 'loans', page: 'disbursements' },
      { key: 'loans', label: 'Loans', icon: 'hand-coins', path: '/loans', area: 'loans', page: 'loans' },
      { key: 'collateral-guarantors', label: 'Collateral & Guarantors', icon: 'file-user', path: '/collateral-guarantors', area: 'loans', page: 'securities' },
    ],
  },
  {
    label: 'Repayments', group: 'Operations', icon: 'banknote',
    items: [
      { key: 'payments', label: 'Payments', icon: 'credit-card', path: '/payments', area: 'repayments', page: 'payments' },
      { key: 'penalties', label: 'Penalties & Grace', icon: 'clock', path: '/penalties', area: 'repayments', page: 'penalties' },
    ],
  },
  {
    label: 'Collections', group: 'Operations', icon: 'phone',
    items: [
      { key: 'collection-cases', label: 'Collection Cases', icon: 'phone', path: '/collection-cases', area: 'collections', page: 'collection-cases' },
      { key: 'recovery-cases', label: 'Recovery Cases', icon: 'undo-2', path: '/recovery-cases', area: 'collections', page: 'recovery-cases' },
      { key: 'npl', label: 'NPL & Write-offs', icon: 'triangle-alert', path: '/npl', area: 'collections', page: 'npl' },
    ],
  },
  {
    label: 'Accounting', group: 'Finance & Insights', icon: 'calculator',
    items: [
      { key: 'chart-of-accounts', label: 'Chart of Accounts', icon: 'list-ordered', path: '/chart-of-accounts', area: 'accounting', page: 'chart-of-accounts' },
      { key: 'gl-transactions', label: 'GL Transactions', icon: 'book', path: '/gl-transactions', area: 'accounting', page: 'gl-transactions' },
    ],
  },
  {
    label: 'Reports', group: 'Finance & Insights', icon: 'file-chart-column',
    // one page only, so no page key
    items: [{ key: 'reports', label: 'Reports', icon: 'file-chart-column', path: '/reports', area: 'reports' }],
  },
  {
    label: 'Administration', group: 'System', icon: 'settings',
    items: [
      { key: 'users', label: 'Users', icon: 'circle-user-round', path: '/users', area: 'administration', page: 'users' },
      { key: 'roles', label: 'Roles', icon: 'key-round', path: '/roles', area: 'administration', page: 'roles' },
      { key: 'approval-hierarchy', label: 'Approval Hierarchy', icon: 'network', path: '/approval-hierarchy', area: 'administration', page: 'approval-hierarchy' },
      { key: 'company-profile', label: 'Company Profile', icon: 'building-2', path: '/company-profile', area: 'administration', page: 'company-profile' },
      { key: 'security', label: 'Security Settings', icon: 'lock-keyhole', path: '/security', area: 'administration', page: 'security' },
      // no area on purpose: notifications stay open to every role for now
      { key: 'notifications', label: 'Notifications', icon: 'bell', path: '/notifications' },
      { key: 'theme-settings', label: 'Theme Settings', icon: 'palette', path: '/theme-settings', area: 'administration', page: 'theme-settings' },
      { key: 'audit', label: 'Audit Log', icon: 'history', path: '/audit', area: 'administration', page: 'audit' },
    ],
  },
]

// the sections and items a role may see, a section with no visible item is dropped
export function visibleSections(
  can: (area?: string | null, action?: string, page?: string) => boolean,
): NavSection[] {
  return navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => can(item.area, 'view', item.page)) }))
    .filter((section) => section.items.length > 0)
}

// finds the nav item whose path matches, including sub-routes like /applicants/new
export function getActiveKey(pathname: string): string {
  const match = navItems
    .filter((i) => (i.path === '/' ? pathname === '/' : pathname === i.path || pathname.startsWith(`${i.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return match?.key ?? ''
}

// flat list, handy for looking up an item by key or path
export const navItems: NavItem[] = navSections.flatMap((s) => s.items)