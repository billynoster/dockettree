import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowRight, Check, MessageSquareWarning } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { DocumentPreview } from '@/components/DocumentPreview'
import { PageHeader } from '@/components/PageHeader'
import { AccessDeniedState, ErrorState, LoadingState } from '@/components/States'
import { SubmissionStateChip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatDateTime } from '@/domain/dates'
import { can } from '@/domain/permissions'
import { getReviewDetail, reviewSubmission } from '@/services/reviewService'

export function ReviewDetailPage() {
  const app = useApp()
  const navigate = useNavigate()
  const { submissionId = '' } = useParams()
  const [reason, setReason] = useState('')
  const action = useAction()
  const detail = useServiceQuery((ctx) => getReviewDetail(ctx, submissionId), [submissionId])

  if (detail.loading && !detail.data) return <LoadingState label="Loading the submission" rows={5} />
  if (detail.error) {
    return (
      <ErrorState
        title={detail.errorCode === 'not_found' ? 'Submission not found' : 'Something went wrong'}
        message={detail.error}
        onRetry={detail.reload}
      />
    )
  }
  if (!detail.data) return null

  const { submission, requirement, vendor, effective, history, reviewEvents } = detail.data
  const canDecide = can(app.role, 'submission.review')
  const decided = submission.state !== 'pending_review'

  const decide = async (decision: 'accepted' | 'changes_requested') => {
    const result = await action.run(
      (ctx) =>
        reviewSubmission(ctx, {
          submissionId: submission.id,
          expectedVersion: submission.record_version,
          decision,
          reason,
        }),
      {
        success: (value) =>
          decision === 'accepted'
            ? `Accepted ${requirement.title} v${submission.version_number}. ${vendor.company_name} is now ${value.readinessStatus.replace('_', ' ')}.`
            : `Changes requested. ${vendor.company_name} has been notified in the simulated outbox.`,
      },
    )
    if (result) {
      setReason('')
      if (detail.data?.nextPendingSubmissionId) {
        navigate(`/review/${detail.data.nextPendingSubmissionId}`)
      } else {
        navigate('/review')
      }
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Review: ${requirement.title}`}
        description={
          <>
            <Link
              to={`/vendors/${vendor.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {vendor.company_name}
            </Link>{' '}
            · version {submission.version_number} · submitted{' '}
            {formatDateTime(submission.submitted_at, app.organization.timezone)} by{' '}
            {submission.submitted_by_label}
            {submission.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/review">Back to queue</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">Submitted document</h2>
          <DocumentPreview submissionId={submission.id} height="h-[520px]" />
        </section>

        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border bg-background p-4">
            <h2 className="text-sm font-semibold">Checklist instructions</h2>
            <p className="text-sm text-muted-foreground">{requirement.instructions}</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Requirement</dt>
                <dd>{requirement.required ? 'Required' : 'Optional'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Expiration policy</dt>
                <dd>{requirement.expiration_required ? 'Expiration required' : 'No expiration'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Issue date entered</dt>
                <dd>{formatDate(submission.issue_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Expiration entered</dt>
                <dd>{formatDate(submission.expiration_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Current state</dt>
                <dd>
                  <SubmissionStateChip state={submission.state} />
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Dates come from the vendor's submission. Reviewers cannot edit them; request changes
              instead.
            </p>
          </section>

          {effective && effective.id !== submission.id ? (
            <section className="space-y-2 rounded-lg border bg-background p-4">
              <h2 className="text-sm font-semibold">Currently effective version</h2>
              <p className="text-sm">
                Version {effective.version_number}
                {effective.expiration_date
                  ? ` · expires ${formatDate(effective.expiration_date)}`
                  : ' · no expiration'}
              </p>
              <p className="text-xs text-muted-foreground">
                Accepting this submission supersedes version {effective.version_number} in one
                transaction. The old file and its decisions stay in history.
              </p>
            </section>
          ) : null}

          {detail.data.lastCorrectionReason ? (
            <section className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h2 className="text-sm font-semibold text-rose-900">Previous correction request</h2>
              <p className="mt-1 text-sm text-rose-900">{detail.data.lastCorrectionReason}</p>
            </section>
          ) : null}

          <section className="space-y-3 rounded-lg border bg-background p-4">
            <h2 className="text-sm font-semibold">Decision</h2>
            {!canDecide ? (
              <AccessDeniedState message="Only an admin or reviewer can accept a submission or request changes." />
            ) : decided ? (
              <p className="text-sm text-muted-foreground">
                This submission was already decided ({submission.state.replace('_', ' ')}). Decisions
                are append-only and cannot be replaced.
              </p>
            ) : (
              <>
                {detail.data.blockedAcceptReason ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    {detail.data.blockedAcceptReason}
                  </p>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="review-reason">
                    Correction reason (required to request changes)
                  </Label>
                  <Textarea
                    id="review-reason"
                    rows={4}
                    value={reason}
                    placeholder="Explain exactly what the vendor must change, for example: page 2 is missing the signature date."
                    aria-invalid={Boolean(action.fieldErrors.reason)}
                    aria-describedby={action.fieldErrors.reason ? 'review-reason-error' : undefined}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  {action.fieldErrors.reason ? (
                    <p id="review-reason-error" className="text-sm text-destructive">
                      {action.fieldErrors.reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={action.pending || !detail.data.canAccept}
                    onClick={() => void decide('accepted')}
                  >
                    <Check aria-hidden="true" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    disabled={action.pending}
                    onClick={() => void decide('changes_requested')}
                  >
                    <MessageSquareWarning aria-hidden="true" />
                    Request changes
                  </Button>
                </div>
                {action.error ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {action.error}
                  </p>
                ) : null}
                {detail.data.nextPendingSubmissionId ? (
                  <p className="text-xs text-muted-foreground">
                    After a decision you move straight to the next pending submission.
                  </p>
                ) : null}
              </>
            )}
            {detail.data.nextPendingSubmissionId ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/review/${detail.data.nextPendingSubmissionId}`}>
                  Skip to next pending
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </section>

          {history.length > 0 ? (
            <section className="rounded-lg border bg-background p-4">
              <h2 className="text-sm font-semibold">Prior versions</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {history.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">v{entry.version_number}</span>
                    <SubmissionStateChip state={entry.state} />
                    <span className="text-muted-foreground">
                      {formatDateTime(entry.submitted_at, app.organization.timezone)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {reviewEvents.length > 0 ? (
            <section className="rounded-lg border bg-background p-4">
              <h2 className="text-sm font-semibold">Decisions on this version</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {reviewEvents.map((event) => (
                  <li key={event.id}>
                    <span className="font-medium">{event.decision.replace('_', ' ')}</span> by{' '}
                    {event.actor_label} ·{' '}
                    {formatDateTime(event.created_at, app.organization.timezone)}
                    {event.reason ? (
                      <span className="block text-muted-foreground">{event.reason}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
