import { api } from '@/api/client'
import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { newId } from '@/domain/ids'
import type { UUID } from '@/domain/types'

/** Manual reminder: recipients and items are shown before anything is queued. */
export function RemindVendorDialog({
  vendorId,
  trigger,
  onSent,
}: {
  vendorId: UUID
  trigger: React.ReactNode
  /** Called after a reminder is successfully queued (including deduplicated). */
  onSent?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [requestKey, setRequestKey] = useState(() => newId())
  const action = useAction()
  const preview = useServiceQuery(
    () => (open ? api.previewReminder(vendorId) : Promise.resolve(null)),
    [open, vendorId],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setRequestKey(newId())
          action.reset()
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preview the reminder</DialogTitle>
          <DialogDescription>
            Items that are only awaiting review are excluded. One manual reminder per vendor per 24
            hours, and it uses the same daily slot as the scheduled job.
          </DialogDescription>
        </DialogHeader>

        {preview.loading ? <LoadingState label="Building the reminder preview" rows={3} /> : null}
        {preview.error ? <ErrorState message={preview.error} onRetry={preview.reload} /> : null}

        {preview.data ? (
          <div className="space-y-3 text-sm">
            <dl className="space-y-1">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Recipient</dt>
                <dd className="font-medium break-all">
                  {preview.data.recipient_label} &lt;{preview.data.recipient}&gt;
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Subject</dt>
                <dd>{preview.data.subject}</dd>
              </div>
            </dl>

            {preview.data.lines.length > 0 ? (
              <div>
                <p className="font-medium">Items in this reminder</p>
                <ul className="mt-1 space-y-1">
                  {preview.data.lines.map((line) => (
                    <li key={`${line.requirement_id}-${line.milestone_key}`} className="text-sm">
                      <span className="font-medium">{line.requirement_title}</span> — {line.detail}
                      <span className="block text-xs text-muted-foreground">
                        milestone {line.milestone_key}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.data.internalLines.length > 0 ? (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="font-medium">
                  Internal notice to {preview.data.internalRecipient}
                </p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {preview.data.internalLines.map((line) => (
                    <li key={`${line.requirement_id}-internal`}>
                      {line.requirement_title} — {line.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.data.blockedReason ? (
              <InlineNotice tone="warn">{preview.data.blockedReason}</InlineNotice>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            disabled={action.pending || !preview.data?.canSend}
            onClick={async () => {
              const result = await action.run(() => api.sendReminder(vendorId, requestKey), {
                success: (value) => value.message,
              })
              if (result) {
                setOpen(false)
                onSent?.()
              }
            }}
          >
            <BellRing aria-hidden="true" />
            Send reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
