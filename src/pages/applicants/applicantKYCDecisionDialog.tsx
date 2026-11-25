import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Badge, Button, Modal, Text, Textarea } from '@mantine/core'
import { STATUS, type Applicant } from './applicantsData'
import {
  checkReturningKycRequest,
  fileUrl,
  useIdentifications,
  useKycDecision,
  useVerifyIdentification,
} from '../../api/applicants'
import { useApplicantDocuments } from '../../api/applicantRecords'
import { useAuth } from '../../auth/authContext'
import { isImage } from './documentDialogs'
import { notifications } from '@mantine/notifications'

type FileOnRecord = { key: string; name: string; fileName: string; path: string }
type ReturningResult = { valid: boolean; message: string; expiresAt: string | null }
const isPdf = (name: string) => /\.pdf$/i.test(name)


export type KycDecision = 'APPROVED' | 'REJECTED'

type KycDecisionDialogProps = {
  /** the applicant under review, null keeps the dialog closed */
  applicant: Applicant | null
  onClose: () => void
  /** called after the reviewer confirms */
  onDecided?: (applicant: Applicant, decision: KycDecision, remarks: string) => void
}

export function KycDecisionDialog({ applicant, onClose, onDecided }: KycDecisionDialogProps) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<KycDecision | null>(null) // set = showing the confirm step
  const [preview, setPreview] = useState<FileOnRecord | null>(null)
  const { user } = useAuth()
  const decide = useKycDecision()
  const [serverError, setServerError] = useState<string | null>(null)

  // GET /api/applicant-identifications and /api/applicant-documents for this applicant
  const { data: identifications = [] } = useIdentifications(applicant?.id ?? 0)
  const { data: documents = [], isLoading: docsLoading } = useApplicantDocuments(applicant?.id ?? 0)
  const nidaRow = identifications.find((i) => i.type === 'NIDA')
  const nida = nidaRow?.number || 'Not on file'

  // the NIDA/TIN scans live on the identification rows, the rest are applicant documents
  const files: FileOnRecord[] = [
    ...identifications
      .filter((i) => i.documentPath)
      .map((i) => ({
        key: `id-${i.id}`,
        name: `${i.type} document`,
        path: i.documentPath as string,
        fileName: (i.documentPath as string).split('/').pop() ?? '',
      })),
    ...documents
      .filter((d) => d.filePath)
      .map((d) => ({ key: `doc-${d.id}`, name: d.type, path: d.filePath, fileName: d.fileName })),
  ]

  // POST /api/onboarding/identification/verify, from inside the review
  const verify = useVerifyIdentification()
  const [confirmVerify, setConfirmVerify] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // POST /api/onboarding/kyc/check-returning/{applicantId}
  const [checking, setChecking] = useState(false)
  const [returning, setReturning] = useState<ReturningResult | null>(null)
  const [returningError, setReturningError] = useState<string | null>(null)

  const close = () => {
    setRemarks('')
    setError(undefined)
    setServerError(null)
    setPending(null)
    setPreview(null)
    setConfirmVerify(false)
    setVerifyError(null)
    setReturning(null)
    setReturningError(null)
    onClose()
  }

  const markVerified = async () => {
    if (!nidaRow || !user || verify.isPending) return
    setVerifyError(null)
    try {
      await verify.mutateAsync({ identificationId: nidaRow.id, verifiedBy: user.id })
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Could not mark it as verified. Please try again.')
    } finally {
      setConfirmVerify(false)
    }
  }

  const checkReturning = async () => {
    if (!applicant || checking) return
    setChecking(true)
    setReturningError(null)
    try {
      const res = await checkReturningKycRequest(applicant.id)
      setReturning({
        valid: true,
        message: res.message ?? 'Existing KYC still valid; applicant may proceed',
        expiresAt: res.data?.expiresAt ?? null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      // "No valid existing KYC found; full KYC required" is an answer, anything else is a failure
      if (/no valid/i.test(message)) setReturning({ valid: false, message, expiresAt: null })
      else setReturningError(message || 'Could not run the check. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  const choose = (decision: KycDecision) => {
    if (decision === 'REJECTED' && !remarks.trim()) {
      setError('Add a remark explaining the rejection')
      return
    }
    setError(undefined)
    setPending(decision)
  }

  const confirm = async () => {
    if (!applicant || !pending || !user || decide.isPending) return
    setServerError(null)
    try {
      // POST /api/onboarding/kyc/decision, the applicant becomes KYC_APPROVED or REJECTED
      await decide.mutateAsync({
        applicantId: applicant.id,
        status: pending,
        remarks: remarks.trim(),
        verifiedBy: user.id,
      })
      // one notification wherever the decision was made (KYC Review, the profile, registration)
      notifications.show(
        pending === 'APPROVED'
          ? {
              color: 'brand',
              title: 'KYC approved',
              message: `${applicant.name} can now apply for a loan.`,
              icon: <AppIcon name="shield" size={16} />,
            }
          : {
              color: 'red',
              title: 'KYC rejected',
              message: `${applicant.name}'s KYC was rejected. The reason is saved with the decision.`,
              icon: <AppIcon name="circle-x" size={16} />,
            },
      )
      onDecided?.(applicant, pending, remarks.trim())
      close()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save the decision. Please try again.')
    }
  }

  const approving = pending === 'APPROVED'

  return (
    <>
      <Modal
        opened={!!applicant}
        onClose={close}
        title={pending ? 'Confirm decision' : 'KYC decision'}
        size="lg"
        centered
      >
        {applicant && (
          <div className="space-y-5">
            {/* who is being reviewed */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Text fw={600}>{applicant.name}</Text>
                <Text size="xs" c="dimmed">
                  {applicant.applicantNo}
                </Text>
              </div>
              <div className="flex gap-2">
                <Badge variant="light" color={STATUS[applicant.status].color} radius="sm" size="sm">
                  {STATUS[applicant.status].label}
                </Badge>
                <Badge variant="outline" color={applicant.isReturning ? 'brand' : 'gray'} radius="sm" size="sm">
                  {applicant.isReturning ? 'Returning' : 'New'}
                </Badge>
              </div>
            </div>

            {pending ? (
              /* step 2: confirm */
              <div className="space-y-4">
                <Text size="sm">
                  {approving
                    ? `Approve KYC for ${applicant.name}? They will be able to start a loan application. Approval is valid for 12 months.`
                    : `Reject KYC for ${applicant.name}? This stops their loan application.`}
                </Text>
                {remarks.trim() && (
                  <div className="rounded-md bg-gray-50 px-3 py-2">
                    <Text size="xs" c="dimmed">
                      Remarks
                    </Text>
                    <Text size="sm">{remarks.trim()}</Text>
                  </div>
                )}
                {serverError && (
                  <Alert color="red" variant="light" icon={<AppIcon name="circle-x" />}>
                    <Text size="sm">{serverError}</Text>
                  </Alert>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    size="xs"
                    variant="default"
                    disabled={decide.isPending}
                    onClick={() => {
                      setServerError(null)
                      setPending(null)
                    }}
                  >
                    Back
                  </Button>
                  <Button size="xs" color={approving ? undefined : 'red'} loading={decide.isPending} onClick={confirm}>
                    {approving ? 'Confirm approval' : 'Confirm rejection'}
                  </Button>
                </div>
              </div>
            ) : (
              /* step 1: review */
              <>
                {applicant.isReturning && (
                  <Alert color="blue" variant="light" icon={<AppIcon name="refresh-cw" />}>
                    <Text size="sm">
                      Returning applicant. A valid KYC from the last 12 months can let them skip full review.
                    </Text>
                    {!returning && (
                      <Button size="compact-xs" variant="light" mt={8} loading={checking} onClick={checkReturning}>
                        Check existing KYC
                      </Button>
                    )}
                  </Alert>
                )}

                {returning && (
                  <Alert
                    color={returning.valid ? 'green' : 'yellow'}
                    variant="light"
                    withCloseButton
                    onClose={() => setReturning(null)}
                    icon={<AppIcon name={returning.valid ? 'circle-check' : 'triangle-alert'} />}
                  >
                    <Text size="sm">
                      {returning.message}
                      {returning.expiresAt ? ` (valid until ${dayjs(returning.expiresAt).format('MMM D, YYYY')})` : ''}
                    </Text>
                  </Alert>
                )}

                {returningError && (
                  <Alert color="red" variant="light" withCloseButton onClose={() => setReturningError(null)} icon={<AppIcon name="circle-x" />}>
                    <Text size="sm">{returningError}</Text>
                  </Alert>
                )}

                <div>
                  <Text size="sm" fw={600} mb={6}>
                    Documents
                  </Text>
                  {docsLoading ? (
                    <Text size="xs" c="dimmed">
                      Loading documents...
                    </Text>
                  ) : files.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-200 px-4 py-4 text-center text-xs text-red-500">
                      No documents are on file for this applicant.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {files.map((d) => (
                        <li key={d.key} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2">
                          <AppIcon
                            name={isImage(d.fileName) ? 'file-image' : 'file-text'}
                            className="text-xl text-gray-400"
                            size={20}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800">{d.name}</div>
                            <div className="truncate text-xs text-gray-500">{d.fileName}</div>
                          </div>
                          <Button size="compact-xs" variant="light" onClick={() => setPreview(d)}>
                            View
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <Text size="sm" fw={600} mb={4}>
                    Details to match
                  </Text>
                  <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    {[
                      ['NIDA number', nida],
                      ['Name', applicant.name],
                      ['Phone', applicant.phone],
                      ['Nationality', applicant.nationality],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm">
                        <span className="text-gray-500">{label}</span>
                        <span className="text-right font-medium text-gray-800">{value || '-'}</span>
                      </div>
                    ))}
                  </div>

                  {/* the NIDA number should be checked against the official record before approving */}
                  {nidaRow && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="light" color={nidaRow.verified ? 'green' : 'gray'} radius="sm" size="sm">
                        {nidaRow.verified ? 'NIDA verified' : 'NIDA not verified'}
                      </Badge>
                      {!nidaRow.verified &&
                        (confirmVerify ? (
                          <>
                            <Text size="xs" c="dimmed">
                              Checked against the official record?
                            </Text>
                            <Button size="compact-xs" loading={verify.isPending} onClick={markVerified}>
                              Yes, mark verified
                            </Button>
                            <Button size="compact-xs" variant="default" disabled={verify.isPending} onClick={() => setConfirmVerify(false)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button size="compact-xs" variant="light" onClick={() => setConfirmVerify(true)}>
                            Mark verified
                          </Button>
                        ))}
                    </div>
                  )}
                  {verifyError && (
                    <Text size="xs" c="red" mt={4}>
                      {verifyError}
                    </Text>
                  )}
                </div>

                <Textarea
                  label="Remarks"
                  description="Required to reject, optional to approve"
                  placeholder="Add a note about the documents checked"
                  minRows={3}
                  autosize
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.currentTarget.value)
                    setError(undefined)
                  }}
                  error={error}
                />

                <div className="flex justify-end gap-2">
                  <Button size="xs" color="red" variant="light" onClick={() => choose('REJECTED')}>
                    Reject
                  </Button>
                  <Button size="xs" onClick={() => choose('APPROVED')}>
                    Approve
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* document preview, the backend serves the stored file at its path */}
      <Modal opened={preview !== null} onClose={() => setPreview(null)} title={preview?.name ?? ''} size="lg" centered>
        {preview && (
          <div className="space-y-3">
            {isImage(preview.fileName) ? (
              <div className="flex justify-center rounded-md bg-gray-50 p-2">
                <img src={fileUrl(preview.path)} alt={preview.fileName} className="max-h-[56vh] object-contain" />
              </div>
            ) : isPdf(preview.fileName) ? (
              <iframe
                title={preview.fileName}
                src={fileUrl(preview.path)}
                className="h-[60vh] w-full rounded-md border border-gray-200"
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md bg-gray-50 text-center">
                <AppIcon name="file" className="text-gray-300" size={36} />
                <Text size="sm" c="dimmed">
                  This file type cannot be previewed here.
                </Text>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <Text size="xs" c="dimmed" className="truncate">
                {preview.fileName}
              </Text>
              <Button
                size="xs"
                variant="default"
                component="a"
                href={fileUrl(preview.path)}
                target="_blank"
                rel="noopener noreferrer"
                leftSection={<AppIcon name="external-link" />}
              >
                Open in new tab
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}