import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import dayjs from 'dayjs'
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
import {
  APPROVERS,
  METHOD_LABEL,
  journalFor,
  memberAccountsFor,
  type CompanyAccount,
  type DisbursementRecord,
  type JournalLine,
  type LoanApplication,
} from './loanApplicationsData'
import { CURRENT_USER } from '../../auth/currentUser'

// the other pages still import it from here
export { CURRENT_USER }

/* ---------- journal table, also used by the details drawer ---------- */

export function JournalPreview({ lines }: { lines: JournalLine[] }) {
  const debit = lines.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
  const balanced = debit === credit

  return (
    <div className="rounded-md border border-gray-200">
      <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <span>Account</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
      </div>
      {lines.map((l) => (
        <div
          key={`${l.side}-${l.code}`}
          className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-2 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0"
        >
          <div className={`min-w-0 ${l.side === 'CREDIT' ? 'pl-4' : ''}`}>
            <div className="truncate font-medium text-gray-800">{l.name}</div>
            <div className="text-[11px] text-gray-400">{l.code}</div>
          </div>
          <span className="text-right text-gray-800">{l.side === 'DEBIT' ? formatTzs(l.amount) : ''}</span>
          <span className="text-right text-gray-800">{l.side === 'CREDIT' ? formatTzs(l.amount) : ''}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-3 py-2">
        <Badge variant="light" color={balanced ? 'green' : 'red'} radius="sm" size="sm">
          {balanced ? 'Balanced' : 'Not balanced'}
        </Badge>
        <span className="text-xs text-gray-500">Total {formatTzs(debit)}</span>
      </div>
    </div>
  )
}

/* ---------- the dialog ---------- */

export type DisbursementInput = Omit<DisbursementRecord, 'id' | 'applicationId' | 'glStatus'>

type Props = {
  opened: boolean
  application: LoanApplication | null
  accounts: CompanyAccount[]
  /** references already recorded, a reference can only be used once */
  usedReferences: string[]
  onClose: () => void
  onSubmit: (input: DisbursementInput) => void
}

type Errors = Partial<Record<'source' | 'member' | 'reference' | 'date' | 'approver' | 'confirm', string>>

export function DisbursementDialog({ opened, application: a, accounts, usedReferences, onClose, onSubmit }: Props) {
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [approver, setApprover] = useState<string | null>(null)
  const [proof, setProof] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  if (!a) return <Modal opened={false} onClose={onClose} />

  const memberAccounts = memberAccountsFor(a.applicantId)
  const source = accounts.find((x) => String(x.id) === sourceId)
  const member = memberAccounts.find((x) => String(x.id) === memberId)
  const needsReference = !!source && source.method !== 'CASH'

  const clear = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const reset = () => {
    setSourceId(null)
    setMemberId(null)
    setReference('')
    setDate(dayjs().format('YYYY-MM-DD'))
    setApprover(null)
    setProof(null)
    setNotes('')
    setConfirmed(false)
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const found: Errors = {}
    const ref = reference.trim()

    if (!source) found.source = 'Select the account the money was paid from'
    else if (source.balance < a.requestedAmount) found.source = 'This account does not hold enough to cover the amount'

    if (!member) found.member = "Select the borrower's account"

    if (needsReference && !ref) found.reference = 'Enter the transaction reference'
    else if (ref && usedReferences.some((r) => r.toLowerCase() === ref.toLowerCase())) {
      found.reference = 'This reference is already recorded'
    }

    if (!date) found.date = 'Enter the date the money was sent'
    else if (dayjs(date).isAfter(dayjs(), 'day')) found.date = 'The date cannot be in the future'

    if (!approver) found.approver = 'Select who approved this payout'
    else if (approver === CURRENT_USER) found.approver = 'The approver must be someone other than you'

    if (!confirmed) found.confirm = 'Confirm that the money has been sent'

    setErrors(found)
    if (Object.keys(found).length > 0 || !source || !member || !approver) return

    onSubmit({
      amount: a.requestedAmount,
      sourceAccountId: source.id,
      memberAccountId: member.id,
      method: source.method,
      reference: ref,
      date,
      processedBy: CURRENT_USER,
      approvedBy: approver,
      proofName: proof?.name ?? null,
      notes: notes.trim(),
    })
    reset()
  }

  return (
    <Modal opened={opened} onClose={close} title="Record disbursement" size={980} centered>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* the form */}
        <div className="space-y-4">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              label="Paid from"
              description="The company account the money left"
              placeholder="Select account"
              size="sm"
              allowDeselect={false}
              data={accounts.map((x) => ({ value: String(x.id), label: `${x.name} · ${formatTzs(x.balance)}` }))}
              value={sourceId}
              onChange={(v) => {
                setSourceId(v)
                clear('source')
                clear('reference')
              }}
              error={errors.source}
            />
            <Select
              label="Paid to"
              description={`${a.applicantName}'s account`}
              placeholder="Select account"
              size="sm"
              allowDeselect={false}
              data={memberAccounts.map((x) => ({ value: String(x.id), label: `${x.label} · ${x.detail}` }))}
              value={memberId}
              onChange={(v) => {
                setMemberId(v)
                clear('member')
              }}
              error={errors.member}
            />
            <NumberInput
              label="Amount"
              description="Fixed to the contract principal"
              size="sm"
              prefix="TZS "
              thousandSeparator=","
              hideControls
              readOnly
              value={a.requestedAmount}
            />
            <TextInput
              label="Payment method"
              description="Follows the account the money was paid from"
              size="sm"
              readOnly
              value={source ? METHOD_LABEL[source.method] : ''}
              placeholder="Choose the account first"
            />
            <TextInput
              label={needsReference ? 'Transaction reference' : 'Reference (optional for cash)'}
              placeholder="TXN-00123"
              size="sm"
              value={reference}
              onChange={(e) => {
                setReference(e.currentTarget.value)
                clear('reference')
              }}
              error={errors.reference}
            />
            <TextInput
              label="Date sent"
              type="date"
              size="sm"
              max={dayjs().format('YYYY-MM-DD')}
              value={date}
              onChange={(e) => {
                setDate(e.currentTarget.value)
                clear('date')
              }}
              error={errors.date}
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
                clear('approver')
              }}
              error={errors.approver}
            />
            <TextInput label="Processed by" description="You, from your session" size="sm" readOnly value={CURRENT_USER} />
          </SimpleGrid>

          <FileInput
            label="Proof of payment (optional)"
            description="A bank slip or a screenshot of the mobile money message"
            placeholder="Upload PDF or image"
            size="sm"
            accept="application/pdf,image/*"
            clearable
            leftSection={<AppIcon name="upload" />}
            value={proof}
            onChange={setProof}
          />

          <Textarea
            label="Notes (optional)"
            size="sm"
            autosize
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
        </div>

        {/* what will be recorded */}
        <div className="space-y-4">
          <div>
            <Text size="sm" fw={600} mb={4}>
              Loan
            </Text>
            <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm">
              <span className="text-gray-500">Borrower</span>
              <span className="text-right font-medium text-gray-800">{a.applicantName}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm">
              <span className="text-gray-500">Application</span>
              <span className="text-right font-medium text-gray-800">{a.applicationNo}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm">
              <span className="text-gray-500">Amount</span>
              <span className="text-right font-medium text-gray-800">{formatTzs(a.requestedAmount)}</span>
            </div>
          </div>

          <div>
            <Text size="sm" fw={600} mb={4}>
              Journal entry
            </Text>
            <JournalPreview lines={journalFor(a.requestedAmount, source)} />
            <Text size="xs" c="dimmed" mt={6}>
              The borrower now owes the loan (debit) and the money leaves your account (credit).
            </Text>
          </div>

          <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />}>
            <Text size="xs">
              This only records the payout. No money is moved by this system, so send it first. A recorded
              disbursement can't be edited. A mistake is fixed with a reversing entry.
            </Text>
          </Alert>

          <Checkbox
            label="I confirm the money has been sent"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.currentTarget.checked)
              clear('confirm')
            }}
            error={errors.confirm}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button size="xs" variant="default" onClick={close}>
          Cancel
        </Button>
        <Button
          size="xs"
          leftSection={<AppIcon name="check" />}
          onClick={submit}
        >
          Record disbursement
        </Button>
      </div>
    </Modal>
  )
}