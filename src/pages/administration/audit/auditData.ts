// field names follow the API: GET /api/audit-logs
export type AuditLog = {
  id: number
  userId: number | null // null when the system did it
  action: string // CREATE, UPDATE, DELETE... whatever the server recorded, upper-cased
  entityType: string
  entityId: number | null
  oldValues: string // JSON text
  newValues: string // JSON text
  ipAddress: string
  createdAt: string // ISO date-time
}

// the API example only shows CREATE, UPDATE and DELETE. Any other action the server records
// still shows, with a plain label and a grey badge.
export const ACTION: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'Created', color: 'green' },
  UPDATE: { label: 'Updated', color: 'blue' },
  DELETE: { label: 'Deleted', color: 'red' },
  LOGIN: { label: 'Signed in', color: 'gray' },
  APPROVE: { label: 'Approved', color: 'teal' },
}

// SOME_THING -> Some thing
const humanize = (text: string) => {
  const spaced = text.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : ''
}

export const actionInfo = (action: string) => ACTION[action] ?? { label: humanize(action) || 'Other', color: 'gray' }

// the entity types are our guess, the API example only shows LOAN. An unknown type still shows
// (its name made readable) and simply has no "Open record" link.
export const ENTITY: Record<string, { label: string; path: (id: number) => string | null }> = {
  LOAN: { label: 'Loan', path: (id) => `/loans/${id}` },
  APPLICANT: { label: 'Applicant', path: (id) => `/applicants/${id}` },
  LOAN_APPLICATION: { label: 'Loan application', path: (id) => `/loan-applications/${id}` },
  USER: { label: 'User', path: (id) => `/users?user=${id}` },
  ROLE: { label: 'Role', path: (id) => `/roles?role=${id}` },
  CHART_OF_ACCOUNT: { label: 'Account', path: (id) => `/chart-of-accounts?account=${id}` },
  PAYMENT: { label: 'Payment', path: (id) => `/payments?view=${id}` },
  SESSION: { label: 'Session', path: () => null },
}

export const entityLabel = (type: string) => ENTITY[type]?.label ?? (humanize(type) || 'Record')