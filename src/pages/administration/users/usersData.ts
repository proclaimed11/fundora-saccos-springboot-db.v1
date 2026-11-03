export const ROLES = ['Admin', 'Loan Officer', 'Approver', 'Collector'] as const
export type RoleName = (typeof ROLES)[number]

// the approval level each role covers (see the approval hierarchy)
export const ROLE_STYLE: Record<RoleName, { color: string; level: string }> = {
  Admin: { color: 'red', level: 'Approval level 1 · Admin' },
  'Loan Officer': { color: 'blue', level: 'Approval level 2 · Manager' },
  Approver: { color: 'violet', level: 'Approval level 3 · Committee' },
  Collector: { color: 'teal', level: 'No approval level' },
}

const DEFAULT_STYLE = { color: 'gray', level: 'No approval level' }

// a role that is not one of the known system roles gets the plain style
export const roleStyle = (role: string | null) =>
  role && role in ROLE_STYLE ? ROLE_STYLE[role as RoleName] : DEFAULT_STYLE

export type User = {
  id: number
  name: string
  username: string
  email: string
  phone: string
  role: string | null
  roleId?: number | null // the id the API uses, the sample users have none
  active: boolean
  twoFactor: boolean
  lastLogin: string | null // ISO date
  created: string // ISO date
}

// SAMPLE ONLY: replaced by GET /api/users later
export const SAMPLE_USERS: User[] = [
  { id: 1, name: 'Admin User', username: 'admin', email: 'admin@fundora.co.tz', phone: '0700000001', role: 'Admin', active: true, twoFactor: true, lastLogin: '2026-10-27', created: '2026-01-05' },
  { id: 2, name: 'Asha Mrema', username: 'asha', email: 'asha@fundora.co.tz', phone: '0713222111', role: 'Loan Officer', active: true, twoFactor: false, lastLogin: '2026-10-26', created: '2026-01-12' },
  { id: 3, name: 'Juma Bakari', username: 'juma', email: 'juma@fundora.co.tz', phone: '0754333222', role: 'Loan Officer', active: true, twoFactor: false, lastLogin: '2026-10-24', created: '2026-02-03' },
  { id: 4, name: 'Credit Committee', username: 'committee', email: 'committee@fundora.co.tz', phone: '0765444333', role: 'Approver', active: true, twoFactor: true, lastLogin: '2026-10-20', created: '2026-02-10' },
  { id: 5, name: 'Rehema Salim', username: 'rehema', email: 'rehema@fundora.co.tz', phone: '0688555666', role: 'Collector', active: true, twoFactor: false, lastLogin: '2026-10-22', created: '2026-04-18' },
  { id: 6, name: 'Daudi Mwanga', username: 'daudi', email: 'daudi@fundora.co.tz', phone: '0654777888', role: 'Collector', active: false, twoFactor: false, lastLogin: '2026-08-15', created: '2026-03-01' },
  { id: 7, name: 'Neema Kileo', username: 'neema', email: 'neema@fundora.co.tz', phone: '0712345678', role: null, active: true, twoFactor: false, lastLogin: null, created: '2026-10-25' },
]

export type UserEvent = { title: string; detail: string; date: string; icon: string }

// SAMPLE ONLY: the audit log feeds this later
export function activityFor(u: User): UserEvent[] {
  const events: UserEvent[] = [
    { title: 'Account created', detail: `Username ${u.username}`, date: u.created, icon: 'user-round-plus' },
  ]
  if (u.twoFactor) events.push({ title: 'Two-factor enabled', detail: 'Sign-in needs an emailed code', date: u.created, icon: 'shield' })
  if (u.lastLogin) events.push({ title: 'Signed in', detail: 'Last successful sign-in', date: u.lastLogin, icon: 'circle-check' })
  if (!u.active) events.push({ title: 'Account deactivated', detail: 'Can no longer sign in', date: u.lastLogin ?? u.created, icon: 'circle-x' })
  return events.reverse()
}