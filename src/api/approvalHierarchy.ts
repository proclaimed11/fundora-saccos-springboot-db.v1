import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from './client'
import { queryClient } from './queryClient'

// approval_hierarchy table, raw CRUD (the working path is spelled "approval-hierarchys")
export type ServerHierarchy = {
  id: number
  name: string
  isDefault: boolean
  isActive: boolean
  createdAt: string
}

const hierarchyKeys = { all: ['approval-hierarchies'] as const }

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const toHierarchy = (raw: unknown): ServerHierarchy => {
  const r = asRecord(raw)
  return {
    id: Number(r.id) || 0,
    name: typeof r.name === 'string' ? r.name : '',
    isDefault: r.isDefault === true,
    isActive: r.isActive !== false,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
  }
}

// answers either a bare list or { data: [...] }
const listOf = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : (asRecord(raw).data as unknown[]) ?? [])

/* ---------- GET /api/approval-hierarchys ---------- */

export const useServerHierarchies = () =>
  useQuery({
    queryKey: hierarchyKeys.all,
    queryFn: async () =>
      listOf(await api<unknown>('/api/approval-hierarchys'))
        .map(toHierarchy)
        .filter((h) => h.id > 0)
        .sort((a, b) => a.id - b.id),
  })

/* ---------- POST /api/approval-hierarchys ---------- */

// a new hierarchy is never the default, so it changes nothing until it is made the default
export async function createHierarchy(name: string): Promise<ServerHierarchy> {
  const raw = await api<unknown>('/api/approval-hierarchys', {
    method: 'POST',
    body: { name, isDefault: false, isActive: true, createdAt: new Date().toISOString().slice(0, 19) },
  })
  const r = asRecord(raw)
  const created = toHierarchy(r.data ?? r)
  void queryClient.invalidateQueries({ queryKey: hierarchyKeys.all })
  return created
}

/* ---------- PUT /api/approval-hierarchys/{id}: which hierarchy is in use ---------- */

// raw CRUD PUT replaces the row, so the current row is read first and only the given fields are changed
async function putHierarchy(id: number, changes: Partial<Pick<ServerHierarchy, 'name' | 'isActive' | 'isDefault'>>) {
  const raw = asRecord(await api<unknown>(`/api/approval-hierarchys/${id}`))
  const row = asRecord(raw.data ?? raw)
  await api<unknown>(`/api/approval-hierarchys/${id}`, { method: 'PUT', body: { ...row, ...changes, id } })
}
const putDefault = (id: number, isDefault: boolean) => putHierarchy(id, { isDefault })

// PUT /api/approval-hierarchys/{id}: rename, activate or deactivate
export async function updateHierarchy(id: number, changes: { name?: string; isActive?: boolean }) {
  try {
    await putHierarchy(id, changes)
  } finally {
    void queryClient.invalidateQueries({ queryKey: hierarchyKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['approval-levels'] })
  }
}

// DELETE /api/approval-hierarchys/{id}, after DELETE /api/approval-levels/{id} for each of its levels.
// Refused when a decision in the approval table points at one of its levels, so that history is kept
export async function deleteHierarchy(id: number) {
  // skipped levels included, so none is left behind without its hierarchy
  const levels = await getLevelsOf(id)
  const levelIds = new Set(levels.map((l) => l.id))
  if (levelIds.size > 0) {
    const decisions = listOf(await api<unknown>('/api/approvals')).map(asRecord)
    const used = decisions.some((d) => levelIds.has(Number(d.approvalLevelId ?? asRecord(d.approvalLevel).id)))
    if (used) {
      throw new Error('Applications have already been decided at its levels, so it is kept for the record. Deactivate it instead.')
    }
  }
  try {
    for (const l of levels) await api<unknown>(`/api/approval-levels/${l.id}`, { method: 'DELETE' })
    await api<unknown>(`/api/approval-hierarchys/${id}`, { method: 'DELETE' })
  } finally {
    void queryClient.invalidateQueries({ queryKey: hierarchyKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['approval-levels'] })
  }
}

// is_default = true only on the hierarchy in use, false on every other one (System Hierarchy included).
// The new one is switched on first, so a failure half way never leaves loans without a default
export async function setDefaultHierarchy(id: number, all: ServerHierarchy[]) {
  try {
    await putDefault(id, true)
    for (const h of all) if (h.id !== id && h.isDefault) await putDefault(h.id, false)
  } finally {
    void queryClient.invalidateQueries({ queryKey: hierarchyKeys.all })
    // the chain used by loans changed (Admin-only badge, application pages)
    void queryClient.invalidateQueries({ queryKey: ['approval-levels'] })
  }
}

/* ---------- approval_level table ---------- */

export type ServerLevel = {
  id: number
  hierarchyId: number
  levelNo: number
  levelName: string
  requiredRole: string
  isActive: boolean
}

const toLevel = (raw: unknown, hierarchyId: number): ServerLevel => {
  const r = asRecord(raw)
  return {
    id: Number(r.id) || 0,
    hierarchyId: Number(r.hierarchyId ?? asRecord(r.hierarchy).id) || hierarchyId,
    levelNo: Number(r.levelNo) || 0,
    levelName: typeof r.levelName === 'string' ? r.levelName : '',
    requiredRole: typeof r.requiredRole === 'string' ? r.requiredRole : '',
    isActive: r.isActive !== false,
  }
}

const levelsKey = (hierarchyId: number) => [...hierarchyKeys.all, hierarchyId, 'levels'] as const

// one flat list; a stable function so React Query keeps the same array until the data changes
const allLevels = (results: { data?: ServerLevel[] }[]) => results.flatMap((r) => r.data ?? [])

// GET /api/approval-levels (raw CRUD), this hierarchy's rows. /approval-hierarchys/{id}/levels leaves out
// skipped levels (is_active = false), and those must stay listed, greyed out, so they can be restored
async function getLevelsOf(hierarchyId: number): Promise<ServerLevel[]> {
  return listOf(await api<unknown>('/api/approval-levels'))
    .map((l) => toLevel(l, 0))
    .filter((l) => l.id > 0 && l.hierarchyId === hierarchyId)
    .sort((a, b) => a.levelNo - b.levelNo)
}

export const useServerLevels = (hierarchyIds: number[]) =>
  useQueries({
    combine: allLevels,
    queries: hierarchyIds.map((id) => ({
      queryKey: levelsKey(id),
      queryFn: () => getLevelsOf(id),
    })),
  })

export type ChainLevel = { id: number; levelNo: number; levelName: string; requiredRole: string }

// The steps a loan follows, the same rule as the backend (API v5): its own approvePolicyId when that hierarchy
// exists and is active, otherwise the is_default hierarchy (or the first active one). Only active levels, in order.
export function useApprovalChains() {
  const hierarchies = useServerHierarchies()
  const list = hierarchies.data ?? []
  const levels = useServerLevels(list.map((h) => h.id))

  const fallback = list.find((h) => h.isDefault && h.isActive) ?? list.find((h) => h.isActive) ?? null
  const hierarchyOf = (policyId: number | null) =>
    list.find((h) => h.id === policyId && h.isActive) ?? fallback
  const chainOf = (policyId: number | null): ChainLevel[] => {
    const h = hierarchyOf(policyId)
    if (!h) return []
    return levels
      .filter((l) => l.hierarchyId === h.id && l.isActive)
      .sort((a, b) => a.levelNo - b.levelNo)
      .map(({ id, levelNo, levelName, requiredRole }) => ({ id, levelNo, levelName, requiredRole }))
  }
  return {
    hierarchyOf,
    chainOf,
    levels,
    isLoading: hierarchies.isLoading,
    isPending: hierarchies.isPending,
    error: hierarchies.error,
    refetch: hierarchies.refetch,
  }
}

// which approval levels ask for each role (by name, as required_role stores it), e.g.
// { 'Loan Officer': ['Level 2 "Loan officer" in Normal Loans'] }. Used to protect roles from rename/delete
export function useRoleUsage(): { usage: Record<string, string[]>; loading: boolean } {
  const hierarchies = useServerHierarchies()
  const levels = useServerLevels((hierarchies.data ?? []).map((h) => h.id))
  const usage: Record<string, string[]> = {}
  for (const l of levels) {
    const h = (hierarchies.data ?? []).find((x) => x.id === l.hierarchyId)
    const key = l.requiredRole.trim()
    if (!key) continue
    ;(usage[key] ??= []).push(`Level ${l.levelNo} "${l.levelName}" in ${h?.name ?? 'a hierarchy'}`)
  }
  return { usage, loading: hierarchies.isPending }
}

// PUT /api/approval-levels/{id}: raw CRUD replaces the row, so it is read first and only the given fields change
async function putLevel(id: number, changes: Partial<Pick<ServerLevel, 'levelNo' | 'levelName' | 'requiredRole' | 'isActive'>>) {
  const raw = asRecord(await api<unknown>(`/api/approval-levels/${id}`))
  const row = asRecord(raw.data ?? raw)
  await api<unknown>(`/api/approval-levels/${id}`, { method: 'PUT', body: { ...row, ...changes, id } })
}

const refreshLevels = (hierarchyId: number) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: levelsKey(hierarchyId) }),
    // the default chain (Admin-only badge, application pages) may have changed too
    queryClient.invalidateQueries({ queryKey: ['approval-levels'] }),
  ])

// the arrows: two levels trade their level_no (there is no reorder endpoint, so it is two PUTs)
export async function swapLevels(hierarchyId: number, a: ServerLevel, b: ServerLevel) {
  try {
    await putLevel(a.id, { levelNo: b.levelNo })
    await putLevel(b.id, { levelNo: a.levelNo })
  } finally {
    await refreshLevels(hierarchyId)
  }
}

// skip / include: PUT /api/approval-levels/{id} { isActive }. The level keeps its number and its history
export async function setLevelActive(hierarchyId: number, levelId: number, isActive: boolean) {
  try {
    await putLevel(levelId, { isActive })
  } finally {
    await refreshLevels(hierarchyId)
  }
}

// DELETE /api/approval-levels/{id}, then the levels after it move up one number (a PUT each).
// Refused when a decision in the approval table points at it, so that history is kept
export async function deleteLevel(hierarchyId: number, level: ServerLevel, all: ServerLevel[]) {
  const decisions = listOf(await api<unknown>('/api/approvals')).map(asRecord)
  if (decisions.some((d) => Number(d.approvalLevelId ?? asRecord(d.approvalLevel).id) === level.id)) {
    throw new Error('Applications have already been decided at this level, so it is kept for the record. Skip it instead.')
  }
  try {
    await api<unknown>(`/api/approval-levels/${level.id}`, { method: 'DELETE' })
    const rest = all.filter((l) => l.id !== level.id).sort((a, b) => a.levelNo - b.levelNo)
    for (const [i, l] of rest.entries()) if (l.levelNo !== i + 1) await putLevel(l.id, { levelNo: i + 1 })
  } finally {
    await refreshLevels(hierarchyId)
  }
}

// POST /api/approval-levels. The doc does not say how the hierarchy is linked, so both forms are sent
export async function createLevel(
  hierarchyId: number,
  level: { levelNo: number; levelName: string; requiredRole: string },
): Promise<void> {
  await api<unknown>('/api/approval-levels', {
    method: 'POST',
    body: { ...level, hierarchyId, hierarchy: { id: hierarchyId }, isActive: true },
  })
  await queryClient.invalidateQueries({ queryKey: levelsKey(hierarchyId) })
  // the default chain (Admin-only badge, application pages) may have changed too
  void queryClient.invalidateQueries({ queryKey: ['approval-levels'] })
}
