import { api } from '@/api/client'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { DocumentPreview } from '@/components/DocumentPreview'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ReviewPanel } from '@/components/ReviewPanel'
import { Section } from '@/components/Section'
import { ErrorState, LoadingState } from '@/components/States'
import { RequiredChip, SubmissionStateChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { TextLink } from '@/components/ui/text-link'

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

  const { submission, requirement, vendor } = detail.data
  const canDecide = app.can('submission.review')

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
    <Page>
      <PageHeader
        back={{ label: 'Reviews', to: '/review' }}
        title={requirement.title}
        description={
          <>
            <TextLink to={`/vendors/${vendor.id}`}>{vendor.company_name}</TextLink>
            {' · '}version {submission.version_number} · submitted{' '}
            <Timestamp value={submission.submitted_at} timezone={app.organization.timezone} /> by{' '}
            {submission.submitted_by_label}
            {submission.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
          </>
        }
        meta={
          <>
            <SubmissionStateChip state={submission.state} />
            <RequiredChip required={requirement.required} size="default" />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.9fr)] lg:items-start">
        {/*
         * The document stays pinned while the ReviewPanel scrolls. A reviewer who has to
         * scroll away from the file to reach Accept / Request Update can accept the wrong one.
         */}
        <Section className="p-4 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
          <h2 className="type-title mb-3">Document</h2>
          <DocumentPreview
            submissionId={submission.id}
            height="h-[18rem] sm:h-[24rem] lg:h-[min(70dvh,44rem)]"
          />
        </Section>

        <ReviewPanel
          detail={detail.data}
          timezone={app.organization.timezone}
          canDecide={canDecide}
          reason={reason}
          onReasonChange={setReason}
          onDecide={(decision) => void decide(decision)}
          actionPending={action.pending}
          actionError={action.error}
          fieldErrors={action.fieldErrors}
        />
      </div>
    </Page>
  )
}
