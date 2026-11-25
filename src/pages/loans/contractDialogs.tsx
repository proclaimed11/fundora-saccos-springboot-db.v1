import { AppIcon } from '../../components/appIcon'
import { useState } from 'react'
import { Alert, Button, FileInput, Modal, Text } from '@mantine/core'

/* ---------- simple confirm dialog (generate, send, create loan) ---------- */

type ConfirmProps = {
  opened: boolean
  title: string
  message: string
  confirmLabel: string
  /** red confirm button, for actions that delete something */
  danger?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ContractConfirmDialog({
  opened,
  title,
  message,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: ConfirmProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <div className="space-y-4">
        <Text size="sm">{message}</Text>
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" color={danger ? 'red' : undefined} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- upload the signed copy ---------- */

type SignedProps = {
  opened: boolean
  contractNo: string
  onClose: () => void
  onUploaded: (file: File) => void
}

export function SignedContractDialog({ opened, contractNo, onClose, onUploaded }: SignedProps) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string>()

  const close = () => {
    setFile(null)
    setError(undefined)
    onClose()
  }

  const upload = () => {
    if (!file) {
      setError('Choose the signed contract to upload')
      return
    }
    // TODO: call POST /api/loan-origination/contracts/{contractId}/sign as multipart/form-data (part: file)
    onUploaded(file)
    close()
  }

  return (
    <Modal opened={opened} onClose={close} title="Upload signed contract" centered>
      <div className="space-y-4">
        <Text size="sm">
          Upload the copy the borrower printed, signed and returned for contract{' '}
          <span className="font-medium">{contractNo}</span>.
        </Text>

        <FileInput
          label="Signed contract"
          placeholder="Upload PDF or image"
          size="sm"
          accept="application/pdf,image/*"
          clearable
          leftSection={<AppIcon name="upload" />}
          value={file}
          onChange={(f) => {
            setFile(f)
            setError(undefined)
          }}
          error={error}
        />

        <Alert color="blue" variant="light" icon={<AppIcon name="info" />}>
          <Text size="sm">
            The contract will be marked as signed and the application moves to the next step, where the
            loan can be created.
          </Text>
        </Alert>

        <div className="flex justify-end gap-2">
          <Button size="xs" variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            size="xs"
            leftSection={<AppIcon name="upload" />}
            onClick={upload}
          >
            Upload
          </Button>
        </div>
      </div>
    </Modal>
  )
}