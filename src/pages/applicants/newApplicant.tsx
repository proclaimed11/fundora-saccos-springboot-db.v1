import { AppIcon } from '../../components/appIcon'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
} from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { DateInput } from '@mantine/dates'
import { DashboardLayout } from '../../components/layout/dashboardLayout'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import {
  registerApplicantRequest,
  sendOtpRequest,
  verifyOtpRequest,
  type RegisterBody,
} from '../../api/applicants'

type FormValues = {
  firstName: string
  middleName: string
  lastName: string
  gender: string
  dateOfBirth: string
  phone: string
  email: string
  nationality: string
  address: string
  occupation: string
  locationName: string
  locationPin: string
  isReturning: boolean
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
  nationality: '',
  address: '',
  occupation: '',
  locationName: '',
  locationPin: '',
  isReturning: false,
  nidaNumber: '',
  tinNumber: '',
  nidaDocument: null,
  idScan: null,
}

const statusLabels: Record<string, string> = {
  PENDING_OTP: 'Pending OTP',
  PENDING_KYC: 'Pending KYC',
}

const EMAIL = /^\S+@\S+\.\S+$/
const PHONE = /^0\d{9}$/

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

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
    need('nationality', 'Enter the nationality')
    if (!v.phone.trim()) e.phone = 'Enter a phone number'
    else if (!PHONE.test(v.phone.trim())) e.phone = 'Enter 10 digits starting with 0'
    if (!v.email.trim()) e.email = 'Enter an email address'
    else if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email address'
  }

  if (step === 1) {
    need('address', 'Enter the address')
    need('occupation', 'Enter the occupation')
    need('locationName', 'Enter the location name')
    need('locationPin', 'Enter the location pin')
  }

  if (step === 2) {
    need('nidaNumber', 'Enter the NIDA number')
    if (!v.nidaDocument) e.nidaDocument = 'Upload the NIDA document'
    if (!v.idScan) e.idScan = 'Upload the ID scan'
  }

  return e
}

// the request body of POST /api/onboarding/register
function toBody(v: FormValues): RegisterBody {
  return {
    firstName: v.firstName.trim(),
    middleName: v.middleName.trim(),
    lastName: v.lastName.trim(),
    // the applicant table stores MALE or FEMALE
    gender: v.gender.toUpperCase(),
    dateOfBirth: dayjs(v.dateOfBirth).format('YYYY-MM-DD'),
    phone: v.phone.trim(),
    email: v.email.trim(),
    address: v.address.trim(),
    nationality: v.nationality.trim(),
    occupation: v.occupation.trim(),
    locationName: v.locationName.trim(),
    locationPin: v.locationPin.trim(),
    isReturning: v.isReturning,
    nidaNumber: v.nidaNumber.trim(),
    // TODO: the API has no file upload yet, it only stores a path. The files are NOT sent,
    //       only these paths. Replace them with the paths an upload endpoint returns.
    nidaDocumentPath: `/uploads/${v.nidaDocument?.name ?? ''}`,
    tinNumber: v.tinNumber.trim() || undefined,
    idScanFilePath: `/uploads/${v.idScan?.name ?? ''}`,
    idScanFileName: v.idScan?.name ?? '',
    idScanMimeType: v.idScan?.type ?? '',
  }
}

export function NewApplicantPage() {
  const navigate = useNavigate()
  const goBack = () => navigate('/applicants')

  const [active, setActive] = useState(0)
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [errors, setErrors] = useState<Errors>({})

  const [applicantId, setApplicantId] = useState<number | null>(null)
  const [applicantNo, setApplicantNo] = useState('')
  const [status, setStatus] = useState('PENDING_OTP')
  const [destination, setDestination] = useState('')
  const [destError, setDestError] = useState<string>()
  const [otpSent, setOtpSent] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string>()
  const [verified, setVerified] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  // one flag for the register, send and verify calls, so a button cannot be pressed twice
  const [loading, setLoading] = useState(false)
  // an error from the register call, shown above the buttons
  const [formError, setFormError] = useState<string | null>(null)

  // anything typed, or an applicant number already issued, means leaving loses something
  const touched =
    applicantNo !== '' ||
    (Object.keys(values) as (keyof FormValues)[]).some((k) => values[k] !== emptyValues[k])
  const cancelRegistration = () => (touched ? setCancelOpen(true) : goBack())
  const leave = () => {
    setCancelOpen(false)
    goBack()
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

  function next() {
    const found = validate(active, values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (active < 2) setActive(active + 1)
    else void register()
  }

  async function register() {
    setFormError(null)
    setLoading(true)
    try {
      const res = await registerApplicantRequest(toBody(values))
      setApplicantId(res.data.id)
      setApplicantNo(res.data.applicantNo)
      setStatus(res.data.status)
      setDestination(values.email.trim())
      setActive(3)
    } catch (err) {
      setFormError(messageOf(err, 'Could not register the applicant. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

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
    } catch (err) {
      // for example "Invalid OTP code" or "OTP has expired"
      setCodeError(messageOf(err, 'Could not verify the code. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  function startOver() {
    setValues(emptyValues)
    setErrors({})
    setApplicantId(null)
    setApplicantNo('')
    setStatus('PENDING_OTP')
    setDestination('')
    setDestError(undefined)
    setOtpSent(false)
    setCode('')
    setCodeError(undefined)
    setVerified(false)
    setFormError(null)
    setActive(0)
  }

  // Enter does the sensible next thing on every step
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    if (active < 3) next()
    else if (!otpSent) void sendCode()
    else if (!verified) void verifyCode()
  }

  return (
    <DashboardLayout
      title="New applicant"
      subtitle="Register new applicants by filling all necessary details"
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: 'Applicants', to: '/applicants' },
        { label: 'New applicant' },
      ]}
      actions={
        verified ? undefined : (
          <Button size="xs" color="red" leftSection={<AppIcon name="user-round-x" />} onClick={cancelRegistration}>
            Cancel registration
          </Button>
        )
      }
    >
      <div className="rounded-md bg-white p-6 shadow-[0_10px_30px_rgba(76,87,125,0.12)]">
        <Stepper
          active={verified ? 4 : active}
          size="xs"
          color="brand"
          allowNextStepsSelect={false}
          onStepClick={(i) => {
            if (active < 3 && i < active && !loading) setActive(i)
          }}
          mb="xl"
        >
          <Stepper.Step label="Personal" />
          <Stepper.Step label="Address" />
          <Stepper.Step label="Identity" />
          <Stepper.Step label="Verify" />
        </Stepper>

        <form onSubmit={handleSubmit} noValidate>
          {active === 0 && (
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
                inputMode="tel"
                {...text('phone')}
              />
              <TextInput label="Email" type="email" placeholder="john@example.com" {...text('email')} />
              <TextInput label="Nationality" placeholder="Tanzanian" {...text('nationality')} />
            </SimpleGrid>
          )}

          {active === 1 && (
            <Stack gap="md">
              <TextInput label="Address" placeholder="123 Street" {...text('address')} />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput label="Occupation" placeholder="Software engineer" {...text('occupation')} />
                <TextInput
                  label="Location name"
                  placeholder="Dar es Salaam City Center"
                  {...text('locationName')}
                />
                <TextInput label="Location pin" placeholder="TZ-DOM-001" {...text('locationPin')} />
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

          {active === 2 && (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput label="NIDA number" placeholder="NIDA123" {...text('nidaNumber')} />
                <TextInput label="TIN number (optional)" placeholder="TIN123" {...text('tinNumber')} />
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

              {formError && (
                <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
                  <Text size="sm">{formError}</Text>
                </Alert>
              )}
            </Stack>
          )}

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
                  <Badge color={verified ? 'yellow' : 'gray'} variant="light" radius="sm" tt="none">
                    {statusLabels[status] ?? status}
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
                      <Button
                        type="submit"
                        color="brand"
                        loading={loading}
                        leftSection={<AppIcon name="mail" />}
                      >
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
                  <Alert
                    color="brand"
                    variant="light"
                    title="Code verified"
                    icon={<AppIcon name="shield" />}
                  >
                    <Text size="sm">
                      The applicant is now pending KYC and will appear in KYC review.
                    </Text>
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

          {active < 3 && (
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
              <Button type="submit" color="brand" loading={loading}>
                {active === 2 ? 'Register applicant' : 'Next'}
              </Button>
            </Group>
          )}
        </form>
      </div>

      <ContractConfirmDialog
        opened={cancelOpen}
        title="Cancel registration"
        message={
          applicantNo
            ? `${applicantNo} is already registered and waiting for verification. If you leave now they stay in the Applicants list as Pending OTP, and you can verify them later from their profile.`
            : 'Leave without registering? Everything you entered is lost.'
        }
        confirmLabel="Leave"
        onClose={() => setCancelOpen(false)}
        onConfirm={leave}
      />
    </DashboardLayout>
  )
}