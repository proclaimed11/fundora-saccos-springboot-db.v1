import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Modal, Select, SimpleGrid, Text, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { STATUS, fullName, type Applicant } from './applicantsData'

const EMAIL = /^\S+@\S+\.\S+$/
const PHONE = /^0\d{9}$/

export type ApplicantEditInput = Pick<
  Applicant,
  | 'name'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'gender'
  | 'dateOfBirth'
  | 'phone'
  | 'email'
  | 'nationality'
  | 'address'
  | 'occupation'
  | 'location'
  | 'locationPin'
  | 'isReturning'
>

type Props = {
  opened: boolean
  applicant: Applicant
  saving?: boolean
  /** a message from the API, shown inside the dialog */
  serverError?: string | null
  onClose: () => void
  onSubmit: (input: ApplicantEditInput) => void
}

type Values = {
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
  location: string
  locationPin: string
  isReturning: boolean
}

type Errors = Partial<Record<Exclude<keyof Values, 'middleName' | 'isReturning'>, string>>

const fromApplicant = (a: Applicant): Values => ({
  firstName: a.firstName,
  middleName: a.middleName,
  lastName: a.lastName,
  gender: a.gender,
  dateOfBirth: a.dateOfBirth,
  phone: a.phone,
  email: a.email,
  nationality: a.nationality,
  address: a.address,
  occupation: a.occupation,
  location: a.location,
  locationPin: a.locationPin,
  isReturning: a.isReturning,
})

export function ApplicantEditDialog({ opened, applicant, saving = false, serverError, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<Values>(() => fromApplicant(applicant))
  const [errors, setErrors] = useState<Errors>({})

  // start from the applicant being edited each time the dialog opens
  useEffect(() => {
    if (!opened) return
    setValues(fromApplicant(applicant))
    setErrors({})
  }, [opened, applicant])

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // props shared by every plain text field
  const text = (key: Exclude<keyof Values, 'isReturning' | 'gender' | 'dateOfBirth'>) => ({
    size: 'sm' as const,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.currentTarget.value),
    error: errors[key as keyof Errors],
  })

  const submit = () => {
    const found: Errors = {}
    const need = (key: keyof Errors, message: string) => {
      if (!String(values[key] ?? '').trim()) found[key] = message
    }

    need('firstName', 'Enter the first name')
    need('lastName', 'Enter the last name')
    need('gender', 'Select a gender')
    need('dateOfBirth', 'Enter the date of birth')
    need('nationality', 'Enter the nationality')
    if (!values.phone.trim()) found.phone = 'Enter a phone number'
    else if (!PHONE.test(values.phone.trim())) found.phone = 'Enter 10 digits starting with 0'
    if (!values.email.trim()) found.email = 'Enter an email address'
    else if (!EMAIL.test(values.email.trim())) found.email = 'Enter a valid email address'
    need('address', 'Enter the address')
    need('occupation', 'Enter the occupation')
    need('location', 'Enter the location name')
    need('locationPin', 'Enter the location pin')

    setErrors(found)
    if (Object.keys(found).length > 0) return

    const clean = {
      firstName: values.firstName.trim(),
      middleName: values.middleName.trim(),
      lastName: values.lastName.trim(),
    }

    // TODO: PUT /api/applicants/{id} { ...changed fields }
    onSubmit({
      ...clean,
      name: fullName(clean),
      gender: values.gender,
      dateOfBirth: values.dateOfBirth,
      phone: values.phone.trim(),
      email: values.email.trim(),
      nationality: values.nationality.trim(),
      address: values.address.trim(),
      occupation: values.occupation.trim(),
      location: values.location.trim(),
      locationPin: values.locationPin.trim(),
      isReturning: values.isReturning,
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Edit applicant" size="xl" centered>
      <div className="space-y-5">
        {/* what cannot be changed here */}
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" fw={600}>
            {applicant.applicantNo}
          </Text>
          <Badge variant="light" color={STATUS[applicant.status].color} radius="sm" size="sm">
            {STATUS[applicant.status].label}
          </Badge>
        </div>

        {/* the same groups as registration: Personal, Address */}
        <div>
          <Text size="sm" fw={600} mb={8}>
            Personal
          </Text>
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
            <TextInput label="Nationality" placeholder="Tanzanian" {...text('nationality')} />
            <TextInput
              label="Phone"
              placeholder="0700000000"
              maxLength={10}
              inputMode="tel"
              {...text('phone')}
            />
            <TextInput label="Email" type="email" placeholder="john@example.com" {...text('email')} />
          </SimpleGrid>
        </div>

        <div>
          <Text size="sm" fw={600} mb={8}>
            Address
          </Text>
          <div className="space-y-4">
            <TextInput label="Address" placeholder="123 Street" {...text('address')} />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput label="Occupation" placeholder="Software engineer" {...text('occupation')} />
              <TextInput label="Location name" placeholder="Dar es Salaam City Center" {...text('location')} />
              <TextInput label="Location pin" placeholder="TZ-DOM-001" {...text('locationPin')} />
            </SimpleGrid>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 px-3 py-2.5">
          <Checkbox
            label="Returning applicant"
            description="Has been through KYC before. A valid record from the last 12 months lets them skip full KYC."
            checked={values.isReturning}
            onChange={(e) => set('isReturning', e.currentTarget.checked)}
          />
        </div>

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="xs">
            The identity details (NIDA and TIN numbers, documents) are not edited here, they belong to KYC. The
            applicant number and status cannot be edited either. Changing the phone or email does not send a new
            verification code.
          </Text>
        </Alert>

        {serverError && (
          <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
            <Text size="sm">{serverError}</Text>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" loading={saving} leftSection={<AppIcon name="check" />} onClick={submit}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}