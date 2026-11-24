import { AppIcon } from '../../../components/appIcon'
import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Select, Text, TextInput } from '@mantine/core'
import { type ApprovalHierarchy, type ApprovalLevel } from './approvalHierarchyData'
import { toUser, useApiRoles, useApiUsers } from '../../../api/users'

/* ---------- new / rename hierarchy ---------- */

type HierarchyDialogProps = {
  opened: boolean
  /** null means a new hierarchy is being created */
  hierarchy: ApprovalHierarchy | null
  existingNames: string[]
  onClose: () => void
  /** may answer a promise (saved on the server); a thrown error is shown under the name */
  onSubmit: (name: string) => void | Promise<void>
}

export function HierarchyDialog({ opened, hierarchy, existingNames, onClose, onSubmit }: HierarchyDialogProps) {
  const editing = hierarchy !== null
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!opened) return
    setName(hierarchy?.name ?? '')
    setError(undefined)
  }, [opened, hierarchy])

  const submit = async () => {
    if (saving) return
    const n = name.trim()
    if (!n) return setError('Enter the hierarchy name')
    if (existingNames.some((x) => x.toLowerCase() === n.toLowerCase() && x !== hierarchy?.name)) {
      return setError('This name is already used')
    }
    // creating: POST /api/approval-hierarchys (in the page). TODO: PUT /api/approval-hierarchys/{id} when renaming
    setSaving(true)
    try {
      await onSubmit(n)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the hierarchy. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Rename hierarchy' : 'New hierarchy'} centered>
      <div className="space-y-4">
        <TextInput
          label="Hierarchy name"
          placeholder="Large loans"
          size="sm"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            setError(undefined)
          }}
          error={error}
        />

        {!editing && (
          <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
            <Text size="xs">
              A new hierarchy starts with no levels and is not the default. Add its levels, then make it the default
              when it is ready.
            </Text>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} loading={saving} onClick={() => void submit()}>
            {editing ? 'Save changes' : 'Create hierarchy'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- new / edit level ---------- */

export type LevelInput = { levelName: string; requiredRole: string }

type LevelDialogProps = {
  opened: boolean
  /** null means a new level is being added */
  level: ApprovalLevel | null
  hierarchyName: string
  /** names of the other levels in the same hierarchy */
  existingNames: string[]
  onClose: () => void
  /** may answer a promise (saved on the server); a thrown error is shown in the dialog */
  onSubmit: (input: LevelInput) => void | Promise<void>
}

type Errors = Partial<Record<'name' | 'role' | 'save', string>>

export function LevelDialog({ opened, level, hierarchyName, existingNames, onClose, onSubmit }: LevelDialogProps) {
  const editing = level !== null
  const [name, setName] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  // GET /api/roles and /api/users: required_role must match a real Role.name exactly
  const rolesQuery = useApiRoles()
  const usersQuery = useApiUsers()
  const roles = rolesQuery.data ?? []
  const roleNames = roles.filter((r) => r.isActive).map((r) => r.name)
  // an edited level keeps its role in the list even if that role is gone
  const roleOptions = role && !roleNames.includes(role) ? [...roleNames, role] : roleNames
  const activeUsersWithRole = (r: string) =>
    (usersQuery.data ?? []).map((u) => toUser(u, roles)).filter((u) => u.role === r && u.active)

  useEffect(() => {
    if (!opened) return
    setName(level?.levelName ?? '')
    setRole(level?.requiredRole ?? null)
    setErrors({})
  }, [opened, level])

  const users = role ? activeUsersWithRole(role) : []

  const submit = async () => {
    if (saving) return
    const found: Errors = {}
    const n = name.trim()

    if (!n) found.name = 'Enter the level name'
    else if (existingNames.some((x) => x.toLowerCase() === n.toLowerCase())) {
      found.name = 'Another level in this hierarchy already has this name'
    }
    if (!role) found.role = 'Select the role that decides this level'

    setErrors(found)
    if (Object.keys(found).length > 0 || !role) return

    // adding to a saved hierarchy: POST /api/approval-levels (in the page)
    // TODO: PUT /api/approval-levels/{id} when editing (raw CRUD, there is no workflow endpoint for levels)
    setSaving(true)
    try {
      await onSubmit({ levelName: n, requiredRole: role })
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : 'Could not save the level. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit level' : 'Add level'} centered>
      <div className="space-y-4">
        <Text size="sm">
          {editing ? 'Change the level in' : 'Add a level to'} <span className="font-medium">{hierarchyName}</span>.
          {!editing && ' It goes at the end of the chain, you can move it afterwards.'}
        </Text>

        <TextInput
          label="Level name"
          placeholder="Manager"
          size="sm"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            setErrors((x) => ({ ...x, name: undefined }))
          }}
          error={errors.name}
        />

        <Select
          label="Required role"
          description="Only a user with this role can decide this level"
          placeholder={rolesQuery.isPending ? 'Loading roles…' : 'Select role'}
          disabled={rolesQuery.isPending}
          nothingFoundMessage="No roles found"
          size="sm"
          data={roleOptions}
          allowDeselect={false}
          value={role}
          onChange={(v) => {
            setRole(v)
            setErrors((x) => ({ ...x, role: undefined }))
          }}
          error={errors.role ?? (rolesQuery.isError ? 'Could not load the roles. Close and try again.' : undefined)}
        />

        {role && !usersQuery.isPending && (
          <div className="rounded-md bg-gray-50 px-4 py-3 text-sm">
            {users.length === 0 ? (
              <span className="text-red-600">
                No active user has the {role} role. Applications would get stuck at this level.
              </span>
            ) : (
              <span className="text-gray-700">
                {users.length} active {users.length === 1 ? 'user' : 'users'} can decide this level:{' '}
                {users.map((u) => u.name).join(', ')}.
              </span>
            )}
          </div>
        )}

        {errors.save && (
          <Alert color="red" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <Text size="sm">{errors.save}</Text>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} loading={saving} onClick={() => void submit()}>
            {editing ? 'Save changes' : 'Add level'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}