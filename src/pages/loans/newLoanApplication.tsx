import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { formatTzs } from '../../utils/format'
import { applicants, STATUS as APPLICANT_STATUS } from '../applicants/applicantsData'
import {
  afterSubmit,
  estimateInstallment,
  existingLoansFor,
  inForm,
  methodLabel,
  STATUS as LOAN_STATUS,
  totalRepayable,
  type FlowStep,
  type InterestMethod,
  type LoanApplication,
} from './loanApplicationsData'
import { ExistingLoansPanel } from './existingLoansPanel'
import { ContractConfirmDialog } from './contractDialogs'
import { clearDraft, loadDraft, saveDraft } from './draftStore'
import { AppIcon, THEMED_STEPPER_STYLES } from '../../components/appIcon'
/* ---------- types ---------- */

// each guarantor and asset has its own id so the forms keep their state when one is removed
type GuarantorItem = {
  uid: number
  name: string
  phone: string
  relationship: string
  idNumber: string
  idVerified: boolean
  exposureVerified: boolean
}

type CollateralItem = {
  uid: number
  type: string
  description: string
  value: number | ''
  ownershipVerified: boolean
  pledgeVerified: boolean
  document: File | null
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
  overrideUnpaid: boolean
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

type StepId = 'applicant' | 'details' | 'requirements' | 'guarantor' | 'collateral' | 'credit' | 'review'

type Assessment = { decision: 'APPROVE' | 'REJECT'; cashFlow: number; reason: string }

type Outcome = 'SUBMITTED' | 'CREDIT_APPROVED' | 'REJECTED'

/* ---------- constants ---------- */

// SAMPLE ONLY: loan officers come from the users API later
const LOAN_OFFICERS = [
  { value: '2', label: 'Asha Mrema' },
  { value: '3', label: 'Juma Bakari' },
]

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
  requirements: 'REQUIREMENTS',
  guarantor: 'GUARANTOR',
  collateral: 'COLLATERAL',
  credit: 'CREDIT_ASSESSMENT',
  review: 'SUBMITTED',
}

const STEP_LABEL: Record<StepId, string> = {
  applicant: 'Applicant',
  details: 'Loan details',
  requirements: 'Approval checks',
  guarantor: 'Guarantor',
  collateral: 'Collateral',
  credit: 'Credit assessment',
  review: 'Review',
}

// the icon shown on each step instead of its number
const STEP_ICON: Record<StepId, string> = {
  applicant: 'contact-round',
  details: 'banknote',
  requirements: 'square-check',
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
  idVerified: false,
  exposureVerified: false,
})

const newCollateral = (): CollateralItem => ({
  uid: nextUid++,
  type: '',
  description: '',
  value: '',
  ownershipVerified: false,
  pledgeVerified: false,
  document: null,
})

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
  overrideUnpaid: false,
})

const guarantorVerified = (g: GuarantorItem) => g.idVerified && g.exposureVerified
const collateralVerified = (c: CollateralItem) => c.ownershipVerified && c.pledgeVerified

// only applicants with approved KYC can start a loan application
const eligible = applicants.filter((a) => a.status === 'KYC_APPROVED')
const applicantOptions = eligible.map((a) => ({ value: String(a.id), label: `${a.name} · ${a.applicantNo}` }))

// guarantor, collateral and credit steps only exist when the application needs them
const stepsFor = (v: FormValues): StepId[] => [
  'applicant',
  'details',
  'requirements',
  ...(v.guarantorRequired ? (['guarantor'] as StepId[]) : []),
  ...(v.collateralRequired ? (['collateral'] as StepId[]) : []),
  ...(v.creditAssessmentRequired ? (['credit'] as StepId[]) : []),
  'review',
]

// files cannot be stored, so an uploaded deed has to be added again after a resume
const forStorage = (v: FormValues): FormValues => ({
  ...v,
  collaterals: v.collaterals.map((c) => ({ ...c, document: null })),
})

// turns saved data back into form values, null when it is not usable
function restore(raw: unknown): FormValues | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<FormValues>
  if (typeof r.applicantId !== 'string' || !Array.isArray(r.guarantors) || !Array.isArray(r.collaterals)) return null

  const merged: FormValues = { ...emptyValues(), ...r }
  if (merged.guarantors.length === 0) merged.guarantors = [newGuarantor()]
  if (merged.collaterals.length === 0) merged.collaterals = [newCollateral()]
  merged.collaterals = merged.collaterals.map((c) => ({ ...c, document: null }))

  // new guarantors and assets must not reuse an id that was already saved
  const used = [...merged.guarantors, ...merged.collaterals].map((x) => x.uid)
  nextUid = Math.max(nextUid, ...used) + 1
  return merged
}

const CARD = 'rounded-md bg-white p-6 shadow-[0_10px_30px_rgba(76,87,125,0.12)]'

/* ---------- credit decision (placeholder) ---------- */

// SAMPLE RULE: replace with the decision returned by
// POST /api/loan-origination/applications/{applicationId}/credit-assessment
function assess(income: number, expenses: number, hasUnpaidLoan: boolean, installment: number): Assessment {
  const cashFlow = income - expenses
  if (hasUnpaidLoan) {
    return {
      decision: 'REJECT',
      cashFlow,
      reason: "The applicant still has an unpaid loan, so a new loan can't be issued.",
    }
  }
  if (cashFlow < installment) {
    return {
      decision: 'REJECT',
      cashFlow,
      reason: 'Monthly cash flow does not cover the estimated installment.',
    }
  }
  return { decision: 'APPROVE', cashFlow, reason: 'Monthly cash flow covers the estimated installment.' }
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
    if (!g.relationship.trim()) e.relationship = 'Enter how the guarantor knows the applicant'
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
    if (DEED_TYPES.includes(c.type) && !c.document) e.document = 'Upload a copy of the title deed'

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
            label="Relationship to applicant"
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

        <FileInput
          label={needsDeed ? 'Title deed copy' : 'Supporting document (optional)'}
          description={
            needsDeed
              ? `A copy of the deed is required for a ${item.type.toLowerCase()}`
              : 'Ownership papers, a valuation report or similar'
          }
          placeholder="Upload PDF or image"
          size="sm"
          accept="application/pdf,image/*"
          clearable
          leftSection={<AppIcon name="upload" />}
          value={item.document}
          onChange={(f) => onChange({ document: f })}
          error={errors?.document}
        />

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
  const preselectedId = eligible.some((a) => String(a.id) === preselected) ? preselected! : ''
  const [startDraft] = useState(() => {
    const saved = preselectedId ? loadDraft<unknown>(preselectedId) : null
    const restored = saved ? restore(saved.values) : null
    return saved && restored ? { saved, values: restored } : null
  })
  const [values, setValues] = useState<FormValues>(
    () => startDraft?.values ?? { ...emptyValues(), applicantId: preselectedId },
  )
  const [errors, setErrors] = useState<Errors>({})
  const [guarantorErrors, setGuarantorErrors] = useState<ItemErrors>({})
  const [collateralErrors, setCollateralErrors] = useState<ItemErrors>({})
  const [active, setActive] = useState(() =>
    startDraft ? Math.max(0, stepsFor(startDraft.values).indexOf(startDraft.saved.stepId as StepId)) : 0,
  )
  // true once a saved draft has been loaded, so it is not offered again
  const [resumed, setResumed] = useState(startDraft !== null)
  const [notice, setNotice] = useState<string | null>(
    startDraft ? `Resumed the draft saved on ${dayjs(startDraft.saved.savedAt).format('MMM D, YYYY h:mm A')}.` : null,
  )
  const [cancelOpen, setCancelOpen] = useState(false)
  const [applicationNo, setApplicationNo] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>('SUBMITTED')
  const [assessment, setAssessment] = useState<{ result: Assessment; signature: string } | null>(null)
  const [creditError, setCreditError] = useState<string>()

  // guarantor, collateral and credit steps only exist when the application needs them
  const steps = stepsFor(values)
  const current = steps[active]
  const isLast = active === steps.length - 1

  const applicant = eligible.find((a) => String(a.id) === values.applicantId)
  const officer = LOAN_OFFICERS.find((o) => o.value === values.loanOfficerId)

  // SAMPLE ONLY: comes from the applicant's loans in the API later
  const existingLoans = applicant ? existingLoansFor(applicant.id) : []
  const hasUnpaidLoan = existingLoans.some((l) => l.outstanding > 0)
  // the restriction only applies while it hasn't been overridden
  const blockedByLoan = hasUnpaidLoan && !values.overrideUnpaid

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

    /* ---------- saved draft ---------- */

  // an applicant picked by hand may already have a saved draft
  const offered = !resumed && active === 0 && values.applicantId ? loadDraft<unknown>(values.applicantId) : null

  const resumeDraft = () => {
    if (!offered) return
    const restored = restore(offered.values)
    if (!restored) {
      clearDraft(offered.applicantId)
      setNotice('The saved draft could not be read, so it was removed.')
      return
    }
    setValues(restored)
    setErrors({})
    setGuarantorErrors({})
    setCollateralErrors({})
    setAssessment(null)
    setActive(Math.max(0, stepsFor(restored).indexOf(offered.stepId as StepId)))
    setResumed(true)
    setNotice(`Resumed the draft saved on ${dayjs(offered.savedAt).format('MMM D, YYYY h:mm A')}.`)
  }

  const discardOffered = () => {
    if (!offered) return
    clearDraft(offered.applicantId)
    setNotice('The saved draft was discarded.')
  }

  const persist = (stepId: StepId) =>
    // TODO: PUT /api/loan-applications/{id}/progress { currentStage: STAGE[stepId], ...fields }
    saveDraft<FormValues>({
      applicantId: values.applicantId,
      stepId,
      stepLabel: STEP_LABEL[stepId],
      savedAt: new Date().toISOString(),
      values: forStorage(values),
    })

  const discard = () => {
    if (values.applicantId) clearDraft(values.applicantId)
    setCancelOpen(false)
    goBack()
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

  const removeGuarantor = (uid: number) =>
    setValues((prev) =>
      prev.guarantors.length <= MIN_GUARANTORS
        ? prev
        : { ...prev, guarantors: prev.guarantors.filter((g) => g.uid !== uid) },
    )

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

  const removeCollateral = (uid: number) =>
    setValues((prev) =>
      prev.collaterals.length <= 1
        ? prev
        : { ...prev, collaterals: prev.collaterals.filter((c) => c.uid !== uid) },
    )

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

  // a result only counts while the applicant, figures, loan terms and override it was run on are unchanged
  const signature = JSON.stringify([
    values.applicantId,
    values.requestedAmount,
    values.interestMethod,
    values.interestRate,
    values.tenure,
    values.monthlyIncome,
    values.monthlyExpenses,
    blockedByLoan,
  ])
  const result = assessment && assessment.signature === signature ? assessment.result : null

  // the API only runs a credit assessment once guarantors and collateral are verified,
  // so every guarantor and every asset has to be verified
  const blockers = [
    values.guarantorRequired && !values.guarantors.every(guarantorVerified) ? 'guarantors' : null,
    values.collateralRequired && !values.collaterals.every(collateralVerified) ? 'collateral' : null,
  ].filter((b): b is string => b !== null)

  // an unpaid loan is rejected straight away, so it skips the verification gate
  const canRun = blockers.length === 0 || blockedByLoan
  const rejected = current === 'credit' && result?.decision === 'REJECT'

  /* ---------- actions ---------- */

  function runAssessment() {
    setCreditError(undefined)
    const found: Errors = {}
    if (!blockedByLoan) {
      if (values.monthlyIncome === '' || values.monthlyIncome <= 0) found.monthlyIncome = 'Enter the monthly income'
      if (values.monthlyExpenses === '' || values.monthlyExpenses < 0) {
        found.monthlyExpenses = 'Enter the monthly expenses'
      }
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const income = values.monthlyIncome === '' ? 0 : values.monthlyIncome
    const expenses = values.monthlyExpenses === '' ? 0 : values.monthlyExpenses
    // TODO: POST /api/loan-origination/applications/{applicationId}/credit-assessment
    //       { income, expenses, hasPendingPayments: hasUnpaidLoan, assessedBy, notes: values.creditNotes }
    //       and use the decision and cashFlow from the response instead of assess()
    setAssessment({ result: assess(income, expenses, blockedByLoan, installment), signature })
  }

  function next() {
    if (current === 'credit') {
      if (!result) {
        setCreditError('Run the assessment to see the decision')
        return
      }
      if (result.decision === 'REJECT') return // a denied application doesn't continue, see the footer buttons
    }

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
      setErrors(found)
      if (Object.keys(found).length > 0) return
    }

    if (isLast) {
      // TODO: POST /api/loan-applications/start { applicantId, loanOfficerId }
      //       ... (keep the existing TODO comments)
      clearDraft(values.applicantId)
      setOutcome('CREDIT_APPROVED')
      setApplicationNo(`LA-${Date.now()}`)
      setSubmitted(true)
      return
    }
    // every step forward saves the draft, so closing the tab does not lose the work
    persist(steps[active + 1])
    setActive(active + 1)
  }

  function recordRejection() {
    // TODO: the API sets the application to REJECTED when the credit assessment decision is REJECT
    clearDraft(values.applicantId)
    setOutcome('REJECTED')
    setApplicationNo(`LA-${Date.now()}`)
    setSubmitted(true)
  }

  function saveAndExit() {
    // the draft can be picked up later from the Loan applications page or Continue application
    if (values.applicantId) persist(current)
    goBack()
  }

  function startOver() {
    setValues(emptyValues())
    setErrors({})
    setGuarantorErrors({})
    setCollateralErrors({})
    setApplicationNo('')
    setSubmitted(false)
    setOutcome('SUBMITTED')
    setAssessment(null)
    setCreditError(undefined)
    setActive(0)
    setResumed(false)
    setNotice(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    next()
  }

  const outcomeStatus = LOAN_STATUS[outcome]
  const formSteps = inForm(values)

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
      <div className={CARD}>
        <Stepper
          active={submitted ? steps.length : active}
          size="xs"
          color="brand"
          styles={THEMED_STEPPER_STYLES}
          allowNextStepsSelect={false}
          onStepClick={(i) => {
            if (!submitted && i < active) setActive(i)
          }}
          mb="xl"
        >
          {steps.map((s) => (
            <Stepper.Step
              key={s}
              label={STEP_LABEL[s]}
              icon={<AppIcon name={STEP_ICON[s]} size={20} strokeWidth={1.5} />}
              completedIcon={<AppIcon name={STEP_ICON[s]} size={20} strokeWidth={1.5} />}
            />
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
                <Select
                  label="Applicant"
                  description="Only applicants with approved KYC are listed"
                  placeholder="Search by name or application number"
                  size="sm"
                  searchable
                  nothingFoundMessage="No approved applicants found"
                  data={applicantOptions}
                  allowDeselect={false}
                  value={values.applicantId || null}
                  onChange={(v) => {
                    set('applicantId', v ?? '')
                    setResumed(false)
                  }}
                  error={errors.applicantId}
                />
                <Select
                  label="Loan officer"
                  description="Handles this application"
                  placeholder="Select loan officer"
                  size="sm"
                  data={LOAN_OFFICERS}
                  allowDeselect={false}
                  value={values.loanOfficerId || null}
                  onChange={(v) => set('loanOfficerId', v ?? '')}
                  error={errors.loanOfficerId}
                />
              </SimpleGrid>

              {offered && (
                <Alert color="yellow" variant="light" title="You have a saved draft" icon={<AppIcon name="pencil" />}>
                  <Text size="sm">
                    A draft for this applicant was saved on {dayjs(offered.savedAt).format('MMM D, YYYY h:mm A')}. It
                    stopped at {offered.stepLabel}.
                  </Text>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="compact-xs" onClick={resumeDraft}>
                      Resume draft
                    </Button>
                    <Button type="button" size="compact-xs" variant="default" onClick={discardOffered}>
                      Start fresh
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
            </Stack>
          )}

          {/* ---------- step: approval checks ---------- */}
          {!submitted && current === 'requirements' && (
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
                    onChange={(e) => set('guarantorRequired', e.currentTarget.checked)}
                  />
                </div>
                <div className="rounded-md border border-gray-200 px-3 py-2.5">
                  <Checkbox
                    label="Collateral required"
                    description="Adds a Collateral step to this form where you add and verify the assets, with their documents."
                    checked={values.collateralRequired}
                    onChange={(e) => set('collateralRequired', e.currentTarget.checked)}
                  />
                </div>
                <div className="rounded-md border border-gray-200 px-3 py-2.5">
                  <Checkbox
                    label="Credit assessment required"
                    description="Adds a Credit assessment step to this form: enter income and expenses and see an approved or denied decision. If switched off, this check is skipped."
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
          )}

          {/* ---------- step: guarantors ---------- */}
          {!submitted && current === 'guarantor' && (
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
          {!submitted && current === 'collateral' && (
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Add every asset offered as security. A land or house needs a copy of its title deed.
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
              {blockers.length > 0 && !blockedByLoan && (
                <Alert
                  color="yellow"
                  variant="light"
                  icon={<AppIcon name="triangle-alert" />}
                >
                  <Text size="sm">
                    Verify every one of the {blockers.join(' and ')} first. The credit assessment can only run
                    once they are all verified. Use Back to return to that step.
                  </Text>
                </Alert>
              )}

              <ExistingLoansPanel
                applicantName={applicant?.name ?? 'The applicant'}
                loans={existingLoans}
                overridden={values.overrideUnpaid}
              />

              {hasUnpaidLoan && (
                <div className="rounded-md border border-gray-200 px-3 py-2.5">
                  <Checkbox
                    label="Override active or unpaid loans"
                    description="Skips the unpaid loan restriction for this application. The cash flow check still applies."
                    checked={values.overrideUnpaid}
                    onChange={(e) => set('overrideUnpaid', e.currentTarget.checked)}
                  />
                </div>
              )}

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <NumberInput
                  label="Monthly income"
                  placeholder="2,000,000"
                  prefix="TZS "
                  thousandSeparator=","
                  disabled={blockedByLoan}
                  {...num('monthlyIncome')}
                />
                <NumberInput
                  label="Monthly expenses"
                  placeholder="800,000"
                  prefix="TZS "
                  thousandSeparator=","
                  disabled={blockedByLoan}
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: 'Monthly cash flow',
                    value: blockedByLoan || cashFlow === null ? '—' : formatTzs(cashFlow),
                  },
                  { label: 'Est. monthly installment', value: formatTzs(installment) },
                  {
                    label: 'Left after installment',
                    value: blockedByLoan || cashFlow === null ? '—' : formatTzs(cashFlow - installment),
                  },
                ].map((t) => (
                  <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">{t.label}</div>
                    <div className="text-lg font-medium text-gray-800">{t.value}</div>
                  </div>
                ))}
              </div>

              <div>
                <Button
                  type="button"
                  color="brand"
                  variant={result ? 'default' : 'filled'}
                  disabled={!canRun}
                  leftSection={<AppIcon name="calculator" />}
                  onClick={runAssessment}
                >
                  {result ? 'Run again' : 'Run assessment'}
                </Button>
                {creditError && (
                  <Text size="sm" c="red" mt={6}>
                    {creditError}
                  </Text>
                )}
              </div>

              {result && (
                <Alert
                  color={result.decision === 'APPROVE' ? 'brand' : 'red'}
                  variant="light"
                  title={result.decision === 'APPROVE' ? 'Approved' : 'Denied'}
                  icon={
                    <AppIcon name={result.decision === 'APPROVE' ? 'circle-check' : 'circle-x'} />
                  }
                >
                  <Text size="sm">{result.reason}</Text>
                  {result.decision === 'REJECT' && !blockedByLoan && (
                    <Text size="sm" mt={6}>
                      You can change the loan terms and run it again, or record the rejection.
                    </Text>
                  )}
                </Alert>
              )}
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

                  {values.creditAssessmentRequired && result && (
                    <div>
                      <SectionTitle>Credit assessment</SectionTitle>
                      <Field label="Decision" value={result.decision === 'APPROVE' ? 'Approved' : 'Denied'} />
                      {values.overrideUnpaid && hasUnpaidLoan && (
                        <Field label="Unpaid loan check" value="Overridden" />
                      )}
                      <Field
                        label="Monthly income"
                        value={values.monthlyIncome === '' ? '—' : formatTzs(values.monthlyIncome)}
                      />
                      <Field
                        label="Monthly expenses"
                        value={values.monthlyExpenses === '' ? '—' : formatTzs(values.monthlyExpenses)}
                      />
                      <Field label="Cash flow" value={formatTzs(result.cashFlow)} />
                    </div>
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
                title={outcome === 'REJECTED' ? 'Application rejected' : 'Application submitted'}
                icon={
                  <AppIcon name={outcome === 'REJECTED' ? 'circle-x' : 'circle-check'} />
                }
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
                    ? `${applicant?.name}'s application was rejected. ${result?.reason ?? ''}`
                    : `${applicant?.name}'s application for ${
                        values.requestedAmount === '' ? '' : formatTzs(values.requestedAmount)
                      } is ready for approval.`}
                </Text>
              </Alert>
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
          {!submitted && (
            <Group justify="space-between" mt="xl" pt="md" className="border-t border-gray-200">
              {active > 0 ? (
                <Button
                  type="button"
                  variant="default"
                  leftSection={<AppIcon name="arrow-left" />}
                  onClick={() => setActive(active - 1)}
                >
                  Back
                </Button>
              ) : (
                <span />
              )}

              <Group gap="xs">
                {rejected ? (
                  <>
                    {!blockedByLoan && (
                      <Button type="button" variant="default" onClick={() => setActive(steps.indexOf('details'))}>
                        Change loan terms
                      </Button>
                    )}
                    <Button type="button" color="red" onClick={recordRejection}>
                      Record rejection
                    </Button>
                  </>
                ) : (
                  <>
                    {active > 0 && (
                      <Button type="button" variant="subtle" color="gray" onClick={saveAndExit}>
                        Save draft and exit
                      </Button>
                    )}
                    <Button type="submit" color="brand">
                      {isLast ? 'Submit application' : 'Next'}
                    </Button>
                  </>
                )}
              </Group>
            </Group>
          )}
        </form>
      </div>

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