import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Button, Modal, Text } from '@mantine/core'
import { checkReturningKycRequest } from '../../api/applicants'
import type { Applicant } from './applicantsData'

type Props = {
  /** the applicant to check, null keeps the dialog closed */
  applicant: Applicant | null
  onClose: () => void
}

type Result = { valid: boolean; message: string; expiresAt: string | null }

export function RecheckKycDialog({ applicant, onClose }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  // a real failure, not the "no valid KYC" answer
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // every time it opens it starts without a result
  useEffect(() => {
    setResult(null)
    setFailure(null)
  }, [applicant])

  const run = async () => {
    if (!applicant) return
    setLoading(true)
    setFailure(null)
    try {
      // POST /api/onboarding/kyc/check-returning/{applicantId}
      const res = await checkReturningKycRequest(applicant.id)
      setResult({
        valid: true,
        message: res.message ?? 'Existing KYC still valid; applicant may proceed',
        expiresAt: res.data?.expiresAt ?? null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      // "No valid existing KYC found; full KYC required" is an answer, anything else is a failure
      if (/no valid/i.test(message)) setResult({ valid: false, message, expiresAt: null })
      else setFailure(message || 'Could not run the check. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const left = result?.expiresAt ? dayjs(result.expiresAt).diff(dayjs(), 'day') : 0

  return (
    <Modal opened={!!applicant} onClose={onClose} title="Re-check KYC" centered>
      {applicant && (
        <div className="space-y-4">
          <div>
            <Text fw={600}>{applicant.name}</Text>
            <Text size="xs" c="dimmed">
              {applicant.applicantNo}
            </Text>
          </div>

          <Text size="sm">
            This looks for an earlier approved KYC that has not expired. An approval is valid for 12 months. When one is
            found, the applicant can skip full KYC.
          </Text>

          {failure && (
            <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
              <Text size="sm">{failure}</Text>
            </Alert>
          )}

          {result &&
            (result.valid ? (
              <Alert color="green" variant="light" title="KYC is still valid" icon={<AppIcon name="circle-check" />}>
                <Text size="sm">{result.message}.</Text>
                {result.expiresAt && (
                  <div className="mt-2 text-xs text-gray-600">
                    Valid until {dayjs(result.expiresAt).format('MMM D, YYYY')} ({left} {left === 1 ? 'day' : 'days'}{' '}
                    left)
                  </div>
                )}
              </Alert>
            ) : (
              <Alert color="red" variant="light" title="Full KYC required" icon={<AppIcon name="circle-x" />}>
                <Text size="sm">{result.message}.</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Review the applicant's documents and record a new KYC decision.
                </Text>
              </Alert>
            ))}

          <div className="flex justify-end gap-2">
            <Button size="xs" variant="default" onClick={onClose}>
              Close
            </Button>
            <Button size="xs" loading={loading} leftSection={<AppIcon name="refresh-cw" />} onClick={run}>
              {result ? 'Check again' : 'Run check'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}