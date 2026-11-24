import { SAMPLE_USERS } from '../users/usersData'

// field names follow the API: GET /api/approval-hierarchys/default and /{id}/levels
export type ApprovalHierarchy = {
  id: number
  name: string
  isDefault: boolean
  isActive: boolean
  created: string // ISO date, not in the API yet
}

export type ApprovalLevel = {
  id: number
  hierarchyId: number
  levelNo: number
  levelName: string
  requiredRole: string // must match Role.name exactly
  isActive: boolean
}

// sample rows removed: the page lists the real hierarchies and levels from the API
export const SAMPLE_HIERARCHIES: ApprovalHierarchy[] = []

export const SAMPLE_LEVELS: ApprovalLevel[] = []

// SAMPLE ONLY: the same sample users as the Users page (still used by the page's approver tiles)
export const activeUsersWithRole = (role: string) => SAMPLE_USERS.filter((u) => u.role === role && u.active)