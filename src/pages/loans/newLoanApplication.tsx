import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  FileInput,
  Group,
  NumberInput,
  Progress,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { formatTzs } from '../../utils/format'
import { STATUS as APPLICANT_STATUS } from '../applicants/applicantsData'
import { useApplicants } from '../../api/applicants'
import { toUser, useApiRoles, useApiUsers } from '../../api/users'
import { useAuth } from '../../auth/authContext'
import {
  afterSubmit,
  estimateInstallment,
  inForm,
  methodLabel,
  STATUS as LOAN_STATUS,
  totalRepayable,
  type FlowStep,
  type InterestMethod,
  type LoanApplication,
} from './loanApplicationsData'
import { LoanCalculatorDrawer } from './loanCalculatorDrawer'
import { useExistingDebts, useFinancialProfile, useSaveFinancialProfile } from '../../api/applicantRecords'
import { ContractConfirmDialog } from './contractDialogs'
import {
  deleteCollateral,
  deleteGuarantor,
  deleteLoanApplication,
  finalizeLoanApplication,
  getDraftCollaterals,
  getDraftGuarantors,
  saveCollateral,
  saveCollateralDocument,
  saveGuarantor,
  saveLoanProgress,
  startLoanApplication,
  useLatestLoanApplication,
  verifyCollateral,
  verifyGuarantor,
  runCreditAssessment,
  useUnfinishedLoans,
  type CreditAssessmentResult,
  type LoanDraft,
  type ProgressBody,
  type SavedCollateral,
  type SavedGuarantor,
} from '../../api/loanApplications'
import { useQuery } from '@tanstack/react-query'
import { AppIcon, stepIcon } from '../../components/appIcon'
/* ---------- types ---------- */

// each guarantor and asset has its own id so the forms keep their state when one is removed
type GuarantorItem = {
  uid: number
  name: string
  phone: string
  relationship: string
  idNumber: string
  /** saved as guarantor.address */
  address: string
  idVerified: boolean
  exposureVerified: boolean
  /** the guarantor's id on the server, null until it is first saved */
  serverId: number | null
  /** what was last saved, so an unchanged card is not sent again */
  savedSig: string
  savedCheckSig: string
}

type CollateralItem = {
  uid: number
  type: string
  description: string
  value: number | ''
  ownershipVerified: boolean
  pledgeVerified: boolean
  document: File | null
  /** optional, saved as collateral_document.document_number, e.g. the title deed number */
  documentNumber: string
  /** optional, sent as remarks with the verify call */
  remarks: string
  /** the asset's id on the server, null until it is first saved */
  serverId: number | null
  /** its collateral_document record, null until one is saved */
  docServerId: number | null
  /** the file saved earlier: only its name and path are on the server, not the file */
  savedFileName: string
  savedFilePath: string
  /** what was last saved, so an unchanged card is not sent again */
  savedSig: string
  savedDocSig: string
  savedCheckSig: string
}

type ItemErrors = Record<number, Record<string, string>>

type FormValues = {
  // applicant
  applicantId: string
  loanOfficerId: string
  // loan details
  requestedAmount: number | ''
  interestMethod: InterestMethod
  interestRate: number | ''
  tenure: number | ''
  penaltyRate: number | ''
  // approval checks
  guarantorRequired: boolean
  collateralRequired: boolean
  creditAssessmentRequired: boolean
  // guarantors and collateral
  guarantors: GuarantorItem[]
  collaterals: CollateralItem[]
  // credit assessment
  monthlyIncome: number | ''
  monthlyExpenses: number | ''
  creditNotes: string
  /** sent to the credit assessment: the applicant has unpaid loans or overdue payments */
  hasPendingPayments: boolean
}

type StringKey = {
  [K in keyof FormValues]: FormValues[K] extends string ? K : never
}[keyof FormValues]

type NumberKey =
  | 'requestedAmount'
  | 'interestRate'
  | 'tenure'
  | 'penaltyRate'
  | 'monthlyIncome'
  | 'monthlyExpenses'

type Errors = Partial<Record<keyof FormValues, string>>

type StepId = 'applicant' | 'details' | 'guarantor' | 'collateral' | 'credit' | 'review'

// what the credit assessment answered after submit, or why it could not run
type CreditOutcome = { result: CreditAssessmentResult | null; error: string | null }

type Outcome = 'SUBMITTED' | 'CREDIT_APPROVED' | 'REJECTED'

/* ---------- constants ---------- */

// the roles whose users can handle a loan application (the role names on the Roles page)
const OFFICER_ROLES = ['admin', 'loan officer']

const COLLATERAL_TYPES = ['Land', 'House', 'Vehicle', 'Equipment', 'Other']
// these need a copy of the title deed
const DEED_TYPES = ['Land', 'House']

// the guarantor limit is a business rule in this form, the API doesn't set one
const MIN_GUARANTORS = 1
const MAX_GUARANTORS = 3

const PHONE = /^0\d{9}$/

// the stage name saved on the draft for each step (see PUT /api/loan-applications/{id}/progress)
const STAGE: Record<StepId, string> = {
  applicant: 'APPLICANT',
  details: 'LOAN_DETAILS',
  guarantor: 'GUARANTOR',
  collateral: 'COLLATERAL',
  credit: 'CREDIT_ASSESSMENT',
  review: 'SUBMITTED',
}

const STEP_LABEL: Record<StepId, string> = {
  applicant: 'Applicant',
  details: 'Loan details',
  guarantor: 'Guarantors',
  collateral: 'Collateral',
  credit: 'Credit assessment',
  review: 'Review & Submit',
}

// the icon shown on each step node
const STEP_ICON: Record<StepId, string> = {
  applicant: 'contact-round',
  // the same icon as Loans in the sidebar
  details: 'hand-coins',
  guarantor: 'user-round',
  collateral: 'shield',
  credit: 'calculator',
  review: 'file-check',
}

let nextUid = 1
const newGuarantor = (): GuarantorItem => ({
  uid: nextUid++,
  name: '',
  phone: '',
  relationship: '',
  idNumber: '',
  address: '',
  idVerified: false,
  exposureVerified: false,
  serverId: null,
  savedSig: '',
  savedCheckSig: checkSigOfGuarantor({ idVerified: false, exposureVerified: false }),
})

const newCollateral = (): CollateralItem => ({
  uid: nextUid++,
  type: '',
  description: '',
  value: '',
  ownershipVerified: false,
  pledgeVerified: false,
  document: null,
  documentNumber: '',
  remarks: '',
  serverId: null,
  docServerId: null,
  savedFileName: '',
  savedFilePath: '',
  savedSig: '',
  savedDocSig: docSigOf({ documentNumber: '', document: null, savedFileName: '' }),
  savedCheckSig: checkSigOfCollateral({ ownershipVerified: false, pledgeVerified: false, remarks: '' }),
})

/* ---------- what is saved for each card (compared with what was saved last time) ---------- */

function sigOfGuarantor(g: Pick<GuarantorItem, 'name' | 'phone' | 'idNumber' | 'address'>) {
  return JSON.stringify([g.name.trim(), g.phone.trim(), g.idNumber.trim(), g.address.trim()])
}
function checkSigOfGuarantor(g: Pick<GuarantorItem, 'idVerified' | 'exposureVerified'>) {
  return JSON.stringify([g.idVerified, g.exposureVerified])
}
function sigOfCollateral(c: Pick<CollateralItem, 'type' | 'description' | 'value'>) {
  return JSON.stringify([c.type, c.description.trim(), c.value])
}
function docSigOf(c: Pick<CollateralItem, 'documentNumber' | 'document' | 'savedFileName'>) {
  return JSON.stringify([c.documentNumber.trim(), c.document?.name ?? c.savedFileName])
}
function checkSigOfCollateral(c: Pick<CollateralItem, 'ownershipVerified' | 'pledgeVerified' | 'remarks'>) {
  return JSON.stringify([c.ownershipVerified, c.pledgeVerified, c.remarks.trim()])
}

// saved records -> cards; an empty list keeps one blank card so the step is never empty
function guarantorsFromServer(list: SavedGuarantor[]): GuarantorItem[] {
  if (list.length === 0) return [newGuarantor()]
  return list.map((s) => {
    const g = {
      ...newGuarantor(),
      name: s.fullName,
      phone: s.phone,
      idNumber: s.idNumber,
      address: s.address,
      idVerified: s.idVerified,
      exposureVerified: s.exposureVerified,
      serverId: s.id,
    }
    return { ...g, savedSig: sigOfGuarantor(g), savedCheckSig: checkSigOfGuarantor(g) }
  })
}

function collateralsFromServer(list: SavedCollateral[]): CollateralItem[] {
  if (list.length === 0) return [newCollateral()]
  return list.map((s) => {
    const c: CollateralItem = {
      ...newCollateral(),
      type: COLLATERAL_TYPES.includes(s.collateralType) ? s.collateralType : s.collateralType ? 'Other' : '',
      description: s.description,
      value: s.estimatedValue ?? '',
      ownershipVerified: s.ownershipVerified,
      pledgeVerified: s.existingPledgeVerified,
      remarks: s.remarks,
      documentNumber: s.documentNumber,
      serverId: s.id,
      docServerId: s.documentId,
      savedFileName: s.documentFileName,
      savedFilePath: s.documentPath,
    }
    return { ...c, savedSig: sigOfCollateral(c), savedDocSig: docSigOf(c), savedCheckSig: checkSigOfCollateral(c) }
  })
}

const emptyValues = (): FormValues => ({
  applicantId: '',
  loanOfficerId: '',
  requestedAmount: '',
  interestMethod: 'REDUCING',
  interestRate: 24,
  tenure: 12,
  penaltyRate: 2,
  guarantorRequired: false,
  collateralRequired: false,
  creditAssessmentRequired: true,
  guarantors: [newGuarantor()],
  collaterals: [newCollateral()],
  monthlyIncome: '',
  monthlyExpenses: '',
  creditNotes: '',
  hasPendingPayments: false,
})

const guarantorVerified = (g: GuarantorItem) => g.idVerified && g.exposureVerified
const collateralVerified = (c: CollateralItem) => c.ownershipVerified && c.pledgeVerified


// guarantor, collateral and credit steps only exist when the application needs them
const stepsFor = (v: FormValues): StepId[] => [
  'applicant',
  'details',
  ...(v.guarantorRequired ? (['guarantor'] as StepId[]) : []),
  ...(v.collateralRequired ? (['collateral'] as StepId[]) : []),
  ...(v.creditAssessmentRequired ? (['credit'] as StepId[]) : []),
  'review',
]

// a draft saved on the server -> the form. Only the application's own fields are stored there;
// guarantors, collateral and the credit figures are separate records, connected in their own steps.
const fromDraft = (d: LoanDraft): FormValues => {
  const base = emptyValues()
  return {
    ...base,
    applicantId: String(d.applicantId),
    loanOfficerId: d.loanOfficerId ? String(d.loanOfficerId) : '',
    requestedAmount: d.requestedAmount ?? '',
    interestMethod: d.interestMethod ?? base.interestMethod,
    interestRate: d.interestRate ?? base.interestRate,
    tenure: d.tenure ?? base.tenure,
    penaltyRate: d.penaltyRate ?? base.penaltyRate,
    guarantorRequired: d.guarantorRequired,
    collateralRequired: d.collateralRequired,
    creditAssessmentRequired: d.creditAssessmentRequired,
  }
}

// the step a saved stage reopens on; an unknown stage starts at Loan details, after the applicant
const stepForStage = (stage: string, steps: StepId[]) => {
  const index = steps.findIndex((s) => STAGE[s] === stage)
  return index >= 0 ? index : 1
}

// the step label for a saved stage, for the "you have a saved draft" note
const stageLabel = (stage: string) => {
  const step = (Object.keys(STAGE) as StepId[]).find((s) => STAGE[s] === stage)
  return step ? STEP_LABEL[step] : stage.replace(/_/g, ' ').toLowerCase()
}

// what /progress saves for a step: the stage plus every field the form already has a value for
const progressBody = (v: FormValues, stage: StepId): ProgressBody => {
  const body: ProgressBody = {
    currentStage: STAGE[stage],
    interestMethod: v.interestMethod,
    guarantorRequired: v.guarantorRequired,
    collateralRequired: v.collateralRequired,
    creditAssessmentRequired: v.creditAssessmentRequired,
  }
  if (v.loanOfficerId) body.loanOfficerId = Number(v.loanOfficerId)
  if (v.requestedAmount !== '') body.requestedAmount = v.requestedAmount
  if (v.interestRate !== '') body.interestRate = v.interestRate
  if (v.tenure !== '') body.tenure = v.tenure
  if (v.penaltyRate !== '') body.penaltyRate = v.penaltyRate
  return body
}

const CARD = 'rounded-md bg-white p-6 shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

/* ---------- a dropdown that loads its options from the API ---------- */

type LoadedSelectProps = {
  label: string
  description: string
  placeholder: string
  /** shown when the list loaded but has nothing to pick */
  emptyText: string
  /** what is being loaded, for the error message, e.g. "applicants" */
  what: string
  loading: boolean
  error: Error | null
  onRetry: () => void
  data: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  fieldError?: string
  /** shown but not changeable, with this note as the description */
  lockedNote?: string
}

// a skeleton while the list loads (slow network), a clear message when it is empty, a retry when it failed
function LoadedSelect(p: LoadedSelectProps) {
  if (p.loading) {
    return (
      <div aria-busy="true" aria-label={`Loading ${p.what}`}>
        <Text size="sm" fw={500}>
          {p.label}
        </Text>
        <Text size="xs" c="dimmed" mb={5}>
          {p.description}
        </Text>
        <Skeleton height={36} radius="sm" />
      </div>
    )
  }

  if (p.error) {
    return (
      <div>
        <Text size="sm" fw={500}>
          {p.label}
        </Text>
        <Text size="xs" c="dimmed" mb={5}>
          {p.description}
        </Text>
        <div className="flex items-center justify-between gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2">
          <Text size="xs" c="red">
            Could not load the {p.what}. {p.error.message}
          </Text>
          <Button type="button" size="compact-xs" variant="light" color="red" onClick={p.onRetry}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const empty = p.data.length === 0
  return (
    <Select
      label={p.label}
      description={p.lockedNote ?? p.description}
      placeholder={empty ? p.emptyText : p.placeholder}
      size="sm"
      searchable
      disabled={empty || !!p.lockedNote}
      nothingFoundMessage="No match for that search"
      data={p.data}
      allowDeselect={false}
      value={p.value || null}
      onChange={(v) => p.onChange(v ?? '')}
      error={p.fieldError}
    />
  )
}

/* ---------- the tracker: what has been filled so far, like the applicant registration wizard ---------- */

type SummaryState = 'saved' | 'current' | 'unsaved' | 'empty'

const SUMMARY_BADGE: Record<SummaryState, { label: string; color: string }> = {
  saved: { label: 'Saved as draft', color: 'green' },
  current: { label: 'In progress', color: 'blue' },
  unsaved: { label: 'Not saved yet', color: 'yellow' },
  empty: { label: 'Not started', color: 'gray' },
}

type ApplicationSummaryProps = {
  values: FormValues
  steps: StepId[]
  active: number
  submitted: boolean
  applicantName: string
  applicantNo: string
  officerName: string
  installment: number
  /** the earlier steps can be opened again */
  canEdit: boolean
  onEdit: (step: number) => void
}

function ApplicationSummary({
  values: v,
  steps,
  active,
  submitted,
  applicantName,
  applicantNo,
  officerName,
  installment,
  canEdit,
  onEdit,
}: ApplicationSummaryProps) {
  const shown = (value: string) => value.trim() || '—'
  const money = (value: number | '') => (value === '' ? '—' : formatTzs(value))
  const percent = (value: number | '') => (value === '' ? '—' : `${value}%`)
  const yesNo = (value: boolean) => (value ? 'Required' : 'Not required')

  // what each step shows; Review is the last step and repeats everything, so it has no section of its own
  const itemsFor = (step: StepId): [string, string][] => {
    switch (step) {
      case 'applicant':
        return [
          ['Applicant', shown(applicantName)],
          ['Applicant no.', shown(applicantNo)],
          ['Loan officer', shown(officerName)],
        ]
      case 'details':
        return [
          ['Requested amount', money(v.requestedAmount)],
          ['Interest method', methodLabel(v.interestMethod)],
          ['Interest rate', percent(v.interestRate)],
          ['Tenure', v.tenure === '' ? '—' : `${v.tenure} months`],
          ['Penalty rate', percent(v.penaltyRate)],
          ['Est. monthly installment', installment > 0 ? formatTzs(installment) : '—'],
          // the approval checks are part of this step
          ['Guarantor', yesNo(v.guarantorRequired)],
          ['Collateral', yesNo(v.collateralRequired)],
          ['Credit assessment', yesNo(v.creditAssessmentRequired)],
        ]
      case 'guarantor':
        return v.guarantors.map((g, i) => [
          `Guarantor ${i + 1}`,
          g.name.trim() ? `${g.name.trim()}${guarantorVerified(g) ? ' · verified' : ''}` : '—',
        ])
      case 'collateral':
        return v.collaterals.map((c, i) => [
          `Asset ${i + 1}`,
          c.type ? `${c.type}${c.value !== '' ? ` · ${formatTzs(c.value)}` : ''}${collateralVerified(c) ? ' · verified' : ''}` : '—',
        ])
      case 'credit':
        return [
          ['Monthly income', money(v.monthlyIncome)],
          ['Monthly expenses', money(v.monthlyExpenses)],
          [
            'Cash flow',
            v.monthlyIncome !== '' && v.monthlyExpenses !== '' ? formatTzs(v.monthlyIncome - v.monthlyExpenses) : '—',
          ],
          ['Pending payments', v.hasPendingPayments ? 'Yes' : '—'],
          // the system decides when the application is submitted
          ['Decision', submitted ? 'See the result' : 'On submit'],
        ]
      default:
        return []
    }
  }

  // a section counts as filled once any of its values is not the placeholder
  const filled = (step: StepId) =>
    itemsFor(step).some(([label, value]) => value !== '—' && label !== 'Decision')

  const sections = steps
    .map((id, index) => ({ id, index }))
    .filter((s) => s.id !== 'review')
    .map((s) => ({
      ...s,
      state: (submitted || s.index < active
        ? 'saved'
        : s.index === active
          ? 'current'
          : filled(s.id)
            ? 'unsaved'
            : 'empty') as SummaryState,
    }))

  const total = steps.length - 1 // Review is not counted, submitting finishes it
  const done = submitted ? total : Math.min(active, total)

  return (
    <div className="rounded-md bg-white p-4 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
      <div className="min-w-0">
        <Text size="sm" fw={600}>
          Application summary
        </Text>
        <Text size="xs" c="dimmed">
          {applicantName ? `${applicantName}${applicantNo ? ` · ${applicantNo}` : ''}` : 'No applicant chosen yet'}
        </Text>
      </div>

      <div className="mt-3">
        <Progress value={total > 0 ? (done / total) * 100 : 0} size="xs" radius="xl" color="brand" />
        <div className="mt-1 text-[11px] text-gray-500">
          {done} of {total} steps done
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {sections.map((s) => (
          <section
            key={s.id}
            className={`rounded-md border px-3 py-2.5 ${
              !submitted && s.index === active ? 'border-brand ring-1 ring-brand' : 'border-gray-200'
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <AppIcon name={STEP_ICON[s.id]} size={14} className="shrink-0 text-gray-400" />
                <span className="truncate text-xs font-semibold text-gray-800">{STEP_LABEL[s.id]}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="light" color={SUMMARY_BADGE[s.state].color} radius="sm" size="xs" tt="none">
                  {SUMMARY_BADGE[s.state].label}
                </Badge>
                {canEdit && s.index < active && (
                  <Button size="compact-xs" variant="subtle" onClick={() => onEdit(s.index)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>

            <dl className="space-y-1">
              {itemsFor(s.id).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-xs">
                  <dt className="shrink-0 text-gray-500">{label}</dt>
                  <dd className={`min-w-0 break-words text-right ${value === '—' ? 'text-gray-300' : 'text-gray-800'}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Each step is saved as a draft when you click Save &amp; continue, so you can come back and finish later.
      </p>
    </div>
  )
}

/* ---------- validation ---------- */

function validate(step: StepId, v: FormValues): Errors {
  const e: Errors = {}
  const need = (key: StringKey, message: string) => {
    if (!v[key].trim()) e[key] = message
  }

  if (step === 'applicant') {
    need('applicantId', 'Select an applicant')
    need('loanOfficerId', 'Select the loan officer handling this application')
  }

  // the figures sent to the credit assessment when the application is submitted
  if (step === 'credit') {
    if (v.monthlyIncome === '' || v.monthlyIncome <= 0) e.monthlyIncome = 'Enter the monthly income'
    if (v.monthlyExpenses === '' || v.monthlyExpenses < 0) e.monthlyExpenses = 'Enter the monthly expenses'
  }

  if (step === 'details') {
    if (v.requestedAmount === '' || v.requestedAmount <= 0) e.requestedAmount = 'Amount must be greater than zero'
    if (v.interestRate === '') e.interestRate = 'Interest rate is required'
    else if (v.interestRate < 0) e.interestRate = 'Interest rate cannot be negative'
    if (v.tenure === '' || v.tenure <= 0) e.tenure = 'Tenure must be at least 1 month'
    else if (!Number.isInteger(v.tenure)) e.tenure = 'Enter a whole number of months'
    if (v.penaltyRate === '') e.penaltyRate = 'Penalty rate is required'
    else if (v.penaltyRate < 0) e.penaltyRate = 'Penalty rate cannot be negative'
  }

  return e
}

function validateGuarantors(list: GuarantorItem[]): ItemErrors {
  const out: ItemErrors = {}
  const seen = new Set<string>()

  list.forEach((g) => {
    const e: Record<string, string> = {}
    if (!g.name.trim()) e.name = 'Enter the guarantor name'
    // relationship is optional: the guarantor table has no column for it yet, so it cannot be restored
    if (!g.address.trim()) e.address = 'Enter the guarantor address'
    if (!g.phone.trim()) e.phone = 'Enter a phone number'
    else if (!PHONE.test(g.phone.trim())) e.phone = 'Enter 10 digits starting with 0'

    const nida = g.idNumber.trim().toUpperCase()
    if (!nida) e.idNumber = 'Enter the guarantor NIDA number'
    else if (seen.has(nida)) e.idNumber = 'Another guarantor already has this NIDA number'
    else seen.add(nida)

    if (Object.keys(e).length > 0) out[g.uid] = e
  })

  return out
}

function validateCollaterals(list: CollateralItem[]): ItemErrors {
  const out: ItemErrors = {}

  list.forEach((c) => {
    const e: Record<string, string> = {}
    if (!c.type) e.type = 'Select the collateral type'
    if (!c.description.trim()) e.description = 'Describe the collateral'
    if (c.value === '' || c.value <= 0) e.value = 'Value must be greater than zero'
    // the document, its number and the remarks are optional: the API cannot receive files yet

    if (Object.keys(e).length > 0) out[c.uid] = e
  })

  return out
}

/* ---------- small helpers ---------- */

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

function FlowList({ steps }: { steps: FlowStep[] }) {
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
              {i + 1}
            </span>
            {i < steps.length - 1 && <span className="my-1 w-px flex-1 bg-gray-200" />}
          </div>
          <div className="pb-3">
            <div className="text-sm font-medium text-gray-800">{s.label}</div>
            <div className="text-xs text-gray-500">{s.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ---------- repeatable forms ---------- */

type CardShellProps = {
  title: string
  verified: boolean
  onRemove?: () => void
  children: React.ReactNode
}

function CardShell({ title, verified, onRemove, children }: CardShellProps) {
  return (
    <div className="rounded-md border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Text size="sm" fw={600}>
            {title}
          </Text>
          <Badge variant="light" color={verified ? 'brand' : 'gray'} radius="sm" size="sm">
            {verified ? 'Verified' : 'Not verified'}
          </Badge>
        </div>
        {onRemove && (
          <Button
            type="button"
            size="compact-xs"
            variant="subtle"
            color="red"
            leftSection={<AppIcon name="trash" />}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

type GuarantorCardProps = {
  item: GuarantorItem
  index: number
  errors?: Record<string, string>
  onChange: (patch: Partial<GuarantorItem>) => void
  onRemove?: () => void
}

function GuarantorCard({ item, index, errors, onChange, onRemove }: GuarantorCardProps) {
  return (
    <CardShell title={`Guarantor ${index + 1}`} verified={guarantorVerified(item)} onRemove={onRemove}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Full name"
            placeholder="Joseph Massawe"
            size="sm"
            value={item.name}
            onChange={(e) => onChange({ name: e.currentTarget.value })}
            error={errors?.name}
          />
          <TextInput
            label="Phone"
            placeholder="0713222111"
            size="sm"
            maxLength={10}
            inputMode="tel"
            value={item.phone}
            onChange={(e) => onChange({ phone: e.currentTarget.value })}
            error={errors?.phone}
          />
          <TextInput
            label="Relationship to applicant (optional)"
            description="Not saved yet, the backend has no field for it"
            placeholder="Brother"
            size="sm"
            value={item.relationship}
            onChange={(e) => onChange({ relationship: e.currentTarget.value })}
            error={errors?.relationship}
          />
          <TextInput
            label="NIDA number"
            placeholder="NIDA123"
            size="sm"
            value={item.idNumber}
            onChange={(e) => onChange({ idNumber: e.currentTarget.value })}
            error={errors?.idNumber}
          />
        </SimpleGrid>

        <TextInput
          label="Address"
          placeholder="Plot 12, Mikocheni, Dar es Salaam"
          size="sm"
          value={item.address}
          onChange={(e) => onChange({ address: e.currentTarget.value })}
          error={errors?.address}
        />

        <div className="space-y-2 rounded-md bg-gray-50 px-3 py-2.5">
          <Text size="sm" fw={600}>
            Verification
          </Text>
          <Text size="xs" c="dimmed">
            Both must be ticked before the credit assessment can run.
          </Text>
          <Checkbox
            label="ID verified"
            checked={item.idVerified}
            onChange={(e) => onChange({ idVerified: e.currentTarget.checked })}
          />
          <Checkbox
            label="Exposure verified"
            description="Existing guarantees and debts have been checked"
            checked={item.exposureVerified}
            onChange={(e) => onChange({ exposureVerified: e.currentTarget.checked })}
          />
        </div>
      </Stack>
    </CardShell>
  )
}

type CollateralCardProps = {
  item: CollateralItem
  index: number
  errors?: Record<string, string>
  onChange: (patch: Partial<CollateralItem>) => void
  onRemove?: () => void
}

function CollateralCard({ item, index, errors, onChange, onRemove }: CollateralCardProps) {
  const needsDeed = DEED_TYPES.includes(item.type)

  return (
    <CardShell title={`Asset ${index + 1}`} verified={collateralVerified(item)} onRemove={onRemove}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Select
            label="Collateral type"
            placeholder="Select type"
            size="sm"
            data={COLLATERAL_TYPES}
            allowDeselect={false}
            value={item.type || null}
            onChange={(v) => onChange({ type: v ?? '' })}
            error={errors?.type}
          />
          <NumberInput
            label="Estimated value"
            placeholder="7,500,000"
            size="sm"
            prefix="TZS "
            thousandSeparator=","
            hideControls
            allowNegative={false}
            value={item.value}
            onChange={(v) => onChange({ value: v === '' ? '' : Number(v) })}
            error={errors?.value}
          />
        </SimpleGrid>

        <TextInput
          label="Description"
          placeholder="Plot 214, Kinondoni, with title deed"
          size="sm"
          value={item.description}
          onChange={(e) => onChange({ description: e.currentTarget.value })}
          error={errors?.description}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <FileInput
            label={needsDeed ? 'Title deed copy (optional)' : 'Supporting document (optional)'}
            description={
              needsDeed
                ? `A copy of the ${item.type.toLowerCase()}'s title deed`
                : 'Ownership papers, a valuation report or similar'
            }
            size="sm"
            accept="application/pdf,image/*"
            clearable
            leftSection={<AppIcon name="upload" />}
            value={item.document}
            onChange={(f) => onChange({ document: f })}
            error={errors?.document}
            // a file saved earlier is only a name on the server, so the field starts empty after a resume
            placeholder={item.savedFileName ? `Saved earlier: ${item.savedFileName}` : 'Upload PDF or image'}
          />
          <TextInput
            label="Document number (optional)"
            description={needsDeed ? 'The title deed number' : 'The number printed on the document'}
            placeholder={needsDeed ? 'LR-12345' : 'REF-001'}
            size="sm"
            value={item.documentNumber}
            onChange={(e) => onChange({ documentNumber: e.currentTarget.value })}
          />
        </SimpleGrid>

        <div className="space-y-2 rounded-md bg-gray-50 px-3 py-2.5">
          <Text size="sm" fw={600}>
            Verification
          </Text>
          <Text size="xs" c="dimmed">
            Both must be ticked before the credit assessment can run.
          </Text>
          <Checkbox
            label="Ownership verified"
            checked={item.ownershipVerified}
            onChange={(e) => onChange({ ownershipVerified: e.currentTarget.checked })}
          />
          <Checkbox
            label="Existing pledge checked"
            description="Confirmed the collateral isn't already pledged elsewhere"
            checked={item.pledgeVerified}
            onChange={(e) => onChange({ pledgeVerified: e.currentTarget.checked })}
          />
          <Textarea
            label="Verification remarks (optional)"
            placeholder="Title deed verified, no existing pledge"
            size="sm"
            autosize
            minRows={2}
            value={item.remarks}
            onChange={(e) => onChange({ remarks: e.currentTarget.value })}
          />
        </div>
      </Stack>
    </CardShell>
  )
}

/* ---------- page ---------- */

export function NewLoanApplicationPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const goBack = () => navigate('/loan-applications')

  // /loan-applications/new?applicantId=1 opens with the applicant already chosen,
  // and picks up that applicant's saved draft when there is one
  const preselected = params.get('applicantId')
  // the applicants are still loading here, so the id is checked against the list when continuing
  const preselectedId = preselected && /^\d+$/.test(preselected) ? preselected : ''

  // GET /api/applicants: only applicants with approved KYC can start a loan application
  const applicantsQuery = useApplicants()
  const eligible = (applicantsQuery.data ?? []).filter((a) => a.status === 'KYC_APPROVED')
  const applicantOptions = eligible.map((a) => ({ value: String(a.id), label: `${a.name} · ${a.applicantNo}` }))

  // GET /api/users (+ /api/roles for the role names): active users whose role is Admin or Loan Officer
  const usersQuery = useApiUsers()
  const { data: roles = [], isLoading: rolesLoading } = useApiRoles()
  const officers = (usersQuery.data ?? [])
    .map((raw) => toUser(raw, roles))
    .filter((u) => u.id > 0 && u.active && OFFICER_ROLES.includes((u.role ?? '').trim().toLowerCase()))
  const officerOptions = officers
    .map((u) => ({ value: String(u.id), label: `${u.name !== 'Unknown' ? u.name : u.username} · ${u.role}` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // the officer filled in by default: the logged-in user when they are an active Admin or Loan Officer,
  // otherwise the only Loan Officer when there is exactly one; else the field is left to pick
  const { user: me } = useAuth()
  const onlyLoanOfficers = officers.filter((u) => (u.role ?? '').trim().toLowerCase() === 'loan officer')
  const defaultOfficerId =
    me && officers.some((u) => u.id === me.id)
      ? String(me.id)
      : onlyLoanOfficers.length === 1
        ? String(onlyLoanOfficers[0].id)
        : ''
  const [values, setValues] = useState<FormValues>(() => ({ ...emptyValues(), applicantId: preselectedId }))
  const [errors, setErrors] = useState<Errors>({})
  const [guarantorErrors, setGuarantorErrors] = useState<ItemErrors>({})
  const [collateralErrors, setCollateralErrors] = useState<ItemErrors>({})
  const [active, setActive] = useState(0)
  // true once a saved draft has been loaded or declined, so it is not offered again
  const [resumed, setResumed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // the draft on the server: created by /start on the Applicant step, updated by /progress on each step
  const [draftId, setDraftId] = useState<number | null>(null)
  // one flag for every server call, so a button cannot be pressed twice
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // cards removed in the form that are already on the server, deleted on the next save
  const [removedGuarantorIds, setRemovedGuarantorIds] = useState<number[]>([])
  const [removedCollateralIds, setRemovedCollateralIds] = useState<number[]>([])
  // a resumed draft loads its saved guarantors and assets into the cards once
  const [restoreItemsFor, setRestoreItemsFor] = useState<number | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [applicationNo, setApplicationNo] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>('SUBMITTED')
  // the credit assessment's answer after submit
  const [creditOutcome, setCreditOutcome] = useState<CreditOutcome | null>(null)
  // small screens: the summary folds away above the form
  const [summaryOpen, setSummaryOpen] = useState(false)
  // the drawer that shows how the installment is calculated
  const [calculatorOpen, setCalculatorOpen] = useState(false)

  // once the users have loaded, an empty Loan officer field gets the default officer, one time only,
  // so a choice made by hand (or restored from a draft) is never overwritten
  const [officerDefaulted, setOfficerDefaulted] = useState(false)
  // the role names are needed to tell who is an officer, so both lists have to be in
  if (!officerDefaulted && !usersQuery.isLoading && !rolesLoading) {
    setOfficerDefaulted(true)
    if (!values.loanOfficerId && defaultOfficerId) {
      setValues((prev) => (prev.loanOfficerId ? prev : { ...prev, loanOfficerId: defaultOfficerId }))
    }
  }

  // guarantor, collateral and credit steps only exist when the application needs them
  const steps = stepsFor(values)
  const current = steps[active]
  const isLast = active === steps.length - 1

  const applicant = eligible.find((a) => String(a.id) === values.applicantId)
  const officer = officerOptions.find((o) => o.value === values.loanOfficerId)

  // GET /api/existing-debts: debts with other lenders from the applicant's Financial tab; the backend reads the
  // same records during the credit assessment, so they are shown and counted in the estimate
  const debtsQuery = useExistingDebts(applicant?.id ?? 0)
  const existingDebts = applicant ? (debtsQuery.data ?? []) : []
  const debtPayments = existingDebts.reduce((sum, d) => sum + d.monthly, 0)
  const debtOutstanding = existingDebts.reduce((sum, d) => sum + d.balance, 0)

  // GET /api/financial-profiles: the applicant's saved income and expenses pre-fill the Credit assessment step,
  // and Save & continue on that step writes them back, so they survive a resume and are ready for the next loan
  const profileQuery = useFinancialProfile(applicant?.id ?? 0)
  const savedProfile = applicant ? (profileQuery.data ?? null) : null
  const saveProfile = useSaveFinancialProfile()
  const [incomeFilledFor, setIncomeFilledFor] = useState<number | null>(null)
  // Runs once per applicant (and again after a draft is resumed, which resets the form). Figures typed in by
  // hand afterwards are kept; the figures belong to this applicant, so a different applicant's are replaced.
  if (applicant && profileQuery.isSuccess && incomeFilledFor !== applicant.id) {
    setIncomeFilledFor(applicant.id)
    const p = profileQuery.data
    setValues((prev) => ({
      ...prev,
      monthlyIncome: p && p.monthlyIncome > 0 ? p.monthlyIncome : '',
      monthlyExpenses: p ? p.monthlyExpenses : '',
    }))
  }

  // POST or PUT /api/financial-profiles with the step's figures; the profile's other fields are kept.
  // Skipped when the figures are incomplete or unchanged.
  const saveCreditFigures = async () => {
    if (!applicant || values.monthlyIncome === '' || values.monthlyExpenses === '') return
    if (
      savedProfile &&
      savedProfile.monthlyIncome === values.monthlyIncome &&
      savedProfile.monthlyExpenses === values.monthlyExpenses
    )
      return
    await saveProfile.mutateAsync({
      id: savedProfile?.id,
      applicantId: applicant.id,
      profile: {
        employmentType: savedProfile?.employmentType ?? '',
        employer: savedProfile?.employer ?? '',
        dependants: savedProfile?.dependants ?? 0,
        monthlyIncome: values.monthlyIncome,
        monthlyExpenses: values.monthlyExpenses,
      },
    })
  }

  // GET /api/loans: this applicant's loans that are not completed (active, awaiting payout, or written off)
  const loansQuery = useUnfinishedLoans(applicant?.id ?? 0)
  const unfinishedLoans = applicant ? (loansQuery.data ?? []) : []

  // "Has pending payments" is ticked by default when there is an unfinished loan, unticked otherwise.
  // Once the officer changes it by hand for this applicant, their choice is kept (the override).
  const [pendingDefaultFor, setPendingDefaultFor] = useState<number | null>(null)
  const [pendingTouchedFor, setPendingTouchedFor] = useState<number | null>(null)
  if (applicant && loansQuery.isSuccess && pendingDefaultFor !== applicant.id && pendingTouchedFor !== applicant.id) {
    setPendingDefaultFor(applicant.id)
    const shouldTick = loansQuery.data.length > 0
    if (values.hasPendingPayments !== shouldTick) setValues((prev) => ({ ...prev, hasPendingPayments: shouldTick }))
  }
  const pendingOverridden = unfinishedLoans.length > 0 && !values.hasPendingPayments

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  // props shared by every number field
  const num = (key: NumberKey) => ({
    size: 'sm' as const,
    hideControls: true,
    allowNegative: false,
    value: values[key],
    onChange: (v: string | number) => set(key, v === '' ? '' : Number(v)),
    error: errors[key],
  })

    /* ---------- saved draft (GET /api/loan-applications/latest) ---------- */

  // the chosen applicant may already have an unfinished application on the server
  const latestQuery = useLatestLoanApplication(
    Number(values.applicantId) || 0,
    !resumed && draftId === null && active === 0 && !submitted,
  )
  const offered = !resumed && draftId === null && active === 0 ? (latestQuery.data ?? null) : null

  const applyDraft = (d: LoanDraft) => {
    const restored = fromDraft(d)
    setValues(restored)
    setErrors({})
    setGuarantorErrors({})
    setCollateralErrors({})
    setCreditOutcome(null)
    setRemovedGuarantorIds([])
    setRemovedCollateralIds([])
    setRestoreItemsFor(d.id)
    // the draft has no income, expenses or pending-payments tick, so their defaults are worked out again
    setIncomeFilledFor(null)
    setPendingDefaultFor(null)
    setPendingTouchedFor(null)
    setDraftId(d.id)
    setApplicationNo(d.applicationNo)
    setActive(stepForStage(d.currentStage, stepsFor(restored)))
    setResumed(true)
    setNotice(
      `Resumed draft ${d.applicationNo || `#${d.id}`}${d.updatedAt ? `, last saved ${dayjs(d.updatedAt).format('MMM D, YYYY h:mm A')}` : ''}.`,
    )
  }

  // /loan-applications/new?applicantId=1 (Continue application) opens that applicant's draft straight away
  const [autoResumeTried, setAutoResumeTried] = useState(false)
  if (!autoResumeTried && preselectedId && latestQuery.isFetched) {
    setAutoResumeTried(true)
    if (latestQuery.data && values.applicantId === preselectedId) applyDraft(latestQuery.data)
  }

  // "Start fresh": DELETE /api/loan-applications/{id} removes the old draft
  const discardOffered = async () => {
    if (!offered || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteLoanApplication(offered.id)
      setNotice(`Draft ${offered.applicationNo || `#${offered.id}`} was discarded.`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not discard the draft. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // POST /api/loan-applications/start the first time, then the same draft is reused
  const ensureDraft = async (): Promise<number> => {
    if (draftId !== null) return draftId
    const created = await startLoanApplication({
      applicantId: Number(values.applicantId),
      loanOfficerId: Number(values.loanOfficerId),
    })
    setDraftId(created.id)
    setApplicationNo(created.applicationNo)
    setResumed(true)
    return created.id
  }

  // PUT /api/loan-applications/{id}/progress, with the stage to reopen on
  const persist = async (stepId: StepId): Promise<number> => {
    const id = await ensureDraft()
    await saveLoanProgress(id, progressBody(values, stepId))
    return id
  }

  // runs one server call with the shared busy flag and shows its error
  const run = async (work: () => Promise<void>) => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await work()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Cancel: DELETE /api/loan-applications/{id} removes the draft from the server too
  // the dialog closes first, so a failure shows in the form's error box
  const discard = () => {
    setCancelOpen(false)
    void run(async () => {
      if (draftId !== null) await deleteLoanApplication(draftId)
      goBack()
    })
  }

  /* ---------- guarantors ---------- */

  const updateGuarantor = (uid: number, patch: Partial<GuarantorItem>) => {
    setValues((prev) => ({
      ...prev,
      guarantors: prev.guarantors.map((g) => (g.uid === uid ? { ...g, ...patch } : g)),
    }))
    setGuarantorErrors((prev) => (prev[uid] ? { ...prev, [uid]: {} } : prev))
  }

  const addGuarantor = () =>
    setValues((prev) =>
      prev.guarantors.length >= MAX_GUARANTORS
        ? prev
        : { ...prev, guarantors: [...prev.guarantors, newGuarantor()] },
    )

  const removeGuarantor = (uid: number) => {
    if (values.guarantors.length <= MIN_GUARANTORS) return
    // one already on the server is deleted there on the next save
    const serverId = values.guarantors.find((g) => g.uid === uid)?.serverId
    if (serverId) setRemovedGuarantorIds((ids) => [...ids, serverId])
    setValues((prev) => ({ ...prev, guarantors: prev.guarantors.filter((g) => g.uid !== uid) }))
  }

  /* ---------- collateral ---------- */

  const updateCollateral = (uid: number, patch: Partial<CollateralItem>) => {
    setValues((prev) => ({
      ...prev,
      collaterals: prev.collaterals.map((c) => (c.uid === uid ? { ...c, ...patch } : c)),
    }))
    setCollateralErrors((prev) => (prev[uid] ? { ...prev, [uid]: {} } : prev))
  }

  const addCollateral = () =>
    setValues((prev) => ({ ...prev, collaterals: [...prev.collaterals, newCollateral()] }))

  const removeCollateral = (uid: number) => {
    if (values.collaterals.length <= 1) return
    // one already on the server is deleted there on the next save
    const serverId = values.collaterals.find((c) => c.uid === uid)?.serverId
    if (serverId) setRemovedCollateralIds((ids) => [...ids, serverId])
    setValues((prev) => ({ ...prev, collaterals: prev.collaterals.filter((c) => c.uid !== uid) }))
  }

  /* ---------- saved guarantors and assets of a resumed draft ---------- */

  // GET /api/guarantors and /api/collaterals (with their checks and documents) for this application
  const savedGuarantorsQuery = useQuery({
    queryKey: ['loan-applications', restoreItemsFor, 'guarantors'],
    queryFn: () => getDraftGuarantors(restoreItemsFor as number),
    enabled: restoreItemsFor !== null,
    staleTime: 0,
  })
  const savedCollateralsQuery = useQuery({
    queryKey: ['loan-applications', restoreItemsFor, 'collaterals'],
    queryFn: () => getDraftCollaterals(restoreItemsFor as number),
    enabled: restoreItemsFor !== null,
    staleTime: 0,
  })
  const restoringItems = restoreItemsFor !== null && (savedGuarantorsQuery.isLoading || savedCollateralsQuery.isLoading)
  const restoreError = restoreItemsFor !== null ? (savedGuarantorsQuery.error ?? savedCollateralsQuery.error) : null
  // saving before the saved cards are in would send the blank cards as new records
  const cardsNotReady = (current === 'guarantor' || current === 'collateral') && (restoringItems || !!restoreError)

  // once both have loaded, they replace the blank cards, one time per resumed draft
  const [itemsRestoredFor, setItemsRestoredFor] = useState<number | null>(null)
  if (
    restoreItemsFor !== null &&
    itemsRestoredFor !== restoreItemsFor &&
    savedGuarantorsQuery.isSuccess &&
    savedCollateralsQuery.isSuccess
  ) {
    setItemsRestoredFor(restoreItemsFor)
    setValues((prev) => ({
      ...prev,
      // a step that has saved records is ticked, whatever the application row says
      guarantorRequired: prev.guarantorRequired || savedGuarantorsQuery.data.length > 0,
      collateralRequired: prev.collateralRequired || savedCollateralsQuery.data.length > 0,
      guarantors: guarantorsFromServer(savedGuarantorsQuery.data),
      collaterals: collateralsFromServer(savedCollateralsQuery.data),
    }))
  }

  /* ---------- unticking Guarantor / Collateral required removes their records ---------- */

  type CheckKind = 'guarantor' | 'collateral'
  const [dropping, setDropping] = useState<CheckKind | null>(null)

  const guarantorHasData = (g: GuarantorItem) =>
    g.serverId !== null ||
    [g.name, g.phone, g.idNumber, g.address, g.relationship].some((x) => x.trim() !== '') ||
    g.idVerified ||
    g.exposureVerified
  const collateralHasData = (c: CollateralItem) =>
    c.serverId !== null ||
    !!c.type ||
    c.value !== '' ||
    [c.description, c.documentNumber, c.remarks].some((x) => x.trim() !== '') ||
    !!c.document ||
    c.ownershipVerified ||
    c.pledgeVerified

  // ticking adds the step; unticking with cards filled in asks first, because their data is deleted
  const toggleRequired = (kind: CheckKind, checked: boolean) => {
    const key = kind === 'guarantor' ? 'guarantorRequired' : 'collateralRequired'
    if (checked) {
      set(key, true)
      return
    }
    const filled =
      kind === 'guarantor'
        ? values.guarantors.some(guarantorHasData) || removedGuarantorIds.length > 0
        : values.collaterals.some(collateralHasData) || removedCollateralIds.length > 0
    if (filled) setDropping(kind)
    else set(key, false)
  }

  // DELETE every saved guarantor / asset of this application, empty the cards, untick, and save the switch
  const confirmDrop = () => {
    const kind = dropping
    if (!kind) return
    setDropping(null)
    void run(async () => {
      if (kind === 'guarantor') {
        const ids = [...values.guarantors.map((g) => g.serverId), ...removedGuarantorIds].filter(
          (id): id is number => id !== null,
        )
        for (const id of ids) await deleteGuarantor(id)
        setRemovedGuarantorIds([])
      } else {
        const ids = [...values.collaterals.map((c) => c.serverId), ...removedCollateralIds].filter(
          (id): id is number => id !== null,
        )
        for (const id of ids) await deleteCollateral(id)
        setRemovedCollateralIds([])
      }
      const updated: FormValues =
        kind === 'guarantor'
          ? { ...values, guarantorRequired: false, guarantors: [newGuarantor()] }
          : { ...values, collateralRequired: false, collaterals: [newCollateral()] }
      if (kind === 'guarantor') setGuarantorErrors({})
      else setCollateralErrors({})
      setValues((prev) =>
        kind === 'guarantor'
          ? { ...prev, guarantorRequired: false, guarantors: updated.guarantors }
          : { ...prev, collateralRequired: false, collaterals: updated.collaterals },
      )
      // PUT /progress, so the application on the server no longer asks for this step
      if (draftId !== null) await saveLoanProgress(draftId, progressBody(updated, 'details'))
      setNotice(kind === 'guarantor' ? 'The guarantors were removed.' : 'The collateral was removed.')
    })
  }
  const dropCount =
    dropping === 'guarantor'
      ? values.guarantors.filter((g) => g.serverId !== null).length + removedGuarantorIds.length
      : dropping === 'collateral'
        ? values.collaterals.filter((c) => c.serverId !== null).length + removedCollateralIds.length
        : 0

  /* ---------- saving guarantors and assets ---------- */

  // POST/PUT each changed guarantor, DELETE the removed ones, then verify the ones whose ticks changed.
  // A failed verify does not stop the save, it comes back as a warning.
  const syncGuarantors = async (applicationId: number): Promise<string[]> => {
    const warnings: string[] = []
    for (const id of removedGuarantorIds) await deleteGuarantor(id)
    setRemovedGuarantorIds([])

    const saved: GuarantorItem[] = []
    for (const g of values.guarantors) {
      const sig = sigOfGuarantor(g)
      const serverId =
        g.serverId === null || sig !== g.savedSig
          ? await saveGuarantor(applicationId, g.serverId, {
              fullName: g.name.trim(),
              phone: g.phone.trim(),
              idNumber: g.idNumber.trim(),
              address: g.address.trim(),
            })
          : g.serverId
      let checkSig = g.savedCheckSig
      if (checkSigOfGuarantor(g) !== g.savedCheckSig && me) {
        try {
          await verifyGuarantor(applicationId, serverId, {
            idVerified: g.idVerified,
            exposureVerified: g.exposureVerified,
            verifiedBy: me.id,
            remarks: '',
          })
          checkSig = checkSigOfGuarantor(g)
        } catch (err) {
          warnings.push(`${g.name.trim() || 'A guarantor'}: ${err instanceof Error ? err.message : 'verification failed'}`)
        }
      }
      saved.push({ ...g, serverId, savedSig: sig, savedCheckSig: checkSig })
    }
    // keep anything typed while saving, only the server ids and saved markers change
    setValues((prev) => ({
      ...prev,
      guarantors: prev.guarantors.map((g) => {
        const s = saved.find((x) => x.uid === g.uid)
        return s ? { ...g, serverId: s.serverId, savedSig: s.savedSig, savedCheckSig: s.savedCheckSig } : g
      }),
    }))
    return warnings
  }

  // the same for assets, plus each asset's document record (the file itself cannot be sent yet)
  const syncCollaterals = async (applicationId: number): Promise<string[]> => {
    const warnings: string[] = []
    for (const id of removedCollateralIds) await deleteCollateral(id)
    setRemovedCollateralIds([])

    const saved: CollateralItem[] = []
    for (const c of values.collaterals) {
      const sig = sigOfCollateral(c)
      const serverId =
        c.serverId === null || sig !== c.savedSig
          ? await saveCollateral(applicationId, c.serverId, {
              collateralType: c.type,
              description: c.description.trim(),
              estimatedValue: c.value === '' ? 0 : c.value,
            })
          : c.serverId

      // the document record: only when there is a file or a number to keep
      const docSig = docSigOf(c)
      let docServerId = c.docServerId
      let savedFileName = c.savedFileName
      let savedFilePath = c.savedFilePath
      if (docSig !== c.savedDocSig && (c.document || c.documentNumber.trim() || c.savedFilePath || c.docServerId)) {
        const filePath = c.document ? `/uploads/${c.document.name}` : c.savedFilePath
        docServerId = await saveCollateralDocument(serverId, c.docServerId, {
          documentType: DEED_TYPES.includes(c.type) ? 'TITLE_DEED' : 'SUPPORTING_DOCUMENT',
          documentNumber: c.documentNumber.trim(),
          filePath,
        })
        if (c.document) {
          savedFileName = c.document.name
          savedFilePath = filePath
        }
      }

      let checkSig = c.savedCheckSig
      if (checkSigOfCollateral(c) !== c.savedCheckSig && me) {
        try {
          await verifyCollateral(applicationId, serverId, {
            ownershipVerified: c.ownershipVerified,
            existingPledgeVerified: c.pledgeVerified,
            verifiedBy: me.id,
            remarks: c.remarks.trim(),
          })
          checkSig = checkSigOfCollateral(c)
        } catch (err) {
          warnings.push(`${c.type || 'An asset'}: ${err instanceof Error ? err.message : 'verification failed'}`)
        }
      }
      saved.push({
        ...c,
        serverId,
        docServerId,
        savedFileName,
        savedFilePath,
        savedSig: sig,
        savedDocSig: docSigOf({ ...c, savedFileName }),
        savedCheckSig: checkSig,
      })
    }
    setValues((prev) => ({
      ...prev,
      collaterals: prev.collaterals.map((c) => {
        const s = saved.find((x) => x.uid === c.uid)
        return s
          ? {
              ...c,
              serverId: s.serverId,
              docServerId: s.docServerId,
              savedFileName: s.savedFileName,
              savedFilePath: s.savedFilePath,
              savedSig: s.savedSig,
              savedDocSig: s.savedDocSig,
              savedCheckSig: s.savedCheckSig,
            }
          : c
      }),
    }))
    return warnings
  }

  // saves the cards of the step being left; verification problems become a notice, not an error
  const syncStep = async (step: StepId, applicationId: number) => {
    const warnings =
      step === 'guarantor'
        ? await syncGuarantors(applicationId)
        : step === 'collateral'
          ? await syncCollaterals(applicationId)
          : []
    if (warnings.length > 0) {
      setNotice(`Saved, but the verification could not be recorded. ${warnings.join(' · ')}`)
    }
  }

  // display-only estimate, the real schedule is created when the loan is disbursed
  const preview: LoanApplication | null =
    values.requestedAmount !== '' && values.tenure !== '' && values.interestRate !== ''
      ? {
          id: 0,
          applicationNo: 'DRAFT',
          applicantId: Number(values.applicantId) || 0,
          applicantName: applicant?.name ?? '',
          loanOfficer: officer?.label ?? '',
          requestedAmount: values.requestedAmount,
          interestMethod: values.interestMethod,
          interestRate: values.interestRate,
          tenure: values.tenure,
          penaltyRate: values.penaltyRate === '' ? 0 : values.penaltyRate,
          guarantorRequired: values.guarantorRequired,
          collateralRequired: values.collateralRequired,
          creditAssessmentRequired: values.creditAssessmentRequired,
          status: 'DRAFT',
          currentStage: STAGE[current],
          created: dayjs().format('YYYY-MM-DD'),
          submittedAt: null,
        }
      : null

  const installment = preview ? Math.round(estimateInstallment(preview)) : 0
  const repayable = preview ? Math.round(totalRepayable(preview)) : 0
  const interestTotal = preview ? repayable - preview.requestedAmount : 0

  /* ---------- credit assessment state ---------- */

  const cashFlow =
    values.monthlyIncome !== '' && values.monthlyExpenses !== ''
      ? values.monthlyIncome - values.monthlyExpenses
      : null

  // the backend only runs the credit assessment once every required guarantor and asset is verified
  const blockers = [
    values.guarantorRequired && !values.guarantors.every(guarantorVerified) ? 'guarantors' : null,
    values.collateralRequired && !values.collaterals.every(collateralVerified) ? 'collateral' : null,
  ].filter((b): b is string => b !== null)

  /* ---------- actions ---------- */

  // POST .../credit-assessment, right after the application is submitted (the backend's order).
  // A refusal (e.g. something not verified) does not undo the submit, it is shown on the result screen.
  const assessCredit = async (applicationId: number): Promise<CreditOutcome> => {
    if (!me) return { result: null, error: 'You are not signed in, so the credit assessment could not run.' }
    const notes = values.creditNotes.trim()
    try {
      const result = await runCreditAssessment(
        applicationId,
        values.creditAssessmentRequired
          ? {
              income: values.monthlyIncome === '' ? 0 : values.monthlyIncome,
              expenses: values.monthlyExpenses === '' ? 0 : values.monthlyExpenses,
              hasPendingPayments: values.hasPendingPayments,
              assessedBy: me.id,
              notes,
            }
          : { assessedBy: me.id, notes: notes || 'Credit assessment not required' },
      )
      return { result, error: null }
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : 'The credit assessment could not run.' }
    }
  }

  function next() {
    if (cardsNotReady) return

    if (current === 'guarantor') {
      const found = validateGuarantors(values.guarantors)
      setGuarantorErrors(found)
      if (Object.keys(found).length > 0) return
    } else if (current === 'collateral') {
      const found = validateCollaterals(values.collaterals)
      setCollateralErrors(found)
      if (Object.keys(found).length > 0) return
    } else {
      const found = validate(current, values)
      // an id from the address bar or a draft must still be an applicant with approved KYC
      if (current === 'applicant' && values.applicantId && !applicant) {
        found.applicantId = 'Select an applicant with approved KYC'
      }
      setErrors(found)
      if (Object.keys(found).length > 0) return
    }

    if (isLast) {
      void run(async () => {
        // 1. save the last values, then POST /api/loan-applications/{id}/finalize locks it as SUBMITTED
        if (values.creditAssessmentRequired) await saveCreditFigures()
        const id = await persist('review')
        const done = await finalizeLoanApplication(id)
        setApplicationNo(done.applicationNo || applicationNo)

        // 2. retry any verification the backend refused while it was a draft
        if (values.guarantorRequired) await syncStep('guarantor', id)
        if (values.collateralRequired) await syncStep('collateral', id)

        // 3. the credit assessment: APPROVE -> CREDIT_APPROVED, REJECT -> REJECTED
        const credit = await assessCredit(id)
        setCreditOutcome(credit)
        setOutcome(
          credit.result?.decision === 'REJECT'
            ? 'REJECTED'
            : credit.result?.decision === 'APPROVE' || (credit.result && !values.creditAssessmentRequired)
              ? 'CREDIT_APPROVED'
              : 'SUBMITTED',
        )
        setSubmitted(true)
      })
      return
    }
    // every step forward saves the draft on the server, so closing the tab does not lose the work
    const nextStep = steps[active + 1]
    void run(async () => {
      // the Guarantors and Collateral cards are their own records, saved before the stage moves on
      if (current === 'guarantor' || current === 'collateral') await syncStep(current, await ensureDraft())
      // income and expenses go to the applicant's financial profile
      if (current === 'credit') await saveCreditFigures()
      await persist(nextStep)
      setActive(active + 1)
    })
  }


  function saveAndExit() {
    // the cards of this step are saved too, so they have to be complete first
    if (current === 'guarantor' || current === 'collateral') {
      const found = current === 'guarantor' ? validateGuarantors(values.guarantors) : validateCollaterals(values.collaterals)
      if (current === 'guarantor') setGuarantorErrors(found)
      else setCollateralErrors(found)
      if (Object.keys(found).length > 0) {
        setSaveError(
          `Complete or remove the unfinished ${current === 'guarantor' ? 'guarantor' : 'asset'} cards before saving the draft.`,
        )
        return
      }
    }
    // the draft can be picked up later from the Loan applications page or Continue application
    void run(async () => {
      if (values.applicantId && values.loanOfficerId) {
        if (current === 'guarantor' || current === 'collateral') await syncStep(current, await ensureDraft())
        // complete figures are kept on the financial profile, incomplete ones are skipped
        if (current === 'credit') await saveCreditFigures()
        await persist(current)
      }
      goBack()
    })
  }

  function startOver() {
    setValues({ ...emptyValues(), loanOfficerId: defaultOfficerId })
    setErrors({})
    setGuarantorErrors({})
    setCollateralErrors({})
    setApplicationNo('')
    setSubmitted(false)
    setOutcome('SUBMITTED')
    setCreditOutcome(null)
    setActive(0)
    setResumed(false)
    setNotice(null)
    setDraftId(null)
    setSaveError(null)
    setRemovedGuarantorIds([])
    setRemovedCollateralIds([])
    setRestoreItemsFor(null)
    setPendingDefaultFor(null)
    setPendingTouchedFor(null)
    setIncomeFilledFor(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    next()
  }

  const outcomeStatus = LOAN_STATUS[outcome]
  const formSteps = inForm(values)

  const summary = (
    <ApplicationSummary
      values={values}
      steps={steps}
      active={active}
      submitted={submitted}
      applicantName={applicant?.name ?? ''}
      applicantNo={applicant?.applicantNo ?? ''}
      officerName={officer?.label ?? ''}
      installment={installment}
      canEdit={!submitted}
      onEdit={setActive}
    />
  )

  return (
    <DashboardLayout
      title="New loan application"
      subtitle="Capture the loan terms and requirements, then submit for review"
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: 'Loan applications', to: '/loan-applications' },
        { label: 'New application' },
      ]}
      actions={
        submitted ? undefined : (
          <Button
            size="xs"
            color="red"
            leftSection={<AppIcon name="x" />}
            onClick={() => (values.applicantId ? setCancelOpen(true) : goBack())}
          >
            Cancel Application
          </Button>
        )
      }
    >
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* small screens: the summary folds away above the form */}
      <div className="xl:hidden">
        <Button
          size="xs"
          variant="default"
          fullWidth
          leftSection={<AppIcon name="clipboard" />}
          rightSection={<AppIcon name={summaryOpen ? 'chevron-up' : 'chevron-down'} />}
          onClick={() => setSummaryOpen((o) => !o)}
        >
          {summaryOpen ? 'Hide' : 'Show'} filled details
        </Button>
        <Collapse expanded={summaryOpen}>
          <div className="mt-3">{summary}</div>
        </Collapse>
      </div>

      <div className={`min-w-0 ${CARD}`}>
        <Stepper
          active={submitted ? steps.length : active}
          size="xs"
          color="brand"
          className="app-stepper"
          allowNextStepsSelect={false}
          onStepClick={(i) => {
            if (!submitted && i < active) setActive(i)
          }}
          mb="xl"
        >
          {steps.map((s) => (
            <Stepper.Step key={s} label={STEP_LABEL[s]} {...stepIcon(STEP_ICON[s])} />
          ))}
        </Stepper>

        {notice && !submitted && (
          <Alert
            color="blue"
            variant="light"
            withCloseButton
            onClose={() => setNotice(null)}
            icon={<AppIcon name="info" />}
            mb="md"
          >
            <Text size="sm">{notice}</Text>
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* ---------- step: applicant ---------- */}
          {!submitted && current === 'applicant' && (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <LoadedSelect
                  label="Applicant"
                  description="Only applicants with approved KYC are listed"
                  placeholder="Search by name or applicant number"
                  emptyText="No applicants with approved KYC yet"
                  what="applicants"
                  loading={applicantsQuery.isLoading}
                  error={applicantsQuery.error}
                  onRetry={() => void applicantsQuery.refetch()}
                  data={applicantOptions}
                  value={values.applicantId}
                  onChange={(v) => {
                    set('applicantId', v)
                    setResumed(false)
                  }}
                  fieldError={errors.applicantId}
                  lockedNote={
                    draftId !== null
                      ? `Draft ${applicationNo || `#${draftId}`} belongs to this applicant. Cancel it to start one for someone else.`
                      : undefined
                  }
                />
                <LoadedSelect
                  label="Loan officer"
                  description="Admins and Loan Officers"
                  placeholder="Select loan officer"
                  emptyText="No active Admin or Loan Officer yet"
                  what="users"
                  loading={usersQuery.isLoading}
                  error={usersQuery.error}
                  onRetry={() => void usersQuery.refetch()}
                  data={officerOptions}
                  value={values.loanOfficerId}
                  onChange={(v) => set('loanOfficerId', v)}
                  fieldError={errors.loanOfficerId}
                />
              </SimpleGrid>

              {/* nothing to pick means the wizard cannot continue, so say where to fix it */}
              {!applicantsQuery.isLoading && !applicantsQuery.error && applicantOptions.length === 0 && (
                <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
                  <Text size="sm">
                    No applicant has an approved KYC yet. Approve one on the KYC Review page before starting a loan
                    application.
                  </Text>
                  <Button type="button" size="compact-xs" variant="light" mt={8} onClick={() => navigate('/kyc-review')}>
                    Go to KYC Review
                  </Button>
                </Alert>
              )}
              {!usersQuery.isLoading && !usersQuery.error && officerOptions.length === 0 && (
                <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
                  <Text size="sm">
                    No active user has the Admin or Loan Officer role. Add or activate one on the Users page.
                  </Text>
                  <Button type="button" size="compact-xs" variant="light" mt={8} onClick={() => navigate('/users')}>
                    Go to Users
                  </Button>
                </Alert>
              )}

              {offered && (
                <Alert color="yellow" variant="light" title="This applicant has a saved draft" icon={<AppIcon name="pencil" />}>
                  <Text size="sm">
                    Draft {offered.applicationNo || `#${offered.id}`}
                    {offered.updatedAt ? ` was last saved on ${dayjs(offered.updatedAt).format('MMM D, YYYY h:mm A')}` : ''}.
                    It stopped at {stageLabel(offered.currentStage)}.
                  </Text>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="compact-xs" disabled={saving} onClick={() => applyDraft(offered)}>
                      Resume draft
                    </Button>
                    <Button
                      type="button"
                      size="compact-xs"
                      variant="default"
                      loading={saving}
                      onClick={() => void discardOffered()}
                    >
                      Discard it and start fresh
                    </Button>
                  </div>
                </Alert>
              )}

              {applicant && (
                <div className="rounded-md border border-gray-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800">{applicant.name}</div>
                      <div className="text-xs text-gray-500">{applicant.applicantNo}</div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="light" color={APPLICANT_STATUS[applicant.status].color} radius="sm" size="sm">
                        {APPLICANT_STATUS[applicant.status].label}
                      </Badge>
                      <Badge
                        variant="outline"
                        color={applicant.isReturning ? 'brand' : 'gray'}
                        radius="sm"
                        size="sm"
                      >
                        {applicant.isReturning ? 'Returning' : 'New'}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    <Field label="Phone" value={applicant.phone} />
                    <Field label="Occupation" value={applicant.occupation} />
                  </div>
                </div>
              )}
            </Stack>
          )}

          {/* ---------- step: loan details ---------- */}
          {!submitted && current === 'details' && (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <NumberInput
                  label="Requested amount"
                  placeholder="5,000,000"
                  prefix="TZS "
                  thousandSeparator=","
                  {...num('requestedAmount')}
                />
                <Select
                  label="Interest method"
                  size="sm"
                  data={[
                    { value: 'REDUCING', label: 'Reducing balance' },
                    { value: 'FLAT', label: 'Flat' },
                  ]}
                  allowDeselect={false}
                  value={values.interestMethod}
                  onChange={(v) => set('interestMethod', (v as InterestMethod) ?? 'REDUCING')}
                />
                <NumberInput
                  label="Interest rate"
                  description="Per year"
                  placeholder="24"
                  suffix="%"
                  decimalScale={2}
                  {...num('interestRate')}
                />
                <NumberInput
                  label="Tenure"
                  description="In months"
                  placeholder="12"
                  suffix=" months"
                  {...num('tenure')}
                />
                <NumberInput
                  label="Penalty rate"
                  description="Charged once on each late installment"
                  placeholder="2"
                  suffix="%"
                  decimalScale={2}
                  {...num('penaltyRate')}
                />
              </SimpleGrid>

              {/* the estimate, with a drawer that shows how it is worked out */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-gray-50 px-4 py-3">
                <div>
                  <div className="text-xs text-gray-500">Est. monthly installment</div>
                  <div className="text-lg font-medium text-gray-800">{preview ? formatTzs(installment) : '—'}</div>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  leftSection={<AppIcon name="calculator" />}
                  onClick={() => setCalculatorOpen(true)}
                >
                  See calculation
                </Button>
              </div>

              {/* approval checks: part of Loan details, they are saved with the loan terms (LOAN_DETAILS) */}
              <div className="border-t border-gray-200 pt-4">
                <SectionTitle>Approval checks</SectionTitle>
              </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Choose which checks this application must pass. The panel on the right updates as you choose.
                </Text>
                <div className="rounded-md border border-gray-200 px-3 py-2.5">
                  <Checkbox
                    label="Guarantor required"
                    description="Adds a Guarantor step to this form where you add and verify up to 3 guarantors."
                    checked={values.guarantorRequired}
                    // the saved guarantors have to be in before unticking can delete them
                    disabled={restoringItems || saving}
                    onChange={(e) => toggleRequired('guarantor', e.currentTarget.checked)}
                  />
                </div>
                <div className="rounded-md border border-gray-200 px-3 py-2.5">
                  <Checkbox
                    label="Collateral required"
                    description="Adds a Collateral step to this form where you add and verify the assets, with their documents."
                    checked={values.collateralRequired}
                    disabled={restoringItems || saving}
                    onChange={(e) => toggleRequired('collateral', e.currentTarget.checked)}
                  />
                </div>
                <div className="rounded-md border border-gray-200 px-3 py-2.5">
                  <Checkbox
                    label="Credit assessment required"
                    description="Adds a Credit assessment step where you enter income and expenses. The system decides when the application is submitted. If switched off, the application is credit-approved without the check."
                    checked={values.creditAssessmentRequired}
                    onChange={(e) => set('creditAssessmentRequired', e.currentTarget.checked)}
                  />
                </div>
              </Stack>

              <div className="space-y-5 self-start rounded-md bg-gray-50 p-4">
                <div>
                  <SectionTitle>In this form</SectionTitle>
                  {formSteps.length > 0 ? (
                    <FlowList steps={formSteps} />
                  ) : (
                    <Text size="xs" c="dimmed">
                      Nothing extra to complete. The form goes straight to review.
                    </Text>
                  )}
                </div>
                <div>
                  <SectionTitle>After you submit</SectionTitle>
                  <FlowList steps={afterSubmit()} />
                </div>
              </div>
            </div>
            </Stack>
          )}

          {/* ---------- step: guarantors ---------- */}
          {/* a resumed draft's saved guarantors and assets: loading, or failed to load */}
          {!submitted && (current === 'guarantor' || current === 'collateral') && restoringItems && (
            <Stack gap="sm" aria-busy="true" aria-label="Loading saved cards">
              <Skeleton height={18} width="45%" radius="sm" />
              <Skeleton height={150} radius="md" />
              <Skeleton height={150} radius="md" />
            </Stack>
          )}
          {!submitted && (current === 'guarantor' || current === 'collateral') && !restoringItems && restoreError && (
            <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm">Could not load the saved {current === 'guarantor' ? 'guarantors' : 'assets'}. {restoreError.message}</Text>
                <Button
                  type="button"
                  size="compact-xs"
                  variant="light"
                  color="red"
                  onClick={() => {
                    void savedGuarantorsQuery.refetch()
                    void savedCollateralsQuery.refetch()
                  }}
                >
                  Try again
                </Button>
              </div>
            </Alert>
          )}

          {!submitted && current === 'guarantor' && !restoringItems && !restoreError && (
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Add between {MIN_GUARANTORS} and {MAX_GUARANTORS} guarantors. Each one is verified separately.
              </Text>

              {values.guarantors.map((g, i) => (
                <GuarantorCard
                  key={g.uid}
                  item={g}
                  index={i}
                  errors={guarantorErrors[g.uid]}
                  onChange={(patch) => updateGuarantor(g.uid, patch)}
                  onRemove={values.guarantors.length > MIN_GUARANTORS ? () => removeGuarantor(g.uid) : undefined}
                />
              ))}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="default"
                  disabled={values.guarantors.length >= MAX_GUARANTORS}
                  leftSection={<AppIcon name="plus" />}
                  onClick={addGuarantor}
                >
                  Add guarantor
                </Button>
                <Text size="xs" c="dimmed">
                  {values.guarantors.length} of {MAX_GUARANTORS} added
                  {values.guarantors.length >= MAX_GUARANTORS && ' (maximum reached)'}
                </Text>
              </div>
            </Stack>
          )}

          {/* ---------- step: collateral ---------- */}
          {!submitted && current === 'collateral' && !restoringItems && !restoreError && (
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Add every asset offered as security. For land or a house, add the title deed and its number if you have them.
              </Text>

              {values.collaterals.map((c, i) => (
                <CollateralCard
                  key={c.uid}
                  item={c}
                  index={i}
                  errors={collateralErrors[c.uid]}
                  onChange={(patch) => updateCollateral(c.uid, patch)}
                  onRemove={values.collaterals.length > 1 ? () => removeCollateral(c.uid) : undefined}
                />
              ))}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="default"
                  leftSection={<AppIcon name="plus" />}
                  onClick={addCollateral}
                >
                  Add asset
                </Button>
                <Text size="xs" c="dimmed">
                  {values.collaterals.length} {values.collaterals.length === 1 ? 'asset' : 'assets'} added
                </Text>
              </div>
            </Stack>
          )}

          {/* ---------- step: credit assessment ---------- */}
          {!submitted && current === 'credit' && (
            <Stack gap="md">
              <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
                <Text size="sm">
                  The system makes the credit decision when you submit the application, using these figures, the
                  applicant&apos;s existing debts and their loans with us. The numbers below are an estimate.
                </Text>
              </Alert>

              {blockers.length > 0 && (
                <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
                  <Text size="sm">
                    Not every one of the {blockers.join(' and ')} is verified yet. The credit assessment only runs
                    once they all are, so verify them (use Back) or the application will be submitted without a
                    credit decision.
                  </Text>
                </Alert>
              )}

              {/* GET /api/existing-debts: the same records the backend uses; managed on the applicant's Financial tab */}
              <div className="rounded-md border border-gray-200 px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Text size="sm" fw={600}>
                    Existing debts with other lenders
                  </Text>
                  {existingDebts.length > 0 && (
                    <Text size="xs" c="dimmed">
                      {formatTzs(debtPayments)} a month · {formatTzs(debtOutstanding)} owed
                    </Text>
                  )}
                </div>
                {debtsQuery.isLoading ? (
                  <Stack gap={6}>
                    <Skeleton height={14} radius="sm" />
                    <Skeleton height={14} width="70%" radius="sm" />
                  </Stack>
                ) : debtsQuery.error ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text size="xs" c="red">
                      Could not load the existing debts. {debtsQuery.error.message}
                    </Text>
                    <Button type="button" size="compact-xs" variant="light" color="red" onClick={() => void debtsQuery.refetch()}>
                      Try again
                    </Button>
                  </div>
                ) : existingDebts.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    None recorded for {applicant?.name ?? 'this applicant'}. Debts are added on the applicant&apos;s
                    Financial tab.
                  </Text>
                ) : (
                  <ul className="space-y-1">
                    {existingDebts.map((d) => (
                      <li key={d.id} className="flex justify-between gap-3 text-xs">
                        <span className="text-gray-700">{d.lender || 'Lender not named'}</span>
                        <span className="text-gray-500">
                          {formatTzs(d.monthly)} a month · {formatTzs(d.balance)} owed
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {applicant && (
                  <Button
                    type="button"
                    size="compact-xs"
                    variant="subtle"
                    mt={6}
                    leftSection={<AppIcon name="external-link" />}
                    component="a"
                    href={`/applicants/${applicant.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage on the Financial tab
                  </Button>
                )}
              </div>

              {/* GET /api/loans: the applicant's unfinished loans decide the default of the tick below */}
              <div className="space-y-2 rounded-md border border-gray-200 px-3 py-2.5">
                <Text size="sm" fw={600}>
                  Loans not yet completed
                </Text>
                {loansQuery.isLoading ? (
                  <Stack gap={6}>
                    <Skeleton height={14} radius="sm" />
                    <Skeleton height={14} width="60%" radius="sm" />
                  </Stack>
                ) : loansQuery.error ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text size="xs" c="red">
                      Could not load the applicant&apos;s loans. {loansQuery.error.message} Set the tick below by hand.
                    </Text>
                    <Button type="button" size="compact-xs" variant="light" color="red" onClick={() => void loansQuery.refetch()}>
                      Try again
                    </Button>
                  </div>
                ) : unfinishedLoans.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    {applicant?.name ?? 'This applicant'} has no active, awaiting-payout or written-off loans.
                  </Text>
                ) : (
                  <ul className="space-y-1">
                    {unfinishedLoans.map((l) => (
                      <li key={l.id} className="flex flex-wrap justify-between gap-x-3 text-xs">
                        <span className="text-gray-700">
                          {l.loanNo} · {l.status === 'PENDING_DISBURSEMENT' ? 'Awaiting payout' : l.status === 'WRITTEN_OFF' ? 'Written off' : 'Active'}
                          {l.overdueDays > 0 ? ` · ${l.overdueDays} days overdue` : ''}
                        </span>
                        <span className="text-gray-500">{formatTzs(l.outstanding)} still owed</span>
                      </li>
                    ))}
                  </ul>
                )}

                <Checkbox
                  label="Has pending payments"
                  description={
                    unfinishedLoans.length > 0
                      ? `Ticked automatically: ${applicant?.name ?? 'the applicant'} has ${unfinishedLoans.length} loan${
                          unfinishedLoans.length === 1 ? '' : 's'
                        } not yet completed. Untick to override. This is sent to the credit assessment.`
                      : 'Unticked because there is no unfinished loan. Tick it if you know of unpaid loans elsewhere. This is sent to the credit assessment.'
                  }
                  disabled={loansQuery.isLoading}
                  checked={values.hasPendingPayments}
                  onChange={(e) => {
                    set('hasPendingPayments', e.currentTarget.checked)
                    // a choice made by hand is kept from now on
                    if (applicant) setPendingTouchedFor(applicant.id)
                  }}
                />
                {pendingOverridden && (
                  <Text size="xs" c="orange">
                    Overridden: the unfinished loan{unfinishedLoans.length === 1 ? ' is' : 's are'} not reported as pending
                    payments.
                  </Text>
                )}
              </div>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <NumberInput
                  label="Monthly income"
                  description="Kept on the applicant's financial profile"
                  placeholder="2,000,000"
                  prefix="TZS "
                  thousandSeparator=","
                  disabled={profileQuery.isLoading}
                  {...num('monthlyIncome')}
                />
                <NumberInput
                  label="Monthly expenses"
                  description="Kept on the applicant's financial profile"
                  placeholder="800,000"
                  prefix="TZS "
                  thousandSeparator=","
                  disabled={profileQuery.isLoading}
                  {...num('monthlyExpenses')}
                />
              </SimpleGrid>

              <Textarea
                label="Notes (optional)"
                size="sm"
                autosize
                minRows={2}
                value={values.creditNotes}
                onChange={(e) => set('creditNotes', e.currentTarget.value)}
              />

              {/* an estimate only; the backend's own rule decides on submit */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Monthly cash flow', value: cashFlow === null ? '—' : formatTzs(cashFlow) },
                  { label: 'Est. installment + debt payments', value: formatTzs(installment + debtPayments) },
                  {
                    label: 'Left after both',
                    value: cashFlow === null ? '—' : formatTzs(cashFlow - installment - debtPayments),
                    warn: cashFlow !== null && cashFlow - installment - debtPayments < 0,
                  },
                ].map((t) => (
                  <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">{t.label}</div>
                    <div className={`text-lg font-medium ${t.warn ? 'text-red-600' : 'text-gray-800'}`}>{t.value}</div>
                  </div>
                ))}
              </div>
            </Stack>
          )}

          {/* ---------- step: review ---------- */}
          {!submitted && current === 'review' && (
            <Stack gap="lg">
              {preview && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Est. monthly installment', value: formatTzs(installment) },
                    { label: 'Est. total interest', value: formatTzs(interestTotal) },
                    { label: 'Est. total repayable', value: formatTzs(repayable) },
                  ].map((t) => (
                    <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
                      <div className="text-xs text-gray-500">{t.label}</div>
                      <div className="text-lg font-medium text-gray-800">{t.value}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <SectionTitle>Application</SectionTitle>
                  <Field label="Applicant" value={applicant?.name ?? ''} />
                  <Field label="Loan officer" value={officer?.label ?? ''} />
                  <Field
                    label="Requested amount"
                    value={values.requestedAmount === '' ? '' : formatTzs(values.requestedAmount)}
                  />
                  <Field label="Interest method" value={methodLabel(values.interestMethod)} />
                  <Field label="Interest rate" value={`${values.interestRate}% per year`} />
                  <Field label="Tenure" value={`${values.tenure} months`} />
                  <Field label="Penalty rate" value={`${values.penaltyRate}%`} />
                </div>

                <div className="space-y-6">
                  <div>
                    <SectionTitle>Approval checks</SectionTitle>
                    <Field label="Guarantor" value={values.guarantorRequired ? 'Required' : 'Not required'} />
                    <Field label="Collateral" value={values.collateralRequired ? 'Required' : 'Not required'} />
                    <Field
                      label="Credit assessment"
                      value={values.creditAssessmentRequired ? 'Required' : 'Switched off'}
                    />
                  </div>

                  {values.guarantorRequired &&
                    values.guarantors.map((g, i) => (
                      <div key={g.uid}>
                        <SectionTitle>{`Guarantor ${i + 1}`}</SectionTitle>
                        <Field label="Name" value={g.name} />
                        <Field label="Phone" value={g.phone} />
                        <Field label="Relationship" value={g.relationship} />
                        <Field
                          label="Verification"
                          value={guarantorVerified(g) ? 'ID and exposure verified' : 'Not fully verified'}
                        />
                      </div>
                    ))}

                  {values.collateralRequired &&
                    values.collaterals.map((c, i) => (
                      <div key={c.uid}>
                        <SectionTitle>{`Asset ${i + 1}`}</SectionTitle>
                        <Field label="Type" value={c.type} />
                        <Field label="Description" value={c.description} />
                        <Field
                          label="Estimated value"
                          value={c.value === '' ? '' : formatTzs(c.value)}
                        />
                        <Field label="Document" value={c.document ? c.document.name : 'None uploaded'} />
                        <Field
                          label="Verification"
                          value={collateralVerified(c) ? 'Ownership and pledge checked' : 'Not fully verified'}
                        />
                      </div>
                    ))}

                  {values.creditAssessmentRequired && (
                    <div>
                      <SectionTitle>Credit assessment</SectionTitle>
                      <Field
                        label="Monthly income"
                        value={values.monthlyIncome === '' ? '—' : formatTzs(values.monthlyIncome)}
                      />
                      <Field
                        label="Monthly expenses"
                        value={values.monthlyExpenses === '' ? '—' : formatTzs(values.monthlyExpenses)}
                      />
                      <Field label="Cash flow" value={cashFlow === null ? '—' : formatTzs(cashFlow)} />
                      <Field label="Existing debt payments" value={`${formatTzs(debtPayments)} a month`} />
                      <Field
                        label="Pending payments"
                        value={values.hasPendingPayments ? 'Yes' : pendingOverridden ? 'No (overridden)' : 'No'}
                      />
                      <Field label="Decision" value="Made by the system when you submit" />
                    </div>
                  )}
                  {blockers.length > 0 && (
                    <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
                      <Text size="sm">
                        Not every one of the {blockers.join(' and ')} is verified, so the credit assessment will not
                        run after you submit.
                      </Text>
                    </Alert>
                  )}
                </div>
              </div>

              <div>
                <SectionTitle>After you submit</SectionTitle>
                <FlowList steps={afterSubmit()} />
              </div>

              <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
                <Text size="sm">
                  Once submitted, the application is locked and cannot be edited. The estimate above is based on the
                  requested terms. The real repayment schedule is created when the loan is disbursed.
                </Text>
              </Alert>
            </Stack>
          )}

          {/* ---------- done ---------- */}
          {submitted && (
            <Stack gap="md">
              <Alert
                color={outcome === 'REJECTED' ? 'red' : 'brand'}
                variant="light"
                title={
                  outcome === 'REJECTED'
                    ? 'Submitted, credit assessment rejected'
                    : outcome === 'CREDIT_APPROVED'
                      ? 'Submitted, credit approved'
                      : 'Application submitted'
                }
                icon={<AppIcon name={outcome === 'REJECTED' ? 'circle-x' : 'circle-check'} />}
              >
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    {applicationNo}
                  </Text>
                  <Badge color={outcomeStatus.color} variant="light" radius="sm" tt="none">
                    {outcomeStatus.label}
                  </Badge>
                </Group>
                <Text size="sm" mt={6}>
                  {outcome === 'REJECTED'
                    ? `${applicant?.name ?? 'The applicant'}'s application did not pass the credit assessment.`
                    : outcome === 'CREDIT_APPROVED'
                      ? `${applicant?.name ?? 'The applicant'}'s application for ${
                          values.requestedAmount === '' ? '' : formatTzs(values.requestedAmount)
                        } passed the credit assessment and is ready for approval.`
                      : `${applicant?.name ?? 'The applicant'}'s application was submitted.`}
                </Text>
                {creditOutcome?.result && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {creditOutcome.result.message}
                    {creditOutcome.result.cashFlow !== null ? ` · Cash flow ${formatTzs(creditOutcome.result.cashFlow)}` : ''}
                  </Text>
                )}
              </Alert>

              {/* submitted, but the backend refused the credit assessment (e.g. something not verified) */}
              {creditOutcome?.error && (
                <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />} title="Credit assessment did not run">
                  <Text size="sm">{creditOutcome.error}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    The application stays Submitted. The assessment can be run once the reason above is resolved.
                  </Text>
                </Alert>
              )}
              <Group gap="xs">
                <Button type="button" variant="default" onClick={goBack}>
                  Back to applications
                </Button>
                <Button type="button" color="brand" onClick={startOver}>
                  Start another
                </Button>
              </Group>
            </Stack>
          )}

          {/* ---------- footer ---------- */}
          {saveError && !submitted && (
            <Alert
              color="red"
              variant="light"
              withCloseButton
              onClose={() => setSaveError(null)}
              icon={<AppIcon name="circle-x" />}
              mt="md"
            >
              <Text size="sm">{saveError}</Text>
            </Alert>
          )}
          {!submitted && (
            <Group justify="space-between" mt="xl" pt="md" className="border-t border-gray-200">
              {active > 0 ? (
                <Button
                  type="button"
                  variant="default"
                  disabled={saving}
                  leftSection={<AppIcon name="arrow-left" />}
                  onClick={() => setActive(active - 1)}
                >
                  Back
                </Button>
              ) : (
                <span />
              )}

              <Group gap="xs">
                {(
                  <>
                    {active > 0 && (
                      <Button type="button" variant="subtle" color="gray" disabled={saving || cardsNotReady} onClick={saveAndExit}>
                        Save draft and exit
                      </Button>
                    )}
                    <Button
                      type="submit"
                      color="brand"
                      loading={saving}
                      disabled={cardsNotReady}
                      leftSection={isLast ? undefined : <AppIcon name="save-check" />}
                    >
                      {isLast ? 'Submit application' : 'Save & continue'}
                    </Button>
                  </>
                )}
              </Group>
            </Group>
          )}
        </form>
      </div>

        {/* large screens: the summary stays in view on the right */}
        <aside className="hidden xl:sticky xl:top-4 xl:block">{summary}</aside>
      </div>

      <LoanCalculatorDrawer opened={calculatorOpen} onClose={() => setCalculatorOpen(false)} application={preview} />

      {/* unticking Guarantor / Collateral required once cards are filled in */}
      <ContractConfirmDialog
        opened={dropping !== null}
        title={dropping === 'guarantor' ? 'Remove guarantors' : 'Remove collateral'}
        message={
          dropping === 'guarantor'
            ? `Turn off "Guarantor required"? The guarantors entered for this application${
                dropCount > 0 ? `, including ${dropCount} already saved,` : ''
              } will be permanently deleted. This cannot be undone.`
            : `Turn off "Collateral required"? The assets entered for this application${
                dropCount > 0 ? `, including ${dropCount} already saved with their document records,` : ''
              } will be permanently deleted. This cannot be undone.`
        }
        confirmLabel={dropping === 'guarantor' ? 'Delete guarantors' : 'Delete collateral'}
        onClose={() => setDropping(null)}
        onConfirm={confirmDrop}
      />

      <ContractConfirmDialog
        opened={cancelOpen}
        title="Cancel application"
        message={`Leave without submitting? Everything entered for ${applicant?.name ?? 'this applicant'}, including any saved draft, is discarded. Use "Save draft and exit" to keep it instead.`}
        confirmLabel="Discard and leave"
        onClose={() => setCancelOpen(false)}
        onConfirm={discard}
      />
    </DashboardLayout>
  )
}