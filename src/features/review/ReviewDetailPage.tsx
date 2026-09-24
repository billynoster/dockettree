import { api } from '@/api/client'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowRight, Check, LoaderCircle, MessageSquareWarning } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { DocumentPreview } from '@/components/DocumentPreview'
import { PageHeader } from '@/components/PageHeader'
import { KeyValueList, Section, SectionHeader } from '@/components/Section'
import { AccessDeniedState, ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Chip, SubmissionStateChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/domain/dates'

export function ReviewDetailPage() {
  const app = useApp()
  const navigate = useNavigate()
  const { submissionId = '' } = useParams()
  const [reason, setReason] = useState('')
  const action = useAction()
  const detail = useServiceQuery(() => api.reviewDetail(submissionId), [submissionId])

  if (detail.loading && !detail.data) return <LoadingState label="Loading the submission" rows={4} />
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
  const canDecide = app.can('submission.review')
  const decided = submission.state !== 'pending_review'

  const decide = async (decision: 'accepted' | 'changes_requested') => {
    const result = await action.run(
      () =>
        api.reviewSubmission({
          submissionId: submission.id,
          expectedVersion: submission.record_version,
          decision,
          reason,
        }),
      {
        success: (value) =>
          decision === 'accepted'
            ? `Accepted ${requirement.title} v${submission.version_number}. ${vendor.company_name} is now ${value.readinessStatus.replace('_', ' ')}.`
            : `Changes requested. A correction notice for ${vendor.company_name} is in the notification log.`,
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
    <div className="animate-rise space-y-4">
      <PageHeader
        back={{ label: 'Review queue', to: '/review' }}
        title={requirement.title}
        description={
          <>
            <Link
              to={`/vendors/${vendor.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {vendor.company_name}
            </Link>{' '}
            · version {submission.version_number} · submitted{' '}
            <Timestamp value={submission.submitted_at} timezone={app.organization.timezone} /> by{' '}
            {submission.submitted_by_label}
            {submission.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
          </>
        }
        meta={
          <>
            <SubmissionStateChip state={submission.state} />
            <Chip tone={requirement.required ? 'brand' : 'neutral'}>
              {requirement.required ? 'Required' : 'Optional'}
            </Chip>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        {/*
         * The document stays pinned while the right rail scrolls: a reviewer reads the file and the
         * checklist instructions together, and losing the page while scrolling to the decision is
         * the main way a wrong decision happens.
         */}
        <Section className="p-4 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
          <h2 className="mb-3 text-[0.9375rem] font-semibold">Submitted document</h2>
          <DocumentPreview submissionId={submission.id} height="h-[32rem]" />
        </Section>

        <div className="space-y-4">
          <Section>
            <SectionHeader title="Decision" border />
            <div className="space-y-3 p-4">
              {!canDecide ? (
                <AccessDeniedState message="Only an admin or reviewer can accept a submission or request changes." />
              ) : decided ? (
                <InlineNotice tone="neutral" title="Already decided">
                  This submission is {submission.state.replace('_', ' ')}. Decisions are append-only,
                  so they cannot be replaced — ask the vendor for a new version instead.
                </InlineNotice>
              ) : (
                <>
                  {detail.data.blockedAcceptReason ? (
                    <InlineNotice tone="warn" title="Accepting is blocked">
                      {detail.data.blockedAcceptReason}
                    </InlineNotice>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="review-reason">
                      Correction reason{' '}
                      <span className="font-normal text-muted-foreground">
                        (required to request changes)
                      </span>
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
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        The vendor sees this text verbatim, so name the page and the field.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="flex-1"
                      disabled={action.pending || !detail.data.canAccept}
                      onClick={() => void decide('accepted')}
                    >
                      {action.pending ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <Check aria-hidden="true" />
                      )}
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={action.pending}
                      onClick={() => void decide('changes_requested')}
                    >
                      <MessageSquareWarning aria-hidden="true" />
                      Request changes
                    </Button>
                  </div>
                  {action.error ? (
                    <InlineNotice tone="danger" role="alert">
                      {action.error}
                    </InlineNotice>
                  ) : null}
                </>
              )}
              {detail.data.nextPendingSubmissionId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    {decided || !canDecide
                      ? 'Another submission is waiting.'
                      : 'After a decision you move straight to the next pending submission.'}
                  </p>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/review/${detail.data.nextPendingSubmissionId}`}>
                      Skip to next
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </Section>

          <Section className="space-y-3 p-4">
            <div className="space-y-1">
              <h2 className="text-[0.9375rem] font-semibold">Checklist instructions</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {requirement.instructions}
              </p>
            </div>
            <KeyValueList
              columns={2}
              items={[
                {
                  label: 'Expiration policy',
                  value: requirement.expiration_required ? 'Expiration required' : 'No expiration',
                },
                { label: 'Issue date entered', value: formatDate(submission.issue_date) },
                { label: 'Expiration entered', value: formatDate(submission.expiration_date) },
                {
                  label: 'Current state',
                  value: <SubmissionStateChip state={submission.state} size="sm" />,
                },
              ]}
            />
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Dates come from the vendor's submission. Reviewers cannot edit them; request changes
              instead.
            </p>
          </Section>

          {effective && effective.id !== submission.id ? (
            <Section className="space-y-2 p-4">
              <h2 className="text-[0.9375rem] font-semibold">Currently effective version</h2>
              <p className="text-sm">
                Version {effective.version_number}
                {effective.expiration_date
                  ? ` · expires ${formatDate(effective.expiration_date)}`
                  : ' · no expiration'}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Accepting this submission supersedes version {effective.version_number} in one
                transaction. The old file and its decisions stay in history.
              </p>
            </Section>
          ) : null}

          {detail.data.lastCorrectionReason ? (
            <InlineNotice tone="danger" title="Previous correction request">
              {detail.data.lastCorrectionReason}
            </InlineNotice>
          ) : null}

          {history.length > 0 ? (
            <Section>
              <SectionHeader title="Prior versions" level="h2" border />
              <ul className="divide-y">
                {history.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="font-medium tabular-nums">v{entry.version_number}</span>
                    <SubmissionStateChip state={entry.state} size="sm" />
                    <Timestamp
                      value={entry.submitted_at}
                      timezone={app.organization.timezone}
                      className="text-xs text-muted-foreground"
                    />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {reviewEvents.length > 0 ? (
            <Section>
              <SectionHeader title="Decisions on this version" level="h2" border />
              <ul className="divide-y">
                {reviewEvents.map((event) => (
                  <li key={event.id} className="px-4 py-2.5 text-sm">
                    <p>
                      <span className="font-medium">{event.decision.replace('_', ' ')}</span> by{' '}
                      {event.actor_label} ·{' '}
                      <Timestamp
                        value={event.created_at}
                        timezone={app.organization.timezone}
                        className="text-muted-foreground"
                      />
                    </p>
                    {event.reason ? (
                      <p className="mt-1 border-l-2 pl-2.5 text-muted-foreground">{event.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
