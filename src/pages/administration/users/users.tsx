import { AppIcon } from '../../../components/appIcon'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, SegmentedControl, Text } from '@mantine/core'
import { DashboardLayout } from '../../../components/layout/dashboardLayout'
import { StatWidget } from '../../../components/statsWidgets'
import { PageState } from '../../../components/pageState'
import { CustomTable, type CustomTableColumn } from '../../../components/customTable/customTable'
import { ContractConfirmDialog } from '../../loans/contractDialogs'
import { initials } from '../../applicants/applicantsData'
import { useAuth } from '../../../auth/authContext'
import { useApiRoles, useApiUsers, useUserMutations, toUser, userBody } from '../../../api/users'
import { ResetPasswordDialog, UserDialog, type UserInput } from './userDialogs'
import { ROLE_STYLE, activityFor, roleStyle, type User } from './usersData'
import { usePageAccess } from '../../auth/usePageAccess'
import { Can } from '../../auth/requirePermission'
import { useMinPasswordLength } from '../../../api/security'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'all' | 'active' | 'inactive'
type Notice = { text: string; color: 'green' | 'blue' | 'red' } | null
type DialogState =
  | { kind: 'create' }
  | { kind: 'edit' | 'password' | 'status' | 'twofa' | 'delete'; id: number }
  | null

const TAB_EMPTY: Record<TabKey, string> = {
  all: 'No users yet',
  active: 'No active users',
  inactive: 'No inactive users',
}

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

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

function RoleBadge({ role }: { role: User['role'] }) {
  if (!role) {
    return (
      <Badge variant="light" color="yellow" radius="sm" size="sm">
        No role
      </Badge>
    )
  }
  return (
    <Badge variant="light" color={roleStyle(role).color} radius="sm" size="sm">
      {role}
    </Badge>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant="light" color={active ? 'green' : 'gray'} radius="sm" size="sm">
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

function Avatar({ name, size = 'h-8 w-8 text-xs' }: { name: string; size?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-brand-subtle font-medium text-brand-dark ${size}`}>
      {initials(name)}
    </div>
  )
}

const lastSeen = (u: User) => (u.lastLogin ? dayjs(u.lastLogin).format('MMM D, YYYY') : 'Never')

/* ---------- user drawer ---------- */

type DrawerProps = {
  user: User
  blocked: string | null
  onEdit: (u: User) => void
  onReset: (u: User) => void
  onStatus: (u: User) => void
}

function UserDrawerBody({ user: u, blocked, onEdit, onReset, onStatus }: DrawerProps) {
  const tiles = [
    { label: 'Role', value: u.role ?? 'Not assigned' },
    { label: 'Two-factor', value: u.twoFactor ? 'On' : 'Off' },
    { label: 'Last sign-in', value: lastSeen(u) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar name={u.name} size="h-14 w-14 text-lg" />
        <div className="min-w-0">
          <div className="text-base font-medium text-gray-800">{u.name}</div>
          <div className="text-xs text-gray-500">@{u.username}</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <RoleBadge role={u.role} />
            <StatusBadge active={u.active} />
          </div>
        </div>
      </div>

      {!u.role && (
        <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
          <Text size="sm">This user has no role, so they cannot do anything yet. Edit the user to assign one.</Text>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>User details</SectionTitle>
        <Field label="Username" value={u.username} />
        <Field label="Email" value={u.email || '—'} />
        <Field label="Phone" value={u.phone || '—'} />
        <Field label="Approval level" value={u.role ? roleStyle(u.role).level : '—'} />
        <Field label="Created" value={u.created ? dayjs(u.created).format('MMM D, YYYY') : '—'} />
      </div>

      <div>
        <SectionTitle>Recent activity</SectionTitle>
        <ul className="mt-3 space-y-4">
          {activityFor(u).map((e, i) => (
            <li key={`${e.title}-${i}`} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <AppIcon name={e.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800">{e.title}</span>
                  <span className="shrink-0 text-xs text-gray-400">{dayjs(e.date).format('MMM D, YYYY')}</span>
                </div>
                <div className="text-xs text-gray-500">{e.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {blocked && (
        <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />}>
          <Text size="sm">{blocked}</Text>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Can area="administration" page="users" action="edit">
          <Button size="xs" leftSection={<AppIcon name="pencil" />} onClick={() => onEdit(u)}>
            Edit
          </Button>
        </Can>
        <Can area="administration" page="users" action="edit">
          <Button size="xs" variant="default" leftSection={<AppIcon name="key-round" />} onClick={() => onReset(u)}>
            Reset password
          </Button>
        </Can>
        <Can area="administration" page="users" action="edit">
          <Button
            size="xs"
            color={u.active ? 'red' : undefined}
            variant="light"
            disabled={u.active && !!blocked}
            leftSection={<AppIcon name={u.active ? 'user-round-x' : 'circle-check'} />}
            onClick={() => onStatus(u)}
          >
            {u.active ? 'Deactivate' : 'Activate'}
          </Button>
        </Can>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const { user: me } = useAuth()

  const usersQuery = useApiUsers()
  const rolesQuery = useApiRoles()
  const minLength = useMinPasswordLength()
  const { create, update, remove } = useUserMutations()

  const [tab, setTab] = useState<TabKey>('all')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<Notice>(null)
  // an error from the API shown inside the open dialog
  const [dialogError, setDialogError] = useState<string | null>(null)
  const { canCreate, canEdit, canDelete } = usePageAccess('administration', 'users')

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])
  const roleNames = roles.filter((r) => r.isActive).map((r) => r.name)
  const roleOptions = roles.map((r) => ({ value: r.name, label: r.name }))

  // the real rows of the users table
  const users = useMemo<User[]>(
    () => (usersQuery.data ?? []).map((raw) => toUser(raw, roles)),
    [usersQuery.data, roles],
  )

  const active = users.filter((u) => u.active)
  const inactive = users.filter((u) => !u.active)
  const noRole = users.filter((u) => !u.role)
  const tabData: Record<TabKey, User[]> = { all: users, active, inactive }

  // here `color` is the icon color
  const stats = [
    { label: 'Total Users', value: users.length, icon: 'users', color: '#45bdfc' },
    { label: 'Active Users', value: active.length, icon: 'circle-check', color: 'var(--app-brand)' },
    { label: 'Inactive Users', value: inactive.length, icon: 'circle-x', color: '#ef4444' },
    { label: 'Two-factor On', value: users.filter((u) => u.twoFactor).length, icon: 'shield', color: '#8e44ad' },
  ]

  const isMe = (u: User) => !!me && u.username === me.username
  const activeAdmins = active.filter((u) => u.role === 'Admin')

  // you cannot deactivate yourself or the last active Admin
  const blockReason = (u: User): string | null => {
    if (isMe(u)) return 'You cannot deactivate your own account.'
    if (u.role === 'Admin' && u.active && activeAdmins.length <= 1) {
      return 'This is the last active Admin, so it cannot be deactivated.'
    }
    return null
  }

  // the same protection for delete, and a user who already signed in has history in the audit trail
  const deleteBlock = (u: User): string | null => {
    if (isMe(u)) return 'You cannot delete your own account.'
    if (u.role === 'Admin' && activeAdmins.length <= 1 && u.active) return 'This is the last active Admin, so it cannot be deleted.'
    return null
  }

  // /users?user=2 opens the drawer for user 2
  const userParam = params.get('user')
  const selected = userParam ? (users.find((u) => String(u.id) === userParam) ?? null) : null
  const openView = (id: number) => setParams({ user: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const dialogUser = dialog && dialog.kind !== 'create' ? users.find((u) => u.id === dialog.id) : undefined

  const open = (next: DialogState) => {
    setDialogError(null)
    setDialog(next)
  }

  /* ---------- actions, each one calls the API ---------- */

  const save = async (input: UserInput) => {
    // the full name has no column yet, so input.name is not sent
    const roleId = roles.find((r) => r.name === input.role)?.id ?? null
    setDialogError(null)

    try {
      if (dialog?.kind === 'create') {
        await create.mutateAsync({
          username: input.username,
          email: input.email,
          phone: input.phone,
          roleId,
          isActive: true,
          isTwoFactorEnabled: false,
          passwordHash: input.password,
        })
        setNotice({ color: 'green', text: `User ${input.username} was created.` })
      } else if (dialogUser) {
        await update.mutateAsync({
          id: dialogUser.id,
          body: userBody(dialogUser, { username: input.username, email: input.email, phone: input.phone, roleId }),
        })
        setNotice({ color: 'green', text: `User ${input.username} was updated.` })
      }
      setDialog(null)
    } catch (err) {
      setDialogError(messageOf(err, 'Could not save the user.'))
    }
  }

  const toggleStatus = async () => {
    if (!dialogUser) return
    if (dialogUser.active && blockReason(dialogUser)) return
    try {
      await update.mutateAsync({ id: dialogUser.id, body: userBody(dialogUser, { isActive: !dialogUser.active }) })
      setNotice({
        color: 'blue',
        text: `${dialogUser.name} was ${dialogUser.active ? 'deactivated and can no longer sign in' : 'activated'}.`,
      })
    } catch (err) {
      setNotice({ color: 'red', text: messageOf(err, 'Could not change the status.') })
    }
    setDialog(null)
  }

  const toggleTwoFactor = async () => {
    if (!dialogUser) return
    try {
      await update.mutateAsync({
        id: dialogUser.id,
        body: userBody(dialogUser, { isTwoFactorEnabled: !dialogUser.twoFactor }),
      })
      setNotice({
        color: 'blue',
        text: `Two-factor sign-in is now ${dialogUser.twoFactor ? 'off' : 'on'} for ${dialogUser.name}.`,
      })
    } catch (err) {
      setNotice({ color: 'red', text: messageOf(err, 'Could not change two-factor sign-in.') })
    }
    setDialog(null)
  }

  const resetPassword = async (password: string) => {
    if (!dialogUser) return
    setDialogError(null)
    try {
      // the API checks the length and hashes the plain password
      await update.mutateAsync({ id: dialogUser.id, body: userBody(dialogUser, { passwordHash: password }) })
      setNotice({ color: 'green', text: `The password for ${dialogUser.name} was reset.` })
      setDialog(null)
    } catch (err) {
      setDialogError(messageOf(err, 'Could not reset the password.'))
    }
  }

  const removeUser = async () => {
    if (!dialogUser || deleteBlock(dialogUser)) return
    try {
      await remove.mutateAsync(dialogUser.id)
      setNotice({ color: 'blue', text: `User ${dialogUser.name} was deleted.` })
      if (selected?.id === dialogUser.id) closeView()
    } catch (err) {
      setNotice({
        color: 'red',
        text: `${messageOf(err, 'Could not delete the user.')} A user with sessions or history may need to be deactivated instead.`,
      })
    }
    setDialog(null)
  }

  // the drawer buttons close the drawer first, then open the dialog
  const fromDrawer = (kind: 'edit' | 'password' | 'status', u: User) => {
    closeView()
    open({ kind, id: u.id })
  }

  const saving = create.isPending || update.isPending

  /* ---------- columns ---------- */

  const columns: CustomTableColumn<User>[] = [
    {
      accessor: 'name',
      header: 'User',
      render: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={u.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-800">{u.name}</div>
            <div className="truncate text-xs text-gray-500">{u.email}</div>
          </div>
        </div>
      ),
      exportValue: (u) => `${u.name} (${u.email})`,
    },
    {
      accessor: 'role',
      header: 'Role',
      render: (u) => (
        <div>
          <RoleBadge role={u.role} />
          {u.role && u.role in ROLE_STYLE && (
            <div className="mt-0.5 text-[11px] text-gray-500">{roleStyle(u.role).level}</div>
          )}
        </div>
      ),
      exportValue: (u) => u.role ?? 'No role',
    },
    {
      accessor: 'active',
      header: 'Status',
      sortable: false,
      render: (u) => <StatusBadge active={u.active} />,
      exportValue: (u) => (u.active ? 'Active' : 'Inactive'),
    },
    {
      accessor: 'twoFactor',
      header: 'Two-factor',
      sortable: false,
      render: (u) => (
        <Badge variant="outline" color={u.twoFactor ? 'green' : 'gray'} radius="sm" size="sm">
          {u.twoFactor ? 'On' : 'Off'}
        </Badge>
      ),
      exportValue: (u) => (u.twoFactor ? 'On' : 'Off'),
    },
    {
      accessor: 'lastLogin',
      header: 'Last sign-in',
      render: (u) => (
        <span className={`whitespace-nowrap text-sm ${u.lastLogin ? 'text-gray-800' : 'text-gray-400'}`}>{lastSeen(u)}</span>
      ),
      exportValue: (u) => u.lastLogin ?? '',
    },
    { accessor: 'created', header: 'Created', type: 'date' },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (u) => {
        const blocked = blockReason(u)
        const delBlocked = deleteBlock(u)
        return (
          // stop the click so the row doesn't also open the drawer
          <div onClick={(e) => e.stopPropagation()}>
            <Menu position="bottom-end" shadow="md" width={230}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${u.name}`}>
                  <AppIcon name="ellipsis-vertical" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {canEdit && (
                  <>
                    <Menu.Item fw={500} leftSection={<AppIcon name="pencil" />} onClick={() => open({ kind: 'edit', id: u.id })}>
                      Edit user
                    </Menu.Item>
                    <Menu.Item leftSection={<AppIcon name="key-round" />} onClick={() => open({ kind: 'password', id: u.id })}>
                      Reset password
                    </Menu.Item>
                    <Menu.Item leftSection={<AppIcon name="shield" />} onClick={() => open({ kind: 'twofa', id: u.id })}>
                      {u.twoFactor ? 'Turn off two-factor' : 'Turn on two-factor'}
                    </Menu.Item>
                    <Menu.Divider />
                  </>
                )}
                <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => openView(u.id)}>
                  View details
                </Menu.Item>
                {canEdit && (
                  <>
                    <Menu.Divider />
                    <Menu.Item
                      color={u.active ? 'red' : undefined}
                      disabled={u.active && !!blocked}
                      leftSection={<AppIcon name={u.active ? 'user-round-x' : 'circle-check'} />}
                      onClick={() => open({ kind: 'status', id: u.id })}
                    >
                      {u.active ? (blocked ? 'Cannot deactivate' : 'Deactivate user') : 'Activate user'}
                    </Menu.Item>
                  </>
                )}
                {canDelete && (
                  <Menu.Item
                    color="red"
                    disabled={!!delBlocked}
                    leftSection={<AppIcon name="trash" />}
                    onClick={() => open({ kind: 'delete', id: u.id })}
                  >
                    {delBlocked ? 'Cannot delete' : 'Delete user'}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </div>
        )
      },
    },
  ]

  const loading = usersQuery.isLoading || rolesQuery.isLoading
  const loadError = usersQuery.error ?? rolesQuery.error
  const retry = () => {
    usersQuery.refetch()
    rolesQuery.refetch()
  }

  return (
    <DashboardLayout
      title="Users"
      subtitle="Staff who can sign in to the system"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Users' }]}
      actions={
        canCreate ? (
          <Button
            size="xs"
            disabled={roleNames.length === 0}
            leftSection={<AppIcon name="plus" />}
            onClick={() => open({ kind: 'create' })}
          >
            New user
          </Button>
        ) : undefined
      }
    >
      <PageState loading={loading} error={loadError ? messageOf(loadError, 'Could not load the users.') : null} onRetry={retry}>
        <div className="space-y-4">
          {notice && (
            <Alert
              color={notice.color}
              variant="light"
              withCloseButton
              onClose={() => setNotice(null)}
              icon={<AppIcon name={notice.color === 'green' ? 'circle-check' : notice.color === 'red' ? 'circle-x' : 'info'} />}
            >
              <Text size="sm">{notice.text}</Text>
            </Alert>
          )}

          {noRole.length > 0 && (
            <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm">
                  {noRole.length} {noRole.length === 1 ? 'user has' : 'users have'} no role assigned yet.
                </Text>
                <Button size="compact-xs" variant="default" onClick={() => openView(noRole[0].id)}>
                  Review user
                </Button>
              </div>
            </Alert>
          )}

          {/* row 1: key numbers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <StatWidget key={s.label} {...s} />
            ))}
          </div>

          {/* row 2: table in a plain card */}
          <div className={`${CARD} p-4`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-full overflow-x-auto">
                <SegmentedControl
                  size="xs"
                  value={tab}
                  onChange={(v) => setTab(v as TabKey)}
                  data={[
                    { value: 'all', label: `All (${users.length})` },
                    { value: 'active', label: `Active (${active.length})` },
                    { value: 'inactive', label: `Inactive (${inactive.length})` },
                  ]}
                />
              </div>
              <Text size="xs" c="dimmed">
                Passwords must have at least {minLength} characters
              </Text>
            </div>

            <CustomTable<User>
              size="md"
              data={tabData[tab]}
              columns={columns}
              searchInput
              searchPlaceholder="Search name, username or email"
              searchKeys={['name', 'username', 'email']}
              filters={{ role: roleOptions, created: 'date' }}
              defaultSort={{ accessor: 'name', direction: 'asc' }}
              noRecordText={TAB_EMPTY[tab]}
              onRowClick={(row) => openView(row.id)}
              exportCsv
              exportFileName="users"
              print
              printTitle="Users"
            />
          </div>
        </div>
      </PageState>

      {/* user drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected?.name ?? ''}>
        {selected && (
          <UserDrawerBody
            user={selected}
            blocked={blockReason(selected)}
            onEdit={(u) => fromDrawer('edit', u)}
            onReset={(u) => fromDrawer('password', u)}
            onStatus={(u) => fromDrawer('status', u)}
          />
        )}
      </Drawer>

      <UserDialog
        opened={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        user={dialog?.kind === 'edit' ? (dialogUser ?? null) : null}
        existingUsernames={users.map((u) => u.username)}
        roleNames={roleNames}
        saving={saving}
        serverError={dialogError}
        onClose={() => setDialog(null)}
        onSubmit={save}
      />

      <ResetPasswordDialog
        opened={dialog?.kind === 'password' && !!dialogUser}
        userName={dialogUser?.name ?? ''}
        saving={update.isPending}
        serverError={dialogError}
        onClose={() => setDialog(null)}
        onSubmit={resetPassword}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'status' && !!dialogUser}
        title={dialogUser?.active ? 'Deactivate user' : 'Activate user'}
        message={
          dialogUser?.active
            ? `Deactivate ${dialogUser.name}? They will no longer be able to sign in. Their past records stay as they are.`
            : `Activate ${dialogUser?.name ?? 'this user'}? They will be able to sign in again.`
        }
        confirmLabel={dialogUser?.active ? 'Deactivate' : 'Activate'}
        onClose={() => setDialog(null)}
        onConfirm={toggleStatus}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'twofa' && !!dialogUser}
        title={dialogUser?.twoFactor ? 'Turn off two-factor' : 'Turn on two-factor'}
        message={
          dialogUser?.twoFactor
            ? `Turn off two-factor sign-in for ${dialogUser.name}? They will only need their password.`
            : `Turn on two-factor sign-in for ${dialogUser?.name ?? 'this user'}? They will get an emailed code at every sign-in.`
        }
        confirmLabel={dialogUser?.twoFactor ? 'Turn off' : 'Turn on'}
        onClose={() => setDialog(null)}
        onConfirm={toggleTwoFactor}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'delete' && !!dialogUser && !deleteBlock(dialogUser)}
        title="Delete user"
        message={`Delete ${dialogUser?.name ?? 'this user'} (@${dialogUser?.username ?? ''})? This cannot be undone. To keep their history, deactivate them instead.`}
        confirmLabel="Delete user"
        onClose={() => setDialog(null)}
        onConfirm={removeUser}
      />
    </DashboardLayout>
  )
}