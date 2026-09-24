import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/domain/errors'
import type { UUID } from '@/domain/types'
import { formatBytes } from '@/domain/validation'
import { downloadBlob } from '@/lib/download'
import { ErrorState, LoadingState } from './States'

/**
 * Renders a stored document. Bytes are fetched from the authorized file route, so the server
 * checks on every request that this caller may see this vendor's document.
 */
export function DocumentPreview({
  submissionId,
  height = 'h-[420px]',
}: {
  submissionId: UUID
  height?: string
}) {
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

    fetch(api.documentUrl(submissionId), { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: { message?: string }
          }
          throw new Error(payload.error?.message ?? 'That document could not be opened.')
        }
        const disposition = response.headers.get('Content-Disposition') ?? ''
        const match = /filename="([^"]+)"/.exec(disposition)
        const loaded = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(loaded)
        setBlob(loaded)
        setState({
          url: objectUrl,
          filename: match?.[1] ?? 'document',
          mime: response.headers.get('Content-Type') ?? loaded.type,
          size: loaded.size,
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
  }, [submissionId, attempt])

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
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium break-all">{state.filename}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {state.mime} · {formatBytes(state.size)}
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={() => blob && downloadBlob(state.filename, blob)}>
          <Download aria-hidden="true" />
          Download
        </Button>
      </div>
      {state.mime.startsWith('application/pdf') ? (
        <iframe
          src={state.url}
          title={`Document preview: ${state.filename}`}
          className={`w-full rounded-lg border bg-white ${height}`}
        />
      ) : (
        <img
          src={state.url}
          alt={`Document preview: ${state.filename}`}
          className={`w-full rounded-lg border bg-white object-contain ${height}`}
        />
      )}
    </div>
  )
}
