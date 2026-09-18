import { useState } from 'react'
import { Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, LoadingState } from '@/components/States'
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

/**
 * Invitation preview then send. The invitation carries a single-use link that creates the
 * vendor contact's account; when SMTP is not configured the link is shown once so an operator
 * can pass it on deliberately.
 */
export function InviteVendorDialog({
  vendorId,
  trigger,
}: {
  vendorId: UUID
  trigger: React.ReactNode
}) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const [requestKey, setRequestKey] = useState(() => newId())
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null)
  const action = useAction()
  const preview = useServiceQuery(
    () => (open ? api.previewInvitation(vendorId) : Promise.resolve(null)),
    [open, vendorId],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setRequestKey(newId())
          setAcceptUrl(null)
          action.reset()
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{acceptUrl ? 'Invitation created' : 'Preview the invitation'}</DialogTitle>
          <DialogDescription>
            {acceptUrl
              ? 'The link below works once and expires in 7 days. It is shown now because it is never stored in readable form.'
              : app.delivery.configured
                ? 'Review the recipient before sending. The message is queued and delivered over SMTP.'
                : 'Review the recipient before sending. Email delivery is not configured, so you will get a link to pass on yourself.'}
          </DialogDescription>
        </DialogHeader>

        {acceptUrl ? (
          <div className="space-y-3 text-sm">
            <p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{acceptUrl}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(acceptUrl)
                  .then(() => toast.success('Invitation link copied.'))
                  .catch(() => toast.error('Copy the link manually; the clipboard is unavailable.'))
              }}
            >
              <Copy aria-hidden="true" />
              Copy link
            </Button>
            <p className="text-xs text-muted-foreground">
              The vendor contact sets their own password with this link. Sending a new invitation
              revokes it.
            </p>
          </div>
        ) : (
          <>
            {preview.loading ? <LoadingState label="Building the invitation preview" rows={3} /> : null}
            {preview.error ? <ErrorState message={preview.error} onRetry={preview.reload} /> : null}

            {preview.data ? (
              <div className="space-y-3 text-sm">
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
                {preview.data.alreadyHasAccount ? (
                  <p className="rounded-md border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    This email already has an account. Accepting the invitation will add this vendor
                    to it.
                  </p>
                ) : null}
                {preview.data.requiredItemTitles.length === 0 ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    This vendor has no required items yet. Assign a checklist so the invitation
                    explains what to send.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {action.error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {action.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {acceptUrl ? 'Done' : 'Cancel'}
          </Button>
          {acceptUrl ? null : (
            <Button
              disabled={action.pending || !preview.data}
              onClick={async () => {
                if (!preview.data) return
                const recipient = preview.data.recipient
                const result = await action.run(
                  () => api.inviteVendor(vendorId, recipient, requestKey),
                  {
                    success: (value) =>
                      value.replayed
                        ? 'That invitation was already sent. No duplicate was created.'
                        : app.delivery.configured
                          ? `Invitation queued for ${recipient}.`
                          : `Invitation created for ${recipient}. Email delivery is not configured, so share the link below.`,
                  },
                )
                if (result) setAcceptUrl(result.accept_url)
              }}
            >
              <Send aria-hidden="true" />
              Send invitation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
