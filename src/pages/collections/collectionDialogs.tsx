import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { formatTzs } from '../../utils/format'
import { CURRENT_USER, JournalPreview } from '../loans/disbursementDialog'
import { APPROVERS, NPL_STYLE, type JournalLine, type LoanView } from '../loans/loanApplicationsData'
import {
  ACTIVITY_LABEL,
  COLLECTORS,
  OUTCOME,
  RECOVERY_ACTION_LABEL,
  type ActivityOutcome,
  type ActivityType,
  type RecoveryActionType,
} from './collectionsData'

const TYPE_OPTIONS = (Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((k) => ({
  value: k,
  label: ACTIVITY_LABEL[k],
}))

const OUTCOME_OPTIONS = (Object.keys(OUTCOME) as ActivityOutcome[]).map((k) => ({
  value: k,
  label: OUTCOME[k].label,
}))

/* ---------- log an activity ---------- */

export type ActivityInput = { type: ActivityType; outcome: ActivityOutcome; description: string }

type LogProps = {
  opened: boolean
  caseNo: string
  borrower: string
  onClose: () => void
  onSubmit: (input: ActivityInput) => void
}

type LogErrors = Partial<Record<'outcome' | 'description', string>>

//const defaultAssignee = () => (COLLECTORS.includes(CURRENT_USER) ? CURRENT_USER : null)

export function LogActivityDialog({ opened, caseNo, borrower, onClose, onSubmit }: LogProps) {
  const [type, setType] = useState<ActivityType>('PHONE_CALL')
  const [outcome, setOutcome] = useState<ActivityOutcome | null>(null)
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<LogErrors>({})

  const reset = () => {
    setType('PHONE_CALL')
    setOutcome(null)
    setDescription('')
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const found: LogErrors = {}
    if (!outcome) found.outcome = 'Select how the contact went'
    if (!description.trim()) found.description = 'Write what was said or done'
    setErrors(found)
    if (Object.keys(found).length > 0 || !outcome) return

    // TODO: POST /api/collections-workflow/cases/{caseId}/activities { activityType, description, performedBy, outcome }
    onSubmit({ type, outcome, description: description.trim() })
    reset()
  }

  return (
    <Modal opened={opened} onClose={close} title="Log activity" centered>
      <div className="space-y-4">
        <Text size="sm">
          Record the contact you made with {borrower} on case <span className="font-medium">{caseNo}</span>.
        </Text>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Select
            label="Type of contact"
            size="sm"
            data={TYPE_OPTIONS}
            allowDeselect={false}
            value={type}
            onChange={(v) => setType((v as ActivityType | null) ?? 'PHONE_CALL')}
          />
          <Select
            label="Outcome"
            placeholder="How did it go"
            size="sm"
            data={OUTCOME_OPTIONS}
            allowDeselect={false}
            value={outcome}
            onChange={(v) => {
              setOutcome(v as ActivityOutcome | null)
              setErrors((e) => ({ ...e, outcome: undefined }))
            }}
            error={errors.outcome}
          />
        </SimpleGrid>

        <Textarea
          label="What happened"
          placeholder="Reminded the borrower of the overdue installment"
          size="sm"
          autosize
          minRows={3}
          value={description}
          onChange={(e) => {
            setDescription(e.currentTarget.value)
            setErrors((x) => ({ ...x, description: undefined }))
          }}
          error={errors.description}
        />

        <TextInput label="Logged by" description="You, from your session" size="sm" readOnly value={CURRENT_USER} />

        {outcome === 'PAID' && (
          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <Text size="xs">
              This only logs the conversation. It does not record any money. Record the payment on the Payments page so
              the loan balance updates and the case can be closed.
            </Text>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            Log activity
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- close or escalate (a note is needed) ---------- */

type RemarksProps = {
  opened: boolean
  title: string
  message: string
  confirmLabel: string
  color?: string
  placeholder?: string
  onClose: () => void
  onSubmit: (remarks: string) => void
}

export function RemarksDialog({ opened, title, message, confirmLabel, color, placeholder, onClose, onSubmit }: RemarksProps) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string>()

  const close = () => {
    setRemarks('')
    setError(undefined)
    onClose()
  }

  const submit = () => {
    if (!remarks.trim()) {
      setError('Add a short note')
      return
    }
    onSubmit(remarks.trim())
    setRemarks('')
    setError(undefined)
  }

  return (
    <Modal opened={opened} onClose={close} title={title} centered>
      <div className="space-y-4">
        <Text size="sm">{message}</Text>
        <Textarea
          label="Remarks"
          placeholder={placeholder}
          size="sm"
          autosize
          minRows={3}
          value={remarks}
          onChange={(e) => {
            setRemarks(e.currentTarget.value)
            setError(undefined)
          }}
          error={error}
        />
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close}>
            Cancel
          </Button>
          <Button size="xs" color={color} onClick={submit}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- open a case by hand ---------- */

export type OpenCaseInput = { loanId: number; assignedTo: string; remarks: string }

type OpenProps = {
  opened: boolean
  /** loans that are overdue and have no open case */
  loans: LoanView[]
  initialLoanId: number | null
  onClose: () => void
  onSubmit: (input: OpenCaseInput) => void
}

type OpenErrors = Partial<Record<'loan' | 'assignee', string>>

export function OpenCaseDialog({ opened, loans, initialLoanId, onClose, onSubmit }: OpenProps) {
  const [loanId, setLoanId] = useState<string | null>(null)
  const [assignee, setAssignee] = useState<string | null>(CURRENT_USER)
  const [remarks, setRemarks] = useState('')
  const [errors, setErrors] = useState<OpenErrors>({})

  // coming from a row starts with that loan already chosen
  useEffect(() => {
    if (opened) setLoanId(initialLoanId ? String(initialLoanId) : null)
  }, [opened, initialLoanId])

  const loan = loans.find((l) => String(l.id) === loanId)

  const reset = () => {
    setLoanId(null)
    setAssignee(CURRENT_USER)
    setRemarks('')
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const found: OpenErrors = {}
    if (!loan) found.loan = 'Select the overdue loan'
    if (!assignee) found.assignee = 'Select who will follow it up'
    setErrors(found)
    if (Object.keys(found).length > 0 || !loan || !assignee) return

    // TODO: POST /api/collections-workflow/loans/{loanId}/open-case { assignedTo, remarks }
    onSubmit({ loanId: loan.id, assignedTo: assignee, remarks: remarks.trim() })
    reset()
  }

  return (
    <Modal opened={opened} onClose={close} title="Open collection case" centered>
      <div className="space-y-4">
        <Select
          label="Loan"
          description="Only loans that are overdue and have no open case are listed"
          placeholder="Search by borrower or loan number"
          size="sm"
          searchable
          nothingFoundMessage="No overdue loans without a case"
          data={loans.map((l) => ({
            value: String(l.id),
            label: `${l.applicantName} · ${l.loanNo} · ${l.overdueDays} days overdue`,
          }))}
          allowDeselect={false}
          value={loanId}
          onChange={(v) => {
            setLoanId(v)
            setErrors((e) => ({ ...e, loan: undefined }))
          }}
          error={errors.loan}
        />

        {loan && (
          <div className="rounded-md bg-gray-50 px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Overdue</span>
              <span className="font-medium text-red-600">{loan.overdueDays} days</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-gray-500">Past due</span>
              <span className="font-medium text-gray-800">{formatTzs(loan.overdueAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="text-gray-500">Class</span>
              <Badge variant="outline" color={NPL_STYLE[loan.classification].color} radius="sm" size="sm">
                {loan.isNpl ? 'NPL · ' : ''}
                {NPL_STYLE[loan.classification].label}
              </Badge>
            </div>
          </div>
        )}

        <Select
          label="Assigned to"
          description="The collector who follows this case up"
          size="sm"
          data={COLLECTORS}
          allowDeselect={false}
          value={assignee}
          onChange={(v) => {
            setAssignee(v)
            setErrors((e) => ({ ...e, assignee: undefined }))
          }}
          error={errors.assignee}
        />

        <Textarea
          label="Remarks (optional)"
          placeholder="First follow-up call scheduled"
          size="sm"
          autosize
          minRows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.currentTarget.value)}
        />

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="xs">
            The daily job opens a case for every overdue loan on its own at 07:15 UTC. Opening one by hand just does it
            ahead of time. A loan can only have one open case at a time.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            Open case
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- log a recovery action ---------- */

const RECOVERY_TYPE_OPTIONS = (Object.keys(RECOVERY_ACTION_LABEL) as RecoveryActionType[]).map((k) => ({
  value: k,
  label: RECOVERY_ACTION_LABEL[k],
}))

export type RecoveryActionInput = {
  type: RecoveryActionType
  description: string
  amount: number
  documentName: string | null
  file: File | null
}

type RecoveryActionProps = {
  opened: boolean
  caseNo: string
  borrower: string
  onClose: () => void
  onSubmit: (input: RecoveryActionInput) => void
}

type RecoveryActionErrors = Partial<Record<'type' | 'description', string>>

export function LogRecoveryActionDialog({ opened, caseNo, borrower, onClose, onSubmit }: RecoveryActionProps) {
  const [type, setType] = useState<RecoveryActionType | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [document, setDocument] = useState<File | null>(null)
  const [errors, setErrors] = useState<RecoveryActionErrors>({})

  const reset = () => {
    setType(null)
    setDescription('')
    setAmount('')
    setDocument(null)
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const found: RecoveryActionErrors = {}
    if (!type) found.type = 'Select the kind of action'
    if (!description.trim()) found.description = 'Write what was done'
    setErrors(found)
    if (Object.keys(found).length > 0 || !type) return

    // TODO: POST /api/collections-workflow/recovery-cases/{recoveryCaseId}/actions
    //       { actionType, description, amount, documentPath, performedBy }
    //       The file upload is not in the API yet, only a documentPath is saved.
    onSubmit({
      type,
      description: description.trim(),
      amount: amount === '' ? 0 : amount,
      documentName: document?.name ?? null,
      file: document,
    })
    reset()
  }

  return (
    <Modal opened={opened} onClose={close} title="Log recovery action" centered>
      <div className="space-y-4">
        <Text size="sm">
          Record the step taken to recover the money from {borrower} on case <span className="font-medium">{caseNo}</span>.
        </Text>

        <Select
          label="Type of action"
          placeholder="Select action"
          size="sm"
          data={RECOVERY_TYPE_OPTIONS}
          allowDeselect={false}
          value={type}
          onChange={(v) => {
            setType(v as RecoveryActionType | null)
            setErrors((e) => ({ ...e, type: undefined }))
          }}
          error={errors.type}
        />

        <Textarea
          label="What happened"
          placeholder="Demand letter sent by courier"
          size="sm"
          autosize
          minRows={3}
          value={description}
          onChange={(e) => {
            setDescription(e.currentTarget.value)
            setErrors((x) => ({ ...x, description: undefined }))
          }}
          error={errors.description}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label="Amount (optional)"
            description="Value of a settlement or seized asset"
            size="sm"
            prefix="TZS "
            thousandSeparator=","
            hideControls
            allowNegative={false}
            value={amount}
            onChange={(v) => setAmount(v === '' ? '' : Number(v))}
          />
          <TextInput label="Logged by" description="You, from your session" size="sm" readOnly value={CURRENT_USER} />
        </SimpleGrid>

        <FileInput
          label="Document (optional)"
          description="A notice, court paper or signed agreement"
          placeholder="Upload PDF or image"
          size="sm"
          accept="application/pdf,image/*"
          clearable
          leftSection={<AppIcon name="upload" />}
          value={document}
          onChange={setDocument}
        />

        <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
          <Text size="xs">
            This only logs the step. It does not record any money. When money is actually received, record it on the
            Payments page so the loan balance updates.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            Log action
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- write off a loan ---------- */

export type WriteOffInput = { reason: string; approvedBy: string }

type WriteOffProps = {
  opened: boolean
  loan: LoanView | null
  onClose: () => void
  onSubmit: (input: WriteOffInput) => void
}

type WriteOffErrors = Partial<Record<'reason' | 'approver' | 'confirm', string>>

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right ${strong ? 'font-semibold' : 'font-medium'} text-gray-800`}>{value}</span>
    </div>
  )
}

export function WriteOffDialog({ opened, loan, onClose, onSubmit }: WriteOffProps) {
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<WriteOffErrors>({})

  if (!loan) return <Modal opened={false} onClose={onClose} />

  // the whole balance is written off: principal, interest and penalty
  const journal: JournalLine[] = [
    { side: 'DEBIT', code: 'BAD_DEBT_EXPENSE', name: 'Bad debt expense', amount: loan.outstanding },
    { side: 'CREDIT', code: 'LOAN_RECEIVABLE', name: 'Loan receivable', amount: loan.outstanding },
    { side: 'DEBIT', code: 'WRITE_OFF_EXPENSE', name: 'Write-off expense', amount: loan.outstanding },
  ]

  const reset = () => {
    setReason('')
    setApprover(null)
    setConfirmed(false)
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const found: WriteOffErrors = {}
    if (!reason.trim()) found.reason = 'Explain why the loan cannot be recovered'
    if (!approver) found.approver = 'Select who approved the write-off'
    else if (approver === CURRENT_USER) found.approver = 'The approver must be someone other than you'
    if (!confirmed) found.confirm = 'Confirm that you understand this cannot be undone'
    setErrors(found)
    if (Object.keys(found).length > 0 || !approver) return

    // TODO: POST /api/collections-workflow/loans/{loanId}/write-off { reason, approvedBy }
    onSubmit({ reason: reason.trim(), approvedBy: approver })
    reset()
  }

  return (
    <Modal opened={opened} onClose={close} title="Write off loan" size={900} centered>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Alert color="red" variant="light" title="This is the last step for a bad loan" icon={<AppIcon name="triangle-alert" />}>
            <Text size="sm">
              The full balance of {loan.loanNo} is written off and its outstanding amounts are set to zero. The loan is
              marked written off and any open collection or recovery case on it is closed. This cannot be undone.
            </Text>
          </Alert>

          <Textarea
            label="Reason"
            placeholder="Borrower untraceable after 200 days overdue"
            size="sm"
            autosize
            minRows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.currentTarget.value)
              setErrors((x) => ({ ...x, reason: undefined }))
            }}
            error={errors.reason}
          />

          <Select
            label="Approved by"
            description="Must be someone other than you"
            placeholder="Select approver"
            size="sm"
            allowDeselect={false}
            data={APPROVERS}
            value={approver}
            onChange={(v) => {
              setApprover(v)
              setErrors((x) => ({ ...x, approver: undefined }))
            }}
            error={errors.approver}
          />

          <Checkbox
            label="I understand the loan will be written off for good"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.currentTarget.checked)
              setErrors((x) => ({ ...x, confirm: undefined }))
            }}
            error={errors.confirm}
          />
        </div>

        <div className="space-y-4">
          <div>
            <Text size="sm" fw={600} mb={4}>
              Amount written off
            </Text>
            <Line label="Borrower" value={loan.applicantName} />
            <Line label="Loan" value={loan.loanNo} />
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 text-sm">
              <span className="text-gray-500">Class</span>
              <Badge variant="outline" color={NPL_STYLE[loan.classification].color} radius="sm" size="sm">
                {loan.isNpl ? 'NPL · ' : ''}
                {NPL_STYLE[loan.classification].label}
              </Badge>
            </div>
            <Line label="Principal" value={formatTzs(loan.outstandingPrincipal)} />
            <Line label="Interest" value={formatTzs(loan.outstandingInterest)} />
            <Line label="Penalty" value={formatTzs(loan.outstandingPenalty)} />
            <Line label="Total" value={formatTzs(loan.outstanding)} strong />
          </div>

          <div>
            <Text size="sm" fw={600} mb={4}>
              Journal entry
            </Text>
            <JournalPreview lines={journal} />
            <Text size="xs" c="dimmed" mt={6}>
              The loss is recorded as an expense (debit) and the loan receivable is cleared (credit).
            </Text>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button size="xs" variant="default" onClick={close}>
          Cancel
        </Button>
        <Button size="xs" color="red" leftSection={<AppIcon name="check" />} onClick={submit}>
          Write off loan
        </Button>
      </div>
    </Modal>
  )
}