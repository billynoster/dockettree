import { api } from '@/api/client'
import { useState } from 'react'
import { ChevronDown, Eye, RotateCcw, ShieldOff, Upload } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { DocumentPreview } from '@/components/DocumentPreview'
import { ReasonDialog } from '@/components/ReasonDialog'
import { SubmitDocumentDialog } from '@/components/SubmitDocumentDialog'
import { InlineNotice } from '@/components/States'
import {
  Chip,
  CurrentDocumentChip,
  SubmissionStateChip,
  type ChipTone,
} from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { describeRelativeDays, formatDate } from '@/domain/dates'
import type { RequirementStatus } from '@/domain/readiness'
import type { Vendor } from '@/domain/types'
import { cn } from '@/lib/utils'

const ACCENT_CLASS: Record<ChipTone, string> = {
  ok: 'bg-tone-ok',
  info: 'bg-tone-info',
  warn: 'bg-tone-warn',
  danger: 'bg-tone-danger',
  neutral: 'bg-tone-neutral',
  brand: 'bg-primary',
}

/**
 * One assigned requirement. Current document and latest submission are always shown as two
 * separate facts so a combined label can never hide an expiring current document.
 *
 * The coloured edge is an echo of the current-document chip, never a substitute for it: a card is
 * still fully readable in greyscale.
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const requirement = status.requirement
  const retired = requirement.retired_at !== null

  const canUpload =
    !retired &&
    vendor.lifecycle === 'active' &&
    status.pending === null &&
    (app.role === 'vendor_contact'
      ? app.activeVendorId === vendor.id
      : app.can('document.upload_on_behalf'))
  const canWithdraw =
    status.pending !== null &&
    vendor.lifecycle === 'active' &&
    (app.role === 'vendor_contact'
      ? app.activeVendorId === vendor.id
      : app.can('document.upload_on_behalf'))
  const canRevoke =
    context === 'internal' &&
    status.effective !== null &&
    status.effective.state === 'accepted' &&
    app.can('submission.revoke_acceptance')

  const history = [...status.submissions].sort((a, b) => b.version_number - a.version_number)

  const accent: ChipTone = retired
    ? 'neutral'
    : status.currentDocument === 'accepted'
      ? 'ok'
      : status.currentDocument === 'expiring_soon'
        ? 'warn'
        : status.currentDocument === 'expired'
          ? 'danger'
          : status.pending
            ? 'info'
            : requirement.required
              ? 'danger'
              : 'neutral'

  return (
    <li className="surface relative overflow-hidden pl-1">
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 w-1', ACCENT_CLASS[accent])}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[0.9375rem] font-semibold">{requirement.title}</h3>
              <Chip tone={requirement.required ? 'brand' : 'neutral'} size="sm">
                {requirement.required ? 'Required' : 'Optional'}
              </Chip>
              {retired ? (
                <Chip tone="neutral" size="sm">
                  Retired — excluded from readiness
                </Chip>
              ) : null}
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {requirement.instructions}
            </p>
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
                    () => api.withdrawSubmission(status.pending!.id, status.pending!.record_version),
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

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <dt className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Current document
            </dt>
            <dd className="space-y-2">
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
                <div className="flex flex-wrap gap-2 pt-0.5">
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
                          satisfying this requirement immediately. There is no automatic fallback to
                          an older accepted version, so the vendor may become Not ready.
                        </>
                      }
                      label="Reason for revoking (recorded in history and shown to the vendor)"
                      confirmLabel="Revoke acceptance"
                      destructive
                      pending={action.pending}
                      error={action.fieldErrors.reason ?? null}
                      onConfirm={async (reason) => {
                        const result = await action.run(
                          () => api.revokeAcceptance(status.effective!.id, reason),
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

          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <dt className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Latest submission
            </dt>
            <dd className="space-y-2">
              {status.latest ? (
                <>
                  <SubmissionStateChip state={status.latest.state} />
                  <p className="text-sm">
                    Version {status.latest.version_number} · submitted by{' '}
                    {status.latest.submitted_by_label}
                    {status.latest.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
                  </p>
                  <Timestamp
                    value={status.latest.submitted_at}
                    timezone={app.organization.timezone}
                    className="block text-xs text-muted-foreground"
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No document submitted yet.</p>
              )}
              {correctionReason ? (
                <InlineNotice tone="danger" title="Reviewer asked for changes" className="mt-1">
                  {correctionReason}
                </InlineNotice>
              ) : null}
            </dd>
          </div>
        </dl>

        {history.length > 0 ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={historyOpen}
              className="-ml-2.5 text-muted-foreground"
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn('transition-transform', historyOpen && 'rotate-180')}
              />
              Version history ({history.length})
            </Button>
            {historyOpen ? (
              <ul className="mt-2 divide-y rounded-lg border">
                {history.map((submission) => (
                  <li
                    key={submission.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">v{submission.version_number}</span>
                      <SubmissionStateChip state={submission.state} size="sm" />
                      <span className="text-xs text-muted-foreground">
                        <Timestamp
                          value={submission.submitted_at}
                          timezone={app.organization.timezone}
                        />
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
                          <Eye aria-hidden="true" />
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
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
