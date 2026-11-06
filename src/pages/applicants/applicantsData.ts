import dayjs from 'dayjs'
import type { PaymentMethod } from '../loans/loanApplicationsData'

export type ApplicantStatus = 'PENDING_OTP' | 'PENDING_KYC' | 'KYC_APPROVED' | 'REJECTED'

export type Applicant = {
  id: number
  applicantNo: string
  name: string // full name, built from first, middle and last
  firstName: string
  middleName: string
  lastName: string
  gender: string
  dateOfBirth: string // ISO date
  phone: string
  email: string
  address: string
  occupation: string
  location: string // location name
  locationPin: string
  nationality: string
  status: ApplicantStatus
  isReturning: boolean
  registered: string // ISO date, so the date filter and sorting work
}

// the full name shown everywhere is built from the three parts
export const fullName = (a: Pick<Applicant, 'firstName' | 'middleName' | 'lastName'>) =>
  [a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ')

export const applicants: Applicant[] = [
  { id: 1, applicantNo: 'APP-1786436767272', name: 'John Doe', firstName: 'John', middleName: '', lastName: 'Doe', gender: 'Male', dateOfBirth: '1990-01-01', phone: '0700000000', email: 'john@example.com', address: '123 Street', occupation: 'Software Engineer', location: 'Dar es Salaam City Center', locationPin: 'TZ-DOM-001', nationality: 'Tanzanian', status: 'KYC_APPROVED', isReturning: false, registered: '2026-08-11' },
  { id: 2, applicantNo: 'APP-1786436767301', name: 'Amina Juma', firstName: 'Amina', middleName: '', lastName: 'Juma', gender: 'Female', dateOfBirth: '1988-05-14', phone: '0712345678', email: 'amina@example.com', address: 'Mtaa wa Kariakoo 12', occupation: 'Trader', location: 'Kariakoo', locationPin: 'TZ-DSM-014', nationality: 'Tanzanian', status: 'PENDING_KYC', isReturning: true, registered: '2026-09-02' },
  { id: 3, applicantNo: 'APP-1786436767455', name: 'Peter Mwakyusa', firstName: 'Peter', middleName: '', lastName: 'Mwakyusa', gender: 'Male', dateOfBirth: '1985-11-23', phone: '0755111222', email: 'peter@example.com', address: 'Block C, Mbeya Road', occupation: 'Teacher', location: 'Mbeya', locationPin: 'TZ-MBY-003', nationality: 'Tanzanian', status: 'PENDING_OTP', isReturning: false, registered: '2026-09-14' },
  { id: 4, applicantNo: 'APP-1786436767512', name: 'Grace Mushi', firstName: 'Grace', middleName: '', lastName: 'Mushi', gender: 'Female', dateOfBirth: '1992-03-09', phone: '0766333444', email: 'grace@example.com', address: 'Sakina Street 7', occupation: 'Nurse', location: 'Arusha', locationPin: 'TZ-ARS-021', nationality: 'Tanzanian', status: 'REJECTED', isReturning: false, registered: '2026-09-20' },
  { id: 5, applicantNo: 'APP-1786436767690', name: 'Hassan Said', firstName: 'Hassan', middleName: '', lastName: 'Said', gender: 'Male', dateOfBirth: '1983-07-30', phone: '0688555666', email: 'hassan@example.com', address: 'Area D, Dodoma', occupation: 'Driver', location: 'Dodoma', locationPin: 'TZ-DOD-008', nationality: 'Tanzanian', status: 'KYC_APPROVED', isReturning: true, registered: '2026-09-28' },
  { id: 6, applicantNo: 'APP-1786436767744', name: 'Neema Kileo', firstName: 'Neema', middleName: '', lastName: 'Kileo', gender: 'Female', dateOfBirth: '1995-12-02', phone: '0654777888', email: 'neema@example.com', address: 'Moshi Town 45', occupation: 'Shop Owner', location: 'Moshi', locationPin: 'TZ-MSH-005', nationality: 'Tanzanian', status: 'PENDING_KYC', isReturning: false, registered: '2026-10-01' },
]

export const STATUS: Record<ApplicantStatus, { label: string; color: string; step: number }> = {
  PENDING_OTP: { label: 'Pending OTP', color: 'gray', step: 1 },
  PENDING_KYC: { label: 'Pending KYC', color: 'yellow', step: 2 },
  KYC_APPROVED: { label: 'KYC Approved', color: 'brand', step: 3 },
  REJECTED: { label: 'Rejected', color: 'red', step: 2 },
}

// which buttons show for each stage (display only)
export function stageActions(a: Applicant): { label: string; icon: string }[] {
  const list: { label: string; icon: string }[] = []
  if (a.status === 'PENDING_OTP') list.push({ label: 'Send OTP', icon: 'mail' })
  if (a.status === 'PENDING_KYC') list.push({ label: 'Review KYC', icon: 'contact-round' })
  if (a.isReturning && a.status !== 'REJECTED') list.push({ label: 'Re-check KYC', icon: 'refresh-cw' })
  if (a.status === 'KYC_APPROVED') list.push({ label: 'Start loan application', icon: 'file-text' })
  return list
}

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/* ---------- SAMPLE ONLY: profile extras, replaced by API data later ---------- */

export type ActivityEvent = { title: string; detail: string; date: string; icon: string }

// newest first, built from the applicant's stage so it always matches the status
export function activityFor(a: Applicant): ActivityEvent[] {
  const day = (n: number) => dayjs(a.registered).add(n, 'day').format('YYYY-MM-DD')
  const events: ActivityEvent[] = [
    { title: 'Applicant registered', detail: `Application number ${a.applicantNo}`, date: a.registered, icon: 'user-round-plus' },
  ]
  if (a.status !== 'PENDING_OTP') {
    events.push({ title: 'OTP verified', detail: 'Verified by email', date: a.registered, icon: 'shield' })
  }
  if (a.status === 'KYC_APPROVED') {
    events.push({ title: 'KYC approved', detail: 'Approved by Loan Officer', date: day(1), icon: 'circle-check' })
  }
  if (a.status === 'REJECTED') {
    events.push({ title: 'KYC rejected', detail: 'Documents did not pass review', date: day(1), icon: 'circle-x' })
  }
  return events.reverse()
}

export type LoanRow = {
  id: number
  ref: string
  product: string
  amount: number
  outstanding: number
  status: 'Active' | 'Under review'
  date: string
}

// only approved applicants have loans or applications in this sample
export function loansFor(a: Applicant): LoanRow[] {
  if (a.status !== 'KYC_APPROVED') return []
  return [
    { id: 1, ref: 'LN-0001', product: 'Personal loan', amount: 1500000, outstanding: 1200000, status: 'Active', date: '2026-08-20' },
    { id: 2, ref: 'APP-0042', product: 'Business loan', amount: 3000000, outstanding: 0, status: 'Under review', date: '2026-09-30' },
  ]
}

// SAMPLE ONLY: NIDA number comes from the KYC record later
export const nidaFor = (a: Applicant) => `NIDA${String(a.id).padStart(6, '0')}`


/* ---------- SAMPLE ONLY: financial profile and existing debts, replaced by API data later ---------- */

export const EMPLOYMENT_TYPES = ['Employed', 'Self-employed', 'Business owner', 'Unemployed', 'Other']

export type FinancialProfile = {
  employmentType: string
  employer: string
  monthlyIncome: number
  monthlyExpenses: number
  dependants: number
}

export type ExistingDebt = {
  id: number
  lender: string
  balance: number // what is still owed
  monthly: number // monthly payment
}

// an applicant who has not verified their OTP has no financial profile yet
export function financialFor(a: Applicant): FinancialProfile | null {
  if (a.status === 'PENDING_OTP') return null
  return { employmentType: 'Employed', employer: 'Acme Tech Ltd', monthlyIncome: 2500000, monthlyExpenses: 1200000, dependants: 2 }
}

export function debtsFor(a: Applicant): ExistingDebt[] {
  if (a.status !== 'KYC_APPROVED') return []
  return [
    { id: 1, lender: 'CRDB Bank', balance: 800000, monthly: 90000 },
    { id: 2, lender: 'Vodacom M-Pawa', balance: 150000, monthly: 25000 },
  ]
}

/* ---------- SAMPLE ONLY: member accounts, replaced by API data later ---------- */

// the accounts approved loans are paid into (the disbursement "Paid to" list)
export type ApplicantAccount = {
  id: number
  method: Exclude<PaymentMethod, 'CASH'>
  provider: string // M-Pesa, CRDB Bank...
  number: string
  primary: boolean
}

export const MOBILE_PROVIDERS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa']
export const BANK_PROVIDERS = ['CRDB Bank', 'NMB Bank', 'NBC Bank', 'Stanbic Bank', 'Equity Bank', 'Other bank']

// only approved applicants can receive a loan, so only they have accounts in the sample
export function accountsFor(a: Applicant): ApplicantAccount[] {
  if (a.status !== 'KYC_APPROVED') return []
  return [
    { id: 1, method: 'MOBILE_MONEY', provider: 'M-Pesa', number: a.phone, primary: true },
    { id: 2, method: 'BANK_TRANSFER', provider: 'CRDB Bank', number: '0150004821', primary: false },
  ]
}

/* ---------- SAMPLE ONLY: applicant documents, replaced by API data later ---------- */

export const DOCUMENT_TYPES = ['NIDA document', 'ID scan', 'TIN certificate', 'Proof of address', 'Passport photo', 'Other']

// collected at registration, so they can be replaced but never removed
export const REQUIRED_DOCUMENTS = ['NIDA document', 'ID scan']

export type ApplicantDocument = {
  id: number
  type: string
  fileName: string
  sizeKb: number
  uploaded: string // ISO date
  uploadedBy: string
  notes: string
  /** the real file, only for a document uploaded in this session */
  file?: File | null
}

export const documentsFor = (a: Applicant): ApplicantDocument[] => [
  { id: 1, type: 'NIDA document', fileName: 'nida-document.pdf', sizeKb: 420, uploaded: a.registered, uploadedBy: 'Registration', notes: '' },
  { id: 2, type: 'ID scan', fileName: 'id-scan.jpg', sizeKb: 310, uploaded: a.registered, uploadedBy: 'Registration', notes: '' },
]

/* ---------- SAMPLE ONLY: KYC history, replaced by GET /api/kyc-verifications later ---------- */

export type KycRecord = {
  id: number
  status: 'APPROVED' | 'REJECTED'
  verificationType: 'FULL_KYC' | 'RETURNING_CHECK'
  remarks: string
  verifiedBy: string
  date: string // ISO date
  expiresAt: string | null // an approval is valid for 12 months
}

// older records of returning applicants, from before they registered again
const EARLIER_KYC: Record<number, Omit<KycRecord, 'id'>[]> = {
  // expired, so a re-check says full KYC is needed
  2: [
    { status: 'APPROVED', verificationType: 'FULL_KYC', remarks: 'All documents verified', verifiedBy: 'Asha Mrema', date: '2025-06-20', expiresAt: '2026-06-20' },
  ],
  // still valid
  5: [
    { status: 'APPROVED', verificationType: 'FULL_KYC', remarks: 'All documents verified', verifiedBy: 'Juma Bakari', date: '2026-05-12', expiresAt: '2027-05-12' },
  ],
}

// newest first, built from the applicant's status so it always matches
export function kycHistoryFor(a: Applicant): KycRecord[] {
  const list: Omit<KycRecord, 'id'>[] = [...(EARLIER_KYC[a.id] ?? [])]
  const decided = dayjs(a.registered).add(1, 'day').format('YYYY-MM-DD')

  if (a.status === 'KYC_APPROVED') {
    list.push({
      status: 'APPROVED',
      verificationType: 'FULL_KYC',
      remarks: 'All documents verified',
      verifiedBy: 'Asha Mrema',
      date: decided,
      expiresAt: dayjs(decided).add(12, 'month').format('YYYY-MM-DD'),
    })
  }
  if (a.status === 'REJECTED') {
    list.push({
      status: 'REJECTED',
      verificationType: 'FULL_KYC',
      remarks: 'Documents did not pass review',
      verifiedBy: 'Asha Mrema',
      date: decided,
      expiresAt: null,
    })
  }

  return list.map((r, i) => ({ id: i + 1, ...r })).sort((x, y) => y.date.localeCompare(x.date))
}

export type RecheckResult = { valid: boolean; message: string; record: KycRecord | null }

// the same rule as POST /api/onboarding/kyc/check-returning/{applicantId}:
// skip full KYC when an APPROVED record has not expired (valid for 12 months)
export function recheckKyc(history: KycRecord[]): RecheckResult {
  const record =
    history.find(
      (r) => r.status === 'APPROVED' && r.expiresAt !== null && !dayjs(r.expiresAt).isBefore(dayjs(), 'day'),
    ) ?? null

  return record
    ? { valid: true, message: 'Existing KYC still valid; applicant may proceed', record }
    : { valid: false, message: 'No valid existing KYC found; full KYC required', record: null }
}

/* ---------- SAMPLE ONLY: identification, replaced by GET /api/applicant-identifications later ---------- */

export type IdentificationType = 'NIDA' | 'TIN'

export type ApplicantIdentification = {
  id: number
  type: IdentificationType
  number: string
  verified: boolean
  verifiedBy: string | null
  verifiedAt: string | null // ISO date
}

// the TIN is optional at registration, so only some applicants have one
const TIN_NUMBERS: Record<number, string> = { 1: 'TIN123456789', 2: 'TIN234567890', 5: 'TIN345678901' }

export function identificationsFor(a: Applicant): ApplicantIdentification[] {
  const day = dayjs(a.registered).add(1, 'day').format('YYYY-MM-DD')
  const nidaChecked = a.status === 'KYC_APPROVED'
  const list: ApplicantIdentification[] = [
    {
      id: a.id * 10 + 1,
      type: 'NIDA',
      number: nidaFor(a),
      verified: nidaChecked,
      verifiedBy: nidaChecked ? 'Asha Mrema' : null,
      verifiedAt: nidaChecked ? day : null,
    },
  ]
  const tin = TIN_NUMBERS[a.id]
  if (tin) {
    const tinChecked = a.id === 1
    list.push({
      id: a.id * 10 + 2,
      type: 'TIN',
      number: tin,
      verified: tinChecked,
      verifiedBy: tinChecked ? 'Asha Mrema' : null,
      verifiedAt: tinChecked ? day : null,
    })
  }
  return list
}