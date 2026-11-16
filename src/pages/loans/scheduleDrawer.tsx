import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Badge, Button, Drawer, Text } from '@mantine/core'
import { AppIcon } from '../../components/appIcon'
import { CustomTable, type CustomTableColumn } from '../../components/customTable/customTable'
import { CustomTabs } from '../../components/customTabs'
import { formatTzs } from '../../utils/format'
import {
  INSTALLMENT_STATUS,
  LOAN_STATE,
  NPL_STYLE,
  type InstallmentState,
  type LoanView,
} from './loanApplicationsData'

type Props = {
  opened: boolean
  /** every loan of the borrower, so another loan's schedule is one click away */
  loans: LoanView[]
  /** the loan to show first */
  loanId: number | null
  /** the installments the payment this was opened from went to */
  highlight?: number[]
  onClose: () => void
  onOpenLoan: (l: LoanView) => void
  onPay?: (l: LoanView) => void
}

const n = (x: number) => x.toLocaleString('en-US')

export function ScheduleDrawer({ opened, loans, loanId, highlight = [], onClose, onOpenLoan, onPay }: Props) {
  const [picked, setPicked] = useState<number | null>(null)

  // opening it again starts on the loan of that payment
  useEffect(() => {
    setPicked(null)
  }, [loanId, opened])

  const loan = loans.find((l) => l.id === (picked ?? loanId)) ?? loans[0]

  if (!loan) {
    return <Drawer opened={false} onClose={onClose} />
  }

  // the tags only make sense on the loan the payment belongs to
  const marked = loan.id === loanId ? highlight : []

  const tiles = [
    { label: 'Outstanding', value: formatTzs(loan.outstanding) },
    {
      label: loan.next ? `Next due · ${dayjs(loan.next.dueDate).format('MMM D, YYYY')}` : 'Next installment',
      value: loan.next ? formatTzs(loan.next.outstanding) : '—',
    },
    { label: 'Paid so far', value: `${formatTzs(loan.paid)} · ${loan.repaidPct}%` },
  ]

  const columns: CustomTableColumn<InstallmentState>[] = [
    {
      accessor: 'installmentNo',
      header: 'No.',
      width: 100,
      render: (r) => {
        const isMarked = marked.includes(r.installmentNo)
        return (
          <div>
            <Text size="sm" fw={isMarked ? 600 : 400}>
              #{r.installmentNo}
            </Text>
            {isMarked && (
              <Badge variant="light" color="brand" radius="sm" size="xs">
                This payment
              </Badge>
            )}
          </div>
        )
      },
      exportValue: (r) => r.installmentNo,
    },
    { accessor: 'dueDate', header: 'Due date', type: 'date' },
    {
      accessor: 'principalDue',
      header: 'Due',
      render: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm text-gray-800">{formatTzs(r.principalDue + r.interestDue)}</div>
          <div className="whitespace-nowrap text-[11px] text-gray-500">
            P {n(r.principalDue)} · I {n(r.interestDue)}
          </div>
        </div>
      ),
      exportValue: (r) => r.principalDue + r.interestDue,
    },
    {
      accessor: 'penaltyDue',
      header: 'Penalty',
      render: (r) => (
        <Text size="sm" c={r.penaltyDue > 0 ? 'red' : undefined}>
          {r.penaltyDue > 0 ? formatTzs(r.penaltyDue) : '—'}
        </Text>
      ),
      exportValue: (r) => r.penaltyDue,
    },
    {
      accessor: 'paid',
      header: 'Paid',
      render: (r) => <Text size="sm">{r.paid > 0 ? formatTzs(r.paid) : '—'}</Text>,
      exportValue: (r) => r.paid,
    },
    {
      accessor: 'outstanding',
      header: 'Outstanding',
      render: (r) => (
        <Text size="sm" fw={500}>
          {r.outstanding > 0 ? formatTzs(r.outstanding) : '—'}
        </Text>
      ),
      exportValue: (r) => r.outstanding,
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (r) => (
        <div>
          <Badge variant="light" color={INSTALLMENT_STATUS[r.status].color} radius="sm" size="sm">
            {INSTALLMENT_STATUS[r.status].label}
          </Badge>
          {r.daysOverdue > 0 && <div className="mt-0.5 text-[11px] text-red-500">{r.daysOverdue} days late</div>}
        </div>
      ),
      exportValue: (r) => INSTALLMENT_STATUS[r.status].label,
    },
  ]

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="xl" title={loan.applicantName}>
      <div className="space-y-5">
        {/* more than one loan: switch between their schedules */}
        {loans.length > 1 && (
          <CustomTabs
            ariaLabel="Loan schedules"
            className="w-fit p-0"
            value={String(loan.id)}
            onChange={(value) => setPicked(Number(value))}
            tabs={loans.map((l) => ({ value: String(l.id), label: l.loanNo }))}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="light" color={LOAN_STATE[loan.state].color} radius="sm" size="sm">
            {LOAN_STATE[loan.state].label}
          </Badge>
          {loan.state === 'OVERDUE' && (
            <Badge variant="outline" color={NPL_STYLE[loan.classification].color} radius="sm" size="sm">
              {loan.isNpl ? 'NPL · ' : ''}
              {NPL_STYLE[loan.classification].label}
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {loan.loanNo} · {loan.tenure} months · {loan.interestRate}% p.a. · disbursed{' '}
            {dayjs(loan.disbursed).format('MMM D, YYYY')}
          </Text>
        </div>

        {loan.state === 'OVERDUE' && (
          <Alert color={loan.isNpl ? 'red' : 'yellow'} variant="light" icon={<AppIcon name="triangle-alert" />}>
            <Text size="sm">
              {loan.overdueDays} days overdue. {formatTzs(loan.overdueAmount)} is past due.
            </Text>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-500">{t.label}</div>
              <div className="text-base font-medium text-gray-800">{t.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="default"
            leftSection={<AppIcon name="external-link" />}
            onClick={() => onOpenLoan(loan)}
          >
            Open loan
          </Button>
          {onPay && loan.state !== 'CLOSED' && (
            <Button size="xs" leftSection={<AppIcon name="banknote" />} onClick={() => onPay(loan)}>
              Record payment
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Payments clear the oldest unpaid installment first. Inside an installment the penalty is paid first, then
            the interest, then the principal.
            {marked.length > 0 && ' The installments cleared by the payment you opened are tagged.'}
          </p>
          <CustomTable<InstallmentState>
            size="sm"
            data={loan.installments}
            columns={columns}
            pagination={false}
            defaultSort={null}
            exportCsv
            exportFileName={`${loan.loanNo}-schedule`}
            print
            printTitle={`${loan.loanNo} repayment schedule`}
          />
        </div>
      </div>
    </Drawer>
  )
}