import { AppIcon } from '../../components/appIcon'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Badge, Button, Text } from '@mantine/core'
import { Can } from '../auth/requirePermission'
import { ContractConfirmDialog } from '../loans/contractDialogs'
import { ErrorState, LoadingState } from '../../components/pageState'
import { useAuth } from '../../auth/authContext'
import { useIdentifications, useVerifyIdentification } from '../../api/applicants'
import { useUserNames } from '../../api/users'
import type { Applicant } from './applicantsData'

export function IdentificationSection({ applicant }: { applicant: Applicant }) {
  const { user } = useAuth()
  const names = useUserNames()
  const { data: list = [], isLoading, error, refetch } = useIdentifications(applicant.id)
  const verify = useVerifyIdentification()

  const [targetId, setTargetId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  const target = list.find((i) => i.id === targetId)
  const nida = list.find((i) => i.type === 'NIDA')
  const hasTin = list.some((i) => i.type === 'TIN')

  const confirm = async () => {
    if (!target || !user || verify.isPending) return
    setFailure(null)
    try {
      // POST /api/onboarding/identification/verify { identificationId, verifiedBy }
      await verify.mutateAsync({ identificationId: target.id, verifiedBy: user.id })
      setNotice(`${target.type} ${target.number} was marked as verified.`)
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not mark it as verified. Please try again.')
    } finally {
      setTargetId(null)
    }
  }

  return (
    <div className="mt-4">
      <Text size="sm" fw={600} mb={4}>
        Identification
      </Text>

      {notice && (
        <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} icon={<AppIcon name="circle-check" />} mb="xs">
          <Text size="xs">{notice}</Text>
        </Alert>
      )}

      {failure && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setFailure(null)} icon={<AppIcon name="circle-x" />} mb="xs">
          <Text size="xs">{failure}</Text>
        </Alert>
      )}

      {isLoading ? (
        <LoadingState rows={2} />
      ) : error ? (
        <ErrorState compact message={error.message} onRetry={() => void refetch()} />
      ) : (
        <>
          {applicant.status === 'PENDING_KYC' && nida && !nida.verified && (
            <Alert color="yellow" variant="light" icon={<AppIcon name="triangle-alert" />} mb="xs">
              <Text size="xs">The NIDA number is not verified yet. Check it before you approve the KYC.</Text>
            </Alert>
          )}

          {list.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
              No identification is on file for this applicant.
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <AppIcon name="contact-round" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">{i.type || 'ID'} number</div>
                    <div className="font-mono text-xs text-gray-500">{i.number}</div>
                    {i.verified && (
                      <div className="text-[11px] text-gray-400">
                        Verified
                        {i.verifiedBy !== null ? ` by ${names.get(i.verifiedBy) ?? `User #${i.verifiedBy}`}` : ''}
                        {i.verifiedAt ? ` on ${dayjs(i.verifiedAt).format('MMM D, YYYY')}` : ''}
                      </div>
                    )}
                  </div>
                  <Badge variant="light" color={i.verified ? 'green' : 'gray'} radius="sm" size="sm">
                    {i.verified ? 'Verified' : 'Not verified'}
                  </Badge>
                  {!i.verified && (
                    <Can area="applicants" page="applicants" action="edit">
                      <Button size="compact-xs" variant="light" onClick={() => setTargetId(i.id)}>
                        Mark verified
                      </Button>
                    </Can>
                  )}
                </li>
              ))}
            </ul>
          )}

          {list.length > 0 && !hasTin && <p className="mt-2 text-xs text-gray-500">No TIN number on file. It is optional.</p>}
        </>
      )}

      <ContractConfirmDialog
        opened={!!target}
        title="Mark as verified"
        message={`Confirm that the ${target?.type ?? ''} number ${target?.number ?? ''} of ${applicant.name} was checked against the official record.`}
        confirmLabel="Mark verified"
        onClose={() => setTargetId(null)}
        onConfirm={confirm}
      />
    </div>
  )
}