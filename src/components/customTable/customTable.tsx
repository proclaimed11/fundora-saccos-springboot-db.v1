import { AppIcon } from '../appIcon'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  CloseButton,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  type ComboboxData,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import dayjs from 'dayjs'
import {
  DataTable,
  type DataTableColumn,
  type DataTableSortStatus,
} from 'mantine-datatable'

const ISO = 'YYYY-MM-DD'

/* ====================== public types ====================== */

export type DateRange = [string | null, string | null]

/**
 * 'select' -> dropdown, options are taken from the values found in the data
 * 'date'   -> From / To date range (cell values must be ISO dates, e.g. 2026-09-28)
 * array    -> dropdown with exactly these options, e.g. ['A', 'B'] or [{ value: '1', label: '1 year' }]
 */
export type FilterConfig = 'select' | 'date' | ComboboxData

export type CustomTableColumn<T> = {
  /** field name on the row */
  accessor: keyof T & string
  /** column title */
  header: string
  /** default true */
  sortable?: boolean
  width?: number | string
  align?: 'left' | 'center' | 'right'
  /** controls default formatting: 'date' -> formatted date, 'number' -> 12,054 */
  type?: 'text' | 'number' | 'date'
  /** keep default cell text on one line, default true */
  nowrap?: boolean
  /** custom cell content */
  render?: (row: T) => ReactNode
  /** plain-text value used for CSV export and print (defaults to the formatted cell text) */
  exportValue?: (row: T) => string | number
}

export type CustomTableProps<T extends object> = {
  data: T[]
  columns: CustomTableColumn<T>[]
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** field that uniquely identifies a row, default "id" */
  idAccessor?: keyof T & string

  /* toolbar */
  searchInput?: boolean
  searchPlaceholder?: string
  /** fields the search looks at, default all columns */
  searchKeys?: (keyof T & string)[]
  /** which columns get a header filter, keyed by column accessor */
  filters?: Partial<Record<keyof T & string, FilterConfig>>
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode

  /* row selection */
  selectCheckbox?: boolean
  /** shows the Delete button in the selection bar, you update your own data here */
  onDelete?: (rows: T[]) => void
  confirmModal?: boolean
  confirmHeading?: string | false
  confirmBody?: string | false

  /* collapsible rows */
  collapsible?: boolean
  renderExpanded?: (row: T) => ReactNode
  expandMultiple?: boolean

  /* export / print */
  exportCsv?: boolean
  exportFileName?: string
  print?: boolean
  printTitle?: string

  /* look */
  verticalBorders?: boolean
  horizontalBorders?: boolean
  outerBorder?: boolean
  striped?: boolean
  highlightOnHover?: boolean
  /** setting a height makes the header sticky while rows scroll */
  maxHeight?: number | string
  dateFormat?: string

  /* data behaviour */
  pagination?: boolean
  pageSize?: number
  pageSizeOptions?: number[]
  /** initial sort, pass null for no initial sorting (keeps your data order) */
  defaultSort?: { accessor: keyof T & string; direction: 'asc' | 'desc' } | null
  onRowClick?: (row: T) => void
  loading?: boolean

  /* empty state */
  noRecordText?: string
  noRecordTextFiltered?: string
  noRecordIcon?: ReactNode
}

/* ====================== helpers ====================== */

type FilterDef =
  | { key: string; type: 'select'; options: ComboboxData }
  | { key: string; type: 'date' }

type PaginationProps = {
  totalRecords: number
  recordsPerPage: number
  page: number
  onPageChange: (page: number) => void
}

const field = (row: object, key: string): unknown =>
  (row as unknown as Record<string, unknown>)[key]

const isBlank = (v: unknown) => v === null || v === undefined || v === ''

// text shown in the expanded panel and in the printout
function cellText<T extends object>(
  row: T,
  col: CustomTableColumn<T>,
  dateFormat: string
): string {
  if (col.exportValue) return String(col.exportValue(row))
  const v = field(row, col.accessor)
  if (isBlank(v)) return ''
  if (col.type === 'date') return dayjs(String(v)).format(dateFormat)
  if (col.type === 'number') return Number(v).toLocaleString()
  return String(v)
}

// raw value written to the CSV file
function csvValue<T extends object>(row: T, col: CustomTableColumn<T>): string | number {
  if (col.exportValue) return col.exportValue(row)
  const v = field(row, col.accessor)
  if (isBlank(v)) return ''
  return typeof v === 'number' ? v : String(v)
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`

function downloadCsv<T extends object>(
  rows: T[],
  columns: CustomTableColumn<T>[],
  filename: string
) {
  const lines = [
    columns.map((c) => c.header),
    ...rows.map((r) => columns.map((c) => csvValue(r, c))),
  ]
    .map((line) => line.map(csvCell).join(','))
    .join('\r\n')

  // the BOM makes Excel read the file as UTF-8
  const blob = new Blob(['\uFEFF' + lines], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const esc = (v: string | number) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function printTable<T extends object>(
  rows: T[],
  columns: CustomTableColumn<T>[],
  title: string,
  dateFormat: string
) {
  const head = columns.map((c) => `<th>${esc(c.header)}</th>`).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td>${esc(cellText(r, c, dateFormat))}</td>`).join('')}</tr>`
    )
    .join('')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: ${columns.length > 6 ? 'landscape' : 'portrait'}; margin: 12mm; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #111; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  p { font-size: 11px; color: #666; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · printed ${esc(dayjs().format('MMM D, YYYY h:mm A'))}</p>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`

  // print from a hidden iframe so no popup window is needed
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  win.onafterprint = () => iframe.remove()
  setTimeout(() => {
    win.focus()
    win.print()
  }, 100)
  setTimeout(() => iframe.remove(), 60000) // cleanup fallback
}

const presets: { label: string; range: () => DateRange }[] = [
  {
    label: 'Last 7 days',
    range: () => [dayjs().subtract(7, 'day').format(ISO), dayjs().format(ISO)],
  },
  {
    label: 'Last 30 days',
    range: () => [dayjs().subtract(30, 'day').format(ISO), dayjs().format(ISO)],
  },
  {
    label: 'This month',
    range: () => [dayjs().startOf('month').format(ISO), dayjs().endOf('month').format(ISO)],
  },
]

/* ====================== small UI pieces ====================== */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transition: 'transform 150ms ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function FolderOpenIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#adb5bd"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

// header title with a Lucide filter button that opens a popover
function FilterTitle({
  label,
  active,
  children,
}: {
  label: string
  active: boolean
  children: ReactNode
}) {
  const [opened, setOpened] = useState(false)

  return (
    <Group gap={4} wrap="nowrap">
      <span className="whitespace-nowrap">{label}</span>
      <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
        <Popover.Target>
          <ActionIcon
            size="xs"
            variant={active ? 'filled' : 'subtle'}
            color={active ? 'dark' : 'gray'}
            aria-label={`Filter ${label}`}
            onClick={(e) => {
              e.stopPropagation() // don't trigger column sorting
              setOpened((o) => !o)
            }}
          >
            <AppIcon name="filter" size={10} strokeWidth={1.5} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown p="sm" onClick={(e) => e.stopPropagation()}>
          {children}
        </Popover.Dropdown>
      </Popover>
    </Group>
  )
}

// every size-dependent value lives here, and is used in the DataTable below
const SIZES = {
  xs: { fz: 'xs', text: 'xs', py: 6,  px: 'sm', head: 12, pagination: 'xs' },
  sm: { fz: 'sm', text: 'xs', py: 10, px: 'md', head: 13, pagination: 'sm' },
  md: { fz: 'md', text: 'sm', py: 14, px: 'md', head: 14, pagination: 'md' },
  lg: { fz: 'lg', text: 'sm', py: 18, px: 'lg', head: 15, pagination: 'md' },
  xl: { fz: 'xl', text: 'md', py: 22, px: 'xl', head: 16, pagination: 'md' },
} as const

/* ====================== the table ====================== */

export function CustomTable<T extends object>({
  data,
  columns,
  idAccessor = 'id' as keyof T & string,

  searchInput = false,
  searchPlaceholder = 'Search...',
  searchKeys,
  filters,
  toolbarLeft,
  toolbarRight,

  selectCheckbox = false,
  onDelete,
  confirmModal = true,
  confirmHeading,
  confirmBody,

  collapsible = false,
  renderExpanded,
  expandMultiple = true,

  exportCsv = false,
  exportFileName = 'table',
  print = false,
  printTitle = 'Table',

  verticalBorders = false,
  horizontalBorders = true,
  outerBorder = false,
  striped = false,
  highlightOnHover = true,
  maxHeight,
  dateFormat = 'MMM D, YYYY',
  size = 'xs',

  pagination = true,
  pageSize: pageSizeProp = 8,
  pageSizeOptions,
  defaultSort,
  onRowClick,
  loading = false,

  noRecordText = 'No records available',
  noRecordTextFiltered = 'No matching records',
  noRecordIcon,
}: CustomTableProps<T>) {
  const [search, setSearch] = useState('')
  const [selectValues, setSelectValues] = useState<Record<string, string[]>>({})
  const [dateRanges, setDateRanges] = useState<Record<string, DateRange>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(pageSizeProp)
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<T>>(() => {
    if (defaultSort === null) return { columnAccessor: '__none__', direction: 'asc' }
    if (defaultSort) {
      return { columnAccessor: defaultSort.accessor, direction: defaultSort.direction }
    }
    return { columnAccessor: columns[0]?.accessor ?? '__none__', direction: 'asc' }
  })
  const [selectedRecords, setSelectedRecords] = useState<T[]>([])
  const [expandedIds, setExpandedIds] = useState<unknown[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const getId = (row: T): unknown => field(row, idAccessor)

  const s = SIZES[size]

  /* ---------- filters ---------- */

  const filterList = useMemo<FilterDef[]>(() => {
    const list: FilterDef[] = []
    const entries = Object.entries(filters ?? {}) as [string, FilterConfig | undefined][]
    for (const [key, cfg] of entries) {
      if (!cfg) continue
      if (cfg === 'date') {
        list.push({ key, type: 'date' })
      } else if (cfg === 'select') {
        const values = [
          ...new Set(data.map((r) => field(r, key)).filter((v) => !isBlank(v)).map(String)),
        ].sort()
        list.push({ key, type: 'select', options: values })
      } else {
        list.push({ key, type: 'select', options: cfg })
      }
    }
    return list
  }, [filters, data])

  const selectActive = (key: string) => (selectValues[key]?.length ?? 0) > 0
  const dateActive = (key: string) => {
    const r = dateRanges[key]
    return !!r && (r[0] !== null || r[1] !== null)
  }
  const isActiveFilter = (f: FilterDef) =>
    f.type === 'date' ? dateActive(f.key) : selectActive(f.key)

  const activeDateFilters = filterList.filter((f) => f.type === 'date' && dateActive(f.key))
  const activeCount = filterList.filter(isActiveFilter).length
  const isFiltered = search.trim() !== '' || activeCount > 0

  const setRange = (key: string, range: DateRange) =>
    setDateRanges((prev) => ({ ...prev, [key]: range }))

  const headerOf = (key: string) => columns.find((c) => c.accessor === key)?.header ?? key

  /* ---------- rows ---------- */

  const records = useMemo(() => {
    const q = search.trim().toLowerCase()
    const keys: string[] = searchKeys ?? columns.map((c) => c.accessor)

    const filtered = data.filter((r) => {
      if (q && !keys.some((k) => String(field(r, k) ?? '').toLowerCase().includes(q))) {
        return false
      }
      for (const f of filterList) {
        const v = field(r, f.key)
        if (f.type === 'select') {
          const sel = selectValues[f.key] ?? []
          if (sel.length && !sel.includes(String(v))) return false
        } else {
          const [from, to] = dateRanges[f.key] ?? [null, null]
          const d = String(v ?? '').slice(0, 10)
          if (from && d < from) return false
          if (to && d > to) return false
        }
      }
      return true
    })

    const sortKey = String(sortStatus.columnAccessor)
    const sortCol = columns.find((c) => c.accessor === sortKey)
    if (!sortCol || sortCol.sortable === false) return filtered

    const sorted = [...filtered].sort((a, b) =>
      String(field(a, sortKey) ?? '').localeCompare(String(field(b, sortKey) ?? ''), undefined, {
        numeric: true,
      })
    )
    return sortStatus.direction === 'asc' ? sorted : sorted.reverse()
  }, [data, columns, search, searchKeys, filterList, selectValues, dateRanges, sortStatus])

  const lastPage = Math.max(1, Math.ceil(records.length / pageSize))
  const pageRecords = pagination
    ? records.slice((page - 1) * pageSize, page * pageSize)
    : records

  // a new search or filter goes back to page 1 and clears the selection,
  // so you never act on rows that are hidden from view
  useEffect(() => {
    setPage(1)
    setSelectedRecords([])
  }, [search, selectValues, dateRanges])

  useEffect(() => {
    setPage(1)
  }, [pageSize])

  // if rows disappear and the current page no longer exists, step back
  useEffect(() => {
    if (page > lastPage) setPage(lastPage)
  }, [page, lastPage])

  // when the parent changes the data (for example after a delete),
  // drop selections and open rows that no longer exist
  useEffect(() => {
    const ids = new Set(data.map((r) => field(r, idAccessor)))
    setSelectedRecords((prev) => {
      const next = prev.filter((r) => ids.has(field(r, idAccessor)))
      return next.length === prev.length ? prev : next
    })
    setExpandedIds((prev) => {
      const next = prev.filter((id) => ids.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [data, idAccessor])

  /* ---------- selection ---------- */

  const selectedIdSet = useMemo(
    () => new Set(selectedRecords.map((r) => field(r, idAccessor))),
    [selectedRecords, idAccessor]
  )
  const allPageSelected =
    pageRecords.length > 0 && pageRecords.every((r) => selectedIdSet.has(getId(r)))
  const canSelectAllMatching = allPageSelected && records.length > selectedRecords.length

  const runDelete = () => {
    onDelete?.(selectedRecords)
    setSelectedRecords([])
    setConfirmOpen(false)
  }

  /* ---------- export / print ---------- */

  const stamp = dayjs().format(ISO)
  const printTargets = selectedRecords.length > 0 ? selectedRecords : records
  const printLabel =
    selectedRecords.length > 0
      ? `Print selected (${selectedRecords.length})`
      : `Print all matching (${records.length})`

  /* ---------- columns ---------- */

  const renderFilter = (f: FilterDef, label: string): ReactNode => {
    if (f.type === 'select') {
      return (
        <MultiSelect
          size="xs"
          label={label}
          placeholder={`Pick ${label.toLowerCase()}`}
          data={f.options}
          value={selectValues[f.key] ?? []}
          onChange={(value) => setSelectValues((prev) => ({ ...prev, [f.key]: value }))}
          clearable
          searchable
          comboboxProps={{ withinPortal: false }}
        />
      )
    }

    const [from, to] = dateRanges[f.key] ?? [null, null]
    const active = dateActive(f.key)

    return (
      <Stack gap="xs">
        <Text size="xs" fw={600}>
          {label}
        </Text>

        <Group gap={6}>
          {presets.map((p) => (
            <Button
              key={p.label}
              size="compact-xs"
              variant="light"
              color="gray"
              onClick={() => setRange(f.key, p.range())}
            >
              {p.label}
            </Button>
          ))}
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <DateInput
            size="xs"
            label="From"
            placeholder="Start date"
            valueFormat="MMM D, YYYY"
            value={from}
            maxDate={to ?? undefined}
            onChange={(value) => setRange(f.key, [value, to])}
            clearable
            w={130}
            popoverProps={{ withinPortal: false }}
          />
          <DateInput
            size="xs"
            label="To"
            placeholder="End date"
            valueFormat="MMM D, YYYY"
            value={to}
            minDate={from ?? undefined}
            onChange={(value) => setRange(f.key, [from, value])}
            clearable
            w={130}
            popoverProps={{ withinPortal: false }}
          />
        </Group>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {active
              ? `${from ? dayjs(from).format('MMM D, YYYY') : '…'} – ${to ? dayjs(to).format('MMM D, YYYY') : '…'}`
              : 'Any date'}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            disabled={!active}
            onClick={() => setRange(f.key, [null, null])}
          >
            Clear
          </Button>
        </Group>
      </Stack>
    )
  }

  const expandColumn: DataTableColumn<T> = {
    accessor: '__expand',
    title: '',
    width: 40,
    render: (row) => {
      const open = expandedIds.includes(getId(row))
      return (
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={open ? 'Collapse row' : 'Expand row'}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation() // keeps the row click from firing
            const id = getId(row)
            setExpandedIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            )
          }}
        >
          <ChevronIcon open={open} />
        </ActionIcon>
      )
    },
  }

  const tableColumns: DataTableColumn<T>[] = [
    ...(collapsible ? [expandColumn] : []),
    ...columns.map((col): DataTableColumn<T> => {
      const f = filterList.find((x) => x.key === col.accessor)
      return {
        accessor: col.accessor,
        title: f ? (
          <FilterTitle label={col.header} active={isActiveFilter(f)}>
            {renderFilter(f, col.header)}
          </FilterTitle>
        ) : (
          col.header
        ),
        sortable: col.sortable ?? true,
        width: col.width,
        textAlign: col.align,
        render: (row) =>
          col.render ? (
            col.render(row)
          ) : (
          <Text size={s.text} className={col.nowrap === false ? undefined : 'whitespace-nowrap'}>
            {cellText(row, col, dateFormat)}
          </Text>
          ),
      }
    }),
  ]

  const defaultExpanded = (row: T) => (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
      {columns.map((col) => (
        <div key={col.accessor}>
          <Text size="xs" c="dimmed">
            {col.header}
          </Text>
          <Text size="xs">{cellText(row, col, dateFormat) || '—'}</Text>
        </div>
      ))}
    </div>
  )

  const selectionProps = selectCheckbox
    ? { selectedRecords, onSelectedRecordsChange: setSelectedRecords }
    : {}

  // cast to the "pagination on" shape so DataTable's props union type-checks;
  // when pagination is off, an empty object is spread at runtime
  const paginationProps = (
    pagination
      ? {
          totalRecords: records.length,
          recordsPerPage: pageSize,
          page,
          onPageChange: setPage,
          ...(pageSizeOptions
            ? { recordsPerPageOptions: pageSizeOptions, onRecordsPerPageChange: setPageSize }
            : {}),
        }
      : {}
  ) as PaginationProps

  const showToolbar = Boolean(
    searchInput || exportCsv || print || activeCount > 0 || toolbarLeft || toolbarRight
  )

  /* ---------- render ---------- */

  return (
    <div className="space-y-3">
      {showToolbar && (
        <Group justify="space-between" align="flex-start" gap="xs">
          <Group gap="xs">
            {searchInput && (
              <TextInput
                size="xs"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                w={240}
              />
            )}

            {toolbarLeft}

            {activeDateFilters.map((f) => {
              const [from, to] = dateRanges[f.key] ?? [null, null]
              return (
                <Badge
                  key={f.key}
                  variant="light"
                  color="gray"
                  radius="sm"
                  size="lg"
                  tt="none"
                  fw={500}
                  pr={4}
                  rightSection={
                    <CloseButton
                      size="xs"
                      aria-label={`Clear ${headerOf(f.key)}`}
                      onClick={() => setRange(f.key, [null, null])}
                    />
                  }
                >
                  {headerOf(f.key)}: {from ? dayjs(from).format('MMM D, YYYY') : '…'} –{' '}
                  {to ? dayjs(to).format('MMM D, YYYY') : '…'}
                </Badge>
              )
            })}

            {activeCount > 0 && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setSelectValues({})
                  setDateRanges({})
                }}
              >
                Clear filters ({activeCount})
              </Button>
            )}
          </Group>

          <Group gap="xs">
            {toolbarRight}

            {exportCsv && (
              <Menu position="bottom-end" shadow="md" width={240}>
                <Menu.Target>
                  <Button
                    size="xs"
                    variant="default"
                    disabled={records.length === 0}
                    leftSection={<AppIcon name="download" />}
                    rightSection={<AppIcon name="chevron-down" />}
                  >
                    Export
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Export as CSV</Menu.Label>
                  {selectCheckbox && selectedRecords.length > 0 && (
                    <Menu.Item
                      leftSection={<AppIcon name="square-check" />}
                      onClick={() =>
                        downloadCsv(selectedRecords, columns, `${exportFileName}-selected-${stamp}.csv`)
                      }
                    >
                      Selected rows ({selectedRecords.length})
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<AppIcon name="table" />}
                    onClick={() => downloadCsv(records, columns, `${exportFileName}-${stamp}.csv`)}
                  >
                    All matching rows ({records.length})
                  </Menu.Item>
                  {pagination && (
                    <Menu.Item
                      leftSection={<AppIcon name="file" />}
                      onClick={() =>
                        downloadCsv(pageRecords, columns, `${exportFileName}-page-${page}-${stamp}.csv`)
                      }
                    >
                      Current page ({pageRecords.length})
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}

            {print && (
              <Tooltip label={printLabel} withArrow>
                <ActionIcon
                  variant="default"
                  size={30}
                  aria-label={printLabel}
                  disabled={printTargets.length === 0}
                  onClick={() => printTable(printTargets, columns, printTitle, dateFormat)}
                >
                  <AppIcon name="printer" />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      )}

      {/* selection bar, only when checkboxes are on and something is selected */}
      {selectCheckbox && selectedRecords.length > 0 && (
        <Group
          justify="space-between"
          className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
        >
          <Group gap="xs">
            <Text size="xs" fw={600}>
              {selectedRecords.length} selected
            </Text>
            {canSelectAllMatching && (
              <Button size="compact-xs" variant="subtle" onClick={() => setSelectedRecords(records)}>
                Select all {records.length} matching rows
              </Button>
            )}
          </Group>
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setSelectedRecords([])}
            >
              Clear selection
            </Button>
            {onDelete && (
              <>
                {/* thin divider so Delete sits apart from Clear selection */}
                <div aria-hidden className="h-4 w-px bg-gray-300" />
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  leftSection={<AppIcon name="trash-2" size={14} />}
                  onClick={() => (confirmModal ? setConfirmOpen(true) : runDelete())}
                >
                  Delete ({selectedRecords.length})
                </Button>
              </>
            )}
          </Group>
        </Group>
      )}

      <DataTable
        fz={s.fz}
        verticalSpacing={s.py}
        horizontalSpacing={s.px}
        striped={striped}
        highlightOnHover={highlightOnHover}
        withTableBorder={outerBorder}
        borderColor="#e9ecef"
        borderRadius="sm"
        withColumnBorders={verticalBorders}
        withRowBorders={horizontalBorders}
        rowBorderColor="#e9ecef"
        noRecordsText={isFiltered ? noRecordTextFiltered : noRecordText}
        noRecordsIcon={noRecordIcon ?? <FolderOpenIcon />}
        minHeight={records.length === 0 ? 200 : undefined}
        maxHeight={maxHeight}
        paginationSize={s.pagination}
        fetching={loading}
        styles={{
          header: {
            color: '#1f2937', // dark, clearly readable
            fontSize: s.head,
            fontWeight: 600,
            backgroundColor: '#fff', // solid, so rows don't show through when the header is sticky
            borderBottom: '1px solid #e9ecef',
          },
        }}
        idAccessor={idAccessor}
        records={pageRecords}
        columns={tableColumns}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        {...selectionProps}
        {...paginationProps}
        rowClassName={
          onRowClick
            ? 'cursor-pointer transition-colors hover:bg-gray-50 active:bg-gray-100'
            : undefined
        }
        onRowClick={onRowClick ? ({ record }) => onRowClick(record) : undefined}
        rowExpansion={
          collapsible
            ? {
                trigger: 'never', // only the chevron button expands a row
                allowMultiple: expandMultiple,
                expanded: {
                  recordIds: expandedIds,
                  onRecordIdsChange: setExpandedIds,
                },
                content: ({ record }) => (
                  <div className="bg-gray-50 px-6 py-3">
                    {renderExpanded ? renderExpanded(record) : defaultExpanded(record)}
                  </div>
                ),
              }
            : undefined
        }
      />

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmHeading === false ? undefined : confirmHeading ?? 'Delete selected rows'}
        centered
        size="sm"
      >
        <Stack gap="md">
          {confirmBody !== false && (
            <Text size="sm">
              {confirmBody ??
                `You're about to delete ${selectedRecords.length} ${
                  selectedRecords.length === 1 ? 'row' : 'rows'
                }. This can't be undone.`}
            </Text>
          )}
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="xs" color="red" onClick={runDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}