import { AppIcon } from '../../../components/appIcon'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Menu, Skeleton, Text } from '@mantine/core'
import {
  createHierarchy as createServerHierarchy,
  createLevel as createServerLevel,
  deleteHierarchy,
  deleteLevel,
  setLevelActive,
  swapLevels,
  setDefaultHierarchy,
  updateHierarchy,
  useServerHierarchies,
  useServerLevels,
} from '../../../api/approvalHierarchy'
import { DashboardLayout } from '../../../components/layout/dashboardLayout'
import { StatWidget } from '../../../components/statsWidgets'
import { ContractConfirmDialog } from '../../loans/contractDialogs'
import { HierarchyDialog, LevelDialog, type LevelInput } from './approvalHierarchyDialogs'
import {
  SAMPLE_HIERARCHIES,
  SAMPLE_LEVELS,
  activeUsersWithRole,
  type ApprovalHierarchy,
  type ApprovalLevel,
} from './approvalHierarchyData'
import { usePageAccess } from '../../auth/usePageAccess'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type Notice = { text: string; color: 'green' | 'blue' | 'red' } | null

type DialogState =
  | {
      kind:
        | 'hierarchy-create'
        | 'hierarchy-rename'
        | 'hierarchy-delete'
        | 'hierarchy-default'
        | 'level-create'
    }
  | { kind: 'level-edit' | 'level-delete'; id: number }
  | null

/* ---------- small pieces ---------- */

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="sm" fw={600} mb={4}>
      {children}
    </Text>
  )
}

// approval_hierarchy id 1 is the System Hierarchy (Admin approves only). There is no column for it,
// so this page treats it as read-only by its id; the API itself does not block changes to it
const SYSTEM_HIERARCHY_SERVER_ID = 1
const isSystem = (h: { id: number }) => h.id === -SYSTEM_HIERARCHY_SERVER_ID

function HierarchyBadges({ h }: { h: ApprovalHierarchy }) {
  return (
    <>
      {isSystem(h) && (
        <Badge variant="light" color="dark" radius="sm" size="sm" leftSection={<AppIcon name="lock-keyhole" size={11} />}>
          System
        </Badge>
      )}
      {/* negative id = a real row from approval_hierarchy, the others are still samples */}
      {h.id < 0 && (
        <Badge variant="light" color="teal" radius="sm" size="sm">
          Saved
        </Badge>
      )}
      {/* is_default = the hierarchy in use; the System Hierarchy is the fallback when no other is chosen */}
      {h.isDefault ? (
        <Badge variant="light" color="brand" radius="sm" size="sm">
          {isSystem(h) ? 'System default · In use' : 'Organization default · In use'}
        </Badge>
      ) : (
        isSystem(h) && (
          <Badge variant="light" color="gray" radius="sm" size="sm">
            Fallback · Not in use
          </Badge>
        )
      )}
      <Badge variant="light" color={h.isActive ? 'green' : 'gray'} radius="sm" size="sm">
        {h.isActive ? 'Active' : 'Inactive'}
      </Badge>
    </>
  )
}

/* ---------- page ---------- */

export function ApprovalHierarchyPage() {
  const navigate = useNavigate()

  // UI only: changes made in this session, nothing is saved yet
  const [sampleHierarchies, setHierarchies] = useState<ApprovalHierarchy[]>(SAMPLE_HIERARCHIES)
  // real rows from approval_hierarchy, listed after the samples. Their local id is the server id made
  // negative, so they never share an id (or the sample levels) with a sample hierarchy
  const serverHierarchiesQuery = useServerHierarchies()
  const serverHierarchies = serverHierarchiesQuery.data
  const hierarchies: ApprovalHierarchy[] = useMemo(
    () =>
      [
        ...sampleHierarchies,
        ...(serverHierarchies ?? []).map((h) => ({
          id: -h.id,
          name: h.name,
          isDefault: h.isDefault,
          isActive: h.isActive,
          created: h.createdAt ? h.createdAt.slice(0, 10) : '',
        })),
      ].sort((a, b) => Number(isSystem(b)) - Number(isSystem(a))), // the System Hierarchy is listed first
    [sampleHierarchies, serverHierarchies],
  )
  const [sampleLevels, setLevels] = useState<ApprovalLevel[]>(SAMPLE_LEVELS)
  // the real levels of every saved hierarchy, with negative ids like the hierarchies above
  const serverLevels = useServerLevels((serverHierarchiesQuery.data ?? []).map((h) => h.id))
  // kept stable so an open level dialog is not reset on every render
  const levels: ApprovalLevel[] = useMemo(
    () => [...sampleLevels, ...serverLevels.map((l) => ({ ...l, id: -l.id, hierarchyId: -l.hierarchyId }))],
    [sampleLevels, serverLevels],
  )
  // 0 = nothing picked yet, the default hierarchy is shown
  const [selectedId, setSelectedId] = useState<number>(0)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const { canCreate, canEdit, canDelete } = usePageAccess('administration', 'approval-hierarchy')
  const locked = !canEdit

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const levelsOf = (id: number) => levels.filter((l) => l.hierarchyId === id).sort((a, b) => a.levelNo - b.levelNo)

  const defaultHierarchy = hierarchies.find((h) => h.isDefault)
  // a blank stand-in while the list loads or is empty (the section below is not shown then)
  const selected: ApprovalHierarchy = hierarchies.find((h) => h.id === selectedId) ??
    defaultHierarchy ??
    hierarchies[0] ?? { id: 0, name: '', isDefault: false, isActive: false, created: '' }
  const current = levelsOf(selected.id)
  const chain = current.filter((l) => l.isActive)

  // what the loan applications really go through
  const defaultChain = defaultHierarchy ? levelsOf(defaultHierarchy.id).filter((l) => l.isActive) : []
  const uncovered = defaultChain.filter((l) => activeUsersWithRole(l.requiredRole).length === 0)
  const approvers = new Set(defaultChain.flatMap((l) => activeUsersWithRole(l.requiredRole).map((u) => u.id))).size

  // here `color` is the icon color
  const stats = [
    { label: 'Hierarchies', value: hierarchies.length, icon: 'network', color: '#45bdfc' },
    {
      label: 'Levels In Default Chain',
      value: defaultChain.length,
      icon: 'square-check',
      color: 'var(--app-brand)',
    },
    { label: 'Approvers Available', value: approvers, icon: 'users', color: '#8e44ad' },
    { label: 'Levels Without Approver', value: uncovered.length, icon: 'triangle-alert', color: uncovered.length > 0 ? '#ef4444' : '#0077b5' },
  ]

  // our own rules, the API does not enforce them
  const defaultBlock = !selected.isActive
    ? 'Activate this hierarchy first.'
    : chain.length === 0
      ? 'Add at least one active level first.'
      : null

  const deleteBlock = isSystem(selected) ? 'The System Hierarchy cannot be deleted.' : null

  // the default hierarchy always needs a level that decides
  const levelBlock = (l: ApprovalLevel): string | null =>
    selected.isDefault && l.isActive && chain.length <= 1
      ? 'The default hierarchy needs at least one active level.'
      : null

  const dialogLevel = dialog && 'id' in dialog ? levels.find((l) => l.id === dialog.id) : undefined

  // on-screen changes are for the sample hierarchies only; on a saved one, only adding a level is connected so far
  const saveLevels = (next: ApprovalLevel[]) => {
    if (isSystem(selected)) {
      setNotice({ color: 'blue', text: 'The System Hierarchy is read-only. Nothing was changed.' })
      setDialog(null)
      return false
    }
    if (selected.id < 0) {
      setNotice({ color: 'blue', text: 'Only adding levels is connected for saved hierarchies so far.' })
      setDialog(null)
      return false
    }
    setLevels((all) => [...all.filter((l) => l.hierarchyId !== selected.id), ...next])
    return true
  }

  const renumber = (list: ApprovalLevel[]) => list.map((l, i) => ({ ...l, levelNo: i + 1 }))

  /* ---------- hierarchy actions ---------- */

  // POST /api/approval-hierarchys; an error is thrown back to the dialog and shown there
  const createHierarchy = async (name: string) => {
    const created = await createServerHierarchy(name)
    await serverHierarchiesQuery.refetch()
    if (created.id > 0) setSelectedId(-created.id)
    setNotice({ color: 'green', text: `Hierarchy ${name} was saved. Add its levels next.` })
    setDialog(null)
  }

  // the System Hierarchy cannot be renamed, deactivated or deleted
  const readOnly = () => {
    if (!isSystem(selected)) return false
    setNotice({ color: 'blue', text: 'The System Hierarchy is read-only. Nothing was changed.' })
    setDialog(null)
    return true
  }

  // when the hierarchy in use is deactivated or deleted, the System Hierarchy takes over first,
  // so loans are never left without a default
  const fallBackToSystem = () => setDefaultHierarchy(SYSTEM_HIERARCHY_SERVER_ID, serverHierarchies ?? [])

  // PUT /api/approval-hierarchys/{id} { name }; an error is shown in the dialog
  const renameHierarchy = async (name: string) => {
    if (readOnly()) return
    if (selected.id >= 0) {
      setHierarchies((list) => list.map((h) => (h.id === selected.id ? { ...h, name } : h)))
    } else {
      await updateHierarchy(-selected.id, { name })
    }
    setNotice({ color: 'green', text: `The hierarchy was renamed to ${name}.` })
    setDialog(null)
  }

  // PUT /api/approval-hierarchys/{id}: is_default = true on the chosen one, false on all the others.
  // Allowed on the System Hierarchy too: choosing it as the fallback does not change its contents
  const [switching, setSwitching] = useState(false)
  const makeDefault = async () => {
    setDialog(null)
    if (defaultBlock || switching) return
    if (selected.id >= 0) {
      setHierarchies((list) => list.map((h) => ({ ...h, isDefault: h.id === selected.id })))
      return
    }
    const target = selected
    const levelCount = chain.length
    setSwitching(true)
    try {
      await setDefaultHierarchy(-target.id, serverHierarchies ?? [])
      setNotice({
        color: 'green',
        text: isSystem(target)
          ? `Back to the system default. New approvals follow ${target.name} (one Admin decision).`
          : `${target.name} is now the organization default. New approvals follow its ${levelCount} ${
              levelCount === 1 ? 'level' : 'levels'
            }.`,
      })
    } catch (err) {
      setNotice({
        color: 'red',
        text: `Could not change the default: ${err instanceof Error ? err.message : 'please try again'}. Check which hierarchy is marked default before retrying.`,
      })
    } finally {
      setSwitching(false)
    }
  }

  // PUT /api/approval-hierarchys/{id} { isActive }; deactivating the one in use falls back to the System Hierarchy
  const toggleHierarchy = async () => {
    if (readOnly() || switching) return
    const target = selected
    if (target.id >= 0) {
      setHierarchies((list) => list.map((h) => (h.id === target.id ? { ...h, isActive: !h.isActive } : h)))
      return
    }
    const deactivating = target.isActive
    const inUse = target.isDefault
    setSwitching(true)
    try {
      if (deactivating && inUse) await fallBackToSystem()
      await updateHierarchy(-target.id, { isActive: !deactivating })
      setNotice({
        color: 'blue',
        text: deactivating
          ? `${target.name} was deactivated.${inUse ? ' New approvals now follow the System Hierarchy.' : ''}`
          : `${target.name} was activated. Make it the default to use it for new approvals.`,
      })
    } catch (err) {
      setNotice({
        color: 'red',
        text: `Could not ${deactivating ? 'deactivate' : 'activate'} ${target.name}: ${
          err instanceof Error ? err.message : 'please try again'
        }`,
      })
    } finally {
      setSwitching(false)
    }
  }

  // DELETE the levels, then the hierarchy; deleting the one in use falls back to the System Hierarchy first
  const removeHierarchy = async () => {
    setDialog(null)
    if (deleteBlock || readOnly() || switching) return
    const target = selected
    if (target.id >= 0) {
      setHierarchies((list) => list.filter((h) => h.id !== target.id))
      setLevels((list) => list.filter((l) => l.hierarchyId !== target.id))
      setSelectedId(0)
      return
    }
    setSwitching(true)
    try {
      if (target.isDefault) await fallBackToSystem()
      await deleteHierarchy(-target.id)
      setSelectedId(0)
      setNotice({
        color: 'blue',
        text: `Hierarchy ${target.name} was deleted.${target.isDefault ? ' New approvals now follow the System Hierarchy.' : ''}`,
      })
    } catch (err) {
      setNotice({
        color: 'red',
        text: `Could not delete ${target.name}: ${err instanceof Error ? err.message : 'please try again'}`,
      })
    } finally {
      setSwitching(false)
    }
  }

  /* ---------- level actions ---------- */

  // saved hierarchy: POST /api/approval-levels as the next number (an error is shown in the dialog)
  const addLevel = async (input: LevelInput) => {
    const levelNo = Math.max(0, ...current.map((l) => l.levelNo)) + 1
    if (isSystem(selected)) throw new Error('The System Hierarchy is read-only.')
    if (selected.id < 0) {
      await createServerLevel(-selected.id, { levelNo, ...input })
    } else {
      const id = Math.max(0, ...levels.map((l) => l.id)) + 1
      saveLevels([...current, { id, hierarchyId: selected.id, levelNo, isActive: true, ...input }])
    }
    setNotice({ color: 'green', text: `Level ${input.levelName} was added to ${selected.name} as level ${levelNo}.` })
    setDialog(null)
  }

  const editLevel = (input: LevelInput) => {
    if (!dialogLevel) return
    if (!saveLevels(current.map((l) => (l.id === dialogLevel.id ? { ...l, ...input } : l)))) return
    setNotice({ color: 'green', text: `Level ${input.levelName} was updated.` })
    setDialog(null)
  }

  // true while levels are being saved and read back (skip, move or delete): the list shows skeletons
  const [moving, setMoving] = useState(false)

  // saved hierarchy: PUT /api/approval-levels/{id} { isActive } (skip = false, include = true)
  const toggleLevel = async (l: ApprovalLevel) => {
    if (levelBlock(l) || moving) return
    const done = l.isActive
      ? `${l.levelName} is now skipped. Applications go straight past it.`
      : `${l.levelName} was restored and is back in the chain.`
    if (isSystem(selected) || selected.id >= 0) {
      if (saveLevels(current.map((x) => (x.id === l.id ? { ...x, isActive: !x.isActive } : x)))) {
        setNotice({ color: 'blue', text: done })
      }
      return
    }
    setMoving(true)
    try {
      await setLevelActive(-selected.id, -l.id, !l.isActive)
      setNotice({ color: 'blue', text: done })
    } catch (err) {
      setNotice({
        color: 'red',
        text: `Could not ${l.isActive ? 'skip' : 'include'} ${l.levelName}: ${
          err instanceof Error ? err.message : 'please try again'
        }`,
      })
    } finally {
      setMoving(false)
    }
  }

  // saved hierarchy: DELETE /api/approval-levels/{id}, then the levels after it are renumbered
  const removeLevel = async () => {
    const target = dialogLevel
    setDialog(null)
    if (!target || levelBlock(target) || moving) return
    if (isSystem(selected) || selected.id >= 0) {
      if (saveLevels(renumber(current.filter((l) => l.id !== target.id)))) {
        setNotice({ color: 'blue', text: `Level ${target.levelName} was removed and the rest renumbered.` })
      }
      return
    }
    const toServer = (x: ApprovalLevel) => ({ ...x, id: -x.id, hierarchyId: -x.hierarchyId })
    setMoving(true)
    try {
      await deleteLevel(-selected.id, toServer(target), current.map(toServer))
      setNotice({ color: 'blue', text: `Level ${target.levelName} was deleted and the levels after it moved up.` })
    } catch (err) {
      setNotice({
        color: 'red',
        text: `Could not delete ${target.levelName}: ${err instanceof Error ? err.message : 'please try again'}`,
      })
    } finally {
      setMoving(false)
    }
  }

  // swap a level with its neighbour: on a saved hierarchy the two trade level_no (PUT /api/approval-levels/{id} x2)
  const move = async (l: ApprovalLevel, step: -1 | 1) => {
    const list = [...current]
    const i = list.findIndex((x) => x.id === l.id)
    const j = i + step
    if (j < 0 || j >= list.length || moving) return
    const other = list[j]

    if (isSystem(selected)) {
      saveLevels(list) // refuses with the read-only notice
      return
    }
    if (selected.id >= 0) {
      list[j] = list[i]
      list[i] = other
      saveLevels(renumber(list))
      return
    }

    // server ids are the local ids made positive again
    const toServer = (x: ApprovalLevel) => ({ ...x, id: -x.id, hierarchyId: -x.hierarchyId })
    setMoving(true)
    try {
      await swapLevels(-selected.id, toServer(l), toServer(other))
      setNotice({
        color: 'green',
        text: `${l.levelName} is now level ${other.levelNo} and ${other.levelName} is level ${l.levelNo}.`,
      })
    } catch (err) {
      setNotice({
        color: 'red',
        text: `Could not move ${l.levelName}: ${err instanceof Error ? err.message : 'please try again'}. Check the level order below before retrying.`,
      })
    } finally {
      setMoving(false)
    }
  }

  return (
    <DashboardLayout
      title="Approval Hierarchy"
      subtitle="The chain of levels every loan application goes through before it is approved"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Approval Hierarchy' }]}
       actions={
        canCreate ? (
        <Button
          size="xs"
          leftSection={<AppIcon name="plus" />}
          onClick={() => setDialog({ kind: 'hierarchy-create' })}
        >
          New hierarchy
        </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {notice && (
          <Alert
            color={notice.color}
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name={notice.color === 'green' ? 'circle-check' : 'info'} />}
          >
            <Text size="sm">{notice.text}</Text>
          </Alert>
        )}


        {uncovered.length > 0 && (
          <Alert color="red" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {uncovered.map((l) => `${l.levelName} (${l.requiredRole})`).join(', ')}{' '}
                {uncovered.length === 1 ? 'has' : 'have'} no active user in the default chain. Applications will wait
                at {uncovered.length === 1 ? 'that level' : 'those levels'} until someone is given the role.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => navigate('/users')}>
                Open users
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

        {/* row 2: nothing to list yet (loading, failed or empty) */}
        {hierarchies.length === 0 && (
          <div className={`${CARD} p-5`}>
            {serverHierarchiesQuery.isPending ? (
              <div className="space-y-2">
                <Skeleton height={16} width="30%" />
                <Skeleton height={48} />
                <Skeleton height={48} />
              </div>
            ) : serverHierarchiesQuery.isError ? (
              <Text size="sm" c="red">
                Could not load the hierarchies. Refresh the page to try again.
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                No hierarchy yet. Create one with New hierarchy, then add its levels.
              </Text>
            )}
          </div>
        )}

        {/* row 2: the hierarchies and the chain of the selected one */}
        {hierarchies.length > 0 && (
        <div aria-disabled={locked} className={locked ? 'pointer-events-none select-none opacity-50' : ''}>
          <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* hierarchy list */}
            <div className={`${CARD} p-4`}>
              <SectionTitle>Hierarchies</SectionTitle>
              <ul className="mt-2 space-y-2">
                {hierarchies.map((h) => {
                  const active = levelsOf(h.id).filter((l) => l.isActive).length
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        aria-pressed={h.id === selected.id}
                        onClick={() => setSelectedId(h.id)}
                        className={`w-full rounded-md border bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                          h.id === selected.id ? 'border-brand ring-2 ring-brand' : 'border-gray-200'
                        }`}
                      >
                        <div className="truncate text-sm font-medium text-gray-800">{h.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <HierarchyBadges h={h} />
                        </div>
                        <div className="mt-1.5 text-xs text-gray-500">
                          {active} active {active === 1 ? 'level' : 'levels'}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-xs text-gray-500">Only the default hierarchy is used for new approvals.</p>
            </div>

            {/* selected hierarchy */}
            <div className={`${CARD} p-5`}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-gray-800">{selected.name}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <HierarchyBadges h={selected} />
                    {selected.created && (
                      <Text size="xs" c="dimmed">
                        Created {dayjs(selected.created).format('MMM D, YYYY')}
                      </Text>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!selected.isDefault && (
                    <Button
                      size="xs"
                      variant="default"
                      disabled={!!defaultBlock || !canEdit}
                      loading={switching}
                      leftSection={<AppIcon name="circle-check" />}
                      onClick={() => setDialog({ kind: 'hierarchy-default' })}
                    >
                      {isSystem(selected) ? 'Use system default' : 'Make default'}
                    </Button>
                  )}
                  {!isSystem(selected) && (
                  <>
                  <Button size="xs" leftSection={<AppIcon name="plus" />} onClick={() => setDialog({ kind: 'level-create' })}>
                    Add level
                  </Button>
                  <Menu position="bottom-end" shadow="md" width={230}>
                    <Menu.Target>
                      <ActionIcon variant="default" size={30} aria-label={`Actions for ${selected.name}`}>
                        <AppIcon name="ellipsis-vertical" />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<AppIcon name="pencil" />} onClick={() => setDialog({ kind: 'hierarchy-rename' })}>
                        Rename
                      </Menu.Item>
                      <Menu.Item
                        disabled={switching}
                        leftSection={<AppIcon name={selected.isActive ? 'circle-x' : 'circle-check'} />}
                        onClick={() => void toggleHierarchy()}
                      >
                        {selected.isActive
                          ? selected.isDefault
                            ? 'Deactivate (System Hierarchy takes over)'
                            : 'Deactivate'
                          : 'Activate'}
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        disabled={!!deleteBlock || !canDelete}
                        leftSection={<AppIcon name="trash" />}
                        onClick={() => setDialog({ kind: 'hierarchy-delete' })}
                      >
                        {deleteBlock ? 'Cannot delete' : 'Delete hierarchy'}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                  </>
                  )}
                </div>
              </div>

              {isSystem(selected) && (
                <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />} mb="md">
                  <Text size="sm">
                    This is the system hierarchy: one Admin decision approves or rejects an application. It is read-only,
                    so it cannot be renamed, deactivated or deleted, and its levels cannot be changed.
                  </Text>
                </Alert>
              )}

              {!selected.isDefault && defaultBlock && (
                <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />} mb="md">
                  <Text size="sm">This hierarchy cannot be the default yet. {defaultBlock}</Text>
                </Alert>
              )}

              {/* the chain, as an application sees it */}
              <div className="mb-5">
                <SectionTitle>The path of an application</SectionTitle>
                {moving ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {[80, ...chain.map(() => 140), 80].map((w, k) => (
                      <Skeleton key={k} height={24} width={w} radius="sm" />
                    ))}
                  </div>
                ) : chain.length === 0 ? (
                  <div className="mt-2 rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
                    No active level yet, so there is no chain. Add a level to start.
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" color="gray" radius="sm" size="md" tt="none">
                      Submitted
                    </Badge>
                    {chain.map((l) => (
                      <Fragment key={l.id}>
                        <AppIcon name="chevron-right" className="text-gray-400" />
                        <Badge variant="light" color="brand" radius="sm" size="md" tt="none">
                          {l.levelName} · {l.requiredRole}
                        </Badge>
                      </Fragment>
                    ))}
                    <AppIcon name="chevron-right" className="text-gray-400" />
                    <Badge variant="filled" color="green" radius="sm" size="md" tt="none">
                      Approved
                    </Badge>
                  </div>
                )}
              </div>

              {/* the levels */}
              <div>
                <SectionTitle>{`Levels (${current.length})`}</SectionTitle>
                <p className="mb-3 text-xs text-gray-500">
                  Each level must approve in order. A rejection at any level stops the application. A skipped level is
                  kept but not asked.
                </p>

                {moving ? (
                  // the new order is being saved and read back
                  <ul className="space-y-2" aria-busy="true" aria-label="Saving the new level order">
                    {current.map((l) => (
                      <li key={l.id} className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-3">
                        <Skeleton height={32} width={32} circle />
                        <div className="flex-1 space-y-2 pt-1">
                          <Skeleton height={12} width="40%" />
                          <Skeleton height={10} width="25%" />
                          <Skeleton height={10} width="55%" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : current.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-500">
                    This hierarchy has no levels yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {current.map((l, i) => {
                      const users = activeUsersWithRole(l.requiredRole)
                      const blocked = levelBlock(l)
                      return (
                        <li
                          key={l.id}
                          className={`flex items-start gap-3 rounded-md border px-3 py-3 ${
                            l.isActive ? 'border-gray-200' : 'border-dashed border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                              l.isActive ? 'bg-brand-subtle text-brand-dark' : 'bg-gray-100 text-gray-400 opacity-60'
                            }`}
                          >
                            {l.levelNo}
                          </div>

                          {/* a skipped level stays in the list, greyed out, until it is restored */}
                          <div className={`min-w-0 flex-1 ${l.isActive ? '' : 'opacity-60'}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-sm font-medium ${l.isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                                {l.levelName}
                              </span>
                              {!l.isActive && (
                                <Badge variant="light" color="gray" radius="sm" size="sm">
                                  Skipped
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">Required role: {l.requiredRole}</div>
                            <div
                              className={`mt-1 text-xs ${
                                users.length === 0 && l.isActive ? 'font-medium text-red-600' : 'text-gray-500'
                              }`}
                            >
                              {users.length === 0
                                ? 'No active user has this role'
                                : `${users.length} active ${users.length === 1 ? 'user' : 'users'}: ${users
                                    .map((u) => u.name)
                                    .join(', ')}`}
                            </div>
                          </div>

                          {!isSystem(selected) && (
                          <div className="flex shrink-0 items-center gap-1">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              disabled={i === 0 || moving}
                              aria-label={`Move ${l.levelName} up`}
                              onClick={() => void move(l, -1)}
                            >
                              <AppIcon name="arrow-up" />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              disabled={i === current.length - 1 || moving}
                              aria-label={`Move ${l.levelName} down`}
                              onClick={() => void move(l, 1)}
                            >
                              <AppIcon name="arrow-down" />
                            </ActionIcon>

                            <Menu position="bottom-end" shadow="md" width={230}>
                              <Menu.Target>
                                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${l.levelName}`}>
                                  <AppIcon name="ellipsis-vertical" />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item fw={500} leftSection={<AppIcon name="pencil" />} onClick={() => setDialog({ kind: 'level-edit', id: l.id })}>
                                  Edit level
                                </Menu.Item>
                                <Menu.Item
                                  disabled={!!blocked || !canDelete}
                                  leftSection={<AppIcon name={l.isActive ? 'circle-x' : 'circle-check'} />}
                                  onClick={() => void toggleLevel(l)}
                                >
                                  {l.isActive ? (blocked ? 'Cannot skip' : 'Skip this level') : 'Restore level'}
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                  color="red"
                                  disabled={!!blocked}
                                  leftSection={<AppIcon name="trash" />}
                                  onClick={() => setDialog({ kind: 'level-delete', id: l.id })}
                                >
                                  {blocked ? 'Cannot delete' : 'Delete level'}
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <Alert color="blue" variant="light" icon={<AppIcon name="info" />} mt="md">
                <Text size="xs">
                  The approver's role must match the level's required role exactly. Roles are managed on the Roles page,
                  and people are given a role on the Users page.
                </Text>
              </Alert>
            </div>
          </div>
        </div>
        )}
      </div>

      <HierarchyDialog
        opened={dialog?.kind === 'hierarchy-create' || dialog?.kind === 'hierarchy-rename'}
        hierarchy={dialog?.kind === 'hierarchy-rename' ? selected : null}
        existingNames={hierarchies.map((h) => h.name)}
        onClose={() => setDialog(null)}
        onSubmit={dialog?.kind === 'hierarchy-rename' ? renameHierarchy : createHierarchy}
      />

      <LevelDialog
        opened={dialog?.kind === 'level-create' || dialog?.kind === 'level-edit'}
        level={dialog?.kind === 'level-edit' ? (dialogLevel ?? null) : null}
        hierarchyName={selected.name}
        existingNames={current.filter((l) => l.id !== dialogLevel?.id || dialog?.kind !== 'level-edit').map((l) => l.levelName)}
        onClose={() => setDialog(null)}
        onSubmit={dialog?.kind === 'level-edit' ? editLevel : addLevel}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'hierarchy-default'}
        title={isSystem(selected) ? 'Use system default' : 'Make organization default'}
        message={`${
          isSystem(selected) ? `Go back to ${selected.name}` : `Make ${selected.name} the organization default`
        }? New approvals will go through its ${chain.length} ${chain.length === 1 ? 'level' : 'levels'}${
          defaultHierarchy ? `, and ${defaultHierarchy.name} stops being used` : ''
        }. Applications already in approval keep their decisions so far.`}
        confirmLabel={isSystem(selected) ? 'Use system default' : 'Make default'}
        onClose={() => setDialog(null)}
        onConfirm={() => void makeDefault()}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'hierarchy-delete' && !deleteBlock}
        title="Delete hierarchy"
        message={`Delete ${selected.name} and its ${current.length} ${current.length === 1 ? 'level' : 'levels'}? This cannot be undone.${
          selected.isDefault ? ' It is in use, so new approvals will follow the System Hierarchy.' : ''
        }`}
        confirmLabel="Delete hierarchy"
        onClose={() => setDialog(null)}
        onConfirm={() => void removeHierarchy()}
      />

      <ContractConfirmDialog
        opened={dialog?.kind === 'level-delete' && !!dialogLevel}
        title="Delete level"
        message={`Remove the ${dialogLevel?.levelName ?? ''} level from ${selected.name}? The remaining levels are renumbered.`}
        confirmLabel="Delete level"
        onClose={() => setDialog(null)}
        onConfirm={() => void removeLevel()}
      />
    </DashboardLayout>
  )
}