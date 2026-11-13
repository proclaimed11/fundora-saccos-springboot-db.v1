import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from './client'
import { rolePermissionsRequest } from './auth'
import { permissionSchema } from './schemas'
import { useApiRoles } from './users'
import { permits, toPermissions, type Permissions, type Role } from '../pages/administration/roles/rolesData'

// the approval chain looks these up by name, so they cannot be renamed or deleted
const SYSTEM_ROLES = ['Admin', 'Loan Officer', 'Approver']

// GET /api/permissions, the read-only catalogue
export const usePermissionCatalogue = () =>
  useQuery({
    queryKey: ['permissions'],
    queryFn: () => api('/api/permissions', { schema: z.array(permissionSchema) }),
    staleTime: Infinity,
  })

// every role with its grants, one GET /api/roles/{id}/permissions per role
export function useRoleList() {
  const rolesQuery = useApiRoles()
  const apiRoles = rolesQuery.data ?? []

  const grantQueries = useQueries({
    queries: apiRoles.map((r) => ({
      queryKey: ['role-permissions', r.id],
      queryFn: () => rolePermissionsRequest(r.id),
    })),
  })

  const roles: Role[] = apiRoles.map((r, i) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    level: null, // lives in the approval hierarchy, not on the role
    system: SYSTEM_ROLES.includes(r.name),
    permissions: toPermissions(grantQueries[i]?.data ?? []),
    created: r.created,
  }))

  const err = rolesQuery.error ?? grantQueries.find((q) => q.error)?.error ?? null

  return {
    roles,
    apiRoles,
    loading: rolesQuery.isLoading || grantQueries.some((q) => q.isLoading),
    error: err instanceof Error ? err.message : null,
    refetch: () => {
      void rolesQuery.refetch()
      grantQueries.forEach((q) => void q.refetch())
    },
  }
}

const idOf = (v: unknown): number => {
  const o = (v && typeof v === 'object' ? v : {}) as { id?: unknown; data?: { id?: unknown } }
  return Number(o.id ?? o.data?.id)
}

type RoleBody = { name: string; description: string; permissions: Permissions }

export function useRoleMutations() {
  const client = useQueryClient()
  const catalogue = usePermissionCatalogue()

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['roles'] })
    void client.invalidateQueries({ queryKey: ['role-permissions'] })
  }

  // the matrix is turned into permission ids using the catalogue
  const idsFor = (perms: Permissions) =>
    (catalogue.data ?? [])
      .filter((p) => (p.page ? permits(perms, p.area, p.action, p.page) : (perms[p.area] ?? []).includes(p.action)))
      .map((p) => p.id)

  const savePermissions = (id: number, perms: Permissions) =>
    api(`/api/roles/${id}/permissions`, { method: 'PUT', body: idsFor(perms) })

  const create = useMutation({
    mutationFn: async ({ name, description, permissions }: RoleBody) => {
      const res = await api<unknown>('/api/roles', { method: 'POST', body: { name, description, isActive: true } })
      const id = idOf(res)
      if (!id) throw new Error('The server did not return the new role.')
      await savePermissions(id, permissions)
    },
    onSuccess: refresh,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, description, permissions }: RoleBody & { id: number }) => {
      await api(`/api/roles/${id}`, { method: 'PUT', body: { name, description, isActive: true } })
      await savePermissions(id, permissions)
    },
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/roles/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })

  return { create, update, remove, catalogueReady: !!catalogue.data }
}