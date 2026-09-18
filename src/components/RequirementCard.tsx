import { useState } from 'react'
import { Eye, RotateCcw, ShieldOff, Upload } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { DocumentPreview } from '@/components/DocumentPreview'
import { ReasonDialog } from '@/components/ReasonDialog'
import { SubmitDocumentDialog } from '@/components/SubmitDocumentDialog'
import { CurrentDocumentChip, SubmissionStateChip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { describeRelativeDays, formatDate, formatDateTime } from '@/domain/dates'
import { can } from '@/domain/permissions'
import type { RequirementStatus } from '@/domain/readiness'
import type { Vendor } from '@/domain/types'
import { revokeAcceptance } from '@/services/reviewService'
import { withdrawSubmission } from '@/services/submissionService'

/**
 * One assigned requirement. Current document and latest submission are always shown as two
 * separate facts so a combined label can never hide an expiring current document.
 */
export function RequirementCard({
  status,
  vendor,
  correctionReason,
  context,
}: {
  status: RequirementStatus
  vendor: Vendor
  correctionReason?: string | null
  context: 'internal' | 'portal'
}) {
  const app = useApp()
  const action = useAction()
  const [previewSubmissionId, setPreviewSubmissionId] = useState<string | null>(null)
  const requirement = status.requirement
  const retired = requirement.retired_at !== null

  const canUpload =
    !retired &&
    vendor.lifecycle === 'active' &&
    status.pending === null &&
    (app.role === 'vendor_contact'
      ? app.session.vendorId === vendor.id
      : can(app.role, 'document.upload_on_behalf'))
  const canWithdraw =
    status.pending !== null &&
    vendor.lifecycle === 'active' &&
    (app.role === 'vendor_contact'
      ? app.session.vendorId === vendor.id
      : can(app.role, 'document.upload_on_behalf'))
  const canRevoke =
    context === 'internal' &&
    status.effective !== null &&
    status.effective.state === 'accepted' &&
    can(app.role, 'submission.revoke_acceptance')

  const history = [...status.submissions].sort((a, b) => b.version_number - a.version_number)

  return (
    <li className="rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{requirement.title}</h3>
            <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
              {requirement.required ? 'Required' : 'Optional'}
            </span>
            {retired ? (
              <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                Retired — excluded from readiness
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{requirement.instructions}</p>
          {requirement.due_date ? (
            <p className="text-xs text-muted-foreground">
              Requested by {formatDate(requirement.due_date)}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canUpload ? (
            <SubmitDocumentDialog
              requirement={requirement}
              trigger={
                <Button size="sm" variant={status.satisfied ? 'outline' : 'default'}>
                  <Upload aria-hidden="true" />
                  {status.effective ? 'Submit replacement' : 'Submit document'}
                </Button>
              }
            />
          ) : null}
          {canWithdraw && status.pending ? (
            <Button
              size="sm"
              variant="outline"
              disabled={action.pending}
              onClick={() =>
                void action.run(
                  (ctx) => withdrawSubmission(ctx, status.pending!.id, status.pending!.record_version),
                  { success: `Withdrew ${requirement.title} v${status.pending?.version_number}.` },
                )
              }
            >
              <RotateCcw aria-hidden="true" />
              Withdraw pending
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/40 p-3">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Current document
          </dt>
          <dd className="mt-1.5 space-y-1">
            <CurrentDocumentChip status={status.currentDocument} />
            {status.effective ? (
              <p className="text-sm">
                Version {status.effective.version_number}
                {status.currentExpiration ? (
                  <>
                    {' · expires '}
                    {formatDate(status.currentExpiration)}{' '}
                    <span className="text-muted-foreground">
                      ({describeRelativeDays(status.daysUntilExpiration ?? 0)})
                    </span>
                  </>
                ) : (
                  ' · no expiration date required'
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing is currently accepted for this requirement.
              </p>
            )}
            {status.effective ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewSubmissionId(status.effective!.id)}
                    >
                      <Eye aria-hidden="true" />
                      Preview
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>
                        {requirement.title} · version {status.effective.version_number}
                      </DialogTitle>
                    </DialogHeader>
                    {previewSubmissionId ? (
                      <DocumentPreview submissionId={previewSubmissionId} />
                    ) : null}
                  </DialogContent>
                </Dialog>
                {canRevoke ? (
                  <ReasonDialog
                    trigger={
                      <Button size="sm" variant="destructive">
                        <ShieldOff aria-hidden="true" />
                        Revoke acceptance
                      </Button>
                    }
                    title="Revoke this acceptance?"
                    description={
                      <>
                        {requirement.title} version {status.effective.version_number} will stop
                        satisfying this requirement immediately. There is no automatic fallback to an
                        older accepted version, so the vendor may become Not ready.
                      </>
                    }
                    label="Reason for revoking (recorded in history and shown to the vendor)"
                    confirmLabel="Revoke acceptance"
                    destructive
                    pending={action.pending}
                    error={action.fieldErrors.reason ?? null}
                    onConfirm={async (reason) => {
                      const result = await action.run(
                        (ctx) => revokeAcceptance(ctx, status.effective!.id, reason),
                        { success: `Acceptance revoked for ${requirement.title}.` },
                      )
                      return result !== undefined
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </dd>
        </div>

        <div className="rounded-md border bg-muted/40 p-3">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Latest submission
          </dt>
          <dd className="mt-1.5 space-y-1">
            {status.latest ? (
              <>
                <SubmissionStateChip state={status.latest.state} />
                <p className="text-sm">
                  Version {status.latest.version_number} · submitted by{' '}
                  {status.latest.submitted_by_label}
                  {status.latest.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(status.latest.submitted_at, app.organization.timezone)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No document submitted yet.</p>
            )}
            {correctionReason ? (
              <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
                <span className="font-medium">Reviewer asked for changes:</span> {correctionReason}
              </p>
            ) : null}
          </dd>
        </div>
      </dl>

      {history.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Version history ({history.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {history.map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">v{submission.version_number}</span>
                  <SubmissionStateChip state={submission.state} />
                  <span className="text-muted-foreground">
                    {formatDateTime(submission.submitted_at, app.organization.timezone)}
                    {submission.expiration_date
                      ? ` · expires ${formatDate(submission.expiration_date)}`
                      : ''}
                  </span>
                </span>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setPreviewSubmissionId(submission.id)}
                    >
                      Preview
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>
                        {requirement.title} · version {submission.version_number}
                      </DialogTitle>
                    </DialogHeader>
                    {previewSubmissionId ? (
                      <DocumentPreview submissionId={previewSubmissionId} />
                    ) : null}
                  </DialogContent>
                </Dialog>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  )
}
