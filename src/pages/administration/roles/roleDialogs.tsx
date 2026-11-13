import { AppIcon } from '../../../components/appIcon'
import { useEffect, useState } from 'react'
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
  onClose: () => void
  onSubmit: (input: RoleInput) => void
}

type Errors = Partial<Record<'name' | 'description' | 'permissions', string>>

const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(5,64px)] items-center gap-2'

const copyOf = (p: Permissions): Permissions =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [...v]]))

// one box of the matrix: ticked, dashed (some pages have it), empty, or not available
function Cell({ state, label, onChange }: { state: Tri; label: string; onChange: (on: boolean) => void }) {
  if (state === 'na') return <span className="text-gray-300">—</span>
  return (
    <Checkbox
      size="xs"
      aria-label={label}
      checked={state === 'all'}
      indeterminate={state === 'some'}
      onChange={() => onChange(state !== 'all')}
    />
  )
}

export function RoleDialog({ opened, role, existingNames, onClose, onSubmit }: Props) {
  const editing = role !== null
  const system = role?.system ?? false

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [perms, setPerms] = useState<Permissions>({})
  // which areas are open to show their pages
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!opened) return
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setPerms(role ? copyOf(role.permissions) : {})
    // an area that was given out page by page starts open, so you see what was chosen
    setExpanded(
      role ? Object.fromEntries(MODULES.filter((m) => isSplit(role.permissions, m)).map((m) => [m.key, true])) : {},
    )
    setErrors({})
  }, [opened, role])

  const clear = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const changeArea = (m: Module, action: string, on: boolean) => {
    setPerms((p) => toggleArea(p, m, action, on))
    clear('permissions')
  }

  const changePage = (m: Module, page: PageDef, action: string, on: boolean) => {
    setPerms((p) => togglePage(p, m, page.key, action, on))
    clear('permissions')
  }

  const toggleOpen = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  const selectAll = () => {
    setPerms(Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]])))
    clear('permissions')
  }

  const total = permissionCount(perms)

  const submit = () => {
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

    // TODO: POST /api/roles, or PUT /api/roles/{id} when editing (the permission fields come from the Role model)
    onSubmit({
      name: n,
      description: description.trim(),
      permissions: Object.fromEntries(Object.entries(perms).filter(([, list]) => list.length > 0)),
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit role' : 'New role'} size={780} centered>
      <div className="space-y-4">
        {system && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="lock-keyhole" />}>
            <Text size="xs">
              This is a system role. The approval chain looks it up by name, so the name stays fixed. You can still
              change the description and permissions.
            </Text>
          </Alert>
        )}

        <div>
          <TextInput
            label="Role name"
            placeholder="Branch Manager"
            size="sm"
            readOnly={system}
            disabled={system}
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
            <div className="flex gap-2">
              <Button type="button" size="compact-xs" variant="default" onClick={selectAll}>
                Select all
              </Button>
              <Button type="button" size="compact-xs" variant="subtle" color="gray" onClick={() => setPerms({})}>
                Clear all
              </Button>
            </div>
          </div>

          <Text size="xs" c="dimmed" mb={8}>
            Tick an area to give access to all its pages, or open it with the arrow to choose pages one by one. A dash
            means only some pages have that permission. View is needed for anything else, so it is ticked for you.
          </Text>

          <div className="overflow-x-auto">
            <div className="min-w-[580px] rounded-md border border-gray-200">
              <div className={`${GRID} border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500`}>
                <span>Area</span>
                {ACTIONS.map((a) => (
                  <span key={a.key} className="text-center">
                    {a.label}
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
          <Button size="xs" variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            {editing ? 'Save changes' : 'Create role'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}