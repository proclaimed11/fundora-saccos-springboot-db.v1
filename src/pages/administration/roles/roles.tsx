import { AppIcon } from '../../../components/appIcon'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Text } from '@mantine/core'
import { DashboardLayout } from '../../../components/layout/dashboardLayout'
import { StatWidget } from '../../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../../components/customTable/customTable'
import { ContractConfirmDialog } from '../../loans/contractDialogs'
import { RoleDialog, type RoleInput } from './roleDialogs'
import { KIND, MODULES, actionLabel, areaCount, hasPages, isSplit, pageActions, permissionCount, type Role } from './rolesData'
import { usePageAccess } from '../../auth/usePageAccess'
import { PageState } from '../../../components/pageState'
import { useRoleList, useRoleMutations } from '../../../api/roles'
import { useRoleUsage } from '../../../api/approvalHierarchy'
import { useApiUsers, toUser } from '../../../api/users'
import type { User } from '../users/usersData'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type Notice = { text: string; color: 'green' | 'blue' | 'red' } | null
type DialogState = { kind: 'create' } | { kind: 'edit' | 'delete'; id: number } | null

/** usedBy: the approval levels that ask for this role (required_role stores the role's name) */
type Row = Role & { userCount: number; permissionCount: number; usedBy: string[] }

// the approval levels keep the role's name, so a renamed or deleted role would leave them without approvers
function nameLockReason(r: Row): string | null {
  if (r.system) return 'Admin is the system role, so its name stays fixed.'
  if (r.usedBy.length > 0) {
    return `Used by ${r.usedBy.join(', ')}. Change ${r.usedBy.length === 1 ? 'that level' : 'those levels'} on the Approval Hierarchy page first.`
  }
  return null
}

// our own rule, the API does not say when a role can be deleted
function deleteBlockReason(r: Row): string | null {
  if (r.system) return 'Admin is the system role and cannot be deleted.'
  if (r.usedBy.length > 0) return nameLockReason(r)
  if (r.userCount > 0) return `${r.userCount} ${r.userCount === 1 ? 'user has' : 'users have'} this role. Move them to another role first.`
  return null
}

/* ---------- small pieces ---------- */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="sm" fw={600} mb={4}>
      {children}
    </Text>
  )
}

/* ---------- role drawer ---------- */

type DrawerProps = {
  row: Row
  members: User[]
  onEdit: (r: Row) => void
  onDelete: (r: Row) => void
}

function RoleDrawerBody({ row: r, members, onEdit, onDelete }: DrawerProps) {
  const navigate = useNavigate()
  const blocked = deleteBlockReason(r)

  const tiles = [
    { label: 'Users', value: String(r.userCount) },
    { label: 'Permissions', value: String(r.permissionCount) },
    { label: 'Approval levels', value: String(r.usedBy.length) },
  ]

  return (
    <div className="space-y-6">
      {r.created && (
        <Text size="xs" c="dimmed">
          Created {dayjs(r.created).format('MMM D, YYYY')}
        </Text>
      )}

      <Text size="sm" c="dimmed">
        {r.description}
      </Text>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>What this role can do</SectionTitle>
        <ul className="mt-2 space-y-2">
          {MODULES.map((m) => {
            // an area given out page by page lists each page, otherwise one line covers the whole area
            const split = hasPages(m) && isSplit(r.permissions, m)
            const granted = r.permissions[m.key] ?? []
            return (
              <li key={m.key} className="rounded-md border border-gray-200 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800">{m.label}</span>
                  {split ? (
                    <Badge variant="light" color="yellow" radius="sm" size="sm" tt="none">
                      Chosen pages
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {granted.length === 0 ? (
                        <span className="text-xs text-gray-400">No access</span>
                      ) : (
                        granted.map((a) => (
                          <Badge key={a} variant="light" color="brand" radius="sm" size="sm">
                            {actionLabel(a)}
                          </Badge>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {split && (
                  <ul className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                    {m.pages!.map((p) => {
                      const acts = pageActions(r.permissions, m, p)
                      return (
                        <li key={p.key} className="flex items-start justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-xs text-gray-600">{p.label}</span>
                            {p.kind && (
                              <Badge variant="light" color={KIND[p.kind].color} radius="sm" size="xs" tt="none">
                                {KIND[p.kind].label}
                              </Badge>
                            )}
                          </span>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {acts.length === 0 ? (
                              <span className="text-xs text-gray-400">No access</span>
                            ) : (
                              acts.map((a) => (
                                <Badge key={a} variant="light" color="brand" radius="sm" size="sm">
                                  {actionLabel(a)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <SectionTitle>{`Users with this role (${members.length})`}</SectionTitle>
        {members.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
            No user has this role yet.
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {members.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">{u.name}</div>
                  <div className="truncate text-xs text-gray-500">{u.email}</div>
                </div>
                <Badge variant="light" color={u.active ? 'green' : 'gray'} radius="sm" size="sm">
                  {u.active ? 'Active' : 'Inactive'}
                </Badge>
                <Button size="compact-xs" variant="subtle" color="brand" onClick={() => navigate(`/users?user=${u.id}`)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>Role details</SectionTitle>
        <Field label="Role name" value={r.name} />
        <Field label="Approval levels" value={r.usedBy.length > 0 ? r.usedBy.join(', ') : 'None'} />
      </div>

      {blocked && (
        <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />}>
          <Text size="sm">{blocked}</Text>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="xs" leftSection={<AppIcon name="pencil" />} onClick={() => onEdit(r)}>
          Edit
        </Button>
        <Button
          size="xs"
          color="red"
          variant="light"
          disabled={!!blocked}
          leftSection={<AppIcon name="trash" />}
          onClick={() => onDelete(r)}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function RolesPage() {
  const [params, setParams] = useSearchParams()

  const { roles, apiRoles, loading, error, refetch } = useRoleList()
  const usersQuery = useApiUsers()
  const { create, update, remove: removeRole } = useRoleMutations()

  const users = useMemo(() => (usersQuery.data ?? []).map((u) => toUser(u, apiRoles)), [usersQuery.data, apiRoles])
  const usersWith = (role: string) => users.filter((u) => u.role === role)
  // which approval levels ask for each role (GET /api/approval-hierarchys + /api/approval-levels)
  const { usage } = useRoleUsage()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const { canCreate, canEdit, canDelete } = usePageAccess('administration', 'roles')

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const rows: Row[] = roles.map((r) => ({
    ...r,
    userCount: usersWith(r.name).length,
    permissionCount: permissionCount(r.permissions),
    usedBy: usage[r.name.trim()] ?? [],
  }))

  const withoutRole = users.filter((u) => !u.role).length
  const inApproval = rows.filter((r) => r.usedBy.length > 0).length

  // here `color` is the icon color
  const stats = [
    { label: 'Total Roles', value: rows.length, icon: 'key-round', color: '#45bdfc' },
    { label: 'Roles In Approval Levels', value: inApproval, icon: 'network', color: '#8e44ad' },
    { label: 'Users Without A Role', value: withoutRole, icon: 'users', color: '#e08a1e' },
  ]

  // /roles?role=2 opens the drawer for role 2
  const roleParam = params.get('role')
  const selected = roleParam ? (rows.find((r) => String(r.id) === roleParam) ?? null) : null
  const openView = (id: number) => setParams({ role: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const dialogRow =
    dialog && (dialog.kind === 'edit' || dialog.kind === 'delete') ? rows.find((r) => r.id === dialog.id) : undefined

  /* ---------- actions ---------- */

  const save = async (input: RoleInput) => {
    try {
      if (dialog?.kind === 'create') {
        await create.mutateAsync({ name: input.name, description: input.description, permissions: input.permissions })
        setNotice({ color: 'green', text: `Role ${input.name} was created.` })
      } else if (dialogRow) {
        await update.mutateAsync({
          id: dialogRow.id,
          // a locked name (Admin, or a role used by an approval level) is never changed
          name: nameLockReason(dialogRow) ? dialogRow.name : input.name,
          description: input.description,
          permissions: input.permissions,
        })
        setNotice({ color: 'green', text: `Role ${dialogRow.name} was updated. People with this role see the change after they refresh.` })
      }
      setDialog(null)
    } catch (err) {
      setNotice({ color: 'red', text: err instanceof Error ? err.message : 'Could not save the role.' })
    }
  }

  const remove = async () => {
    if (!dialogRow || deleteBlockReason(dialogRow)) return
    try {
      await removeRole.mutateAsync(dialogRow.id)
      setNotice({ color: 'blue', text: `Role ${dialogRow.name} was deleted.` })
      if (selected?.id === dialogRow.id) closeView()
    } catch (err) {
      setNotice({ color: 'red', text: err instanceof Error ? err.message : 'Could not delete the role.' })
    }
    setDialog(null)
  }

  // the drawer buttons close the drawer first, then open the dialog
  const fromDrawer = (kind: 'edit' | 'delete', r: Row) => {
    closeView()
    setDialog({ kind, id: r.id })
  }

  /* ---------- columns ---------- */

  const columns: CustomTableColumn<Row>[] = [
    {
      accessor: 'name',
      header: 'Role',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.name}</div>
          <div className="max-w-[320px] truncate text-xs text-gray-500">{r.description}</div>
        </div>
      ),
      exportValue: (r) => `${r.name} (${r.description})`,
    },
    {
      accessor: 'usedBy',
      header: 'Approval levels',
      sortable: false,
      render: (r) =>
        r.usedBy.length > 0 ? (
          <div className="max-w-[260px] space-y-0.5">
            {r.usedBy.map((u) => (
              <div key={u} className="truncate text-xs text-gray-700" title={u}>
                {u}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-400">None</span>
        ),
      exportValue: (r) => (r.usedBy.length > 0 ? r.usedBy.join('; ') : 'None'),
    },
    {
      accessor: 'permissionCount',
      header: 'Permissions',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm text-gray-800">
            {r.permissionCount} {r.permissionCount === 1 ? 'permission' : 'permissions'}
          </div>
          <div className="whitespace-nowrap text-xs text-gray-500">
            {areaCount(r.permissions)} of {MODULES.length} areas
          </div>
        </div>
      ),
      exportValue: (r) => r.permissionCount,
    },
    {
      accessor: 'userCount',
      header: 'Users',
      render: (r) => <span className="text-sm text-gray-800">{r.userCount}</span>,
      exportValue: (r) => r.userCount,
    },
    { accessor: 'created', header: 'Created', type: 'date' },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (r) => {
        const blocked = deleteBlockReason(r)
        return (
          // stop the click so the row doesn't also open the drawer
          <div onClick={(e) => e.stopPropagation()}>
            <Menu position="bottom-end" shadow="md" width={230}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${r.name}`}>
                  <AppIcon name="ellipsis-vertical" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
              {canEdit && (
                <>
                <Menu.Item fw={500} leftSection={<AppIcon name="pencil" />} onClick={() => setDialog({ kind: 'edit', id: r.id })}>
                  Edit role
                </Menu.Item>
                <Menu.Divider />
                </>
                )}
                <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => openView(r.id)}>
                  View details
                </Menu.Item>
                <Menu.Divider />
                {canDelete && (
                <>
                <Menu.Item
                  color="red"
                  disabled={!!blocked}
                  leftSection={<AppIcon name="trash" />}
                  onClick={() => setDialog({ kind: 'delete', id: r.id })}
                >
                  {blocked ? 'Cannot delete' : 'Delete role'}
                </Menu.Item>
                 </>
                )}
              </Menu.Dropdown>
            </Menu>
          </div>
        )
      },
    },
  ]

  return (
    <DashboardLayout
      title="Roles"
      subtitle="What each kind of user is allowed to do"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Roles' }]}
      actions={
        <>
          {canCreate && (
            <Button size="xs" leftSection={<AppIcon name="plus" />} onClick={() => setDialog({ kind: 'create' })}>
              New role
            </Button>
          )}
        </>
      }
    >
      <PageState loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-4">
          {notice && (
            <Alert
              color={notice.color}
              variant="light"
              withCloseButton
              onClose={() => setNotice(null)}
              icon={
                <AppIcon
                  name={notice.color === 'green' ? 'circle-check' : notice.color === 'red' ? 'circle-x' : 'info'}
                />
              }
            >
              <Text size="sm">{notice.text}</Text>
            </Alert>
          )}

          {/* row 1: key numbers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map((s) => (
              <StatWidget key={s.label} {...s} />
            ))}
          </div>

          {/* row 2: table in a plain card */}
          <div className={`${CARD} p-4`}>
            <Text size="xs" c="dimmed" mb="sm">
              A role used by an approval level cannot be renamed or deleted. Admin is the system role and always has
              every permission.
            </Text>

            <CustomTable<Row>
              size="md"
              data={rows}
              columns={columns}
              searchInput
              searchPlaceholder="Search role"
              searchKeys={['name', 'description']}
              filters={{ created: 'date' }}
              defaultSort={{ accessor: 'name', direction: 'asc' }}
              noRecordText="No roles yet"
              onRowClick={(row) => openView(row.id)}
              exportCsv
              exportFileName="roles"
              print
              printTitle="Roles"
            />
          </div>
        </div>
      </PageState>

      {/* role drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.name ?? ''}>
        {selected && (
          <RoleDrawerBody
            row={selected}
            members={usersWith(selected.name)}
            onEdit={(r) => fromDrawer('edit', r)}
            onDelete={(r) => fromDrawer('delete', r)}
          />
        )}
      </Drawer>

      <RoleDialog
        opened={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        role={dialog?.kind === 'edit' ? (dialogRow ?? null) : null}
        existingNames={roles.map((r) => r.name)}
        nameLockedReason={dialog?.kind === 'edit' && dialogRow ? nameLockReason(dialogRow) : null}
        onClose={() => setDialog(null)}
        onSubmit={save}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'delete' && !!dialogRow}
        title="Delete role"
        message={`Delete the role ${dialogRow?.name ?? ''}? This cannot be undone.`}
        confirmLabel="Delete role"
        onClose={() => setDialog(null)}
        onConfirm={remove}
      />
    </DashboardLayout>
  )
}