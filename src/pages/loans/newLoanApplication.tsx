import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CloseButton,
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
  Tooltip,
} from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { NIDA_DIGITS, formatNida, formatTzs, nidaDigitCount } from '../../utils/format'
import { STATUS as APPLICANT_STATUS } from '../applicants/applicantsData'
import { useApplicants } from '../../api/applicants'
import { toUser, useApiUsers } from '../../api/users'
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
import { useServerHierarchies, useServerLevels } from '../../api/approvalHierarchy'
import { useRoles } from '../administration/roles/rolesContext'
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
  sendGuarantorOtp,
  verifyGuarantorOtp,
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
import { notifications } from '@mantine/notifications'
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
  email: string
  locationName: string
  locationPin: string
  /** the guarantor confirmed with the emailed code (status VERIFIED on the server) */
  otpVerified: boolean
  /** the officer's tick: the guarantor's existing debts and guarantees were checked (needed to verify) */
  exposureChecked: boolean
  /** when the last code was sent in this session, for the 60 second resend wait and the 24 hour note */
  otpSentAt: number | null
  /** the guarantor's id on the server, null until it is first saved */
  serverId: number | null
  /** what was last saved, so an unchanged card is not sent again */
  savedSig: string
}

type CollateralItem = {
  uid: number
  type: string
  /** the exact asset typed in when the type is 'Other', e.g. "Livestock" */
  otherType: string
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


const COLLATERAL_TYPES = ['Land', 'House', 'Vehicle', 'Equipment', 'Other']
// these need a copy of the title deed
const DEED_TYPES = ['Land', 'House']

// the guarantor limit is a business rule in this form, the API doesn't set one
const MIN_GUARANTORS = 1
const MAX_GUARANTORS = 3

const PHONE = /^0\d{9}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  email: '',
  locationName: '',
  locationPin: '',
  otpVerified: false,
  exposureChecked: false,
  otpSentAt: null,
  serverId: null,
  savedSig: '',
})

const newCollateral = (): CollateralItem => ({
  uid: nextUid++,
  type: '',
  otherType: '',
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

// the type saved and shown: the typed-in asset when 'Other' is picked, otherwise the list value
const assetType = (c: Pick<CollateralItem, 'type' | 'otherType'>) =>
  c.type === 'Other' ? c.otherType.trim() : c.type

/* ---------- what is saved for each card (compared with what was saved last time) ---------- */

function sigOfGuarantor(
  g: Pick<GuarantorItem, 'name' | 'phone' | 'idNumber' | 'address' | 'email' | 'locationName' | 'locationPin'>,
) {
  return JSON.stringify(
    [g.name, g.phone, g.idNumber, g.address, g.email, g.locationName, g.locationPin].map((x) => x.trim()),
  )
}
function sigOfCollateral(c: Pick<CollateralItem, 'type' | 'otherType' | 'description' | 'value'>) {
  return JSON.stringify([assetType(c), c.description.trim(), c.value])
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
      email: s.email,
      locationName: s.locationName,
      locationPin: s.locationPin,
      // the officer's tick was required to verify, so a verified guarantor has it
      otpVerified: s.idVerified,
      exposureChecked: s.idVerified,
      // a code sent before leaving the page is still running (remembered in this browser)
      otpSentAt: s.idVerified ? null : recalledOtpSent(s.id),
      serverId: s.id,
    }
    return { ...g, savedSig: sigOfGuarantor(g) }
  })
}

function collateralsFromServer(list: SavedCollateral[]): CollateralItem[] {
  if (list.length === 0) return [newCollateral()]
  return list.map((s) => {
    const c: CollateralItem = {
      ...newCollateral(),
      type: COLLATERAL_TYPES.includes(s.collateralType) ? s.collateralType : s.collateralType ? 'Other' : '',
      // a type that is not in the list was typed in under 'Other'
      otherType: COLLATERAL_TYPES.includes(s.collateralType) ? '' : s.collateralType,
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

const guarantorVerified = (g: GuarantorItem) => g.otpVerified
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
  /** the approval hierarchy shown on Loan details (screen only for now) */
  hierarchyName: string
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
  hierarchyName,
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
          ['Recorded by', shown(officerName)],
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
          ['Approval hierarchy', shown(hierarchyName)],
        ]
      case 'guarantor':
        return v.guarantors.map((g, i) => [
          `Guarantor ${i + 1}`,
          g.name.trim() ? `${g.name.trim()}${guarantorVerified(g) ? ' · verified' : ''}` : '—',
        ])
      case 'collateral':
        return v.collaterals.map((c, i) => [
          `Asset ${i + 1}`,
          c.type ? `${assetType(c) || c.type}${c.value !== '' ? ` · ${formatTzs(c.value)}` : ''}${collateralVerified(c) ? ' · verified' : ''}` : '—',
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
    need('loanOfficerId', 'Your user could not be read. Log out and back in, then try again.')
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

// requireVerified: Save & continue needs every guarantor confirmed by OTP; saving a draft does not,
// because a guarantor may take up to a day to answer
function validateGuarantors(list: GuarantorItem[], requireVerified = false): ItemErrors {
  const out: ItemErrors = {}
  const seen = new Set<string>()

  list.forEach((g) => {
    const e: Record<string, string> = {}
    if (!g.name.trim()) e.name = 'Enter the guarantor name'
    // relationship is optional: the guarantor table has no column for it yet, so it cannot be restored
    if (!g.address.trim()) e.address = 'Enter the guarantor address'
    if (!g.locationName.trim()) e.locationName = 'Enter the location name'
    // location pin is optional
    if (!g.phone.trim()) e.phone = 'Enter a phone number'
    else if (!PHONE.test(g.phone.trim())) e.phone = 'Enter 10 digits starting with 0'
    if (!g.email.trim()) e.email = 'Enter an email address'
    else if (!EMAIL.test(g.email.trim())) e.email = 'Enter a valid email address'

    // compared by digits only, so "1990..." and "1990-..." count as the same number
    const nida = g.idNumber.replace(/\D/g, '')
    if (!nida) e.idNumber = 'Enter the guarantor NIDA number'
    else if (nida.length !== NIDA_DIGITS)
      e.idNumber = `The NIDA number must have ${NIDA_DIGITS} digits (${nidaDigitCount(g.idNumber)} entered)`
    else if (seen.has(nida)) e.idNumber = 'Another guarantor already has this NIDA number'
    else seen.add(nida)

    if (requireVerified && !g.otpVerified) {
      if (!g.exposureChecked) e.exposure = "Tick this once the guarantor's debts and guarantees are checked"
      e.otp = 'Verify this guarantor with the code sent to their email before continuing'
    }

    if (Object.keys(e).length > 0) out[g.uid] = e
  })

  return out
}

function validateCollaterals(list: CollateralItem[]): ItemErrors {
  const out: ItemErrors = {}

  list.forEach((c) => {
    const e: Record<string, string> = {}
    if (!c.type) e.type = 'Select the collateral type'
    else if (c.type === 'Other' && !c.otherType.trim()) e.type = 'Type the exact asset, e.g. Livestock'
    // description is optional
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

/* ---------- guarantor verification by email code (required) ---------- */

// the API's rules: a code lasts 24 hours, a new one can be sent 60 seconds after the last
const OTP_VALID_MS = 24 * 60 * 60 * 1000
const OTP_RESEND_SECONDS = 60
// the moment a code was sent; read in event handlers only, never while rendering
const timeNow = () => Date.now()

// When a code was sent is remembered in this browser per saved guarantor, so leaving the page and coming back
// keeps "Code sent", the resend wait and the "valid until" time. The API cannot tell us (otp_verification is
// Admin-only). Storage can be unavailable (private mode), so every read and write is guarded
const otpSentKey = (guarantorId: number) => `fundora.guarantorOtpSentAt.${guarantorId}`

function rememberOtpSent(guarantorId: number, at: number) {
  try {
    window.localStorage.setItem(otpSentKey(guarantorId), String(at))
  } catch {
    // not remembered; the card simply shows "Send code" after a reload
  }
}

function forgetOtpSent(guarantorId: number) {
  try {
    window.localStorage.removeItem(otpSentKey(guarantorId))
  } catch {
    // nothing to clean up
  }
}

// the remembered send time, or null when there is none or the code has run out (older than 24 hours)
function recalledOtpSent(guarantorId: number): number | null {
  try {
    const at = Number(window.localStorage.getItem(otpSentKey(guarantorId)))
    if (!at) return null
    if (Date.now() - at > OTP_VALID_MS) {
      forgetOtpSent(guarantorId)
      return null
    }
    return at
  } catch {
    return null
  }
}
const mmss =(s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

type GuarantorVerificationProps = {
  item: GuarantorItem
  errors?: Record<string, string>
  onChange: (patch: Partial<GuarantorItem>) => void
  /** saves the card if needed, then POST .../otp/send */
  onSend: () => Promise<void>
  /** POST .../otp/verify with the code the guarantor read out */
  onVerify: (code: string) => Promise<void>
}

function GuarantorVerification({ item, errors, onChange, onSend, onVerify }: GuarantorVerificationProps) {
  const [now, setNow] = useState(() => Date.now())
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // ticks every second during the 60 second resend wait
  const sentAt = item.otpSentAt
  useEffect(() => {
    if (sentAt === null || item.otpVerified) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sentAt, item.otpVerified])

  const resendIn = sentAt === null ? 0 : Math.max(0, OTP_RESEND_SECONDS - Math.floor((now - sentAt) / 1000))
  const emailOk = EMAIL.test(item.email.trim())
  // a saved guarantor may still have a code from earlier (it lasts 24 hours), so the box opens once it is saved
  const canEnterCode = item.serverId !== null || sentAt !== null

  const act = async (kind: 'send' | 'verify') => {
    if (busy) return
    setBusy(kind)
    setMessage(null)
    try {
      if (kind === 'send') {
        await onSend()
        setCode('')
        setNow(Date.now())
        setMessage({ text: `Code sent to ${item.email.trim()}.`, ok: true })
      } else {
        await onVerify(code)
        setMessage(null)
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Something went wrong. Please try again.', ok: false })
    } finally {
      setBusy(null)
    }
  }

  if (item.otpVerified) {
    return (
      <Alert color="brand" variant="light" icon={<AppIcon name="circle-check" />} title="Verified by email code">
        <Text size="xs">
          The guarantor confirmed with the code sent to {item.email.trim() || 'their email'}, and their existing debts
          and guarantees were checked. Their details are locked.
        </Text>
      </Alert>
    )
  }

  return (
    <div className={`space-y-2 rounded-md px-3 py-2.5 ${errors?.otp ? 'bg-red-50' : 'bg-gray-50'}`}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>
          Guarantor verification
        </Text>
        <Badge size="xs" variant="light" color={sentAt !== null ? 'yellow' : 'gray'}>
          {sentAt !== null ? 'Code sent' : 'Not sent'}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed">
        The guarantor confirms by reading back the 6-digit code emailed to them. It stays valid for 24 hours.
      </Text>

      <Checkbox
        label="I checked this guarantor's existing debts and guarantees"
        checked={item.exposureChecked}
        onChange={(e) => onChange({ exposureChecked: e.currentTarget.checked })}
        error={errors?.exposure}
      />

      <Group gap="xs" align="flex-end">
        <TextInput
          label="6-digit code"
          placeholder="000000"
          size="sm"
          w={170}
          maxLength={6}
          inputMode="numeric"
          disabled={!canEnterCode || busy !== null}
          styles={{ input: { letterSpacing: 6, textAlign: 'center' } }}
          value={code}
          onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
        />
        <Button
          type="button"
          size="sm"
          leftSection={<AppIcon name="check" />}
          loading={busy === 'verify'}
          disabled={code.length !== 6 || !item.exposureChecked || busy === 'send'}
          onClick={() => void act('verify')}
        >
          Verify
        </Button>
        <Button
          type="button"
          size="sm"
          variant={sentAt === null ? 'light' : 'subtle'}
          color={sentAt === null ? 'brand' : 'gray'}
          leftSection={<AppIcon name="mail" />}
          loading={busy === 'send'}
          disabled={!emailOk || resendIn > 0 || busy === 'verify'}
          onClick={() => void act('send')}
        >
          {sentAt === null ? 'Send code' : resendIn > 0 ? `Resend in ${mmss(resendIn)}` : 'Resend code'}
        </Button>
      </Group>

      <Text size="xs" c={message && !message.ok ? 'red' : 'dimmed'}>
        {message
          ? message.text
          : sentAt !== null
            ? `Code sent to ${item.email.trim()}, valid until ${dayjs(sentAt + OTP_VALID_MS).format('D MMM, HH:mm')}.`
            : !emailOk
              ? 'Enter the guarantor email above to send a code.'
              : item.serverId !== null
                ? 'If a code was sent earlier (it lasts 24 hours), enter it, or send a new one.'
                : 'Send code saves this guarantor and emails them the code.'}
      </Text>
      {!item.exposureChecked && code.length === 6 && (
        <Text size="xs" c="dimmed">
          Tick the debts and guarantees check above to verify.
        </Text>
      )}
      {errors?.otp && (
        <Text size="xs" c="red">
          {errors.otp}
        </Text>
      )}
    </div>
  )
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
  onSend: () => Promise<void>
  onVerify: (code: string) => Promise<void>
}

function GuarantorCard({ item, index, errors, onChange, onRemove, onSend, onVerify }: GuarantorCardProps) {
  // once the guarantor confirmed by code, who they are can no longer change
  const locked = item.otpVerified
  return (
    <CardShell title={`Guarantor ${index + 1}`} verified={guarantorVerified(item)} onRemove={onRemove}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Full name"
            placeholder="Joseph Massawe"
            size="sm"
            readOnly={locked}
            value={item.name}
            onChange={(e) => onChange({ name: e.currentTarget.value })}
            error={errors?.name}
          />
          <TextInput
            label="NIDA number"
            placeholder="YYYYMMDD-XXXXX-XXXXX-XX"
            inputMode="numeric"
            size="sm"
            readOnly={locked}
            value={item.idNumber}
            // digits only, at most 20, with the hyphens added as you type (same as applicant registration)
            onChange={(e) => onChange({ idNumber: formatNida(e.currentTarget.value) })}
            error={errors?.idNumber}
          />
          <TextInput
            label="Phone"
            placeholder="0700000000"
            size="sm"
            maxLength={10}
            inputMode="numeric"
            readOnly={locked}
            value={item.phone}
            // digits only, at most 10
            onChange={(e) => onChange({ phone: e.currentTarget.value.replace(/\D/g, '').slice(0, 10) })}
            error={
              errors?.phone ??
              // once something is typed, say how many digits are still missing
              (item.phone && !PHONE.test(item.phone)
                ? item.phone.startsWith('0')
                  ? `Enter 10 digits (${item.phone.length} entered)`
                  : 'The phone number must start with 0'
                : undefined)
            }
          />
          <TextInput
            label="Email"
            placeholder="joseph@example.com"
            size="sm"
            type="email"
            readOnly={locked}
            value={item.email}
            onChange={(e) => onChange({ email: e.currentTarget.value })}
            error={errors?.email}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Address"
            placeholder="Plot 12, Mikocheni, Dar es Salaam"
            size="sm"
            value={item.address}
            onChange={(e) => onChange({ address: e.currentTarget.value })}
            error={errors?.address}
          />
          <TextInput
            label="Location name"
            placeholder="Dar es Salaam City Center"
            size="sm"
            value={item.locationName}
            onChange={(e) => onChange({ locationName: e.currentTarget.value })}
            error={errors?.locationName}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Location pin (optional)"
            placeholder="TZ-DOM-001"
            size="sm"
            value={item.locationPin}
            onChange={(e) => onChange({ locationPin: e.currentTarget.value })}
            error={errors?.locationPin}
          />
          <TextInput
            label="Relationship to applicant (optional)"
            description="Not saved yet, the backend has no field for it"
            // the note goes under the box so both boxes in this row line up
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            placeholder="Brother"
            size="sm"
            value={item.relationship}
            onChange={(e) => onChange({ relationship: e.currentTarget.value })}
            error={errors?.relationship}
          />
        </SimpleGrid>

        <GuarantorVerification item={item} errors={errors} onChange={onChange} onSend={onSend} onVerify={onVerify} />
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
          {item.type === 'Other' ? (
            // 'Other' turns the list into a text box for the exact asset; the x goes back to the list
            <TextInput
              label="Collateral type"
              placeholder="Type the asset, e.g. Livestock"
              size="sm"
              autoFocus
              value={item.otherType}
              onChange={(e) => onChange({ otherType: e.currentTarget.value })}
              error={errors?.type}
              rightSection={
                <Tooltip label="Back to the list" withArrow>
                  <CloseButton size="sm" aria-label="Back to the list" onClick={() => onChange({ type: '', otherType: '' })} />
                </Tooltip>
              }
            />
          ) : (
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
          )}
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
          label="Description (optional)"
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

  // "Recorded by": the logged-in user who captures the application, saved as loan_officer_id.
  // A resumed draft keeps the user who started it
  const { user: me } = useAuth()
  // GET /api/users is Admin-only, so it is used just to name another user's draft; a failure is fine
  const usersQuery = useApiUsers()
  const userNameOf = (id: string): string => {
    if (!id) return ''
    if (me && String(me.id) === id) return me.name || me.username
    const u = (usersQuery.data ?? []).map((raw) => toUser(raw, [])).find((x) => String(x.id) === id)
    return u ? (u.name !== 'Unknown' ? u.name : u.username) : `User #${id}`
  }

  /* ---------- approval hierarchy (screen only: the backend cannot store it per loan yet) ---------- */

  // GET /api/approval-hierarchys + their levels: active hierarchies with at least one active level
  const { can } = useRoles()
  const canChangeHierarchy = can('loans', 'change-hierarchy', 'applications')
  const hierarchiesQuery = useServerHierarchies()
  const hierarchyLevels = useServerLevels((hierarchiesQuery.data ?? []).map((h) => h.id))
  const hierarchyOptions = (hierarchiesQuery.data ?? [])
    .map((h) => ({ ...h, levels: hierarchyLevels.filter((l) => l.hierarchyId === h.id && l.isActive) }))
    .filter((h) => h.isActive && h.levels.length > 0)
  // null = not changed, so the hierarchy in use (is_default = true) is shown
  const [hierarchyChoice, setHierarchyChoice] = useState<number | null>(null)
  const defaultHierarchy = hierarchyOptions.find((h) => h.isDefault)
  const chosenHierarchy = hierarchyOptions.find((h) => h.id === hierarchyChoice) ?? defaultHierarchy
  const hierarchyLabel = (h: (typeof hierarchyOptions)[number]) =>
    `${h.name} · ${h.levels.length} ${h.levels.length === 1 ? 'level' : 'levels'}${h.isDefault ? ' (in use)' : ''}`

  const defaultOfficerId = me ? String(me.id) : ''
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

  // an empty "Recorded by" (new form, or a draft saved without one) is the logged-in user;
  // a draft's own recorder is never overwritten
  if (!values.loanOfficerId && defaultOfficerId) {
    setValues((prev) => (prev.loanOfficerId ? prev : { ...prev, loanOfficerId: defaultOfficerId }))
  }

  // guarantor, collateral and credit steps only exist when the application needs them
  const steps = stepsFor(values)
  const current = steps[active]
  const isLast = active === steps.length - 1

  const applicant = eligible.find((a) => String(a.id) === values.applicantId)
  const recorderName = userNameOf(values.loanOfficerId)
  const recordedByMe = !!me && values.loanOfficerId === String(me.id)

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
  // isFetchedAfterMount: wait for a fresh read, not the copy cached the last time the wizard was open
  if (!autoResumeTried && preselectedId && latestQuery.isFetchedAfterMount) {
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
  // a copy remembered from an earlier visit may predate cards saved since (e.g. by Send code), so the cards
  // are only restored from a fresh read made after the wizard opened
  const freshItems =
    savedGuarantorsQuery.isFetchedAfterMount &&
    savedCollateralsQuery.isFetchedAfterMount &&
    !savedGuarantorsQuery.isFetching &&
    !savedCollateralsQuery.isFetching
  const restoreError = restoreItemsFor !== null ? (savedGuarantorsQuery.error ?? savedCollateralsQuery.error) : null
  const restoringItems = restoreItemsFor !== null && !freshItems && !restoreError
  // saving before the saved cards are in would send the blank cards as new records
  const cardsNotReady = (current === 'guarantor' || current === 'collateral') && (restoringItems || !!restoreError)

  // once both have loaded, they replace the blank cards, one time per resumed draft
  const [itemsRestoredFor, setItemsRestoredFor] = useState<number | null>(null)
  if (
    restoreItemsFor !== null &&
    itemsRestoredFor !== restoreItemsFor &&
    freshItems &&
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
    [g.name, g.phone, g.idNumber, g.address, g.email, g.locationName, g.locationPin, g.relationship].some(
      (x) => x.trim() !== '',
    ) ||
    g.otpVerified ||
    g.exposureChecked
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

  // POST/PUT one guarantor card (only when new or changed); answers its id on the server
  const saveGuarantorCard = async (applicationId: number, g: GuarantorItem): Promise<{ serverId: number; sig: string }> => {
    const sig = sigOfGuarantor(g)
    if (g.serverId !== null && sig === g.savedSig) return { serverId: g.serverId, sig }
    const serverId = await saveGuarantor(applicationId, g.serverId, {
      fullName: g.name.trim(),
      phone: g.phone.trim(),
      idNumber: g.idNumber.trim(),
      address: g.address.trim(),
      email: g.email.trim(),
      locationName: g.locationName.trim(),
      locationPin: g.locationPin.trim(),
    })
    return { serverId, sig }
  }

  // POST/PUT each changed guarantor and DELETE (deactivate) the removed ones. Verification is not part of
  // saving any more: each guarantor confirms by email code on their card
  const syncGuarantors = async (applicationId: number): Promise<string[]> => {
    for (const id of removedGuarantorIds) await deleteGuarantor(id)
    setRemovedGuarantorIds([])

    const saved = new Map<number, { serverId: number; sig: string }>()
    for (const g of values.guarantors) saved.set(g.uid, await saveGuarantorCard(applicationId, g))
    // keep anything typed while saving, only the server ids and saved markers change
    setValues((prev) => ({
      ...prev,
      guarantors: prev.guarantors.map((g) => {
        const s = saved.get(g.uid)
        return s ? { ...g, serverId: s.serverId, savedSig: s.sig } : g
      }),
    }))
    return []
  }

  // Send code on a card: the card must be complete, it is saved first (the code goes to the saved email),
  // then POST .../otp/send. An error is thrown back to the card and shown there
  const sendGuarantorCode = async (uid: number) => {
    const g = values.guarantors.find((x) => x.uid === uid)
    if (!g) return
    const found = validateGuarantors(values.guarantors)[uid]
    if (found) {
      setGuarantorErrors((prev) => ({ ...prev, [uid]: found }))
      throw new Error('Complete this guarantor’s details first.')
    }
    const applicationId = await ensureDraft()
    const { serverId, sig } = await saveGuarantorCard(applicationId, g)
    updateGuarantor(uid, { serverId, savedSig: sig })
    await sendGuarantorOtp(applicationId, serverId)
    const sentAt = timeNow()
    rememberOtpSent(serverId, sentAt)
    updateGuarantor(uid, { otpSentAt: sentAt })
  }

  // Verify on a card: POST .../otp/verify; success marks the guarantor VERIFIED on the server
  const verifyGuarantorCode = async (uid: number, code: string) => {
    const g = values.guarantors.find((x) => x.uid === uid)
    if (!g) return
    if (!me) throw new Error('Your user could not be read. Log out and back in, then try again.')
    if (!g.exposureChecked) throw new Error("Tick the debts and guarantees check first.")
    if (g.serverId === null || draftId === null) throw new Error('Send a code to this guarantor first.')
    // the code went to the details that were saved; edited details need a new code
    if (sigOfGuarantor(g) !== g.savedSig) throw new Error('The details changed after the code was sent. Send a new code.')
    await verifyGuarantorOtp(draftId, g.serverId, {
      code,
      verifiedBy: me.id,
      remarks: `Verified via email OTP sent to ${g.email.trim()}. The officer checked the guarantor's existing debts and guarantees.`,
    })
    forgetOtpSent(g.serverId)
    updateGuarantor(uid, { otpVerified: true })
    setGuarantorErrors((prev) => {
      const next = { ...prev }
      delete next[uid]
      return next
    })
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
              collateralType: assetType(c),
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
          warnings.push(`${assetType(c) || 'An asset'}: ${err instanceof Error ? err.message : 'verification failed'}`)
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
          loanOfficer: recorderName,
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
      // every guarantor must be confirmed by email code before the form moves on
      const found = validateGuarantors(values.guarantors, true)
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
        const result =
          credit.result?.decision === 'REJECT'
            ? 'REJECTED'
            : credit.result?.decision === 'APPROVE' || (credit.result && !values.creditAssessmentRequired)
              ? 'CREDIT_APPROVED'
              : 'SUBMITTED'
        setOutcome(result)
        setSubmitted(true)

        // top-right toast; the page below still shows the full outcome
        const no = done.applicationNo || applicationNo || 'The application'
        notifications.show(
          result === 'REJECTED'
            ? {
                color: 'red',
                title: 'Application submitted, credit check failed',
                message: `${no} was submitted but rejected by the credit assessment.`,
                icon: <AppIcon name="circle-x" size={16} />,
              }
            : {
                color: 'brand',
                title: 'Application submitted',
                message:
                  result === 'CREDIT_APPROVED'
                    ? `${no} passed the credit assessment and is waiting for approval.`
                    : `${no} was submitted successfully.`,
                icon: <AppIcon name="check" size={16} />,
              },
        )
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
    setHierarchyChoice(null)
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
      officerName={recorderName}
      hierarchyName={chosenHierarchy?.name ?? ''}
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
                {/* who captures this application: not chosen, it is the logged-in user (or the draft's recorder) */}
                <TextInput
                  label="Recorded by"
                  description={recordedByMe ? 'You, the logged-in user' : 'The user who started this draft'}
                  size="sm"
                  readOnly
                  value={recorderName}
                  rightSection={<AppIcon name="lock-keyhole" size={14} className="text-gray-400" />}
                  error={errors.loanOfficerId}
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

                {/* who approves this loan: the hierarchy in use, or another one for users allowed to change it.
                    Screen only for now, the backend cannot store a hierarchy per loan yet */}
                <Select
                  label="Approval hierarchy"
                  description={
                    chosenHierarchy
                      ? `Path: ${chosenHierarchy.levels.map((l) => `${l.levelName} (${l.requiredRole})`).join(' → ')}${
                          canChangeHierarchy ? '' : '. Set by your organization.'
                        }`
                      : undefined
                  }
                  placeholder={
                    hierarchiesQuery.isPending
                      ? 'Loading hierarchies…'
                      : hierarchiesQuery.isError
                        ? 'Could not load the hierarchies'
                        : 'No hierarchy with an active level'
                  }
                  size="sm"
                  data={hierarchyOptions.map((h) => ({ value: String(h.id), label: hierarchyLabel(h) }))}
                  value={chosenHierarchy ? String(chosenHierarchy.id) : null}
                  onChange={(v) => setHierarchyChoice(v ? Number(v) : null)}
                  allowDeselect={false}
                  readOnly={!canChangeHierarchy}
                  disabled={hierarchiesQuery.isPending || submitted}
                  rightSection={
                    canChangeHierarchy ? undefined : <AppIcon name="lock-keyhole" size={14} className="text-gray-400" />
                  }
                />
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
                  onSend={() => sendGuarantorCode(g.uid)}
                  onVerify={(code) => verifyGuarantorCode(g.uid, code)}
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
                  <Field label="Recorded by" value={recorderName} />
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
                    <Field
                      label="Approval hierarchy"
                      value={
                        chosenHierarchy
                          ? `${chosenHierarchy.name} (${chosenHierarchy.levels.map((l) => l.levelName).join(' → ')})`
                          : '—'
                      }
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
                          value={guarantorVerified(g) ? 'Verified by email code' : 'Not verified'}
                        />
                      </div>
                    ))}

                  {values.collateralRequired &&
                    values.collaterals.map((c, i) => (
                      <div key={c.uid}>
                        <SectionTitle>{`Asset ${i + 1}`}</SectionTitle>
                        <Field label="Type" value={assetType(c)} />
                        <Field label="Description" value={c.description || '—'} />
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
                <Button type="button" variant="default" leftSection={<AppIcon name="arrow-left" />} onClick={goBack}>
                  Back to applications
                </Button>
                <Button type="button" color="brand" onClick={startOver}>
                  New application
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