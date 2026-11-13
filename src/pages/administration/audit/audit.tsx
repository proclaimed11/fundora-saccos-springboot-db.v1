import { AppIcon } from '../../../components/appIcon'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, SegmentedControl, Text } from '@mantine/core'
import { DashboardLayout } from '../../../components/layout/dashboardLayout'
import { StatWidget } from '../../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../../components/customTable/customTable'
import { PageState } from '../../../components/pageState'
import { useAuditLogs, useAuditSummary } from '../../../api/audit'
import { toUser, useApiUsers } from '../../../api/users'
import { ENTITY, actionInfo, entityLabel, type AuditLog } from './auditData'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'
const WHEN = 'MMM D, YYYY h:mm A'

type TabKey = 'all' | 'today' | 'week'
type Row = AuditLog & { userName: string }

const TAB_EMPTY: Record<TabKey, string> = {
  all: 'No audit entries yet',
  today: 'Nothing has been recorded today',
  week: 'Nothing has been recorded in the last 7 days',
}

// the entries of one action or record type, counted without caring about upper or lower case
const countOf = (counts: Record<string, number> | null | undefined, key: string) =>
  Object.entries(counts ?? {})
    .filter(([k]) => k.toUpperCase() === key)
    .reduce((sum, [, n]) => sum + n, 0)

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

function ActionBadge({ action }: { action: string }) {
  const info = actionInfo(action)
  return (
    <Badge variant="light" color={info.color} radius="sm" size="sm">
      {info.label}
    </Badge>
  )
}

// the values are saved as JSON text, so anything that is not an object shows as nothing
function parse(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))

/* ---------- details drawer ---------- */

type DrawerProps = { row: Row; onOpenRecord: (r: Row) => void }

function AuditDrawerBody({ row: r, onOpenRecord }: DrawerProps) {
  const before = parse(r.oldValues)
  const after = parse(r.newValues)
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  const link = r.entityId !== null ? ENTITY[r.entityType]?.path(r.entityId) : null

  const tiles = [
    { label: 'Action', value: actionInfo(r.action).label },
    { label: 'Record', value: `${entityLabel(r.entityType)}${r.entityId !== null ? ` #${r.entityId}` : ''}` },
    { label: 'When', value: dayjs(r.createdAt).format('MMM D, YYYY') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <ActionBadge action={r.action} />
        <Text size="xs" c="dimmed">
          Entry #{r.id} · {dayjs(r.createdAt).format(WHEN)}
        </Text>
      </div>

      <Alert color="gray" variant="light" icon={<AppIcon name="lock-keyhole" />}>
        <Text size="sm">An audit entry is a permanent record. It cannot be edited or deleted.</Text>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>What changed</SectionTitle>
        {keys.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
            No values were recorded for this entry.
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Before</th>
                  <th className="px-3 py-2">After</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const changed = JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])
                  return (
                    <tr key={k} className={`border-t border-gray-100 ${changed ? 'bg-yellow-50/60' : ''}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{k}</td>
                      <td className="break-all px-3 py-2.5 text-gray-600">{show(before?.[k])}</td>
                      <td className={`break-all px-3 py-2.5 ${changed ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                        {show(after?.[k])}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-gray-400">Changed fields are highlighted.</p>
      </div>

      <div>
        <SectionTitle>Entry details</SectionTitle>
        <Field label="Performed by" value={r.userName} />
        <Field label="Action" value={actionInfo(r.action).label} />
        <Field label="Record type" value={entityLabel(r.entityType)} />
        <Field label="Record ID" value={r.entityId !== null ? String(r.entityId) : '—'} />
        <Field label="IP address" value={r.ipAddress || '—'} />
        <Field label="Time" value={dayjs(r.createdAt).format(WHEN)} />
      </div>

      {link && (
        <Button size="xs" variant="default" leftSection={<AppIcon name="external-link" />} onClick={() => onOpenRecord(r)}>
          Open record
        </Button>
      )}
    </div>
  )
}

/* ---------- page ---------- */

export function AuditPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<TabKey>('all')

  const logsQuery = useAuditLogs()
  const summaryQuery = useAuditSummary()
  const usersQuery = useApiUsers()

  // the API only returns userId, the names come from the users list.
  // If that list cannot be loaded the page still works and shows "User #5".
  const names = useMemo(() => {
    const map = new Map<number, string>()
    for (const raw of usersQuery.data ?? []) {
      const u = toUser(raw, [])
      if (u.id) map.set(u.id, u.name !== 'Unknown' ? u.name : u.username)
    }
    return map
  }, [usersQuery.data])

  const rows: Row[] = useMemo(
    () =>
      (logsQuery.data ?? []).map((l) => ({
        ...l,
        userName: l.userId === null ? 'System' : (names.get(l.userId) ?? `User #${l.userId}`),
      })),
    [logsQuery.data, names],
  )

  // the filter lists show what is really in the log
  const actionOptions = [...new Set(rows.map((r) => r.action).filter(Boolean))].map((k) => ({
    value: k,
    label: actionInfo(k).label,
  }))
  const entityOptions = [...new Set(rows.map((r) => r.entityType).filter(Boolean))].map((k) => ({
    value: k,
    label: entityLabel(k),
  }))

  const today = rows.filter((r) => dayjs(r.createdAt).isSame(dayjs(), 'day'))
  const week = rows.filter((r) => dayjs(r.createdAt).isAfter(dayjs().subtract(7, 'day')))
  const tabData: Record<TabKey, Row[]> = { all: rows, today, week }

  const people = new Set(rows.filter((r) => r.userId !== null).map((r) => r.userId)).size
  // the totals come from /api/audit-logs/summary, the rows are the fallback while it loads or if it fails
  const summary = summaryQuery.data
  const total = summary?.totalLogs ?? rows.length
  const deletions = summary ? countOf(summary.byAction, 'DELETE') : rows.filter((r) => r.action === 'DELETE').length

  // here `color` is the icon color
  const stats = [
    { label: 'Total Entries', value: total, icon: 'history', color: '#45bdfc' },
    { label: 'Recorded Today', value: today.length, icon: 'calendar-check', color: 'var(--app-brand)' },
    { label: 'People Active', value: people, icon: 'users', color: '#8e44ad' },
    { label: 'Deletions', value: deletions, icon: 'trash', color: '#ef4444' },
  ]

  // /audit?view=3 opens the drawer for entry 3
  const viewParam = params.get('view')
  const selected = viewParam ? (rows.find((r) => String(r.id) === viewParam) ?? null) : null
  const openView = (id: number) => setParams({ view: String(id) }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  const recordPath = (r: Row) => (r.entityId !== null ? (ENTITY[r.entityType]?.path(r.entityId) ?? null) : null)

  const columns: CustomTableColumn<Row>[] = [
    {
      accessor: 'createdAt',
      header: 'When',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm text-gray-800">{dayjs(r.createdAt).format('MMM D, YYYY')}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">{dayjs(r.createdAt).format('h:mm A')}</div>
        </div>
      ),
      exportValue: (r) => r.createdAt,
    },
    {
      accessor: 'action',
      header: 'Action',
      sortable: false,
      render: (r) => <ActionBadge action={r.action} />,
      exportValue: (r) => actionInfo(r.action).label,
    },
    {
      // the accessor is "entityType" so the Record filter can read it
      accessor: 'entityType',
      header: 'Record',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm font-medium text-gray-800">{entityLabel(r.entityType)}</div>
          <div className="text-xs text-gray-500">{r.entityId !== null ? `#${r.entityId}` : 'No record'}</div>
        </div>
      ),
      exportValue: (r) => `${entityLabel(r.entityType)} ${r.entityId ?? ''}`.trim(),
    },
    {
      accessor: 'userName',
      header: 'Performed by',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm text-gray-800">{r.userName}</div>
          <div className="whitespace-nowrap text-xs text-gray-500">{r.ipAddress || '—'}</div>
        </div>
      ),
      exportValue: (r) => `${r.userName} (${r.ipAddress || '—'})`,
    },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (r) => {
        const path = recordPath(r)
        return (
          // stop the click so the row doesn't also open the drawer
          <div onClick={(e) => e.stopPropagation()}>
            <Menu position="bottom-end" shadow="md" width={220}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for entry ${r.id}`}>
                  <AppIcon name="ellipsis-vertical" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item fw={500} leftSection={<AppIcon name="eye" />} onClick={() => openView(r.id)}>
                  View details
                </Menu.Item>
                {path && (
                  <Menu.Item leftSection={<AppIcon name="external-link" />} onClick={() => navigate(path)}>
                    Open record
                  </Menu.Item>
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
      title="Audit Log"
      subtitle="A permanent record of who did what in the system"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Audit Log' }]}
    >
      <PageState
        loading={logsQuery.isLoading}
        error={logsQuery.error ? logsQuery.error.message : null}
        onRetry={() => void logsQuery.refetch()}
      >
      <div className="space-y-4">
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
                  { value: 'all', label: `All (${rows.length})` },
                  { value: 'today', label: `Today (${today.length})` },
                  { value: 'week', label: `Last 7 days (${week.length})` },
                ]}
              />
            </div>
            <Text size="xs" c="dimmed">
              Entries are read-only and cannot be removed
            </Text>
          </div>

          <CustomTable<Row>
            size="md"
            data={tabData[tab]}
            columns={columns}
            searchInput
            searchPlaceholder="Search user, record or IP address"
            searchKeys={['userName', 'entityType', 'ipAddress']}
            filters={{ action: actionOptions, entityType: entityOptions, userName: 'select', createdAt: 'date' }}
            // the newest first
            defaultSort={{ accessor: 'createdAt', direction: 'desc' }}
            noRecordText={TAB_EMPTY[tab]}
            onRowClick={(row) => openView(row.id)}
            exportCsv
            exportFileName="audit-log"
            print
            printTitle="Audit Log"
          />
        </div>
      </div>
      </PageState>

      {/* details drawer */}
      <Drawer
        opened={!!selected}
        onClose={closeView}
        position="right"
        size="lg"
        title={selected ? `${actionInfo(selected.action).label} · ${entityLabel(selected.entityType)}` : ''}
      >
        {selected && (
          <AuditDrawerBody
            row={selected}
            onOpenRecord={(r) => {
              const path = recordPath(r)
              if (path) navigate(path)
            }}
          />
        )}
      </Drawer>
    </DashboardLayout>
  )
}