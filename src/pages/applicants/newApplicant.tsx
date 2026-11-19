import { AppIcon, stepIcon } from '../../components/appIcon'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  FileInput,
  Group,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
} from '@mantine/core'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DateInput } from '@mantine/dates'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { ErrorState, LoadingState } from '../../components/pageState'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import {
  saveAddressDetailsRequest,
  saveIdentificationRequest,
  savePersonalDetailsRequest,
  sendOtpRequest,
  useApplicant,
  useDeleteApplicant,
  useUpdateApplicant,
  verifyOtpRequest,
} from '../../api/applicants'
import { AFRICAN_NATIONALITIES } from './africanCountries'
import { STATUS, registrationStepsDone, type Applicant, type ApplicantStatus } from './applicantsData'

type FormValues = {
  firstName: string
  middleName: string
  lastName: string
  gender: string
  dateOfBirth: string
  phone: string
  email: string
  isReturning: boolean
  address: string
  locationName: string
  locationPin: string
  nationality: string
  occupation: string
  nidaNumber: string
  tinNumber: string
  nidaDocument: File | null
  idScan: File | null
}

type StringKey = {
  [K in keyof FormValues]: FormValues[K] extends string ? K : never
}[keyof FormValues]

type Errors = Partial<Record<keyof FormValues, string>>

const emptyValues: FormValues = {
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  isReturning: false,
  address: '',
  locationName: '',
  locationPin: '',
  nationality: '',
  occupation: '',
  nidaNumber: '',
  tinNumber: '',
  nidaDocument: null,
  idScan: null,
}

const STEPS = [
  { label: 'Personal Details', icon: 'user-round' },
  { label: 'Address Details', icon: 'map-pin' },
  { label: 'Identity verification', icon: 'file-user' },
  { label: 'Verify', icon: 'shield' },
]

// the fields each step sends. A step the server already holds is only sent again when one of these changed.
const STEP_KEYS: Record<number, (keyof FormValues)[]> = {
  0: ['firstName', 'middleName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'email', 'isReturning'],
  1: ['address', 'locationName', 'locationPin'],
  2: ['nationality', 'occupation', 'nidaNumber', 'tinNumber'],
}

const EMAIL = /^\S+@\S+\.\S+$/
const PHONE = /^\d{10}$/
const DIGITS = /^\d+$/

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

const pick = (from: FormValues, keys: (keyof FormValues)[]): Partial<FormValues> =>
  Object.fromEntries(keys.map((k) => [k, from[k]]))

function validate(step: number, v: FormValues): Errors {
  const e: Errors = {}
  const need = (key: StringKey, message: string) => {
    if (!v[key].trim()) e[key] = message
  }

  if (step === 0) {
    need('firstName', 'Enter the first name')
    need('lastName', 'Enter the last name')
    need('gender', 'Select a gender')
    need('dateOfBirth', 'Enter the date of birth')
       if (!v.phone.trim()) e.phone = 'Enter a phone number'
    else if (!PHONE.test(v.phone.trim())) e.phone = 'Phone must be exactly 10 digits'
    if (!v.email.trim()) e.email = 'Enter an email address'
    else if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email address'
  }

  if (step === 1) {
    need('address', 'Enter the address')
    need('locationName', 'Enter the location name')
    need('locationPin', 'Enter the location pin')
  }

  if (step === 2) {
    need('nationality', 'Select the nationality')
    need('occupation', 'Enter the occupation')
    if (!v.nidaNumber.trim()) e.nidaNumber = 'Enter the NIDA number'
    else if (!DIGITS.test(v.nidaNumber.trim())) e.nidaNumber = 'NIDA number must contain digits only'
    if (v.tinNumber.trim() && !DIGITS.test(v.tinNumber.trim())) e.tinNumber = 'TIN number must contain digits only'
    if (!v.nidaDocument) e.nidaDocument = 'Upload the NIDA document'
    if (!v.idScan) e.idScan = 'Upload the ID scan'
  }

  return e
}

/* ---------- request bodies ---------- */

const personalBody = (v: FormValues) => ({
  firstName: v.firstName.trim(),
  middleName: v.middleName.trim(),
  lastName: v.lastName.trim(),
  // the applicant table stores MALE or FEMALE
  gender: v.gender.toUpperCase(),
  dateOfBirth: dayjs(v.dateOfBirth).format('YYYY-MM-DD'),
  phone: v.phone.trim(),
  email: v.email.trim(),
  isReturning: v.isReturning,
})

const addressBody = (applicantId: number, v: FormValues) => ({
  applicantId,
  address: v.address.trim(),
  locationName: v.locationName.trim(),
  locationPin: v.locationPin.trim(),
})

const identificationBody = (applicantId: number, v: FormValues) => ({
  applicantId,
  nationality: v.nationality.trim(),
  occupation: v.occupation.trim(),
  nidaNumber: v.nidaNumber.trim(),
  // TODO: the API has no file upload yet, it only stores a path. The files are NOT sent,
  //       only these paths. Replace them with the paths an upload endpoint returns.
  nidaDocumentPath: `/uploads/${v.nidaDocument?.name ?? ''}`,
  tinNumber: v.tinNumber.trim() || undefined,
  idScanFilePath: `/uploads/${v.idScan?.name ?? ''}`,
  idScanFileName: v.idScan?.name ?? '',
  idScanMimeType: v.idScan?.type ?? '',
})

// editing a step that was already saved goes through PUT /api/applicants/{id}
const toEdit = (v: FormValues) => ({
  firstName: v.firstName.trim(),
  middleName: v.middleName.trim(),
  lastName: v.lastName.trim(),
  gender: v.gender,
  dateOfBirth: v.dateOfBirth,
  phone: v.phone.trim(),
  email: v.email.trim(),
  address: v.address.trim(),
  nationality: v.nationality.trim(),
  occupation: v.occupation.trim(),
  locationName: v.locationName.trim(),
  locationPin: v.locationPin.trim(),
  isReturning: v.isReturning,
})

// what the server already holds, used when an unfinished registration is continued
const fromApplicant = (a: Applicant): FormValues => ({
  ...emptyValues,
  firstName: a.firstName,
  middleName: a.middleName,
  lastName: a.lastName,
  gender: a.gender,
  dateOfBirth: a.dateOfBirth,
  phone: a.phone,
  email: a.email,
  isReturning: a.isReturning,
  address: a.address,
  locationName: a.location,
  locationPin: a.locationPin,
  nationality: a.nationality,
  occupation: a.occupation,
})

/* ---------- the tracker: what has been filled and saved so far ---------- */

type SummaryProps = {
  values: FormValues
  savedSteps: number
  active: number
  verified: boolean
  otpSent: boolean
  destination: string
  applicantNo: string
  status: ApplicantStatus
  hasApplicant: boolean
  /** the earlier steps can be opened again */
  canEdit: boolean
  onEdit: (step: number) => void
}

type SectionState = 'saved' | 'unsaved' | 'sent' | 'empty'

const STATE_BADGE: Record<SectionState, { label: string; color: string }> = {
  saved: { label: 'Saved', color: 'green' },
  unsaved: { label: 'Not saved yet', color: 'yellow' },
  sent: { label: 'Code sent', color: 'blue' },
  empty: { label: 'Not started', color: 'gray' },
}

function RegistrationSummary({
  values: v,
  savedSteps,
  active,
  verified,
  otpSent,
  destination,
  applicantNo,
  status,
  hasApplicant,
  canEdit,
  onEdit,
}: SummaryProps) {
  // the identity step is on the server, but a resumed form does not hold the numbers or the files
  const identitySaved = savedSteps > 2
  const shown = (value: string) => value.trim() || '—'
  const kept = (value: string) => value.trim() || (identitySaved ? 'Saved earlier' : '—')

  const filled = (step: number) =>
    step === 2
      ? STEP_KEYS[2].some((k) => String(v[k]).trim() !== '') || !!v.nidaDocument || !!v.idScan
      : STEP_KEYS[step].some((k) => k !== 'isReturning' && String(v[k]).trim() !== '')

  const stateOf = (step: number): SectionState => (savedSteps > step ? 'saved' : filled(step) ? 'unsaved' : 'empty')

  const sections: { title: string; icon: string; step: number; state: SectionState; items: [string, string][] }[] = [
    {
      title: 'Personal details',
      icon: 'user-round',
      step: 0,
      state: stateOf(0),
      items: [
        ['Full name', shown([v.firstName, v.middleName, v.lastName].filter((x) => x.trim()).join(' '))],
        ['Gender', shown(v.gender)],
        ['Date of birth', v.dateOfBirth ? dayjs(v.dateOfBirth).format('MMM D, YYYY') : '—'],
        ['Phone', shown(v.phone)],
        ['Email', shown(v.email)],
        ['Applicant type', v.isReturning ? 'Returning' : 'New'],
      ],
    },
    {
      title: 'Address details',
      icon: 'map-pin',
      step: 1,
      state: stateOf(1),
      items: [
        ['Address', shown(v.address)],
        ['Location name', shown(v.locationName)],
        ['Location pin', shown(v.locationPin)],
      ],
    },
    {
      title: 'Identity verification',
      icon: 'file-user',
      step: 2,
      state: stateOf(2),
      items: [
        ['Nationality', shown(v.nationality)],
        ['Occupation', shown(v.occupation)],
        ['NIDA number', kept(v.nidaNumber)],
        ['TIN number', v.tinNumber.trim() || (identitySaved ? 'Saved earlier or none' : 'None')],
        ['NIDA document', v.nidaDocument?.name ?? (identitySaved ? 'Saved earlier' : '—')],
        ['ID scan', v.idScan?.name ?? (identitySaved ? 'Saved earlier' : '—')],
      ],
    },
    {
      title: 'Verification code',
      icon: 'shield',
      step: 3,
      state: verified ? 'saved' : otpSent ? 'sent' : 'empty',
      items: [
        ['Sent to', shown(destination)],
        ['Status', verified ? 'Verified' : otpSent ? 'Waiting for the code' : 'Not sent yet'],
      ],
    },
  ]

  const done = [0, 1, 2].filter((i) => savedSteps > i).length + (verified ? 1 : 0)

  return (
    <div className="rounded-md bg-white p-4 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Text size="sm" fw={600}>
            Registration summary
          </Text>
          <Text size="xs" c="dimmed">
            {hasApplicant ? applicantNo || 'Applicant created' : 'Nothing is saved yet'}
          </Text>
        </div>
        {hasApplicant && (
          <Badge variant="light" color={STATUS[status].color} radius="sm" size="sm" tt="none">
            {STATUS[status].label}
          </Badge>
        )}
      </div>

      <div className="mt-3">
        <Progress value={(done / 4) * 100} size="xs" radius="xl" color="brand" />
        <div className="mt-1 text-[11px] text-gray-500">{done} of 4 steps saved</div>
      </div>

      <div className="mt-3 space-y-3">
        {sections.map((s) => {
          const current = !verified && active === s.step
          return (
            <section
              key={s.title}
              className={`rounded-md border px-3 py-2.5 ${current ? 'border-brand ring-1 ring-brand' : 'border-gray-200'}`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <AppIcon name={s.icon} size={14} className="shrink-0 text-gray-400" />
                  <span className="truncate text-xs font-semibold text-gray-800">{s.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge
                    variant="light"
                    color={STATE_BADGE[s.state].color}
                    radius="sm"
                    size="xs"
                    tt="none"
                  >
                    {s.step === 3 && s.state === 'saved' ? 'Verified' : STATE_BADGE[s.state].label}
                  </Badge>
                  {canEdit && s.step < active && (
                    <Button size="compact-xs" variant="subtle" onClick={() => onEdit(s.step)}>
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              <dl className="space-y-1">
                {s.items.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 text-xs">
                    <dt className="shrink-0 text-gray-500">{label}</dt>
                    <dd className={`min-w-0 break-words text-right ${value === '—' ? 'text-gray-300' : 'text-gray-800'}`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Details are saved to the server when you click Save &amp; continue. A section marked Not saved yet is only on this
        screen.
      </p>
    </div>
  )
}

export function NewApplicantPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const goBack = () => navigate('/applicants')

  // /applicants/new?applicantId=7 continues an unfinished registration
  const resumeId = params.get('applicantId') ?? undefined
  const existing = useApplicant(resumeId)
  const updateApplicant = useUpdateApplicant()
  const deleteApplicant = useDeleteApplicant()
  const [exitError, setExitError] = useState<string | null>(null)

  const [active, setActive] = useState(0)
  const [values, setValues] = useState<FormValues>(emptyValues)
  // what the server holds for each saved step, so only a real change is sent again
  const [saved, setSaved] = useState<FormValues>(emptyValues)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const [applicantId, setApplicantId] = useState<number | null>(null)
  const [applicantNo, setApplicantNo] = useState('')
  const [status, setStatus] = useState<ApplicantStatus>('PERSONAL_DETAILS')
  // how many steps the server holds: 0 to 3, and 4 once the code is verified
  const [savedSteps, setSavedSteps] = useState(0)

  const [destination, setDestination] = useState('')
  const [destError, setDestError] = useState<string>()
  const [otpSent, setOtpSent] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string>()
  const [verified, setVerified] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  // one flag for every call, so a button cannot be pressed twice
  const [loading, setLoading] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  // continue an unfinished registration: fill the form and jump to the first unsaved step
  useEffect(() => {
    const a = existing.data
    if (!a || hydrated) return
    const done = registrationStepsDone(a.status)
    if (done >= 4) {
      // the registration is complete, the applicant's profile is the place to go
      navigate(`/applicants/${a.id}`, { replace: true })
      return
    }
    const form = fromApplicant(a)
    setValues(form)
    setSaved(form)
    setApplicantId(a.id)
    setApplicantNo(a.applicantNo)
    setStatus(a.status)
    setSavedSteps(done)
    setActive(Math.min(done, 3))
    setDestination(a.email)
    setNotice(`Continuing ${a.name}'s registration. The steps you already saved are kept.`)
    setHydrated(true)
  }, [existing.data, hydrated, navigate])

  // anything typed, or an applicant already created, means leaving loses something
  const touched =
    applicantId !== null || (Object.keys(values) as (keyof FormValues)[]).some((k) => values[k] !== emptyValues[k])
  const cancelRegistration = () => (touched ? setCancelOpen(true) : goBack())
  const leave = async () => {
    // a registration that was never saved has nothing on the server
    if (applicantId === null) {
      setCancelOpen(false)
      goBack()
      return
    }
    if (deleteApplicant.isPending) return
    setExitError(null)
    try {
      // DELETE /api/applicants/{id}, removes the partially registered applicant
      await deleteApplicant.mutateAsync(applicantId)
      setCancelOpen(false)
      goBack()
    } catch (err) {
      setExitError(
        messageOf(err, 'Could not delete the partial registration.') +
          ' Nothing was left unsaved on your side, try again or delete it from the applicants list.',
      )
    }
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
    setFormError(null)
  }

  // props shared by every plain text field
  const text = (key: StringKey) => ({
    size: 'sm' as const,
    value: values[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => set(key, e.currentTarget.value),
    error: errors[key],
  })

  const changedSince = (step: number) => STEP_KEYS[step].some((k) => values[k] !== saved[k])
  const markSaved = (step: number) => setSaved((s) => ({ ...s, ...pick(values, STEP_KEYS[step]) }))

  /* ---------- saving a step ---------- */

  async function saveStep(step: number) {
    // a step the server already holds is only sent again when something changed
    if (step < savedSteps) {
      // the identity step has no edit call in the API, so it stays as it was saved
      if (step === 2 || !changedSince(step) || applicantId === null) return
      // TODO: the API should offer an edit for the stepped fields, PUT /api/applicants/{id} replaces the whole row
      await updateApplicant.mutateAsync({
        id: applicantId,
        edit: toEdit({ ...saved, ...pick(values, STEP_KEYS[step]) }),
      })
      markSaved(step)
      return
    }

    if (step === 0) {
      // POST /api/onboarding/personal-details, creates the applicant
      const res = await savePersonalDetailsRequest(personalBody(values))
      setApplicantId(res.data.id)
      setApplicantNo(res.data.applicantNo ?? '')
      setStatus('PERSONAL_DETAILS')
    } else {
      if (applicantId === null) throw new Error('Save the personal details first.')
      if (step === 1) {
        // POST /api/onboarding/address-details
        await saveAddressDetailsRequest(addressBody(applicantId, values))
        setStatus('ADDRESS_DETAILS')
      } else {
        // POST /api/onboarding/identification
        await saveIdentificationRequest(identificationBody(applicantId, values))
        setStatus('PENDING_OTP')
      }
    }
    markSaved(step)
    setSavedSteps((n) => Math.max(n, step + 1))
  }

  function reportError(err: unknown) {
    const message = messageOf(err, 'Could not save this step. Please try again.')
    // for example "This email is already registered..."
    if (active === 0 && /email/i.test(message)) setErrors((e) => ({ ...e, email: message }))
    else setFormError(message)
  }

  // validates and saves the current step, true when it worked
  async function save(): Promise<boolean> {
    if (loading) return false
    // the identity step is read-only once it was saved
    if (!(active === 2 && savedSteps > 2)) {
      const found = validate(active, values)
      setErrors(found)
      if (Object.keys(found).length > 0) return false
    }
    setFormError(null)
    setLoading(true)
    try {
      await saveStep(active)
      return true
    } catch (err) {
      reportError(err)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function saveAndContinue() {
    if (!(await save())) return
    if (active === 2) setDestination((d) => d || values.email.trim())
    setActive(active + 1)
  }

  async function saveAndExit() {
    if (await save()) goBack()
  }

  /* ---------- the code ---------- */

  async function sendCode() {
    if (applicantId === null) return
    if (!EMAIL.test(destination.trim())) {
      setDestError('Enter a valid email address')
      return
    }
    setDestError(undefined)
    setLoading(true)
    try {
      await sendOtpRequest(applicantId, destination.trim())
      setOtpSent(true)
      setCode('')
      setCodeError(undefined)
    } catch (err) {
      setDestError(messageOf(err, 'Could not send the code. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    if (applicantId === null) return
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Enter the 6-digit code')
      return
    }
    setCodeError(undefined)
    setLoading(true)
    try {
      await verifyOtpRequest(applicantId, code)
      setVerified(true)
      setStatus('PENDING_KYC')
      setSavedSteps(4)
    } catch (err) {
      // for example "Invalid OTP code" or "OTP has expired"
      setCodeError(messageOf(err, 'Could not verify the code. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  function startOver() {
    setValues(emptyValues)
    setSaved(emptyValues)
    setErrors({})
    setFormError(null)
    setNotice(null)
    setApplicantId(null)
    setApplicantNo('')
    setStatus('PERSONAL_DETAILS')
    setSavedSteps(0)
    setDestination('')
    setDestError(undefined)
    setOtpSent(false)
    setCode('')
    setCodeError(undefined)
    setVerified(false)
    setActive(0)
    navigate('/applicants/new', { replace: true })
  }

  // Enter does the sensible next thing on every step
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    if (active < 3) void saveAndContinue()
    else if (!otpSent) void sendCode()
    else if (!verified) void verifyCode()
  }

  const crumbs = [
    { label: 'Home', to: '/' },
    { label: 'Applicants', to: '/applicants' },
    { label: 'New applicant' },
  ]

  if (resumeId && existing.isLoading) {
    return (
      <DashboardLayout title="New applicant" breadcrumbs={crumbs}>
        <LoadingState />
      </DashboardLayout>
    )
  }

  if (resumeId && existing.error) {
    return (
      <DashboardLayout title="New applicant" breadcrumbs={crumbs}>
        <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} />
      </DashboardLayout>
    )
  }

  const identitySaved = savedSteps > 2

    const summary = (
    <RegistrationSummary
      values={values}
      savedSteps={savedSteps}
      active={active}
      verified={verified}
      otpSent={otpSent}
      destination={destination}
      applicantNo={applicantNo}
      status={status}
      hasApplicant={applicantId !== null}
      canEdit={active < 3 && !loading && !verified}
      onEdit={setActive}
    />
  )

  return (
    <DashboardLayout
      title="New applicant"
      subtitle="Register new applicants by filling all necessary details"
      breadcrumbs={crumbs}
      actions={
        verified ? undefined : (
          <Button size="xs" color="red" leftSection={<AppIcon name="user-round-x" />} onClick={cancelRegistration}>
            {applicantId === null ? 'Cancel registration' : 'Exit registration'}
          </Button>
        )
      }
    >
      
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* small screens: the tracker folds away above the form */}
      <div className="xl:hidden">
        <Button
          size="xs"
          variant="default"
          fullWidth
          leftSection={<AppIcon name="clipboard" />}
          rightSection={<AppIcon name={summaryOpen ? 'chevron-up' : 'chevron-down'} />}
          onClick={() => setSummaryOpen((o) => !o)}
        >
          {summaryOpen ? 'Hide' : 'Show'} saved details
        </Button>
        <Collapse expanded={summaryOpen}>
          <div className="mt-3">{summary}</div>
        </Collapse>
      </div>

    <div className="min-w-0 rounded-md bg-white p-6 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
      <Stepper
          active={verified ? 4 : active}
          size="xs"
          color="brand"
          className="app-stepper"
          allowNextStepsSelect={false}
          onStepClick={(i) => {
            if (active < 3 && i < active && !loading) setActive(i)
          }}
          mb="xl"
        >
          {STEPS.map((s) => (
            <Stepper.Step key={s.label} label={s.label} {...stepIcon(s.icon)} />
          ))}
        </Stepper>

        {notice && !verified && (
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
          {/* ---------- step 1: personal ---------- */}
          {active === 0 && (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput label="First name" placeholder="John" {...text('firstName')} />
                <TextInput label="Middle name (optional)" {...text('middleName')} />
                <TextInput label="Last name" placeholder="Doe" {...text('lastName')} />
                <Select
                  label="Gender"
                  placeholder="Select gender"
                  size="sm"
                  data={['Male', 'Female']}
                  allowDeselect={false}
                  value={values.gender || null}
                  onChange={(v) => set('gender', v ?? '')}
                  error={errors.gender}
                />
                <DateInput
                  label="Date of birth"
                  placeholder="Pick a date"
                  size="sm"
                  valueFormat="MMM D, YYYY"
                  defaultLevel="decade"
                  maxDate={new Date()}
                  value={values.dateOfBirth || null}
                  onChange={(v) => set('dateOfBirth', v ?? '')}
                  error={errors.dateOfBirth}
                />
                <TextInput
                  label="Phone"
                  placeholder="0700000000"
                  maxLength={10}
                  inputMode="numeric"
                  size="sm"
                  value={values.phone}
                  onChange={(e) => set('phone', e.currentTarget.value.replace(/\D/g, ''))}
                  error={errors.phone}
                />
                <TextInput label="Email" type="email" placeholder="john@example.com" {...text('email')} />
              </SimpleGrid>
              <div className="rounded-md border border-gray-200 px-3 py-2.5">
                <Checkbox
                  label="Returning applicant"
                  description="Has been through KYC before. A valid record from the last 12 months lets them skip full KYC."
                  checked={values.isReturning}
                  onChange={(e) => set('isReturning', e.currentTarget.checked)}
                />
              </div>
            </Stack>
          )}

          {/* ---------- step 2: address ---------- */}
          {active === 1 && (
            <Stack gap="md">
              <TextInput label="Address" placeholder="123 Street" {...text('address')} />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Location name"
                  placeholder="Dar es Salaam City Center"
                  {...text('locationName')}
                />
                <TextInput label="Location pin" placeholder="TZ-DOM-001" {...text('locationPin')} />
              </SimpleGrid>
            </Stack>
          )}

          {/* ---------- step 3: identity ---------- */}
          {active === 2 &&
            (identitySaved ? (
              <Alert color="blue" variant="light" title="Identity details saved" icon={<AppIcon name="circle-check" />}>
                <Text size="sm">
                  The NIDA and TIN numbers and the documents were saved earlier and cannot be changed from here. Mark
                  them as verified from the applicant's profile.
                </Text>
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <Select
                  label="Nationality"
                  placeholder="Select or search nationality"
                  size="sm"
                  searchable
                  nothingFoundMessage="No nationality found"
                  data={AFRICAN_NATIONALITIES}
                  allowDeselect={false}
                  value={values.nationality || null}
                  onChange={(v) => set('nationality', v ?? '')}
                  error={errors.nationality}
                />
                <TextInput label="Occupation" placeholder="Software engineer" {...text('occupation')} />
                <TextInput
                  label="NIDA number"
                  placeholder="19900101123456789"
                  inputMode="numeric"
                  size="sm"
                  value={values.nidaNumber}
                  onChange={(e) => set('nidaNumber', e.currentTarget.value.replace(/\D/g, ''))}
                  error={errors.nidaNumber}
                />
                <TextInput
                  label="TIN number (optional)"
                  placeholder="123456789"
                  inputMode="numeric"
                  size="sm"
                  value={values.tinNumber}
                  onChange={(e) => set('tinNumber', e.currentTarget.value.replace(/\D/g, ''))}
                  error={errors.tinNumber}
                />
                <FileInput
                  label="NIDA document"
                  placeholder="Upload PDF or image"
                  size="sm"
                  accept="application/pdf,image/*"
                  clearable
                  leftSection={<AppIcon name="upload" />}
                  value={values.nidaDocument}
                  onChange={(f) => set('nidaDocument', f)}
                  error={errors.nidaDocument}
                />
                <FileInput
                  label="ID scan"
                  placeholder="Upload JPG or PNG"
                  size="sm"
                  accept="image/*"
                  clearable
                  leftSection={<AppIcon name="upload" />}
                  value={values.idScan}
                  onChange={(f) => set('idScan', f)}
                  error={errors.idScan}
                />
              </SimpleGrid>
            ))}

          {/* ---------- step 4: verify ---------- */}
          {active === 3 && (
            <Stack gap="md">
              <Alert
                color="brand"
                variant="light"
                title="Applicant registered"
                icon={<AppIcon name="circle-check" />}
              >
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    {applicantNo}
                  </Text>
                  <Badge color={STATUS[status].color} variant="light" radius="sm" tt="none">
                    {STATUS[status].label}
                  </Badge>
                </Group>
              </Alert>

              {!verified && (
                <>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Select
                      label="Send code by"
                      size="sm"
                      data={[{ value: 'EMAIL', label: 'Email' }]}
                      value="EMAIL"
                      allowDeselect={false}
                      readOnly
                    />
                    <TextInput
                      label="Send to"
                      placeholder="john@example.com"
                      size="sm"
                      disabled={otpSent}
                      value={destination}
                      onChange={(e) => {
                        setDestination(e.currentTarget.value)
                        setDestError(undefined)
                      }}
                      error={destError}
                    />
                  </SimpleGrid>

                  {!otpSent ? (
                    <div>
                      <Button type="submit" color="brand" loading={loading} leftSection={<AppIcon name="mail" />}>
                        Send code
                      </Button>
                    </div>
                  ) : (
                    <Stack gap="sm">
                      <Text size="sm" c="dimmed">
                        Code sent to {destination.trim()}. It expires in 5 minutes and works once.
                      </Text>
                      <TextInput
                        label="6-digit code"
                        placeholder="000000"
                        size="sm"
                        w={240}
                        maxLength={6}
                        inputMode="numeric"
                        styles={{ input: { letterSpacing: 6, textAlign: 'center', fontSize: 18 } }}
                        value={code}
                        onChange={(e) => {
                          setCode(e.currentTarget.value.replace(/\D/g, ''))
                          setCodeError(undefined)
                        }}
                        error={codeError}
                      />
                      <Group gap="xs">
                        <Button type="submit" color="brand" loading={loading}>
                          Verify code
                        </Button>
                        <Button
                          type="button"
                          variant="subtle"
                          color="gray"
                          disabled={loading}
                          onClick={() => void sendCode()}
                        >
                          Resend code
                        </Button>
                      </Group>
                    </Stack>
                  )}
                </>
              )}

              {verified && (
                <>
                  <Alert color="brand" variant="light" title="Code verified" icon={<AppIcon name="shield" />}>
                    <Text size="sm">The applicant is now pending KYC and will appear in KYC review.</Text>
                  </Alert>
                  <Group gap="xs">
                    <Button type="button" variant="default" onClick={goBack}>
                      Back to applicants
                    </Button>
                    <Button type="button" color="brand" onClick={startOver}>
                      Register another
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          )}

          {formError && (
            <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />} mt="md">
              <Text size="sm">{formError}</Text>
            </Alert>
          )}

          {active < 3 && (
            <>
              <Group justify="space-between" mt="xl" pt="md" className="border-t border-gray-200">
                {active > 0 ? (
                  <Button
                    type="button"
                    variant="default"
                    disabled={loading}
                    leftSection={<AppIcon name="arrow-left" />}
                    onClick={() => setActive(active - 1)}
                  >
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Group gap="xs">
                  <Button type="button" variant="default" color="gray" disabled={loading} onClick={() => void saveAndExit()}>
                    Save &amp; exit
                  </Button>
                  <Button type="submit" color="brand" leftSection={<AppIcon name="save-check" />} loading={loading}>
                    Save &amp; continue
                  </Button>
                </Group>
              </Group>
              <Text size="xs" c="dimmed" ta="right" mt={6}>
                Each step is saved when you continue, so you can come back and finish later.
              </Text>
            </>
          )}
        </form>
      </div>

        {/* large screens: the tracker stays in view on the right */}
        <aside className="hidden xl:sticky xl:top-4 xl:block">{summary}</aside>
      </div>

      <ContractConfirmDialog
        opened={cancelOpen}
        title={exitError ? 'Could not exit' : applicantId === null ? 'Cancel registration' : 'Exit registration'}
        message={
          exitError ??
          (applicantId === null
            ? 'Leave without saving? Everything you entered is lost.'
            : `Exit now? ${applicantNo || 'This applicant'} was partly registered (${STATUS[status].label}) and the saved record will be permanently deleted from the system. Use "Save & exit" instead to keep it and continue later.`)
        }
        confirmLabel={exitError ? 'Try again' : applicantId === null ? 'Leave' : 'Delete and exit'}
        onClose={() => {
          setCancelOpen(false)
          setExitError(null)
        }}
        onConfirm={leave}
      />
    </DashboardLayout>
  )
}