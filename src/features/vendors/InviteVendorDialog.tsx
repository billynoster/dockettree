import { useState } from 'react'
import { Link } from 'react-router'
import { Send } from 'lucide-react'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, LoadingState } from '@/components/States'
import { SimulatedChip } from '@/components/StatusChips'
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
import { inviteVendor, previewInvitation } from '@/services/invitationService'

/** Invitation preview then send. The prototype only writes a simulated outbox entry. */
export function InviteVendorDialog({
  vendorId,
  trigger,
}: {
  vendorId: UUID
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [requestKey, setRequestKey] = useState(() => newId())
  const action = useAction()
  const preview = useServiceQuery(
    (ctx) => (open ? previewInvitation(ctx, vendorId) : Promise.resolve(null)),
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
          <DialogTitle>Preview the invitation</DialogTitle>
          <DialogDescription>
            Review the recipient before sending. This prototype never sends email; it records a
            simulated outbox entry and a working demo portal link.
          </DialogDescription>
        </DialogHeader>

        {preview.loading ? <LoadingState label="Building the invitation preview" rows={3} /> : null}
        {preview.error ? <ErrorState message={preview.error} onRetry={preview.reload} /> : null}

        {preview.data ? (
          <div className="space-y-3 text-sm">
            <SimulatedChip label="Simulated email" />
            <dl className="space-y-1">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">To</dt>
                <dd className="font-medium break-all">
                  {preview.data.recipient_label} &lt;{preview.data.recipient}&gt;
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">Subject</dt>
                <dd>{preview.data.subject}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">Expires</dt>
                <dd>{preview.data.expires_at.slice(0, 10)} (7 days)</dd>
              </div>
            </dl>
            <pre className="max-h-52 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {preview.data.body}
            </pre>
            {preview.data.revokesPreviousInvitation ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Sending again revokes the previous unaccepted invitation link.
              </p>
            ) : null}
            {preview.data.requiredItemTitles.length === 0 ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                This vendor has no required items yet. Assign a checklist so the invitation explains
                what to send.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Demo portal link:{' '}
              <Link to={preview.data.portalPath} className="text-primary underline">
                {preview.data.portalPath}
              </Link>
            </p>
          </div>
        ) : null}

        {action.error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {action.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={action.pending || !preview.data}
            onClick={async () => {
              if (!preview.data) return
              const result = await action.run(
                (ctx) =>
                  inviteVendor(ctx, {
                    vendorId,
                    expectedContactEmail: preview.data!.recipient,
                    requestKey,
                  }),
                {
                  success: (value) =>
                    value.replayed
                      ? 'That invitation was already sent. No duplicate was created.'
                      : `Simulated invitation queued for ${preview.data?.recipient}. No email was sent.`,
                },
              )
              if (result) setOpen(false)
            }}
          >
            <Send aria-hidden="true" />
            Send simulated invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
