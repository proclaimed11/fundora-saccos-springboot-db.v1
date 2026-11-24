import { AppIcon } from '../../../components/appIcon'
import { useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Checkbox, Modal, Text, TextInput, Textarea } from '@mantine/core'
import {
  ACTIONS,
  KIND,
  MODULES,
  areaCell,
  hasPages,
  isSplit,
  pageCell,
  pagesWithAccess,
  permissionCount,
  toggleArea,
  togglePage,
  type Module,
  type PageDef,
  type Permissions,
  type Role,
  type Tri,
} from './rolesData'
import { ADMIN_ROLE } from './rolesContext'

export type RoleInput = {
  name: string
  description: string
  permissions: Permissions
}

type Props = {
  opened: boolean
  /** null means a new role is being created */
  role: Role | null
  existingNames: string[]
  /** why the name cannot be changed (Admin, or used by an approval level); null = editable */
  nameLockedReason?: string | null
  onClose: () => void
  /** may answer a promise: the Save button spins until it settles */
  onSubmit: (input: RoleInput) => void | Promise<void>
}

type Errors = Partial<Record<'name' | 'description' | 'permissions', string>>

// one column per action in ACTIONS (View, Create, Edit, Approve, Delete, Hierarchy)
const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(6,64px)] items-center gap-2'

const copyOf = (p: Permissions): Permissions =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [...v]]))

// one box of the matrix: ticked, dashed (some pages have it), empty, or not available
function Cell({
  state,
  label,
  locked,
  onChange,
}: {
  state: Tri
  label: string
  /** ticked boxes that cannot be changed (the Admin role) */
  locked?: boolean
  onChange: (on: boolean) => void
}) {
  if (state === 'na') return <span className="text-gray-300">—</span>
  return (
    <Checkbox
      size="xs"
      aria-label={label}
      checked={state === 'all'}
      indeterminate={state === 'some'}
      disabled={locked}
      onChange={() => onChange(state !== 'all')}
    />
  )
}

// every permission there is: what the Admin role always has
const everyPermission = (): Permissions => Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]]))

export function RoleDialog({ opened, role, existingNames, nameLockedReason, onClose, onSubmit }: Props) {
  const editing = role !== null
  const nameLocked = !!nameLockedReason
  // the app lets Admin pass every permission check, so its boxes are shown all ticked and locked
  const isAdminRole = role?.name === ADMIN_ROLE

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [perms, setPerms] = useState<Permissions>({})
  // which areas are open to show their pages
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  // the form is filled once each time it opens (per role). It used to refill whenever the role list
  // re-rendered, which put the old ticks back in the middle of a save
  const openFor = opened ? String(role?.id ?? 'new') : null
  const [filledFor, setFilledFor] = useState<string | null>(null)
  if (openFor !== filledFor) {
    setFilledFor(openFor)
    if (openFor !== null) {
      setName(role?.name ?? '')
      setDescription(role?.description ?? '')
      setPerms(role?.name === ADMIN_ROLE ? everyPermission() : role ? copyOf(role.permissions) : {})
      // an area that was given out page by page starts open, so you see what was chosen
      setExpanded(
        role ? Object.fromEntries(MODULES.filter((m) => isSplit(role.permissions, m)).map((m) => [m.key, true])) : {},
      )
      setErrors({})
    }
  }

  const clear = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const changeArea = (m: Module, action: string, on: boolean) => {
    if (isAdminRole) return
    setPerms((p) => toggleArea(p, m, action, on))
    clear('permissions')
  }

  const changePage = (m: Module, page: PageDef, action: string, on: boolean) => {
    if (isAdminRole) return
    setPerms((p) => togglePage(p, m, page.key, action, on))
    clear('permissions')
  }

  const toggleOpen = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  const selectAll = () => {
    setPerms(Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]])))
    clear('permissions')
  }

  const total = permissionCount(perms)

  const submit = async () => {
    if (saving) return
    const found: Errors = {}
    const n = name.trim()

    if (!n) found.name = 'Enter the role name'
    else if (existingNames.some((x) => x.toLowerCase() === n.toLowerCase() && x !== role?.name)) {
      found.name = 'This role name is already used'
    }
    if (!description.trim()) found.description = 'Say what this role is for'
    if (total === 0) found.permissions = 'Give the role at least one permission'

    setErrors(found)
    if (Object.keys(found).length > 0) return

    // the page saves it: POST /api/roles or PUT /api/roles/{id}, then PUT /api/roles/{id}/permissions
    setSaving(true)
    try {
      await onSubmit({
        name: n,
        description: description.trim(),
        permissions: Object.fromEntries(Object.entries(perms).filter(([, list]) => list.length > 0)),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit role' : 'New role'} size={780} centered>
      <div className="space-y-4">
        {nameLocked && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="lock-keyhole" />}>
            <Text size="xs">
              {nameLockedReason} You can still change the description{isAdminRole ? '' : ' and permissions'}.
            </Text>
          </Alert>
        )}

        <div>
          <TextInput
            label="Role name"
            placeholder="Branch Manager"
            size="sm"
            readOnly={nameLocked}
            disabled={nameLocked}
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value)
              clear('name')
            }}
            error={errors.name}
          />
        </div>

        <Textarea
          label="Description"
          placeholder="What people with this role do"
          size="sm"
          autosize
          minRows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.currentTarget.value)
            clear('description')
          }}
          error={errors.description}
        />

        {/* the permission matrix */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Text size="sm" fw={600}>
                Permissions
              </Text>
              <Text size="xs" c="dimmed">
                {total} selected
              </Text>
            </div>
            {!isAdminRole && (
              <div className="flex gap-2">
                <Button type="button" size="compact-xs" variant="default" onClick={selectAll}>
                  Select all
                </Button>
                <Button type="button" size="compact-xs" variant="subtle" color="gray" onClick={() => setPerms({})}>
                  Clear all
                </Button>
              </div>
            )}
          </div>

          {isAdminRole && (
            <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />} mb={8}>
              <Text size="xs">
                Admin always has every permission, so nobody can be locked out. These boxes cannot be changed.
              </Text>
            </Alert>
          )}

          <Text size="xs" c="dimmed" mb={8}>
            Tick an area to give access to all its pages, or open it with the arrow to choose pages one by one. A dash
            means only some pages have that permission. View is needed for anything else, so it is ticked for you.
          </Text>

          <div className="overflow-x-auto">
            <div className="min-w-[650px] rounded-md border border-gray-200">
              <div className={`${GRID} border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500`}>
                <span>Area</span>
                {ACTIONS.map((a) => (
                  <span key={a.key} className="text-center" title={a.label}>
                    {'short' in a ? a.short : a.label}
                  </span>
                ))}
              </div>

              <div className="max-h-[46vh] overflow-y-auto">
                {MODULES.map((m) => {
                  const paged = hasPages(m)
                  const open = !!expanded[m.key]
                  const reachable = pagesWithAccess(perms, m)

                  return (
                    <div key={m.key} className="border-b border-gray-100 last:border-b-0">
                      {/* the area row: the choice for the whole area */}
                      <div className={`${GRID} px-3 py-2.5`}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          {paged ? (
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              aria-expanded={open}
                              aria-label={`${open ? 'Hide' : 'Show'} the pages of ${m.label}`}
                              onClick={() => toggleOpen(m.key)}
                            >
                              <AppIcon name={open ? 'chevron-down' : 'chevron-right'} />
                            </ActionIcon>
                          ) : (
                            <span className="w-[22px] shrink-0" />
                          )}
                          <span className="truncate text-sm font-medium text-gray-800">{m.label}</span>
                          {paged && (
                            <Badge
                              variant="light"
                              color={reachable === 0 ? 'gray' : reachable === m.pages!.length ? 'green' : 'yellow'}
                              radius="sm"
                              size="sm"
                              tt="none"
                              className="shrink-0"
                            >
                              {reachable} of {m.pages!.length} {m.unit ?? 'pages'}
                            </Badge>
                          )}
                        </div>
                        {ACTIONS.map((a) => (
                          <div key={a.key} className="flex justify-center">
                            <Cell
                              state={areaCell(perms, m, a.key)}
                              label={`${a.label} ${m.label}`}
                              locked={isAdminRole}
                              onChange={(on) => changeArea(m, a.key, on)}
                            />
                          </div>
                        ))}
                      </div>

                      {/* the pages of the area, shown when it is open */}
                      {paged &&
                        open &&
                        m.pages!.map((page) => (
                          <div key={page.key} className={`${GRID} border-t border-gray-100 bg-gray-50 px-3 py-2`}>
                            <span className="flex min-w-0 items-center gap-2 pl-9">
                              <span className="truncate text-sm text-gray-700">{page.label}</span>
                              {page.kind && (
                                <Badge variant="light" color={KIND[page.kind].color} radius="sm" size="xs" tt="none" className="shrink-0">
                                  {KIND[page.kind].label}
                                </Badge>
                              )}
                            </span>
                            {ACTIONS.map((a) => (
                              <div key={a.key} className="flex justify-center">
                                <Cell
                                  state={pageCell(perms, m, page, a.key)}
                                  label={`${a.label} ${page.label}`}
                                  locked={isAdminRole}
                                  onChange={(on) => changePage(m, page, a.key, on)}
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {errors.permissions && (
            <Text size="sm" c="red" mt={6}>
              {errors.permissions}
            </Text>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button size="xs" variant="default" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} loading={saving} onClick={() => void submit()}>
            {editing ? 'Save' : 'Create role'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}