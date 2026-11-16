import { AppIcon } from '../../components/appIcon'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ActionIcon, Alert, Badge, Button, Drawer, Menu, Text } from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { StatWidget } from '../../components/statsWidgets'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { DocumentViewer, type ViewableDocument } from '../../components/documentViewer'
import { formatTzs } from '../../utils/format'
import { CURRENT_USER } from './disbursementDialog'
import { RemarksDialog } from '../collections/collectionDialogs'
import { useRoles } from '../administration/roles/rolesContext'
import { STATUS as APPLICATION_STATUS } from './loanApplicationsData'
import { CollateralDocumentDialog } from './collateralDocumentDialog'
import { COLLATERAL_CHECKS, GUARANTOR_CHECKS, VerifyDialog } from './verifyDialogs'
import {
  ASSET_ROWS,
  GUARANTOR_ROWS,
  MAX_GUARANTOR_EXPOSURE,
  type AssetRow,
  type Guaranteed,
  type GuarantorRow,
} from './securitiesData'

const CARD = 'rounded-md bg-white shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

type TabKey = 'assets' | 'guarantors'
type AssetStatus = 'PENDING' | 'HELD' | 'RELEASABLE' | 'RELEASED'
type LiabilityStatus = 'ACTIVE' | 'RELEASABLE' | 'RELEASED'
type Release = { date: string; by: string; remarks: string }

type AssetView = AssetRow & {
  status: AssetStatus
  release: Release | null
  /** the uploaded file name, from the sample data or from this session */
  documentName: string | null
  /** the real file, only for a document uploaded in this session */
  documentFile: File | null
}

type GuaranteeView = Guaranteed & { key: string; liability: LiabilityStatus; release: Release | null }

type GuarantorView = Omit<GuarantorRow, 'guaranteed'> & {
  guaranteed: GuaranteeView[]
  /** live guarantees that are not verified yet */
  unverified: number
  /** liabilities that can be released now */
  releasable: number
}

type DialogKind = 'release' | 'verify' | 'document' | 'verify-guarantee' | 'release-liability'
type DialogState = { kind: DialogKind; id: string } | null
type Notice = { text: string; color: 'green' | 'blue' } | null

const ASSET_STATUS: Record<AssetStatus, { label: string; color: string }> = {
  PENDING: { label: 'Not verified', color: 'gray' },
  HELD: { label: 'Held as security', color: 'blue' },
  RELEASABLE: { label: 'Can be released', color: 'yellow' },
  RELEASED: { label: 'Released', color: 'teal' },
}

const LIABILITY: Record<LiabilityStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Active liability', color: 'blue' },
  RELEASABLE: { label: 'Can be released', color: 'yellow' },
  RELEASED: { label: 'Released', color: 'teal' },
}

const statusOptions = (Object.keys(ASSET_STATUS) as AssetStatus[]).map((s) => ({
  value: s,
  label: ASSET_STATUS[s].label,
}))

const TAB_EMPTY: Record<TabKey, string> = {
  assets: 'No collateral has been recorded yet',
  guarantors: 'No guarantors have been recorded yet',
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

function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge variant="light" color={ASSET_STATUS[status].color} radius="sm" size="sm">
      {ASSET_STATUS[status].label}
    </Badge>
  )
}

/* ---------- collateral drawer ---------- */

type AssetDrawerProps = {
  row: AssetView
  canEdit: boolean
  onRelease: (r: AssetView) => void
  onVerify: (r: AssetView) => void
  onDocument: (r: AssetView) => void
  onViewDocument: (r: AssetView) => void
  onOpenApplication: (r: AssetView) => void
  onOpenLoan: (r: AssetView) => void
}

function AssetDrawerBody({
  row: r,
  canEdit,
  onRelease,
  onVerify,
  onDocument,
  onViewDocument,
  onOpenApplication,
  onOpenLoan,
}: AssetDrawerProps) {
  const share = r.value > 0 ? Math.round((r.loanAmount / r.value) * 100) : 0
  const tiles = [
    { label: 'Estimated value', value: formatTzs(r.value) },
    { label: 'Loan amount', value: formatTzs(r.loanAmount) },
    { label: 'Loan as share of value', value: `${share}%` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        <Text size="xs" c="dimmed">
          {r.applicationNo} · {r.applicantName}
        </Text>
      </div>

      {r.status === 'RELEASABLE' && (
        <div className="rounded-md border border-brand/20 bg-brand-subtle p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Next step</div>
          <p className="mt-1 text-sm text-gray-700">
            {r.releaseReason}, so this asset is no longer needed as security. Release it and hand the papers back to
            the borrower.
          </p>
          <div className="mt-3">
            <Button size="xs" disabled={!canEdit} leftSection={<AppIcon name="undo-2" />} onClick={() => onRelease(r)}>
              Release collateral
            </Button>
            {!canEdit && <p className="mt-2 text-xs text-gray-500">Your role cannot release collateral.</p>}
          </div>
        </div>
      )}

      {r.status === 'RELEASED' && r.release && (
        <Alert color="teal" variant="light" icon={<AppIcon name="circle-check" />}>
          <Text size="sm">
            Released on {dayjs(r.release.date).format('MMM D, YYYY')} by {r.release.by}. "{r.release.remarks}"
          </Text>
        </Alert>
      )}

      {r.status === 'PENDING' && (
        <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm">Ownership and existing pledges have not been verified yet.</Text>
            <Button size="compact-xs" disabled={!canEdit} onClick={() => onVerify(r)}>
              Verify now
            </Button>
          </div>
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
        <SectionTitle>Asset details</SectionTitle>
        <Field label="Type" value={r.type} />
        <Field label="Description" value={r.description} />
        <Field label="Borrower" value={r.applicantName} />
        <Field label="Application" value={r.applicationNo} />
        <Field label="Loan" value={r.loanNo || 'No loan yet'} />
        <Field label="Verification" value={r.verified ? 'Ownership and pledge checked' : 'Not verified'} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <SectionTitle>Document</SectionTitle>
          {r.status !== 'RELEASED' && (
            <Button
              size="compact-xs"
              variant="default"
              disabled={!canEdit}
              leftSection={<AppIcon name="upload" />}
              onClick={() => onDocument(r)}
            >
              {r.documentName ? 'Replace' : 'Upload'}
            </Button>
          )}
        </div>
        {r.documentName ? (
          <div className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
            <AppIcon name="file-text" className="text-gray-400" size={20} />
            <div className="min-w-0 flex-1 truncate text-sm text-gray-800">{r.documentName}</div>
            <Button size="compact-xs" variant="subtle" color="brand" onClick={() => onViewDocument(r)}>
              View
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500">
            No document uploaded
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="default" leftSection={<AppIcon name="external-link" />} onClick={() => onOpenApplication(r)}>
          View application
        </Button>
        {r.loanId !== null && (
          <Button size="xs" variant="default" leftSection={<AppIcon name="hand-coins" />} onClick={() => onOpenLoan(r)}>
            View loan
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- guarantor drawer ---------- */

type GuarantorDrawerProps = {
  row: GuarantorView
  canEdit: boolean
  onVerify: (key: string) => void
  onRelease: (key: string) => void
  onOpenApplication: (id: number) => void
}

function GuarantorDrawerBody({ row: g, canEdit, onVerify, onRelease, onOpenApplication }: GuarantorDrawerProps) {
  const tiles = [
    { label: 'Live exposure', value: formatTzs(g.exposure) },
    { label: 'Live guarantees', value: String(g.liveCount) },
    { label: 'Exposure limit', value: formatTzs(MAX_GUARANTOR_EXPOSURE) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="light" color={g.overLimit ? 'red' : 'green'} radius="sm" size="sm">
          {g.overLimit ? 'Over limit' : 'Within limit'}
        </Badge>
        <Text size="xs" c="dimmed">
          {g.phone}
        </Text>
      </div>

      {g.overLimit && (
        <Alert color="red" variant="light" icon={<AppIcon name="triangle-alert" />}>
          <Text size="sm">
            This guarantor stands behind {formatTzs(g.exposure)} of live loans, which is{' '}
            {formatTzs(g.exposure - MAX_GUARANTOR_EXPOSURE)} over the limit. Be careful before accepting them again.
          </Text>
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
        <SectionTitle>{`Guaranteed loans (${g.guaranteed.length})`}</SectionTitle>
        <p className="mb-2 text-xs text-gray-500">
          Only loans that are still running count toward the exposure. Once a loan is repaid or its application is
          stopped, the liability can be released.
        </p>
        <ul className="space-y-2">
          {g.guaranteed.map((x) => (
            <li key={x.key} className="rounded-md border border-gray-200 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">{x.borrower}</div>
                  <div className="truncate text-xs text-gray-500">
                    {x.applicationNo}
                    {x.loanNo ? ` · ${x.loanNo}` : ''} · {x.relationship} · {formatTzs(x.amount)}
                  </div>
                </div>
                <Badge variant="light" color={APPLICATION_STATUS[x.status].color} radius="sm" size="sm">
                  {APPLICATION_STATUS[x.status].label}
                </Badge>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Open ${x.applicationNo}`} onClick={() => onOpenApplication(x.applicationId)}>
                  <AppIcon name="external-link" />
                </ActionIcon>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                <Badge variant="light" color={LIABILITY[x.liability].color} radius="sm" size="sm">
                  {LIABILITY[x.liability].label}
                </Badge>
                {x.live && (
                  <Badge variant="outline" color={x.verified ? 'green' : 'gray'} radius="sm" size="sm">
                    {x.verified ? 'Verified' : 'Not verified'}
                  </Badge>
                )}
                <div className="ml-auto flex gap-2">
                  {x.live && !x.verified && (
                    <Button size="compact-xs" variant="light" disabled={!canEdit} onClick={() => onVerify(x.key)}>
                      Verify
                    </Button>
                  )}
                  {x.liability === 'RELEASABLE' && (
                    <Button size="compact-xs" disabled={!canEdit} leftSection={<AppIcon name="undo-2" />} onClick={() => onRelease(x.key)}>
                      Release liability
                    </Button>
                  )}
                </div>
              </div>

              {x.release && (
                <Text size="xs" c="dimmed" mt={6}>
                  Released on {dayjs(x.release.date).format('MMM D, YYYY')} by {x.release.by}. "{x.release.remarks}"
                </Text>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export function SecuritiesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = useRoles()
  // releasing, verifying and uploading all need the Edit permission on this page
  const canEdit = can('loans', 'edit', 'securities')

  // UI only: changes made in this session, nothing is saved yet
  const [releases, setReleases] = useState<Record<string, Release>>({})
  const [verifiedAssets, setVerifiedAssets] = useState<string[]>([])
  const [documents, setDocuments] = useState<Record<string, { name: string; file: File }>>({})
  const [verifiedGuarantees, setVerifiedGuarantees] = useState<string[]>([])
  const [liabilityReleases, setLiabilityReleases] = useState<Record<string, Release>>({})
  const [tab, setTab] = useState<TabKey>('assets')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [viewing, setViewing] = useState<ViewableDocument | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  // success banners fade away on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const assets = useMemo<AssetView[]>(
    () =>
      ASSET_ROWS.map((r) => {
        const release = releases[r.id] ?? null
        const verified = r.verified || verifiedAssets.includes(r.id)
        const status: AssetStatus = release ? 'RELEASED' : r.releasable ? 'RELEASABLE' : verified ? 'HELD' : 'PENDING'
        const doc = documents[r.id]
        return { ...r, verified, status, release, documentName: doc?.name ?? r.document, documentFile: doc?.file ?? null }
      }),
    [releases, verifiedAssets, documents],
  )

  const guarantors = useMemo<GuarantorView[]>(
    () =>
      GUARANTOR_ROWS.map((g) => {
        const guaranteed: GuaranteeView[] = g.guaranteed.map((x) => {
          // one liability record per guarantor and application
          const key = `${g.id}|${x.applicationId}`
          const release = liabilityReleases[key] ?? null
          const liability: LiabilityStatus = release ? 'RELEASED' : x.live ? 'ACTIVE' : 'RELEASABLE'
          return { ...x, key, verified: x.verified || verifiedGuarantees.includes(key), liability, release }
        })
        return {
          ...g,
          guaranteed,
          unverified: guaranteed.filter((x) => x.live && !x.verified).length,
          releasable: guaranteed.filter((x) => x.liability === 'RELEASABLE').length,
        }
      }),
    [liabilityReleases, verifiedGuarantees],
  )

  const guarantees = guarantors.flatMap((g) => g.guaranteed.map((x) => ({ g, x })))

  const held = assets.filter((r) => r.status === 'HELD' || r.status === 'PENDING')
  const releasable = assets.filter((r) => r.status === 'RELEASABLE')
  const notVerified = assets.filter((r) => r.status === 'PENDING')
  const overLimit = guarantors.filter((g) => g.overLimit)
  const liabilitiesToRelease = guarantors.reduce((s, g) => s + g.releasable, 0)

  // here `color` is the icon color
  const stats = [
    { label: 'Assets Held', value: held.length, icon: 'shield', color: '#45bdfc' },
    { label: 'Value Held', value: formatTzs(held.reduce((s, r) => s + r.value, 0)), icon: 'banknote', color: '#8e44ad' },
    { label: 'Can Be Released', value: releasable.length, icon: 'undo-2', color: '#e08a1e' },
    { label: 'Not Verified', value: notVerified.length, icon: 'triangle-alert', color: '#0077b5' },
    { label: 'Guarantors Over Limit', value: overLimit.length, icon: 'user-round', color: '#ef4444' },
  ]

  // /collateral-guarantors?asset=3-1 or ?guarantor=joseph-massawe opens that drawer
  const assetParam = params.get('asset')
  const guarantorParam = params.get('guarantor')
  const selectedAsset = assetParam ? (assets.find((r) => r.id === assetParam) ?? null) : null
  const selectedGuarantor = guarantorParam ? (guarantors.find((g) => g.id === guarantorParam) ?? null) : null
  const openAsset = (id: string) => setParams({ asset: id }, { replace: true })
  const openGuarantor = (id: string) => setParams({ guarantor: id }, { replace: true })
  const closeView = () => setParams({}, { replace: true })

  // the drawer buttons close the drawer first, then open the dialog
  const fromDrawer = (kind: DialogKind, id: string) => {
    closeView()
    setDialog({ kind, id })
  }

  const forAsset = (kind: DialogKind) => (dialog?.kind === kind ? assets.find((r) => r.id === dialog.id) : undefined)
  const forGuarantee = (kind: DialogKind) =>
    dialog?.kind === kind ? guarantees.find((e) => e.x.key === dialog.id) : undefined

  const releasing = forAsset('release')?.status === 'RELEASABLE' ? forAsset('release') : undefined
  const verifyingAsset = forAsset('verify')
  const documentAsset = forAsset('document')
  const verifyingGuarantee = forGuarantee('verify-guarantee')
  const releasingLiability = forGuarantee('release-liability')?.x.liability === 'RELEASABLE' ? forGuarantee('release-liability') : undefined

  const today = () => dayjs().format('YYYY-MM-DD')

  /* ---------- actions ---------- */

  const release = (remarks: string) => {
    if (!releasing || !canEdit) return
    // TODO: POST /api/collateral-releases (raw CRUD, there is no workflow endpoint yet)
    //       { collateralId, releasedBy, remarks }
    setReleases((all) => ({ ...all, [releasing.id]: { date: today(), by: CURRENT_USER, remarks } }))
    setNotice({ color: 'green', text: `The ${releasing.type.toLowerCase()} of ${releasing.applicantName} was released.` })
    setDialog(null)
  }

  const verifyAsset = () => {
    if (!verifyingAsset || !canEdit) return
    // TODO: POST /api/loan-origination/applications/{applicationId}/collaterals/{collateralId}/verify
    //       { ownershipVerified, existingPledgeVerified, verifiedBy, remarks }
    setVerifiedAssets((list) => [...list, verifyingAsset.id])
    setNotice({ color: 'green', text: `The ${verifyingAsset.type.toLowerCase()} of ${verifyingAsset.applicantName} was verified.` })
    setDialog(null)
  }

  const saveDocument = (file: File) => {
    if (!documentAsset || !canEdit) return
    setDocuments((all) => ({ ...all, [documentAsset.id]: { name: file.name, file } }))
    setNotice({
      color: 'green',
      text: `${documentAsset.documentName ? 'The document was replaced' : 'The document was uploaded'} for the ${documentAsset.type.toLowerCase()} of ${documentAsset.applicantName}.`,
    })
    setDialog(null)
  }

  const verifyGuarantee = () => {
    if (!verifyingGuarantee || !canEdit) return
    // TODO: POST /api/loan-origination/applications/{applicationId}/guarantors/{guarantorId}/verify
    //       { idVerified, exposureVerified, verifiedBy, remarks }
    setVerifiedGuarantees((list) => [...list, verifyingGuarantee.x.key])
    setNotice({ color: 'green', text: `${verifyingGuarantee.g.name} was verified for ${verifyingGuarantee.x.borrower}.` })
    setDialog(null)
  }

  const releaseLiability = (remarks: string) => {
    if (!releasingLiability || !canEdit) return
    // TODO: POST /api/guarantor-liabilities (raw CRUD, no workflow endpoint yet)
    //       { guarantorId, applicationId, releasedBy, remarks }
    setLiabilityReleases((all) => ({ ...all, [releasingLiability.x.key]: { date: today(), by: CURRENT_USER, remarks } }))
    setNotice({
      color: 'green',
      text: `${releasingLiability.g.name} is no longer liable for ${releasingLiability.x.borrower}'s loan.`,
    })
    setDialog(null)
  }

  const viewDocument = (r: AssetView) => {
    if (!r.documentName) return
    setViewing({
      title: `${r.type} document`,
      fileName: r.documentName,
      subtitle: `${r.applicantName} · ${r.applicationNo}`,
      notes: r.description,
      file: r.documentFile,
    })
  }

  /* ---------- columns ---------- */

  const assetColumns: CustomTableColumn<AssetView>[] = [
    {
      accessor: 'type',
      header: 'Asset',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{r.type}</div>
          <div className="max-w-[260px] truncate text-xs text-gray-500">{r.description}</div>
        </div>
      ),
      exportValue: (r) => `${r.type} (${r.description})`,
    },
    {
      accessor: 'applicantName',
      header: 'Borrower',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-800">{r.applicantName}</div>
          <div className="truncate text-xs text-gray-500">{r.applicationNo}</div>
        </div>
      ),
      exportValue: (r) => `${r.applicationNo} (${r.applicantName})`,
    },
    {
      accessor: 'value',
      header: 'Value',
      render: (r) => <span className="whitespace-nowrap text-sm font-medium text-gray-800">{formatTzs(r.value)}</span>,
      exportValue: (r) => r.value,
    },
    {
      accessor: 'loanNo',
      header: 'Loan',
      render: (r) =>
        r.loanNo ? (
          <div>
            <div className="text-sm text-gray-800">{r.loanNo}</div>
            <div className="text-xs text-gray-500">{r.loanState === 'CLOSED' ? 'Fully repaid' : 'Running'}</div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">No loan yet</span>
        ),
      exportValue: (r) => r.loanNo,
    },
    {
      accessor: 'status',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <div>
          <StatusBadge status={r.status} />
          <div className="mt-0.5 text-[11px] text-gray-500">{r.documentName ? 'Document on file' : 'No document'}</div>
        </div>
      ),
      exportValue: (r) => ASSET_STATUS[r.status].label,
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
          <Menu position="bottom-end" shadow="md" width={240}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${r.type} of ${r.applicantName}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {r.status === 'RELEASABLE' && (
                <>
                  <Menu.Item
                    fw={500}
                    disabled={!canEdit}
                    leftSection={<AppIcon name="undo-2" />}
                    onClick={() => setDialog({ kind: 'release', id: r.id })}
                  >
                    {canEdit ? 'Release collateral' : 'Release (no permission)'}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              {r.status === 'PENDING' && (
                <>
                  <Menu.Item
                    fw={500}
                    disabled={!canEdit}
                    leftSection={<AppIcon name="circle-check" />}
                    onClick={() => setDialog({ kind: 'verify', id: r.id })}
                  >
                    {canEdit ? 'Verify collateral' : 'Verify (no permission)'}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => openAsset(r.id)}>
                View details
              </Menu.Item>
              {r.documentName && (
                <Menu.Item leftSection={<AppIcon name="file-text" />} onClick={() => viewDocument(r)}>
                  View document
                </Menu.Item>
              )}
              {r.status !== 'RELEASED' && (
                <Menu.Item
                  disabled={!canEdit}
                  leftSection={<AppIcon name="upload" />}
                  onClick={() => setDialog({ kind: 'document', id: r.id })}
                >
                  {r.documentName ? 'Replace document' : 'Upload document'}
                </Menu.Item>
              )}
              <Menu.Item leftSection={<AppIcon name="external-link" />} onClick={() => navigate(`/loan-applications/${r.applicationId}`)}>
                View application
              </Menu.Item>
              {r.loanId !== null && (
                <Menu.Item leftSection={<AppIcon name="hand-coins" />} onClick={() => navigate(`/loans/${r.loanId}`)}>
                  View loan
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  const guarantorColumns: CustomTableColumn<GuarantorView>[] = [
    {
      accessor: 'name',
      header: 'Guarantor',
      render: (g) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800">{g.name}</div>
          <div className="truncate text-xs text-gray-500">{g.phone}</div>
        </div>
      ),
      exportValue: (g) => `${g.name} (${g.phone})`,
    },
    {
      accessor: 'liveCount',
      header: 'Guarantees',
      render: (g) => (
        <div>
          <div className="text-sm text-gray-800">
            {g.liveCount} live of {g.guaranteed.length}
          </div>
          <div className="max-w-[260px] truncate text-xs text-gray-500">
            {g.releasable > 0
              ? `${g.releasable} to release`
              : g.guaranteed.map((x) => x.borrower).join(', ')}
          </div>
        </div>
      ),
      exportValue: (g) => g.liveCount,
    },
    {
      accessor: 'exposure',
      header: 'Live exposure',
      render: (g) => (
        <div>
          <div className={`whitespace-nowrap text-sm font-medium ${g.overLimit ? 'text-red-600' : 'text-gray-800'}`}>
            {formatTzs(g.exposure)}
          </div>
          <div className="whitespace-nowrap text-xs text-gray-500">Limit {formatTzs(MAX_GUARANTOR_EXPOSURE)}</div>
        </div>
      ),
      exportValue: (g) => g.exposure,
    },
    {
      accessor: 'unverified',
      header: 'Verification',
      sortable: false,
      render: (g) => (
        <Badge variant="light" color={g.unverified > 0 ? 'yellow' : 'green'} radius="sm" size="sm">
          {g.unverified > 0 ? `${g.unverified} not verified` : 'All verified'}
        </Badge>
      ),
      exportValue: (g) => (g.unverified > 0 ? `${g.unverified} not verified` : 'All verified'),
    },
    {
      accessor: 'overLimit',
      header: 'Status',
      sortable: false,
      render: (g) => (
        <Badge variant="light" color={g.overLimit ? 'red' : 'green'} radius="sm" size="sm">
          {g.overLimit ? 'Over limit' : 'Within limit'}
        </Badge>
      ),
      exportValue: (g) => (g.overLimit ? 'Over limit' : 'Within limit'),
    },
    {
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      align: 'right',
      width: 80,
      render: (g) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Menu position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${g.name}`}>
                <AppIcon name="ellipsis-vertical" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<AppIcon name="eye" />} onClick={() => openGuarantor(g.id)}>
                View details
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout
      title="Collateral & Guarantors"
      subtitle="The security behind each loan: assets held and what each guarantor stands behind"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Loans' }, { label: 'Collateral & Guarantors' }]}
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

        {releasable.length > 0 && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {releasable.length} {releasable.length === 1 ? 'asset can' : 'assets can'} be released. Their loans are
                fully repaid or their applications were stopped.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => setTab('assets')}>
                Show them
              </Button>
            </div>
          </Alert>
        )}

        {liabilitiesToRelease > 0 && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm">
                {liabilitiesToRelease} guarantor {liabilitiesToRelease === 1 ? 'liability can' : 'liabilities can'} be
                released. The loan is repaid or the application was stopped.
              </Text>
              <Button size="compact-xs" variant="default" onClick={() => setTab('guarantors')}>
                Show them
              </Button>
            </div>
          </Alert>
        )}

        {/* row 1: key numbers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((s) => (
            <StatWidget key={s.label} {...s} />
          ))}
        </div>

        {/* row 2: table in a plain card */}
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CustomTabs
              ariaLabel="Collateral tabs"
              className="w-fit p-0"
              value={tab}
              onChange={(value) => setTab(value as TabKey)}
              tabs={[
                { value: 'assets', label: `Collateral (${assets.length})` },
                { value: 'guarantors', label: `Guarantors (${guarantors.length})` },
              ]}
            />
            <Text size="xs" c="dimmed">
              {tab === 'assets'
                ? 'Release an asset once its loan is repaid'
                : `A guarantor above ${formatTzs(MAX_GUARANTOR_EXPOSURE)} is flagged`}
            </Text>
          </div>

          {tab === 'assets' ? (
            <CustomTable<AssetView>
              size="md"
              data={assets}
              columns={assetColumns}
              searchInput
              searchPlaceholder="Search borrower, asset or loan"
              searchKeys={['applicantName', 'applicationNo', 'type', 'description', 'loanNo']}
              filters={{ type: 'select', status: statusOptions }}
              // the most valuable first
              defaultSort={{ accessor: 'value', direction: 'desc' }}
              noRecordText={TAB_EMPTY.assets}
              onRowClick={(row) => openAsset(row.id)}
              exportCsv
              exportFileName="collateral"
              print
              printTitle="Collateral"
            />
          ) : (
            <CustomTable<GuarantorView>
              size="md"
              data={guarantors}
              columns={guarantorColumns}
              searchInput
              searchPlaceholder="Search guarantor or borrower"
              searchKeys={['name', 'phone']}
              // the highest exposure first
              defaultSort={{ accessor: 'exposure', direction: 'desc' }}
              noRecordText={TAB_EMPTY.guarantors}
              onRowClick={(row) => openGuarantor(row.id)}
              exportCsv
              exportFileName="guarantors"
              print
              printTitle="Guarantors"
            />
          )}
        </div>
      </div>

      {/* collateral drawer */}
      <Drawer opened={!!selectedAsset} onClose={closeView} position="right" size="lg" title={selectedAsset ? `${selectedAsset.type} · ${selectedAsset.applicantName}` : ''}>
        {selectedAsset && (
          <AssetDrawerBody
            row={selectedAsset}
            canEdit={canEdit}
            onRelease={(r) => fromDrawer('release', r.id)}
            onVerify={(r) => fromDrawer('verify', r.id)}
            onDocument={(r) => fromDrawer('document', r.id)}
            onViewDocument={viewDocument}
            onOpenApplication={(r) => navigate(`/loan-applications/${r.applicationId}`)}
            onOpenLoan={(r) => navigate(`/loans/${r.loanId}`)}
          />
        )}
      </Drawer>

      {/* guarantor drawer */}
      <Drawer opened={!!selectedGuarantor} onClose={closeView} position="right" size="lg" title={selectedGuarantor?.name ?? ''}>
        {selectedGuarantor && (
          <GuarantorDrawerBody
            row={selectedGuarantor}
            canEdit={canEdit}
            onVerify={(key) => fromDrawer('verify-guarantee', key)}
            onRelease={(key) => fromDrawer('release-liability', key)}
            onOpenApplication={(id) => navigate(`/loan-applications/${id}`)}
          />
        )}
      </Drawer>

      <RemarksDialog
        opened={!!releasing}
        title="Release collateral"
        message={`Release the ${releasing?.type.toLowerCase() ?? 'asset'} of ${releasing?.applicantName ?? 'the borrower'}? It is no longer held as security and the papers go back to the borrower. This cannot be undone.`}
        confirmLabel="Release"
        placeholder="Loan fully repaid, title deed handed back"
        onClose={() => setDialog(null)}
        onSubmit={release}
      />

      <RemarksDialog
        opened={!!releasingLiability}
        title="Release guarantor liability"
        message={`Release ${releasingLiability?.g.name ?? 'the guarantor'} from the loan of ${releasingLiability?.x.borrower ?? 'the borrower'}? They no longer stand behind it. This cannot be undone.`}
        confirmLabel="Release liability"
        placeholder="Loan fully repaid, guarantor informed"
        onClose={() => setDialog(null)}
        onSubmit={releaseLiability}
      />

      <VerifyDialog
        opened={!!verifyingAsset}
        title="Verify collateral"
        subject={verifyingAsset ? `${verifyingAsset.type}: ${verifyingAsset.description}` : ''}
        checks={COLLATERAL_CHECKS}
        onClose={() => setDialog(null)}
        onVerified={verifyAsset}
      />

      <VerifyDialog
        opened={!!verifyingGuarantee}
        title="Verify guarantor"
        subject={verifyingGuarantee ? `${verifyingGuarantee.g.name} (${verifyingGuarantee.x.relationship}) for ${verifyingGuarantee.x.borrower}` : ''}
        checks={GUARANTOR_CHECKS}
        onClose={() => setDialog(null)}
        onVerified={verifyGuarantee}
      />

      <CollateralDocumentDialog
        opened={!!documentAsset}
        subject={documentAsset ? `${documentAsset.type}: ${documentAsset.description}` : ''}
        current={documentAsset?.documentName ?? null}
        onClose={() => setDialog(null)}
        onSubmit={saveDocument}
      />

      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </DashboardLayout>
  )
}