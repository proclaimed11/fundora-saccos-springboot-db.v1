import { AppIcon } from '../../../components/appIcon'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Text } from '@mantine/core'
import { DashboardLayout } from '../../../components/layout/dashboardLayout'
import { StatWidget } from '../../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../../components/customTable/customTable'
import { CustomTabs } from '../../../components/customTabs'
import { applicants } from '../../applicants/applicantsData'
import { LOANS } from '../../loans/loanApplicationsData'
import {
  CHANNEL,
  EVENT,
  SAMPLE_NOTIFICATIONS,
  STATUS,
  type AppNotification,
  type EventType,
  type NotificationChannel,
} from './notificationsData'
import { SendNotificationDialog, type SendNotificationInput } from './sendNotificationDialog'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'
const WHEN = 'MMM D, YYYY h:mm A'

type TabKey = 'all' | 'unread' | 'read'
type Row = AppNotification & { applicantName: string; loanNo: string }
type Notice = { text: string; color: 'green' | 'blue' } | null

const TAB_EMPTY: Record<TabKey, string> = {
  all: 'No notifications yet',
  unread: 'You are all caught up',
  read: 'No notifications have been read yet',
}

const eventOptions = (Object.keys(EVENT) as EventType[]).map((k) => ({ value: k, label: EVENT[k].label }))
const channelOptions = (Object.keys(CHANNEL) as NotificationChannel[]).map((k) => ({ value: k, label: CHANNEL[k].label }))

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

function StatusBadge({ status }: { status: Row['status'] }) {
  return (
    <Badge variant="light" color={STATUS[status].color} radius="sm" size="sm">
      {STATUS[status].label}
    </Badge>
  )
}

/* ---------- details drawer ---------- */

type DrawerProps = {
  row: Row
  onOpenLoan: (r: Row) => void
  onOpenApplicant: (r: Row) => void
}

function NotificationDrawerBody({ row: r, onOpenLoan, onOpenApplicant }: DrawerProps) {
  const tiles = [
    { label: 'Channel', value: CHANNEL[r.channel].label },
    { label: 'Status', value: STATUS[r.status].label },
    { label: 'Sent', value: dayjs(r.sentAt).format('MMM D, YYYY') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        <Text size="xs" c="dimmed">
          #{r.id} · {EVENT[r.eventType].label}
        </Text>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs text-gray-500">Message</div>
        <div className="mt-0.5 text-sm text-gray-800">{r.message}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">{t.label}</div>
            <div className="text-base font-medium text-gray-800">{t.value}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle>Details</SectionTitle>
        <Field label="Event" value={EVENT[r.eventType].label} />
        <Field label="Recipient" value={r.recipient} />
        <Field label="Channel" value={CHANNEL[r.channel].label} />
        <Field label="Borrower" value={r.applicantName || 'Staff user'} />
        {r.loanNo && <Field label="Loan" value={r.loanNo} />}
        <Field label="Sent" value={dayjs(r.sentAt).format(WHEN)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {r.loanId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => onOpenLoan(r)}>
            View loan
          </Button>
        )}
        {r.applicantId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="user-round" />} onClick={() => onOpenApplicant(r)}>
            View borrower
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function NotificationsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [sendOpen, setSendOpen] = useState(false)
  // UI only: read marks change for this session, nothing is saved yet
  const [items, setItems] = useState<AppNotification[]>(SAMPLE_NOTIFICATIONS)
  const [tab, setTab] = useState<TabKey>('all')
  const [notice, setNotice] = useState<Notice>(null)

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const rows: Row[] = items.map((n) => ({
    ...n,
    applicantName: applicants.find((a) => a.id === n.applicantId)?.name ?? '',
    loanNo: LOANS.find((l) => l.id === n.loanId)?.loanNo ?? '',
  }))

  const unread = rows.filter((r) => r.status === 'SENT')
  const read = rows.filter((r) => r.status === 'READ')
  const tabData: Record<TabKey, Row[]> = { all: rows, unread, read }

  const reminders = rows.filter((r) => r.eventType === 'REPAYMENT_REMINDER' || r.eventType === 'OVERDUE_REMINDER')
  const codes = rows.filter((r) => ['OTP', 'PASSWORD_RESET', 'TWO_FACTOR'].includes(r.eventType))

  // here `color` is the icon color
  const stats = [
    { label: 'Total Notifications', value: rows.length, icon: 'bell', color: '#45bdfc' },
    { label: 'Unread', value: unread.length, icon: 'mail', color: '#e08a1e' },
    { label: 'Reminders Sent', value: reminders.length, icon: 'calendar-days', color: '#8e44ad' },
    { label: 'Codes Sent', value: codes.length, icon: 'shield', color: '#0077b5' },
  ]

  // /notifications?view=3 opens the drawer for notification 3
  const viewParam = params.get('view')
  const selected = viewParam ? (rows.find((r) => String(r.id) === viewParam) ?? null) : null

  /* ---------- actions ---------- */

  const markRead = (id: number) => {
    // TODO: POST /api/notifications/{id}/read
    setItems((list) => list.map((n) => (n.id === id && n.status === 'SENT' ? { ...n, status: 'READ' } : n)))
  }

  // opening a notification counts as reading it
  const openView = (id: number) => {
    markRead(id)
    setParams({ view: String(id) }, { replace: true })
  }
  const closeView = () => setParams({}, { replace: true })

  const markAllRead = () => {
    // TODO: POST /api/notifications/{id}/read for each unread notification (there is no bulk endpoint)
    setItems((list) => list.map((n) => ({ ...n, status: 'READ' })))
    setNotice({ color: 'green', text: `${unread.length} ${unread.length === 1 ? 'notification' : 'notifications'} marked as read.` })
  }

  const send = (input: SendNotificationInput) => {
  // TODO: POST /api/notifications { applicantId, loanId, eventType: 'CUSTOM', channel, recipient, message }
  //       The API saves it as SENT. There is no live email or SMS gateway yet.
  const id = Math.max(0, ...items.map((n) => n.id)) + 1
  setItems((list) => [
    {
      id,
      applicantId: input.applicantId,
      loanId: input.loanId,
      eventType: 'CUSTOM',
      channel: input.channel,
      recipient: input.recipient,
      message: input.message,
      status: 'SENT',
      sentAt: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    },
    ...list,
  ])
  setNotice({ color: 'green', text: `Notification sent to ${input.recipient}.` })
  setTab('all')
  setSendOpen(false)
}

  /* ---------- columns ---------- */

  const columns: CustomTableColumn<Row>[] = [
    {
      accessor: 'eventType',
      header: 'Notification',
      render: (r) => (
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.status === 'SENT' ? 'bg-brand' : 'bg-transparent'}`}
            aria-hidden="true"
          />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <AppIcon name={EVENT[r.eventType].icon} />
          </div>
          <div className="min-w-0">
            <div className={`truncate text-sm text-gray-800 ${r.status === 'SENT' ? 'font-semibold' : 'font-medium'}`}>
              {EVENT[r.eventType].label}
            </div>
            <div className="max-w-[320px] truncate text-xs text-gray-500">{r.message}</div>
          </div>
        </div>
      ),
      exportValue: (r) => `${EVENT[r.eventType].label}: ${r.message}`,
    },
    {
      accessor: 'channel',
      header: 'Recipient',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-800">{r.recipient}</div>
          <div className="text-xs text-gray-500">{CHANNEL[r.channel].label}</div>
        </div>
      ),
      exportValue: (r) => `${r.recipient} (${CHANNEL[r.channel].label})`,
    },
    {
      accessor: 'applicantName',
      header: 'Related to',
      render: (r) =>
        r.applicantName ? (
          <div>
            <div className="whitespace-nowrap text-sm text-gray-800">{r.applicantName}</div>
            <div className="text-xs text-gray-500">{r.loanNo || 'No loan'}</div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Staff user</span>
        ),
      exportValue: (r) => (r.applicantName ? `${r.applicantName} ${r.loanNo}`.trim() : 'Staff user'),
    },
    {
      accessor: 'status',
      header: 'Status',
      sortable: false,
      render: (r) => <StatusBadge status={r.status} />,
      exportValue: (r) => STATUS[r.status].label,
    },
    {
      accessor: 'sentAt',
      header: 'Sent',
      render: (r) => <span className="whitespace-nowrap text-sm text-gray-800">{dayjs(r.sentAt).format(WHEN)}</span>,
      exportValue: (r) => r.sentAt,
    },
    {
      // the ⋮ menu holds every action; "id" is only used as the accessor
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (r) => (
        // stop the click so the row doesn't also open the drawer
        <div onClick={(e) => e.stopPropagation()}>
          <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for notification ${r.id}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {r.status === 'SENT' && (
                <>
                  <Menu.Item fw={500} leftSection={<AppIcon name="check" />} onClick={() => markRead(r.id)}>
                    Mark as read
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => openView(r.id)}>
                View details
              </Menu.Item>
              {r.loanId !== null && (
                <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.loanId}`)}>
                  View loan
                </Menu.Item>
              )}
              {r.applicantId !== null && (
                <Menu.Item leftSection={<AppIcon name="user-round" />} onClick={() => navigate(`/applicants/${r.applicantId}`)}>
                  View borrower
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout
      title="Notifications"
      subtitle="Emails and messages the system has sent to borrowers and staff"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Notifications' }]}
      actions={
        <>
          <Button size="xs" leftSection={<AppIcon name="send" />} onClick={() => setSendOpen(true)}>
            Send notification
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={unread.length === 0}
            leftSection={<AppIcon name="check" />}
            onClick={markAllRead}
          >
            Mark all as read
          </Button>
        </>
      }
    >

      <SendNotificationDialog opened={sendOpen} onClose={() => setSendOpen(false)} onSubmit={send} />
        
      <div className="space-y-4">
        {notice && (
          <Alert
            color={notice.color}
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name="circle-check" />}
          >
            <Text size="sm">{notice.text}</Text>
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
            <CustomTabs
              ariaLabel="Notification filters"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'all', label: `All (${rows.length})` },
                { value: 'unread', label: `Unread (${unread.length})` },
                { value: 'read', label: `Read (${read.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              Reminders go out daily at 06:00 UTC
            </Text>
          </div>

          <CustomTable<Row>
            size="md"
            data={tabData[tab]}
            columns={columns}
            searchInput
            searchPlaceholder="Search recipient, borrower or message"
            searchKeys={['recipient', 'applicantName', 'loanNo', 'message']}
            filters={{ eventType: eventOptions, channel: channelOptions, sentAt: 'date' }}
            // the newest first
            defaultSort={{ accessor: 'sentAt', direction: 'desc' }}
            noRecordText={TAB_EMPTY[tab]}
            onRowClick={(row) => openView(row.id)}
            exportCsv
            exportFileName="notifications"
            print
            printTitle="Notifications"
          />
        </div>
      </div>

      {/* details drawer */}
      <Drawer opened={!!selected} onClose={closeView} position="right" size="lg" title={selected ? EVENT[selected.eventType].label : ''}>
        {selected && (
          <NotificationDrawerBody
            row={selected}
            onOpenLoan={(r) => navigate(`/loans/${r.loanId}`)}
            onOpenApplicant={(r) => navigate(`/applicants/${r.applicantId}`)}
          />
        )}
      </Drawer>
    </DashboardLayout>
  )
}