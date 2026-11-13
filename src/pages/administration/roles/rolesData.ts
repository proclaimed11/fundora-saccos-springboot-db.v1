import type { Permission } from '../../../api/schemas'

// a page inside an area, with the actions that make sense for it
export type PageKind = 'stat' | 'chart' | 'list'

// the tag shown next to a dashboard item in the role forms
export const KIND: Record<PageKind, { label: string; color: string }> = {
  stat: { label: 'Stat card', color: 'blue' },
  chart: { label: 'Chart', color: 'grape' },
  list: { label: 'List', color: 'orange' },
}

// a page inside an area, with the actions that make sense for it
export type PageDef = { key: string; label: string; actions: string[]; kind?: PageKind }

// an area of the system. Areas with pages can be given out page by page
export type Module = { key: string; label: string; actions: string[]; pages?: PageDef[]; unit?: 'pages' | 'widgets' }


export const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'approve', label: 'Approve' },
  { key: 'delete', label: 'Delete' },
]

export const actionLabel = (key: string) => ACTIONS.find((a) => a.key === key)?.label ?? key

// keeps actions in the order of ACTIONS, so saved data is always tidy
const order = (list: string[]) => ACTIONS.map((a) => a.key).filter((k) => list.includes(k))

// the area's own actions are the actions of its pages put together
function areaWithPages(key: string, label: string, pages: PageDef[], unit?: Module['unit']): Module {
  return { key, label, pages, unit, actions: order(pages.flatMap((p) => p.actions)) }
}

// the areas of the system a role can touch, they follow the sidebar
// (Notifications is left out on purpose, it is open to every role)
 export const MODULES: Module[] = [
  // the dashboard is open to everyone, this decides which widgets each role sees on it
    areaWithPages(
    'dashboard',
    'Dashboard',
    [
      { key: 'cash', label: 'Cash available', actions: ['view'], kind: 'stat' },
      { key: 'loan-book', label: 'Loan book figures (outstanding, portfolio at risk)', actions: ['view'], kind: 'stat' },
      { key: 'collections', label: 'Collection figures (due this week, collected today)', actions: ['view'], kind: 'stat' },
      { key: 'trend', label: 'Disbursed vs collected', actions: ['view'], kind: 'chart' },
      { key: 'status', label: 'Loans by status', actions: ['view'], kind: 'chart' },
      { key: 'npl', label: 'NPL classification', actions: ['view'], kind: 'chart' },
      { key: 'aging', label: 'Collections aging', actions: ['view'], kind: 'chart' },
      { key: 'approvals', label: 'Pending approvals', actions: ['view'], kind: 'list' },
      { key: 'kyc', label: 'KYC to review', actions: ['view'], kind: 'list' },
    ],
    'widgets',
  ),
  areaWithPages('applicants', 'Applicants', [
    { key: 'applicants', label: 'Applicants', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'kyc-review', label: 'KYC Review', actions: ['view', 'approve'] },
  ]),
  areaWithPages('loans', 'Loans and approvals', [
    { key: 'applications', label: 'Applications', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'approvals', label: 'Approvals', actions: ['view', 'approve'] },
    { key: 'contracts', label: 'Contracts', actions: ['view', 'create', 'edit'] },
     { key: 'securities', label: 'Collateral & Guarantors', actions: ['view', 'edit'] },
    { key: 'disbursements', label: 'Disbursements', actions: ['view', 'create'] },
    { key: 'loans', label: 'Loans', actions: ['view'] },
  ]),
  areaWithPages('repayments', 'Repayments', [
    { key: 'payments', label: 'Payments', actions: ['view', 'create'] },
    { key: 'penalties', label: 'Penalties & Grace', actions: ['view', 'create', 'edit'] },
  ]),
  areaWithPages('collections', 'Collections', [
    { key: 'collection-cases', label: 'Collection Cases', actions: ['view', 'create', 'edit'] },
    { key: 'recovery-cases', label: 'Recovery Cases', actions: ['view', 'create', 'edit'] },
    { key: 'npl', label: 'NPL & Write-offs', actions: ['view', 'edit', 'delete'] },
  ]),
  areaWithPages('accounting', 'Accounting', [
    { key: 'chart-of-accounts', label: 'Chart of Accounts', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'gl-transactions', label: 'GL Transactions', actions: ['view', 'create'] },
  ]),
  // one page only, so there is nothing to split
  { key: 'reports', label: 'Reports', actions: ['view'] },
  areaWithPages('administration', 'Administration', [
    { key: 'users', label: 'Users', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'roles', label: 'Roles', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'approval-hierarchy', label: 'Approval Hierarchy', actions: ['view', 'create', 'edit', 'delete'] },
    { key: 'company-profile', label: 'Company Profile', actions: ['view', 'edit'] },
    { key: 'security', label: 'Security Settings', actions: ['view', 'edit'] },
    { key: 'theme-settings', label: 'Theme Settings', actions: ['view', 'edit'] },
    { key: 'audit', label: 'Audit Log', actions: ['view'] },
  ]),
]

// the approval chain: each level needs a user whose role covers it
export const LEVELS = ['Level 1 · Admin', 'Level 2 · Manager', 'Level 3 · Committee']

// 'loans' -> the actions on the whole area, 'loans.approvals' -> the actions on one page
export type Permissions = Record<string, string[]>

// the API sends one row per grant { area, page, action }, the UI checks the 'area' and 'area.page' keys
export function toPermissions(grants: Permission[]): Permissions {
  const out: Permissions = {}
  grants.forEach((g) => {
    const key = g.page ? `${g.area}.${g.page}` : g.area
    const list = out[key] ?? (out[key] = [])
    if (!list.includes(g.action)) list.push(g.action)
  })
  return out
}

export type Role = {
  id: number
  name: string
  description: string
  level: string | null // approval level this role covers
  system: boolean // system roles are needed by the approval chain and cannot be deleted
  permissions: Permissions
  created: string // ISO date
}

/* ---------- reading permissions ---------- */

const pageKey = (area: string, page: string) => `${area}.${page}`

export const areaOfKey = (key: string) => key.split('.')[0]

export const hasPages = (m: Module) => !!m.pages && m.pages.length > 0

// how many grants are saved (the count shown on the Roles page)
export const permissionCount = (p: Permissions) => Object.values(p).reduce((s, list) => s + list.length, 0)

// how many areas the role touches, a page-level key counts for its area
export const areaCount = (p: Permissions) =>
  new Set(
    Object.entries(p)
      .filter(([, list]) => list.length > 0)
      .map(([key]) => areaOfKey(key)),
  ).size

// true when the area was given out page by page instead of as a whole
export const isSplit = (p: Permissions, m: Module) => Object.keys(p).some((k) => k.startsWith(`${m.key}.`))

// what a role may do on one page: the page's own grant wins, otherwise the area grant applies
export function pageActions(p: Permissions, m: Module, page: PageDef): string[] {
  const own = p[pageKey(m.key, page.key)]
  return (own ?? p[m.key] ?? []).filter((a) => page.actions.includes(a))
}

// how many pages of the area the role can open
export const pagesWithAccess = (p: Permissions, m: Module) =>
  (m.pages ?? []).filter((page) => pageActions(p, m, page).includes('view')).length

/**
 * The one rule behind can(): may these permissions do `action` on `area` (and on `page`, if given)?
 * Without a page it asks "anywhere in the area".
 */
export function permits(p: Permissions, area: string, action: string, page?: string): boolean {
  const mod = MODULES.find((m) => m.key === area)

  if (page) {
    const def = mod?.pages?.find((x) => x.key === page)
    // a page only accepts the actions it defines, even when the area grant is wider
    if (def && !def.actions.includes(action)) return false
    return (p[pageKey(area, page)] ?? p[area] ?? []).includes(action)
  }

  if ((p[area] ?? []).includes(action)) return true
  return (mod?.pages ?? []).some((x) => (p[pageKey(area, x.key)] ?? []).includes(action))
}

/* ---------- editing permissions (used by the role dialog) ---------- */

// a box in the matrix: all pages have it, some do, none do, or it does not apply
export type Tri = 'all' | 'some' | 'none' | 'na'

export function areaCell(p: Permissions, m: Module, action: string): Tri {
  if (!hasPages(m)) {
    if (!m.actions.includes(action)) return 'na'
    return (p[m.key] ?? []).includes(action) ? 'all' : 'none'
  }
  const pages = m.pages!.filter((x) => x.actions.includes(action))
  if (pages.length === 0) return 'na'
  const granted = pages.filter((x) => pageActions(p, m, x).includes(action)).length
  return granted === 0 ? 'none' : granted === pages.length ? 'all' : 'some'
}

export function pageCell(p: Permissions, m: Module, page: PageDef, action: string): Tri {
  if (!page.actions.includes(action)) return 'na'
  return pageActions(p, m, page).includes(action) ? 'all' : 'none'
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

// ticking an action also ticks View (nothing works without it), unticking View clears everything
function change(current: string[], allowed: string[], action: string, on: boolean): string[] {
  const next = new Set(current)
  if (on) {
    next.add(action)
    if (allowed.includes('view')) next.add('view')
  } else if (action === 'view') {
    next.clear()
  } else {
    next.delete(action)
  }
  return order([...next])
}

// what every page of the area allows right now
function pageSets(p: Permissions, m: Module): Record<string, string[]> {
  return Object.fromEntries((m.pages ?? []).map((x) => [x.key, pageActions(p, m, x)]))
}

/**
 * Saves the pages of one area. If every page matches one area-wide grant it is stored as that single
 * grant (the simple form), otherwise it is stored page by page.
 */
function store(p: Permissions, m: Module, sets: Record<string, string[]>): Permissions {
  const next: Permissions = {}
  for (const [key, list] of Object.entries(p)) {
    if (key !== m.key && !key.startsWith(`${m.key}.`)) next[key] = list
  }

  const pages = m.pages ?? []
  const union = order([...new Set(Object.values(sets).flat())])
  const simple = pages.every((x) =>
    same(
      sets[x.key],
      union.filter((a) => x.actions.includes(a)),
    ),
  )

  if (simple) {
    if (union.length > 0) next[m.key] = union
  } else {
    pages.forEach((x) => {
      if (sets[x.key].length > 0) next[pageKey(m.key, x.key)] = sets[x.key]
    })
  }
  return next
}

export function toggleArea(p: Permissions, m: Module, action: string, on: boolean): Permissions {
  if (!hasPages(m)) {
    const next = change(p[m.key] ?? [], m.actions, action, on)
    const out = { ...p }
    if (next.length > 0) out[m.key] = next
    else delete out[m.key]
    return out
  }

  const sets = pageSets(p, m)
  m.pages!.forEach((x) => {
    if (x.actions.includes(action)) sets[x.key] = change(sets[x.key], x.actions, action, on)
  })
  return store(p, m, sets)
}

export function togglePage(p: Permissions, m: Module, pageKeyName: string, action: string, on: boolean): Permissions {
  const page = m.pages?.find((x) => x.key === pageKeyName)
  if (!page || !page.actions.includes(action)) return p

  const sets = pageSets(p, m)
  sets[page.key] = change(sets[page.key], page.actions, action, on)
  return store(p, m, sets)
}

/* ---------- the sample roles ---------- */

const everything: Permissions = Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]]))

// the dashboard widgets a role sees, one grant per widget
const widgets = (...keys: string[]): Permissions =>
  Object.fromEntries(keys.map((k) => [`dashboard.${k}`, ['view']]))

// SAMPLE ONLY: replaced by GET /api/roles later
export const SAMPLE_ROLES: Role[] = [
  { id: 1, name: 'Admin', description: 'Full access to the whole system', level: LEVELS[0], system: true, permissions: everything, created: '2026-01-05' },
  {
    id: 2,
    name: 'Loan Officer',
    description: 'Registers applicants, handles loan applications and records repayments',
    level: LEVELS[1],
    system: true,
    permissions: {
      ...widgets('loan-book', 'collections', 'status', 'approvals', 'kyc'),
      applicants: ['view', 'create', 'edit'],
      loans: ['view', 'create', 'edit'],
      repayments: ['view', 'create'],
      collections: ['view'],
      reports: ['view'],
    },
    created: '2026-01-05',
  },
  {
    id: 3,
    name: 'Approver',
    description: 'Decides loan applications as part of the credit committee',
    level: LEVELS[2],
    system: true,
    permissions: {
      ...widgets('loan-book', 'status', 'approvals'),
      applicants: ['view'],
      loans: ['view', 'approve'],
      reports: ['view'],
    },
    created: '2026-01-05',
  },
  {
    id: 4,
    name: 'Collector',
    description: 'Follows up overdue loans and logs contact with borrowers',
    level: null,
    system: false,
    permissions: {
      ...widgets('collections', 'aging', 'npl'),
      applicants: ['view'],
      repayments: ['view'],
      collections: ['view', 'create', 'edit'],
    },
    created: '2026-04-18',
  },
]