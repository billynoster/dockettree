import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/domain/errors'
import type { UUID } from '@/domain/types'
import { formatBytes } from '@/domain/validation'
import { downloadBlob } from '@/lib/download'
import { loadSubmissionFile } from '@/services/submissionService'
import { ErrorState, LoadingState } from './States'

/** Renders the stored document bytes for a submission: PDF in a frame, images inline. */
export function DocumentPreview({
  submissionId,
  height = 'h-[420px]',
}: {
  submissionId: UUID
  height?: string
}) {
  const app = useApp()
  const [state, setState] = useState<{
    url: string | null
    filename: string
    mime: string
    size: number
    error: string | null
    loading: boolean
  }>({ url: null, filename: '', mime: '', size: 0, error: null, loading: true })
  const [blob, setBlob] = useState<Blob | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))
    loadSubmissionFile(app.ctx, submissionId)
      .then((loaded) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(loaded.blob)
        setBlob(loaded.blob)
        setState({
          url: objectUrl,
          filename: loaded.file.original_filename,
          mime: loaded.file.detected_mime,
          size: loaded.file.byte_size,
          error: null,
          loading: false,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          url: null,
          filename: '',
          mime: '',
          size: 0,
          error: errorMessage(error),
          loading: false,
        })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [app.ctx, submissionId, attempt])

  if (state.loading) return <LoadingState label="Loading the document preview" rows={2} />
  if (state.error) {
    return (
      <ErrorState
        title="The document could not be opened"
        message={state.error}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    )
  }
  if (!state.url) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="font-medium break-all">{state.filename}</span>
          <span className="text-muted-foreground">
            {state.mime} · {formatBytes(state.size)}
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => blob && downloadBlob(state.filename, blob)}
        >
          <Download aria-hidden="true" />
          Download
        </Button>
      </div>
      {state.mime === 'application/pdf' ? (
        <iframe
          src={state.url}
          title={`Document preview: ${state.filename}`}
          className={`w-full rounded-md border bg-white ${height}`}
        />
      ) : (
        <img
          src={state.url}
          alt={`Document preview: ${state.filename}`}
          className={`w-full rounded-md border bg-white object-contain ${height}`}
        />
      )}
    </div>
  )
}
