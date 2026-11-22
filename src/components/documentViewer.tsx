import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Text } from '@mantine/core'
import { AppIcon } from './appIcon'

export type ViewableDocument = {
  /** heading of the dialog, for example "Title deed" */
  title: string
  fileName: string
  /** small line under the file, for example who uploaded it and when */
  subtitle?: string
  notes?: string
  /** the real file when it was uploaded in this session, sample files have none */
  file?: File | null
  /** where the backend serves the stored file, used when there is no file from this session */
  url?: string | null
}

const isImage = (name: string) => /\.(jpe?g|png|gif|webp)$/i.test(name)
const isPdf = (name: string) => /\.pdf$/i.test(name)
const sizeText = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`

type Props = { document: ViewableDocument | null; onClose: () => void }

export function DocumentViewer({ document: doc, onClose }: Props) {
  const file = doc?.file ?? null
  const [localUrl, setUrl] = useState<string | null>(null)
  // a file picked in this session wins, otherwise the stored file on the backend
  const url = localUrl ?? doc?.url ?? null

  // a real file gets a temporary address so it can be shown, released again when it closes
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  const name = doc?.fileName ?? ''
  const image = file ? file.type.startsWith('image/') : isImage(name)
  const pdf = file ? file.type === 'application/pdf' : isPdf(name)

  return (
    <Modal opened={!!doc} onClose={onClose} title={doc?.title ?? ''} size="lg" centered>
      {doc && (
        <div className="space-y-4">
          {url && image ? (
            <div className="flex max-h-[60vh] justify-center overflow-auto rounded-md bg-gray-50 p-2">
              <img src={url} alt={doc.fileName} className="max-h-[56vh] object-contain" />
            </div>
          ) : url && pdf ? (
            <iframe title={doc.fileName} src={url} className="h-[60vh] w-full rounded-md border border-gray-200" />
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-md bg-gray-50 text-center">
              <AppIcon name={image ? 'file-image' : 'file-text'} className="text-gray-300" size={36} />
              <Text size="sm" c="dimmed" maw={320}>
                {url
                  ? 'This file type cannot be previewed here. Open it in a new tab or download it.'
                  : 'This file is not available to preview.'}
              </Text>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span className="min-w-0 truncate">
              {doc.fileName}
              {doc.file ? ` · ${sizeText(doc.file.size)}` : ''}
            </span>
            {doc.subtitle && <span>{doc.subtitle}</span>}
          </div>

          {doc.notes && (
            <Alert color="gray" variant="light" icon={<AppIcon name="info" />}>
              <Text size="xs">{doc.notes}</Text>
            </Alert>
          )}

          {url && (
            <div className="flex justify-end gap-2">
              <Button
                component="a"
                href={url}
                target="_blank"
                rel="noreferrer"
                size="xs"
                variant="default"
                leftSection={<AppIcon name="external-link" />}
              >
                Open in new tab
              </Button>
              <Button
                component="a"
                href={url}
                download={doc.fileName}
                size="xs"
                leftSection={<AppIcon name="download" />}
              >
                Download
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}