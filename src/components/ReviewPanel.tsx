/**
 * Document-review rail: vendor, document type, dates, stored metadata, requirement, comments,
 * and Accept / Request Update. Decision rules stay in the review service (sections 3–5).
 */
import { Link } from 'react-router'
import { ArrowRight, Check, LoaderCircle, MessageSquareWarning } from 'lucide-react'
import { AccessDeniedState, InlineNotice } from '@/components/States'
import { RequiredChip, SubmissionStateChip } from '@/components/StatusChips'
import { KeyValueList, Section, SectionHeader } from '@/components/Section'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TextLink } from '@/components/ui/text-link'
import { formatDate } from '@/domain/dates'
import type { FieldErrors } from '@/domain/errors'
import type { ReviewDecision } from '@/domain/types'
import { formatBytes } from '@/domain/validation'
import type { ReviewDetail } from '@/services/reviewService'

const DECISION_LABEL: Record<ReviewDecision, string> = {
  accepted: 'Accepted',
  changes_requested: 'Update requested',
  revoked: 'Revoked',
}

export function ReviewPanel({
  detail,
  timezone,
  canDecide,
  reason,
  onReasonChange,
  onDecide,
  actionPending,
  actionError,
  fieldErrors,
}: {
  detail: ReviewDetail
  timezone: string
  canDecide: boolean
  reason: string
  onReasonChange: (value: string) => void
  onDecide: (decision: 'accepted' | 'changes_requested') => void
  actionPending: boolean
  actionError: string | null
  fieldErrors: FieldErrors
}) {
  const { submission, requirement, vendor, file, effective, history, reviewEvents } = detail
  const decided = submission.state !== 'pending_review'
  const storedMetadata = [
    file
      ? { label: 'File name', value: file.original_filename, key: 'filename' }
      : null,
    file
      ? { label: 'File type', value: file.detected_mime, key: 'mime' }
      : null,
    file
      ? { label: 'File size', value: formatBytes(file.byte_size), key: 'size' }
      : null,
    submission.submitted_by_label
      ? {
          label: 'Submitted by',
          value: submission.submitted_on_behalf
            ? `${submission.submitted_by_label} (on behalf of the vendor)`
            : submission.submitted_by_label,
          key: 'submitter',
        }
      : null,
  ].filter((item): item is { label: string; value: string; key: string } => item !== null)

  return (
    <div className="space-y-4">
      <Section aria-labelledby="review-decision">
        <SectionHeader id="review-decision" title="Decision" border />
        <div className="space-y-3 p-4">
          {!canDecide ? (
            <AccessDeniedState message="Coordinators can view this submission. Only a reviewer or admin can accept it or request an update." />
          ) : decided ? (
            <InlineNotice tone="neutral" title="Already decided">
              This submission is {submission.state.replaceAll('_', ' ')}. Decisions are append-only,
              so they cannot be replaced — ask the vendor for a new version instead.
            </InlineNotice>
          ) : (
            <>
              {detail.blockedAcceptReason ? (
                <InlineNotice tone="warn" title="Accepting is blocked">
                  {detail.blockedAcceptReason}
                </InlineNotice>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="review-reason">
                  Reviewer comments{' '}
                  <span className="font-normal text-muted-foreground">
                    (required to request an update)
                  </span>
                </Label>
                <Textarea
                  id="review-reason"
                  rows={4}
                  value={reason}
                  placeholder="Explain exactly what the vendor must change, for example: page 2 is missing the signature date."
                  aria-invalid={Boolean(fieldErrors.reason)}
                  aria-describedby={fieldErrors.reason ? 'review-reason-error' : undefined}
                  onChange={(event) => onReasonChange(event.target.value)}
                />
                {fieldErrors.reason ? (
                  <p id="review-reason-error" className="text-sm text-destructive">
                    {fieldErrors.reason}
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
                  disabled={actionPending || !detail.canAccept}
                  onClick={() => onDecide('accepted')}
                >
                  {actionPending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  Accept
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={actionPending}
                  onClick={() => onDecide('changes_requested')}
                >
                  <MessageSquareWarning aria-hidden="true" />
                  Request Update
                </Button>
              </div>
              {actionError ? (
                <InlineNotice tone="danger" role="alert">
                  {actionError}
                </InlineNotice>
              ) : null}
            </>
          )}
          {detail.nextPendingSubmissionId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {decided || !canDecide
                  ? 'Another submission is waiting.'
                  : 'After a decision you move straight to the next pending submission.'}
              </p>
              <Button asChild variant="ghost" size="sm">
                <Link to={`/review/${detail.nextPendingSubmissionId}`}>
                  Skip to next
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </Section>

      <Section className="space-y-4 p-4">
        <div className="space-y-1">
          <h2 className="type-title">Review details</h2>
          <p className="type-meta">
            Dates and file facts come from the stored submission. Reviewers cannot edit them;
            request an update instead.
          </p>
        </div>
        <KeyValueList
          columns={1}
          items={[
            {
              label: 'Vendor',
              value: (
                <span>
                  <TextLink to={`/vendors/${vendor.id}`}>{vendor.company_name}</TextLink>
                  <span className="block text-sm text-muted-foreground">
                    {vendor.category} · {vendor.contact_name}
                  </span>
                </span>
              ),
            },
            {
              label: 'Document type',
              value: (
                <span>
                  <span className="font-medium">{requirement.title}</span>
                  <span className="ml-2 inline-flex align-middle">
                    <RequiredChip required={requirement.required} />
                  </span>
                </span>
              ),
            },
            { label: 'Issue date', value: formatDate(submission.issue_date) },
            { label: 'Expiration date', value: formatDate(submission.expiration_date) },
            {
              label: 'Current state',
              value: <SubmissionStateChip state={submission.state} size="sm" />,
            },
          ]}
        />
      </Section>

      <Section className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="type-title">Extracted metadata</h2>
          <p className="type-meta">
            Values already stored with this file. Docket Tree does not invent extra fields.
          </p>
        </div>
        {storedMetadata.length > 0 ? (
          <KeyValueList columns={1} items={storedMetadata} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No extracted metadata is stored for this file yet.
          </p>
        )}
      </Section>

      <Section className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="type-title">Associated requirement</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{requirement.instructions}</p>
        </div>
        <KeyValueList
          columns={2}
          items={[
            {
              label: 'Expiration policy',
              value: requirement.expiration_required ? 'Expiration required' : 'No expiration',
            },
            {
              label: 'Issue date collected',
              value: requirement.collect_issue_date ? 'Yes' : 'No',
            },
            {
              label: 'Requested by',
              value: formatDate(requirement.due_date),
            },
          ]}
        />
      </Section>

      {effective && effective.id !== submission.id ? (
        <Section className="space-y-2 p-4">
          <h2 className="type-title">Currently effective version</h2>
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

      {detail.lastCorrectionReason ? (
        <InlineNotice tone="danger" title="Previous update request">
          {detail.lastCorrectionReason}
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
                  timezone={timezone}
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
                  <span className="font-medium">{DECISION_LABEL[event.decision]}</span> by{' '}
                  {event.actor_label} ·{' '}
                  <Timestamp
                    value={event.created_at}
                    timezone={timezone}
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
  )
}
