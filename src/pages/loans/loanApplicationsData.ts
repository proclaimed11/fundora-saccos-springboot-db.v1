import dayjs from 'dayjs'
import { formatTzs } from '../../utils/format'

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CREDIT_APPROVED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CONTRACT_GENERATED'
  | 'CONTRACT_SIGNED'
  | 'LOAN_CREATED'

export type InterestMethod = 'FLAT' | 'REDUCING'

export type LoanApplication = {
  id: number
  applicationNo: string
  applicantId: number // links to /applicants/:id
  applicantName: string // the API only returns applicantId, joined later
  loanOfficer: string // same for loanOfficerId
  requestedAmount: number
  interestMethod: InterestMethod
  interestRate: number // annual %
  tenure: number // months
  penaltyRate: number
  guarantorRequired: boolean
  collateralRequired: boolean
  creditAssessmentRequired: boolean
  status: ApplicationStatus
  currentStage: string
  created: string // ISO date, so the date filter and sorting work
  submittedAt: string | null,
  contractSentAt?: string | null
  contractSignedAt?: string | null
  credit?: CreditRow | null // set when an assessment is run in the UI
  cancelReason?: string | null
  cancelledAt?: string | null
}

// Emptied: the sample applications were removed. The Loan applications page reads GET /api/loan-applications
// (src/api/loanApplications.ts). The screens that still import this list (dashboard approvals tab, Approvals,
// Contracts, Disbursements, the application page, Collateral & Guarantors) show their empty state until each
// is connected to the API.
export const applications: LoanApplication[] = []

export const STATUS: Record<ApplicationStatus, { label: string; color: string; step: number }> = {
  DRAFT: { label: 'Draft', color: 'gray', step: 0 },
  SUBMITTED: { label: 'Submitted', color: 'blue', step: 1 },
  CREDIT_APPROVED: { label: 'Credit approved', color: 'cyan', step: 2 },
  PENDING_APPROVAL: { label: 'Pending approval', color: 'yellow', step: 2 },
  APPROVED: { label: 'Approved', color: 'green', step: 3 },
  REJECTED: { label: 'Rejected', color: 'red', step: 1 },
  CANCELLED: { label: 'Cancelled', color: 'gray', step: 0 },
  CONTRACT_GENERATED: { label: 'Contract generated', color: 'violet', step: 3 },
  CONTRACT_SIGNED: { label: 'Contract signed', color: 'teal', step: 4 },
  LOAN_CREATED: { label: 'Loan created', color: 'brand', step: 5 },
}

// how far along the lifecycle an application is (used to build the sample extras)
export const RANK: Record<ApplicationStatus, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  REJECTED: 1,
  CANCELLED: 1,
  CREDIT_APPROVED: 2,
  PENDING_APPROVAL: 2,
  APPROVED: 3,
  CONTRACT_GENERATED: 4,
  CONTRACT_SIGNED: 5,
  LOAN_CREATED: 6,
}

export const methodLabel = (m: InterestMethod) => (m === 'FLAT' ? 'Flat' : 'Reducing balance')

/* ---------- calculations (display only, the real schedule is made at disbursement) ---------- */

export function estimateInstallment(a: LoanApplication): number {
  const p = a.requestedAmount
  const n = a.tenure
  if (a.interestMethod === 'FLAT') {
    return (p + ((p * a.interestRate) / 100) * (n / 12)) / n
  }
  const i = a.interestRate / 100 / 12
  if (i === 0) return p / n
  return (p * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
}

export const totalRepayable = (a: LoanApplication) => estimateInstallment(a) * a.tenure

export type InstallmentRow = {
  id: number
  installmentNo: number
  dueDate: string
  principal: number
  interest: number
  total: number
  balance: number
}

// estimated schedule, one installment a month starting a month after the application date
export function scheduleFor(a: LoanApplication): InstallmentRow[] {
  const p = a.requestedAmount
  const n = a.tenure
  const monthlyRate = a.interestRate / 100 / 12
  const emi = estimateInstallment(a)
  let balance = p
  const rows: InstallmentRow[] = []

  for (let i = 1; i <= n; i++) {
    const interest = a.interestMethod === 'FLAT' ? p * monthlyRate : balance * monthlyRate
    const principal = a.interestMethod === 'FLAT' ? p / n : emi - interest
    balance = Math.max(0, balance - principal)
    rows.push({
      id: i,
      installmentNo: i,
      dueDate: dayjs(a.created).add(i, 'month').format('YYYY-MM-DD'),
      principal: Math.round(principal),
      interest: Math.round(interest),
      total: Math.round(principal + interest),
      balance: Math.round(balance),
    })
  }
  return rows
}

/* ---------- which buttons show for each stage (display only, they map to /api/loan-origination) ---------- */

export type StageAction = { id: string; label: string; icon: string }

export function stageActions(a: LoanApplication): StageAction[] {
  const list: StageAction[] = []
  switch (a.status) {
    case 'DRAFT':
      list.push({ id: 'continue', label: 'Continue application', icon: 'pencil' })
      break
    case 'SUBMITTED':
      if (a.guarantorRequired) list.push({ id: 'verify-guarantor', label: 'Verify guarantor', icon: 'user-round' })
      if (a.collateralRequired) list.push({ id: 'verify-collateral', label: 'Verify collateral', icon: 'shield' })
      list.push({
        id: 'credit',
        label: a.creditAssessmentRequired ? 'Run credit assessment' : 'Continue to approval',
        icon: 'calculator',
      })
      break
    case 'CREDIT_APPROVED':
    case 'PENDING_APPROVAL':
      list.push({ id: 'approve', label: 'Approve', icon: 'check' })
      list.push({ id: 'reject', label: 'Reject', icon: 'x' })
      break
    case 'APPROVED':
      list.push({ id: 'generate-contract', label: 'Generate contract', icon: 'file-text' })
      break
    case 'CONTRACT_GENERATED':
    // the application status stays the same after sending, so check the contract itself
    if (contractFor(a)?.status === 'SENT') {
        // the signed upload now lives in the Contract tab
        list.push({ id: 'complete-application', label: 'Complete application', icon: 'check' })
        list.push({ id: 'cancel-application', label: 'Cancel application', icon: 'x' })
    } else {
        list.push({ id: 'send-contract', label: 'Send contract', icon: 'mail' })
    }
    break
    case 'CONTRACT_SIGNED':
      list.push({ id: 'create-loan', label: 'Create loan', icon: 'hand-coins' })
      break
  }
  return list
}

/* ---------- SAMPLE ONLY: profile extras, replaced by API data later ---------- */

// applications that show the full set of 3 guarantors and 3 assets
const FULL_SETS = [3, 11]

export type GuarantorRow = {
  id: number
  name: string
  phone: string
  relationship: string
  status: 'VERIFIED' | 'PENDING'
}

const GUARANTOR_POOL: Omit<GuarantorRow, 'status'>[] = [
  { id: 1, name: 'Joseph Massawe', phone: '0713 222 111', relationship: 'Brother' },
  { id: 2, name: 'Rehema Salim', phone: '0754 333 222', relationship: 'Sister' },
  { id: 3, name: 'Daudi Mwanga', phone: '0765 444 333', relationship: 'Colleague' },
]

export function guarantorsFor(a: LoanApplication): GuarantorRow[] {
  if (!a.guarantorRequired || RANK[a.status] === 0) return []
  // a rejected application had its guarantors verified before the credit assessment failed
  const verified = RANK[a.status] >= 2 || a.status === 'REJECTED'
  const status: GuarantorRow['status'] = verified ? 'VERIFIED' : 'PENDING'
  const count = FULL_SETS.includes(a.id) ? 3 : 1
  return GUARANTOR_POOL.slice(0, count).map((g) => ({ ...g, status }))
}

export type CollateralRow = {
  id: number
  type: string
  description: string
  value: number
  document: string | null // uploaded file name
  status: 'VERIFIED' | 'PENDING'
}

// value is worked out from the loan amount so every sample looks sensible
const COLLATERAL_POOL = [
  { id: 1, type: 'Land', description: 'Plot 214, Kinondoni, with title deed', factor: 1.5, document: 'title-deed-plot-214.pdf' },
  { id: 2, type: 'House', description: '3-bedroom house, Mbezi Beach', factor: 2, document: 'title-deed-mbezi-house.pdf' },
  // no document: the upload is optional for vehicles
  { id: 3, type: 'Vehicle', description: 'Toyota Hilux 2019, reg. T 482 DKF', factor: 0.8, document: null },
]

export function collateralsFor(a: LoanApplication): CollateralRow[] {
  if (!a.collateralRequired || RANK[a.status] === 0) return []
  const verified = RANK[a.status] >= 2 || a.status === 'REJECTED'
  const status: CollateralRow['status'] = verified ? 'VERIFIED' : 'PENDING'
  const count = FULL_SETS.includes(a.id) ? 3 : 1
  return COLLATERAL_POOL.slice(0, count).map(({ factor, ...c }) => ({
    ...c,
    value: Math.round(a.requestedAmount * factor),
    status,
  }))
}

export type CreditRow = {
  income: number
  expenses: number
  cashFlow: number
  decision: 'APPROVE' | 'REJECT'
  assessedBy: string
  notes: string
}

// null means the assessment has not been run yet
export function creditFor(a: LoanApplication): CreditRow | null {
  if (a.credit) return a.credit
  if (!a.creditAssessmentRequired) return null
  if (a.status === 'REJECTED') {
    return { income: 900000, expenses: 750000, cashFlow: 150000, decision: 'REJECT', assessedBy: 'Credit Analyst', notes: 'Cash flow too low for the requested installment' }
  }
  if (RANK[a.status] < 2) return null
  return { income: 2000000, expenses: 800000, cashFlow: 1200000, decision: 'APPROVE', assessedBy: 'Credit Analyst', notes: 'Stable income' }
}

export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'PENDING'

export type ApprovalRow = {
  levelNo: number
  levelName: string
  role: string
  decision: ApprovalDecision
  by: string | null
  comments: string | null
}

const LEVELS = [
  { levelNo: 1, levelName: 'Admin', role: 'Admin', by: 'Admin User' },
  { levelNo: 2, levelName: 'Manager', role: 'Loan Officer', by: 'Asha Mrema' },
  { levelNo: 3, levelName: 'Committee', role: 'Approver', by: 'Credit Committee' },
]

export function approvalsFor(a: LoanApplication): ApprovalRow[] {
  return LEVELS.map((l) => {
    let decision: ApprovalDecision = 'PENDING'
    if (RANK[a.status] >= 3) decision = 'APPROVED'
    else if (a.status === 'PENDING_APPROVAL' && l.levelNo === 1) decision = 'APPROVED'
    else if (a.status === 'REJECTED' && l.levelNo === 1 && !a.creditAssessmentRequired) decision = 'REJECTED'

    return {
      levelNo: l.levelNo,
      levelName: l.levelName,
      role: l.role,
      decision,
      by: decision === 'PENDING' ? null : l.by,
      comments: decision === 'APPROVED' ? 'Looks good' : decision === 'REJECTED' ? 'Does not meet lending criteria' : null,
    }
  })
}

export type ContractRow = {
  contractNo: string
  status: 'GENERATED' | 'SENT' | 'SIGNED'
  generated: string
  sent: string | null
  signed: string | null
}

export function contractFor(a: LoanApplication): ContractRow | null {
  if (RANK[a.status] < 4) return null
  const day = (n: number) => dayjs(a.created).add(n, 'day').format('YYYY-MM-DD')
  const pastSigning = RANK[a.status] >= 5

  const sent = a.contractSentAt ?? (pastSigning ? day(4) : null)
  const signed = a.contractSignedAt ?? (pastSigning ? day(6) : null)

  return {
    contractNo: a.applicationNo.replace('LA-', 'CT-'),
    status: signed ? 'SIGNED' : sent ? 'SENT' : 'GENERATED',
    generated: day(3),
    sent,
    signed,
  }
}

export type ActivityEvent = { title: string; detail: string; date: string; icon: string }

type Milestone = {
  rank: number
  title: string
  detail: (a: LoanApplication) => string
  icon: string
  offset: number
  show?: (a: LoanApplication) => boolean
}

const MILESTONES: Milestone[] = [
  { rank: 0, title: 'Draft started', detail: (a) => `Created by ${a.loanOfficer}`, icon: 'pencil', offset: 0 },
  { rank: 1, title: 'Application submitted', detail: (a) => `Application number ${a.applicationNo}`, icon: 'send', offset: 0 },
  { rank: 2, title: 'Credit stage passed', detail: () => 'Guarantor, collateral and credit checks completed', icon: 'calculator', offset: 1 },
  { rank: 3, title: 'Application approved', detail: () => 'All approval levels signed off', icon: 'circle-check', offset: 2 },
  { rank: 4, title: 'Contract generated', detail: () => 'Contract ready to send to the borrower', icon: 'file-text', offset: 3 },
  {
    rank: 4,
    title: 'Contract sent',
    detail: () => 'Emailed to the borrower with a link to print it',
    icon: 'mail',
    offset: 4,
    show: (a) => RANK[a.status] >= 5 || !!a.contractSentAt,
  },
  { rank: 5, title: 'Contract signed', detail: () => 'Signed copy uploaded', icon: 'pen-line', offset: 6 },
  { rank: 6, title: 'Loan created', detail: () => 'Waiting for disbursement', icon: 'hand-coins', offset: 7 },
]

// newest first, built from the application's stage so it always matches the status
export function activityFor(a: LoanApplication): ActivityEvent[] {
  const day = (n: number) => dayjs(a.created).add(n, 'day').format('YYYY-MM-DD')
  const events: ActivityEvent[] = MILESTONES.filter(
    (m) => m.rank <= RANK[a.status] && (m.show ? m.show(a) : true),
  ).map((m) => ({
    title: m.title,
    detail: m.detail(a),
    date: day(m.offset),
    icon: m.icon,
  }))
  if (a.status === 'REJECTED') {
    events.push({ title: 'Application rejected', detail: a.creditAssessmentRequired ? 'Credit assessment failed' : 'Application halted', date: day(1), icon: 'circle-x' })
  }
    if (a.status === 'CANCELLED') {
    events.push({ title: 'Application cancelled', detail: a.cancelReason || 'Cancelled by staff', date: a.cancelledAt ?? day(1), icon: 'x' })
  }
  return events.reverse()
}

export type ApprovalChecks = Pick<
  LoanApplication,
  'guarantorRequired' | 'collateralRequired' | 'creditAssessmentRequired'
>

export type FlowStep = { id: string; label: string; detail: string }

// what happens after submission, in the order the API enforces:
// guarantors and collateral are verified first, then credit assessment, then approval
// steps completed inside the application form, in order
export function inForm(checks: ApprovalChecks): FlowStep[] {
  const steps: FlowStep[] = []
  if (checks.guarantorRequired) {
    steps.push({ id: 'guarantor', label: 'Guarantor', detail: 'Add the guarantor and confirm their ID and exposure' })
  }
  if (checks.collateralRequired) {
    steps.push({ id: 'collateral', label: 'Collateral', detail: 'Add the collateral and confirm ownership and pledges' })
  }
  if (checks.creditAssessmentRequired) {
    steps.push({ id: 'credit', label: 'Credit assessment', detail: 'Enter income and expenses, then see the decision' })
  }
  return steps
}

// steps that happen after the application is submitted
export function afterSubmit(): FlowStep[] {
  return [
    { id: 'approval', label: 'Approval', detail: 'One decision per approval level' },
    { id: 'contract', label: 'Contract', detail: 'Generated, sent and signed' },
    { id: 'loan', label: 'Loan created', detail: 'Waits for disbursement' },
  ]
}

/* ---------- SAMPLE ONLY: the applicant's existing loans, replaced by API data later ---------- */

export type ExistingLoan = {
  id: number
  ref: string
  product: string
  amount: number // amount disbursed
  outstanding: number // 0 means fully paid
  repaidPct: number // share of the total repayable already paid
  installment: number
  nextDue: string | null
  status: 'ACTIVE' | 'OVERDUE' | 'CLOSED'
  daysOverdue: number
}



// SAMPLE ONLY: built from the sample loans, so it always matches the Loans page
export const existingLoansFor = (applicantId: number): ExistingLoan[] =>
  LOANS.filter((l) => l.applicantId === applicantId).map((l) => {
    const v = viewOf(l, SAMPLE_PAYMENTS, SAMPLE_PENALTIES)
    const first = v.installments[0]
    return {
      id: l.id,
      ref: l.loanNo,
      product: 'Loan',
      amount: l.principal,
      outstanding: v.outstanding,
      repaidPct: v.repaidPct,
      installment: first.principalDue + first.interestDue,
      nextDue: v.nextDueDate,
      status: v.state,
      daysOverdue: v.overdueDays,
    }
  })


/* ---------- SAMPLE ONLY: disbursement, replaced by API data later ---------- */

export type PaymentMethod = 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CASH'

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Bank transfer',
  MOBILE_MONEY: 'Mobile money',
  CASH: 'Cash',
}

// the company's own accounts, where the money is paid FROM (the credit side)
export type CompanyAccount = {
  id: number
  code: string // chart of accounts code
  name: string
  method: PaymentMethod
  balance: number
}

export const COMPANY_ACCOUNTS: CompanyAccount[] = [
  { id: 1, code: 'CASH', name: 'Cash on hand', method: 'CASH', balance: 6000000 },
  { id: 2, code: 'BANK_CRDB', name: 'CRDB Bank · 0150 xxxx 4412', method: 'BANK_TRANSFER', balance: 48000000 },
  { id: 3, code: 'BANK_NMB', name: 'NMB Bank · 2041 xxxx 9087', method: 'BANK_TRANSFER', balance: 12500000 },
  { id: 4, code: 'MPESA', name: 'M-Pesa business · 0754 xxx 100', method: 'MOBILE_MONEY', balance: 9000000 },
]

// the borrower's accounts, where the money is paid TO (the API calls these member accounts)
export type MemberAccount = {
  id: number
  applicantId: number
  method: PaymentMethod
  label: string
  detail: string
}

export function memberAccountsFor(applicantId: number): MemberAccount[] {
  return [
    { id: applicantId * 10 + 1, applicantId, method: 'MOBILE_MONEY', label: 'Mobile money', detail: `0713 222 ${100 + applicantId}` },
    { id: applicantId * 10 + 2, applicantId, method: 'BANK_TRANSFER', label: 'NMB Bank', detail: `2041 000${applicantId} 5521` },
  ]
}

export type JournalLine = {
  side: 'DEBIT' | 'CREDIT'
  code: string
  name: string
  amount: number
}

// disbursing a loan: the borrower now owes us (debit), the money leaves our account (credit)
export function journalFor(amount: number, source?: CompanyAccount): JournalLine[] {
  return [
    { side: 'DEBIT', code: 'LOAN_RECEIVABLE', name: 'Loan receivable', amount },
    { side: 'CREDIT', code: source?.code ?? '—', name: source?.name ?? 'Choose the account paid from', amount },
  ]
}

// receiving a loan payment: the money comes into our account (debit),
// and what the borrower owes goes down (credit), split like the payment allocation
export function paymentJournalFor(
  split: { penalty: number; interest: number; principal: number },
  account?: CompanyAccount,
): JournalLine[] {
  const total = split.penalty + split.interest + split.principal
  if (total <= 0) return []

  const lines: JournalLine[] = [
    {
      side: 'DEBIT',
      code: account?.code ?? '—',
      name: account?.name ?? 'Choose the account received into',
      amount: total,
    },
  ]
  if (split.principal > 0) {
    lines.push({ side: 'CREDIT', code: 'LOAN_RECEIVABLE', name: 'Loan receivable', amount: split.principal })
  }
  if (split.interest > 0) {
    lines.push({ side: 'CREDIT', code: 'INTEREST_INCOME', name: 'Interest income', amount: split.interest })
  }
  if (split.penalty > 0) {
    lines.push({ side: 'CREDIT', code: 'PENALTY_INCOME', name: 'Penalty income', amount: split.penalty })
  }
  return lines
}

export type DisbursementRecord = {
  id: number
  applicationId: number
  amount: number
  sourceAccountId: number
  memberAccountId: number
  method: PaymentMethod
  reference: string
  date: string
  processedBy: string
  approvedBy: string
  proofName: string | null
  notes: string
  // the loan is disbursed first, then posted to the GL in a second call, so the second can fail
  glStatus: 'POSTED' | 'PENDING'
}

// keyed by application id
export const SAMPLE_DISBURSEMENTS: Record<number, DisbursementRecord> = {
  1: {
    id: 1,
    applicationId: 1,
    amount: 5000000,
    sourceAccountId: 2,
    memberAccountId: 12,
    method: 'BANK_TRANSFER',
    reference: 'TXN-00123',
    date: '2026-10-09',
    processedBy: 'Asha Mrema',
    approvedBy: 'Admin User',
    proofName: 'crdb-slip-00123.pdf',
    notes: '',
    glStatus: 'PENDING',
  },
}

// people who can approve a disbursement
export const APPROVERS = ['Admin User', 'Juma Bakari', 'Asha Mrema']


export type Loan = {
  id: number
  loanNo: string
  applicationId: number | null // links to /loan-applications/:id when the loan came from one
  applicantId: number
  applicantName: string
  loanOfficer: string
  principal: number
  interestMethod: InterestMethod
  interestRate: number // annual %
  tenure: number // months
  penaltyRate: number
  disbursed: string // ISO date
}

export type PaymentAllocation = { installmentNo: number; penalty: number; interest: number; principal: number }

export type LoanPayment = {
  id: number
  loanId: number
  amount: number
  method: PaymentMethod
  reference: string
  date: string
  receivedBy: string
  allocations: PaymentAllocation[]
  unallocated: number
  receiptName?: string | null
  /** the real file, only kept for this session */
  receiptFile?: File | null
}

export type PenaltyRecord = {
  id: number
  loanId: number
  installmentNo: number
  rate: number
  amount: number
  date: string
}

type PlannedInstallment = { installmentNo: number; dueDate: string; principalDue: number; interestDue: number }

export type InstallmentStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING'

export type InstallmentState = PlannedInstallment & {
  id: number
  penaltyDue: number // charged so far
  principalPaid: number
  interestPaid: number
  penaltyPaid: number
  paid: number
  outstanding: number
  daysOverdue: number
  status: InstallmentStatus
}

export type NplClass = 'CURRENT' | 'WATCH' | 'SUBSTANDARD' | 'DOUBTFUL' | 'LOSS'
export type LoanState = 'ACTIVE' | 'OVERDUE' | 'CLOSED'

export type LoanView = Loan & {
  installments: InstallmentState[]
  payments: LoanPayment[]
  penalties: PenaltyRecord[]
  totalRepayable: number // schedule plus penalties
  paid: number
  outstandingPrincipal: number
  outstandingInterest: number
  outstandingPenalty: number
  outstanding: number
  overdueDays: number
  overdueAmount: number
  classification: NplClass
  isNpl: boolean
  state: LoanState
  next: InstallmentState | null
  nextDueDate: string | null
  maturity: string
  repaidPct: number
}

// extra days a borrower gets before a penalty is charged (GracePeriod in the API), none in the sample
export const GRACE_DAYS = 0

export const LOAN_STATE: Record<LoanState, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'green' },
  OVERDUE: { label: 'Overdue', color: 'red' },
  CLOSED: { label: 'Closed', color: 'gray' },
}

export const INSTALLMENT_STATUS: Record<InstallmentStatus, { label: string; color: string }> = {
  PAID: { label: 'Paid', color: 'green' },
  PARTIAL: { label: 'Partly paid', color: 'yellow' },
  OVERDUE: { label: 'Overdue', color: 'red' },
  PENDING: { label: 'Pending', color: 'gray' },
}

export const NPL_STYLE: Record<NplClass, { label: string; color: string }> = {
  CURRENT: { label: 'Current', color: 'green' },
  WATCH: { label: 'Watch', color: 'yellow' },
  SUBSTANDARD: { label: 'Substandard', color: 'orange' },
  DOUBTFUL: { label: 'Doubtful', color: 'red' },
  LOSS: { label: 'Loss', color: 'dark' },
}

const sumOf = <T>(list: T[], f: (x: T) => number) => list.reduce((t, x) => t + f(x), 0)

// the same buckets as POST /api/collections-workflow/loans/{loanId}/classify-npl
export const classify = (days: number): NplClass =>
  days <= 0 ? 'CURRENT' : days <= 30 ? 'WATCH' : days <= 90 ? 'SUBSTANDARD' : days <= 180 ? 'DOUBTFUL' : 'LOSS'

// the schedule the API makes at disbursement: monthly installments, FLAT or REDUCING
export function plannedInstallments(l: Loan): PlannedInstallment[] {
  const p = l.principal
  const n = l.tenure
  const r = l.interestRate / 100 / 12
  const emi = r === 0 ? p / n : (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  let balance = p
  const rows: PlannedInstallment[] = []

  for (let i = 1; i <= n; i++) {
    const interest = Math.round(l.interestMethod === 'FLAT' ? p * r : balance * r)
    let principal = Math.round(l.interestMethod === 'FLAT' ? p / n : emi - interest)
    if (i === n) principal = balance // the last installment clears whatever is left
    balance -= principal
    rows.push({
      installmentNo: i,
      dueDate: dayjs(l.disbursed).add(i, 'month').format('YYYY-MM-DD'),
      principalDue: principal,
      interestDue: interest,
    })
  }
  return rows
}

// the schedule plus what has been paid and charged so far (payments and penalties must belong to this loan)
export function installmentStates(loan: Loan, payments: LoanPayment[], penalties: PenaltyRecord[]): InstallmentState[] {
  const today = dayjs().startOf('day')
  const allocations = payments.flatMap((p) => p.allocations)

  return plannedInstallments(loan).map((row) => {
    const mine = allocations.filter((x) => x.installmentNo === row.installmentNo)
    const principalPaid = sumOf(mine, (x) => x.principal)
    const interestPaid = sumOf(mine, (x) => x.interest)
    const penaltyPaid = sumOf(mine, (x) => x.penalty)
    const penaltyDue = sumOf(
      penalties.filter((x) => x.installmentNo === row.installmentNo),
      (x) => x.amount,
    )
    const paid = principalPaid + interestPaid + penaltyPaid
    const outstanding = row.principalDue + row.interestDue + penaltyDue - paid
    const daysOverdue = outstanding > 0 ? Math.max(0, today.diff(dayjs(row.dueDate), 'day')) : 0
    const status: InstallmentStatus =
      outstanding <= 0 ? 'PAID' : daysOverdue > 0 ? 'OVERDUE' : paid > 0 ? 'PARTIAL' : 'PENDING'

    return { ...row, id: row.installmentNo, penaltyDue, principalPaid, interestPaid, penaltyPaid, paid, outstanding, daysOverdue, status }
  })
}

// how the API splits a payment: oldest unpaid installment first, penalty, then interest, then principal
export function allocatePayment(amount: number, states: InstallmentState[]) {
  let left = amount
  const allocations: PaymentAllocation[] = []

  for (const s of states) {
    if (left <= 0) break
    if (s.outstanding <= 0) continue
    const penalty = Math.min(left, s.penaltyDue - s.penaltyPaid)
    left -= penalty
    const interest = Math.min(left, s.interestDue - s.interestPaid)
    left -= interest
    const principal = Math.min(left, s.principalDue - s.principalPaid)
    left -= principal
    allocations.push({ installmentNo: s.installmentNo, penalty, interest, principal })
  }
  return { allocations, unallocated: left }
}

// the penalties POST /api/payments-workflow/loans/{loanId}/accrue-penalties would charge now:
// one time per late installment, outstanding amount x penalty rate, never charged twice
export function penaltiesToCharge(
  loan: Loan,
  states: InstallmentState[],
  penalties: PenaltyRecord[],
  graceDays = GRACE_DAYS,
) {
  return states
    .filter(
      (s) =>
        s.outstanding > 0 &&
        s.daysOverdue > graceDays &&
        !penalties.some((p) => p.installmentNo === s.installmentNo),
    )
    .map((s) => ({
      installmentNo: s.installmentNo,
      rate: loan.penaltyRate,
      amount: Math.round((s.outstanding * loan.penaltyRate) / 100),
    }))
}

export function viewOf(loan: Loan, payments: LoanPayment[], penalties: PenaltyRecord[]): LoanView {
  const own = payments
    .filter((p) => p.loanId === loan.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const pen = penalties.filter((p) => p.loanId === loan.id)
  const installments = installmentStates(loan, own, pen)
  const unpaid = installments.filter((s) => s.outstanding > 0)

  const outstandingPrincipal = sumOf(installments, (s) => s.principalDue - s.principalPaid)
  const outstandingInterest = sumOf(installments, (s) => s.interestDue - s.interestPaid)
  const outstandingPenalty = sumOf(installments, (s) => s.penaltyDue - s.penaltyPaid)
  const outstanding = outstandingPrincipal + outstandingInterest + outstandingPenalty
  const overdueDays = Math.max(0, ...unpaid.map((s) => s.daysOverdue))
  const totalRepayable = sumOf(installments, (s) => s.principalDue + s.interestDue + s.penaltyDue)
  const paid = sumOf(installments, (s) => s.paid)

  return {
    ...loan,
    installments,
    payments: own,
    penalties: pen,
    totalRepayable,
    paid,
    outstandingPrincipal,
    outstandingInterest,
    outstandingPenalty,
    outstanding,
    overdueDays,
    overdueAmount: sumOf(
      unpaid.filter((s) => s.daysOverdue > 0),
      (s) => s.outstanding,
    ),
    classification: classify(overdueDays),
    isNpl: overdueDays >= 90, // the API marks a loan NPL from 90 days
    state: outstanding <= 0 ? 'CLOSED' : overdueDays > 0 ? 'OVERDUE' : 'ACTIVE',
    next: unpaid[0] ?? null,
    nextDueDate: unpaid[0]?.dueDate ?? null,
    maturity: installments[installments.length - 1].dueDate,
    repaidPct: totalRepayable > 0 ? Math.round((paid / totalRepayable) * 100) : 0,
  }
}

// newest first, built from the disbursement, payments and penalties
export function loanActivity(v: LoanView): ActivityEvent[] {
  const events: ActivityEvent[] = [
    {
      title: 'Loan disbursed',
      detail: `${formatTzs(v.principal)} paid out and the repayment schedule created`,
      date: v.disbursed,
      icon: 'banknote',
    },
    ...v.payments.map((p) => ({
      title: 'Payment received',
      detail: `${formatTzs(p.amount)} by ${METHOD_LABEL[p.method]}${p.reference ? ` · ${p.reference}` : ''}`,
      date: p.date,
      icon: 'circle-check',
    })),
    ...v.penalties.map((p) => ({
      title: 'Late penalty charged',
      detail: `Installment #${p.installmentNo} · ${formatTzs(p.amount)} (${p.rate}%)`,
      date: p.date,
      icon: 'triangle-alert',
    })),
  ]

  if (v.state === 'CLOSED' && v.payments.length > 0) {
    events.push({
      title: 'Loan fully repaid',
      detail: 'Every installment is paid, so the loan is closed',
      date: v.payments[v.payments.length - 1].date,
      icon: 'flag',
    })
  }

  // oldest first so a later event on the same day stays on top once reversed
  return events.sort((a, b) => a.date.localeCompare(b.date)).reverse()
}

/* ---------- the sample loans ---------- */

export const LOANS: Loan[] = [
  // came from application 1 and disbursed on the Disbursements page, so nothing is due yet
  { id: 1, loanNo: 'LN-0001', applicationId: 1, applicantId: 1, applicantName: 'John Doe', loanOfficer: 'Asha Mrema', principal: 5000000, interestMethod: 'REDUCING', interestRate: 24, tenure: 12, penaltyRate: 2, disbursed: '2026-10-09' },
  // fully repaid
  { id: 3, loanNo: 'LN-0003', applicationId: null, applicantId: 5, applicantName: 'Hassan Said', loanOfficer: 'Juma Bakari', principal: 2000000, interestMethod: 'FLAT', interestRate: 20, tenure: 6, penaltyRate: 2, disbursed: '2026-02-10' },
  // stopped paying months ago, so it is non-performing
  { id: 5, loanNo: 'LN-0005', applicationId: null, applicantId: 2, applicantName: 'Amina Juma', loanOfficer: 'Juma Bakari', principal: 3000000, interestMethod: 'REDUCING', interestRate: 22, tenure: 12, penaltyRate: 3, disbursed: '2026-03-05' },
  // first installment falls due today
  { id: 6, loanNo: 'LN-0006', applicationId: null, applicantId: 6, applicantName: 'Neema Kileo', loanOfficer: 'Juma Bakari', principal: 1500000, interestMethod: 'FLAT', interestRate: 18, tenure: 6, penaltyRate: 2, disbursed: '2026-09-20' },
  // one installment is a few days late
  { id: 7, loanNo: 'LN-0007', applicationId: null, applicantId: 1, applicantName: 'John Doe', loanOfficer: 'Asha Mrema', principal: 800000, interestMethod: 'FLAT', interestRate: 24, tenure: 6, penaltyRate: 2, disbursed: '2026-06-08' },
]

type SeedPayment = Omit<LoanPayment, 'id' | 'loanId' | 'allocations' | 'unallocated'>

// each payment is allocated against what was owing at that moment, like the API does
function seedPayments(loan: Loan, entries: SeedPayment[], startId: number): LoanPayment[] {
  const out: LoanPayment[] = []
  entries.forEach((e, i) => {
    const { allocations, unallocated } = allocatePayment(e.amount, installmentStates(loan, out, []))
    out.push({ id: startId + i, loanId: loan.id, ...e, allocations, unallocated })
  })
  return out
}

// pays the first installments in full, one payment each, on the given dates
function fullPayments(loan: Loan, dates: string[], startId: number, method: PaymentMethod, receivedBy: string) {
  const plan = plannedInstallments(loan)
  return seedPayments(
    loan,
    dates.map((date, i) => ({
      date,
      amount: plan[i].principalDue + plan[i].interestDue,
      method,
      reference: method === 'CASH' ? '' : `PMT-${String(startId + i).padStart(5, '0')}`,
      receivedBy,
    })),
    startId,
  )
}

const loanById = (id: number) => LOANS.find((l) => l.id === id)!

export const SAMPLE_PAYMENTS: LoanPayment[] = [
  // LN-0001: an early part-payment, the first installment is not due yet
  ...seedPayments(
    loanById(1),
    [{ date: '2026-10-15', amount: 300000, method: 'MOBILE_MONEY', reference: 'PMT-00101', receivedBy: 'Asha Mrema' }],
    101,
  ),
  // LN-0003: every installment paid on time
  ...fullPayments(loanById(3), ['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'], 301, 'BANK_TRANSFER', 'Juma Bakari'),
  // LN-0005: three installments paid, then nothing
  ...fullPayments(loanById(5), ['2026-04-05', '2026-05-06', '2026-06-05'], 501, 'MOBILE_MONEY', 'Juma Bakari'),
  // LN-0007: three installments paid, the fourth is late
  ...fullPayments(loanById(7), ['2026-07-08', '2026-08-09', '2026-09-08'], 701, 'CASH', 'Asha Mrema'),
]

// LN-0005 has been charged for its first three late installments, the newest late one is still to charge
// (the daily job does this on its own, the button on the loan runs it on demand)
const penaltyFor = (id: number, l: Loan, n: number): PenaltyRecord => {
  const row = plannedInstallments(l)[n - 1]
  return {
    id,
    loanId: l.id,
    installmentNo: n,
    rate: l.penaltyRate,
    amount: Math.round(((row.principalDue + row.interestDue) * l.penaltyRate) / 100),
    date: dayjs(row.dueDate).add(1, 'day').format('YYYY-MM-DD'),
  }
}

export const SAMPLE_PENALTIES: PenaltyRecord[] = [4, 5, 6].map((n, i) => penaltyFor(i + 1, loanById(5), n))

/* ---------- SAMPLE ONLY: grace periods, replaced by API data later ---------- */

export type GracePeriod = {
  id: number
  loanId: number
  graceDays: number
  reason: string
  grantedBy: string
  date: string // when it was granted
  active: boolean
}

// the extra days a loan gets before a late installment is charged a penalty
export const graceDaysFor = (loanId: number, list: GracePeriod[]) =>
  list.find((g) => g.loanId === loanId && g.active)?.graceDays ?? GRACE_DAYS

export const SAMPLE_GRACE_PERIODS: GracePeriod[] = [
  // LN-0007 has a late installment, the grace period holds its penalty back
  { id: 1, loanId: 7, graceDays: 30, reason: 'Salary was paid late this month, the borrower asked for more time', grantedBy: 'Asha Mrema', date: '2026-10-10', active: true },
  // an old one that already ended
  { id: 2, loanId: 5, graceDays: 14, reason: 'Hospital bills, agreed a short pause', grantedBy: 'Juma Bakari', date: '2026-07-06', active: false },
]