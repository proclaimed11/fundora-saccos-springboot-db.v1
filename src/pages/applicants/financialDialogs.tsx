import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import { Alert, Button, Modal, NumberInput, SimpleGrid, Text, TextInput } from '@mantine/core'
import { formatTzs } from '../../utils/format'
import { type ExistingDebt, type FinancialProfile } from './applicantsData'

/* ---------- financial profile ---------- */

type ProfileProps = {
  opened: boolean
  /** null means there is no profile yet */
  profile: FinancialProfile | null
  onClose: () => void
  onSubmit: (input: FinancialProfile) => void
}

type ProfileErrors = Partial<Record<'income' | 'expenses', string>>

// Employment type, employer and dependants inputs were removed: the financial_profile table has no columns for them.
export function FinancialProfileDialog({ opened, profile, onClose, onSubmit }: ProfileProps) {
  const [income, setIncome] = useState<number | ''>('')
  const [expenses, setExpenses] = useState<number | ''>('')
  const [errors, setErrors] = useState<ProfileErrors>({})

  useEffect(() => {
    if (!opened) return
    setIncome(profile?.monthlyIncome ?? '')
    setExpenses(profile?.monthlyExpenses ?? '')
    setErrors({})
  }, [opened, profile])

  const clear = (key: keyof ProfileErrors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const submit = () => {
    const found: ProfileErrors = {}
    if (income === '' || income < 0) found.income = 'Enter the monthly income'
    if (expenses === '' || expenses < 0) found.expenses = 'Enter the monthly expenses'

    setErrors(found)
    if (Object.keys(found).length > 0 || income === '' || expenses === '') return

    // TODO: POST /api/financial-profiles, or PUT /api/financial-profiles/{id} when editing (applicantId + fields from the model)
    onSubmit({
      // no inputs any more: keep whatever an older profile already had, so editing doesn't wipe it
      employmentType: profile?.employmentType ?? '',
      employer: profile?.employer ?? '',
      monthlyIncome: income,
      monthlyExpenses: expenses,
      dependants: profile?.dependants ?? 0,
    })
  }

  const flow = income !== '' && expenses !== '' ? income - expenses : null

  return (
    <Modal opened={opened} onClose={onClose} title={profile ? 'Edit financial profile' : 'Add financial profile'} centered>
      <div className="space-y-4">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label="Monthly income"
            placeholder="2,500,000"
            size="sm"
            prefix="TZS "
            thousandSeparator=","
            hideControls
            allowNegative={false}
            value={income}
            onChange={(v) => {
              setIncome(v === '' ? '' : Number(v))
              clear('income')
            }}
            error={errors.income}
          />
          <NumberInput
            label="Monthly expenses"
            placeholder="1,200,000"
            size="sm"
            prefix="TZS "
            thousandSeparator=","
            hideControls
            allowNegative={false}
            value={expenses}
            onChange={(v) => {
              setExpenses(v === '' ? '' : Number(v))
              clear('expenses')
            }}
            error={errors.expenses}
          />
        </SimpleGrid>

        {flow !== null && (
          <div className="rounded-md bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">Monthly cash flow</div>
            <div className={`text-base font-medium ${flow < 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatTzs(flow)}</div>
          </div>
        )}

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="xs">
            These figures are only a starting point. The credit assessment on each loan application asks for the
            income and expenses at that time.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            {profile ? 'Save changes' : 'Add profile'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- existing debt ---------- */

export type DebtInput = Omit<ExistingDebt, 'id'>

type DebtProps = {
  opened: boolean
  /** null means a new debt is being added */
  debt: ExistingDebt | null
  onClose: () => void
  onSubmit: (input: DebtInput) => void
}

type DebtErrors = Partial<Record<'lender' | 'balance' | 'monthly', string>>

export function DebtDialog({ opened, debt, onClose, onSubmit }: DebtProps) {
  const [lender, setLender] = useState('')
  const [balance, setBalance] = useState<number | ''>('')
  const [monthly, setMonthly] = useState<number | ''>('')
  const [errors, setErrors] = useState<DebtErrors>({})

  useEffect(() => {
    if (!opened) return
    setLender(debt?.lender ?? '')
    setBalance(debt?.balance ?? '')
    setMonthly(debt?.monthly ?? '')
    setErrors({})
  }, [opened, debt])

  const clear = (key: keyof DebtErrors) => setErrors((e) => ({ ...e, [key]: undefined }))

  const submit = () => {
    const found: DebtErrors = {}
    if (!lender.trim()) found.lender = 'Enter the lender name'
    if (balance === '' || balance <= 0) found.balance = 'Balance must be greater than zero'
    if (monthly === '' || monthly <= 0) found.monthly = 'Monthly payment must be greater than zero'
    else if (balance !== '' && monthly > balance) found.monthly = 'The monthly payment is more than the balance'

    setErrors(found)
    if (Object.keys(found).length > 0 || balance === '' || monthly === '') return

    // TODO: POST /api/existing-debts, or PUT /api/existing-debts/{id} when editing (applicantId + fields from the model)
    onSubmit({ lender: lender.trim(), balance, monthly })
  }

  return (
    <Modal opened={opened} onClose={onClose} title={debt ? 'Edit debt' : 'Add debt'} centered>
      <div className="space-y-4">
        <TextInput
          label="Lender"
          placeholder="CRDB Bank"
          size="sm"
          value={lender}
          onChange={(e) => {
            setLender(e.currentTarget.value)
            clear('lender')
          }}
          error={errors.lender}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label="Balance owed"
            placeholder="800,000"
            size="sm"
            prefix="TZS "
            thousandSeparator=","
            hideControls
            allowNegative={false}
            value={balance}
            onChange={(v) => {
              setBalance(v === '' ? '' : Number(v))
              clear('balance')
            }}
            error={errors.balance}
          />
          <NumberInput
            label="Monthly payment"
            placeholder="90,000"
            size="sm"
            prefix="TZS "
            thousandSeparator=","
            hideControls
            allowNegative={false}
            value={monthly}
            onChange={(v) => {
              setMonthly(v === '' ? '' : Number(v))
              clear('monthly')
            }}
            error={errors.monthly}
          />
        </SimpleGrid>

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="xs">
            Existing debts are pulled in automatically when a credit assessment is run for this applicant.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<AppIcon name="check" />} onClick={submit}>
            {debt ? 'Save changes' : 'Add debt'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}