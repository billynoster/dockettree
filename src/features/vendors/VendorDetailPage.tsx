import { api } from '@/api/client'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  Archive,
  ArchiveRestore,
  BellRing,
  Building2,
  CalendarClock,
  Eye,
  FileCheck2,
  FileText,
  Plus,
  Save,
  Send,
} from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { DocumentPreview } from '@/components/DocumentPreview'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ReadinessSummary } from '@/components/ReadinessSummary'
import { ReasonDialog } from '@/components/ReasonDialog'
import { RequirementCard } from '@/components/RequirementCard'
import { KeyValueList, Section, SectionHeader } from '@/components/Section'
import { Timestamp } from '@/components/Timestamp'
import {
  AccessDeniedState,
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingState,
} from '@/components/States'
import {
  Chip,
  CurrentDocumentChip,
  ExpiringSoonChip,
  InvitationChip,
  ReadinessChip,
  SubmissionStateChip,
} from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { describeRelativeDays, formatDate, formatDateTime } from '@/domain/dates'
import { INVITATION_LABEL } from '@/domain/invitations'
import type { RequirementStatus } from '@/domain/readiness'
import type { ActivityEvent, Invitation, Submission, Vendor } from '@/domain/types'
import { InviteVendorDialog } from './InviteVendorDialog'
import { RemindVendorDialog } from './RemindVendorDialog'
import { VendorFormFields, type VendorFormValues } from './VendorFormFields'

const DETAIL_TABS = [
  'overview',
  'requirements',
  'documents',
  'requests',
  'activity',
  'properties',
] as const

type DetailTab = (typeof DETAIL_TABS)[number]

function resolveTab(raw: string | null): DetailTab {
  if (raw === 'details') return 'overview'
  if (raw && (DETAIL_TABS as readonly string[]).includes(raw)) return raw as DetailTab
  return 'overview'
}

export function VendorDetailPage() {
  const app = useApp()
  const { vendorId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = resolveTab(searchParams.get('tab'))
  const detail = useServiceQuery(() => api.vendorDetail(vendorId), [vendorId])
  const lifecycleAction = useAction()

  if (detail.loading && !detail.data) return <LoadingState label="Loading the vendor" rows={5} />
  if (detail.error) {
    return (
      <ErrorState
        title={detail.errorCode === 'not_found' ? 'Vendor not found' : 'Something went wrong'}
        message={detail.error}
        onRetry={detail.reload}
      />
    )
  }
  if (!detail.data) return null

  const { snapshot, invitation, invitations, correctionReasons, activity, lastReminderAt } =
    detail.data
  const vendor = snapshot.vendor
  const readiness = snapshot.readiness
  const canManage = app.can('vendor.manage')
  const canInvite = app.can('invitation.send')
  const canRemind = app.can('reminder.send')
  const canArchive = app.can('vendor.archive')
  const activeRequirements = snapshot.requirementStatuses.filter(
    (status) => status.requirement.retired_at === null,
  )
  const retiredRequirements = snapshot.requirementStatuses.filter(
    (status) => status.requirement.retired_at !== null,
  )
  const documentRows = collectDocumentRows(activeRequirements)
  const upcomingExpirations = activeRequirements
    .filter(
      (status) =>
        status.currentExpiration &&
        (status.currentDocument === 'expiring_soon' || status.currentDocument === 'expired'),
    )
    .sort((a, b) => (a.currentExpiration ?? '').localeCompare(b.currentExpiration ?? ''))
  const requestEvents = activity.filter(
    (event) =>
      event.event_type === 'invitation_sent' ||
      event.event_type === 'invitation_revoked' ||
      event.event_type === 'invitation_accepted' ||
      event.event_type === 'reminder_sent',
  )
  const recentActivity = activity.slice(0, 6)
  const missingRequirements = activeRequirements.filter(
    (status) => status.requirement.required && !status.satisfied,
  )

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', value)
    setSearchParams(next, { replace: true })
  }

  return (
    <Page density="workspace" className="space-y-5 lg:space-y-6">
      <PageHeader
        back={{ label: 'All vendors', to: '/vendors' }}
        title={vendor.company_name}
        description={
          <>
            {vendor.category}
            {vendor.property_tags.length > 0
              ? ` · ${vendor.property_tags.length} propert${vendor.property_tags.length === 1 ? 'y' : 'ies'}`
              : ''}
            {' · '}
            {vendor.contact_name} ({vendor.contact_email})
          </>
        }
        meta={
          <>
            <ReadinessChip status={readiness.status} />
            {readiness.expiringSoon ? (
              <ExpiringSoonChip nextExpiration={readiness.nextExpiration} />
            ) : null}
            <InvitationChip status={invitation.status} />
            {vendor.lifecycle === 'archived' ? <Chip tone="neutral">Archived</Chip> : null}
            {vendor.property_tags.slice(0, 3).map((tag) => (
              <Chip key={tag} tone="neutral" size="sm">
                {tag}
              </Chip>
            ))}
            {vendor.property_tags.length > 3 ? (
              <Chip tone="neutral" size="sm">
                +{vendor.property_tags.length - 3}
              </Chip>
            ) : null}
          </>
        }
        actions={
          <>
            {canRemind && vendor.lifecycle === 'active' ? (
              <RemindVendorDialog
                vendorId={vendor.id}
                trigger={
                  <Button
                    size="sm"
                    variant={
                      readiness.status === 'ready' && !readiness.expiringSoon
                        ? 'outline'
                        : 'default'
                    }
                  >
                    <BellRing aria-hidden="true" />
                    Request documents
                  </Button>
                }
              />
            ) : null}
            {canInvite && vendor.lifecycle === 'active' ? (
              <InviteVendorDialog
                vendorId={vendor.id}
                trigger={
                  <Button variant="outline" size="sm">
                    <Send aria-hidden="true" />
                    {invitation.status === 'not_invited' ? 'Send invitation' : 'Resend invitation'}
                  </Button>
                }
              />
            ) : null}
            {canArchive ? (
              vendor.lifecycle === 'active' ? (
                <ReasonDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Archive aria-hidden="true" />
                      Archive
                    </Button>
                  }
                  title={`Archive ${vendor.company_name}?`}
                  description="Archiving removes this vendor from active dashboard counts, the review queue and all reminders, and disables portal uploads. Documents and history are kept and the vendor can be restored."
                  label="Reason for archiving (recorded in history)"
                  confirmLabel="Archive vendor"
                  pending={lifecycleAction.pending}
                  error={lifecycleAction.fieldErrors.reason ?? null}
                  onConfirm={async (reason) => {
                    const result = await lifecycleAction.run(
                      () => api.archiveVendor(vendor.id, reason),
                      { success: `${vendor.company_name} archived.` },
                    )
                    return result !== undefined
                  }}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={lifecycleAction.pending}
                  onClick={() =>
                    void lifecycleAction.run(() => api.restoreVendor(vendor.id), {
                      success: `${vendor.company_name} restored. Readiness has been recalculated.`,
                    })
                  }
                >
                  <ArchiveRestore aria-hidden="true" />
                  Restore vendor
                </Button>
              )
            ) : null}
          </>
        }
      />

      {vendor.lifecycle === 'archived' ? (
        <InlineNotice tone="neutral" title="This vendor is archived">
          Archived {formatDateTime(vendor.archived_at, app.organization.timezone)}. {vendor.archive_reason}{' '}
          Documents and history are kept, and portal uploads are disabled until the vendor is restored.
        </InlineNotice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList variant="line" className="mb-1 min-w-max border-b pb-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requirements">
              Requirements
              <span className="text-muted-foreground tabular-nums">{activeRequirements.length}</span>
            </TabsTrigger>
            <TabsTrigger value="documents">
              Documents
              <span className="text-muted-foreground tabular-nums">{documentRows.length}</span>
            </TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              <span className="text-muted-foreground tabular-nums">
                {invitations.length + requestEvents.filter((e) => e.event_type === 'reminder_sent').length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="activity">
              Activity
              <span className="text-muted-foreground tabular-nums">{activity.length}</span>
            </TabsTrigger>
            <TabsTrigger value="properties">
              Properties
              <span className="text-muted-foreground tabular-nums">{vendor.property_tags.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <ReadinessSummary
            readiness={readiness}
            reviewHref={
              readiness.status === 'awaiting_review' ? `/review?vendor=${vendor.id}` : undefined
            }
            action={
              readiness.status === 'unconfigured' && canManage ? (
                <Button size="sm" variant="outline" onClick={() => setTab('requirements')}>
                  <Plus aria-hidden="true" />
                  Assign checklist
                </Button>
              ) : canRemind &&
                vendor.lifecycle === 'active' &&
                (readiness.status === 'not_ready' || readiness.expiringSoon) ? (
                <RemindVendorDialog
                  vendorId={vendor.id}
                  trigger={
                    <Button size="sm" variant="outline">
                      <BellRing aria-hidden="true" />
                      Request documents
                    </Button>
                  }
                />
              ) : null
            }
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <Section aria-labelledby="missing-reqs">
              <SectionHeader
                id="missing-reqs"
                title="Needs attention"
                description={
                  missingRequirements.length === 0
                    ? undefined
                    : 'Required items that still block readiness'
                }
                action={
                  missingRequirements.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => setTab('requirements')}>
                      View all
                    </Button>
                  ) : null
                }
                border={missingRequirements.length > 0}
              />
              {missingRequirements.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {readiness.status === 'ready'
                    ? 'No missing requirements. This vendor is ready to work.'
                    : readiness.status === 'unconfigured'
                      ? 'Assign a checklist to start tracking what’s needed.'
                      : 'Nothing is marked missing right now.'}
                </p>
              ) : (
                <ul className="divide-y">
                  {missingRequirements.slice(0, 6).map((status) => (
                    <li key={status.requirement.id} className="flex items-start gap-3 px-4 py-3">
                      <FileText
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{status.requirement.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {status.blocker?.label ?? 'Still needed'}
                        </p>
                      </div>
                      {status.pending ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <SubmissionStateChip state={status.pending.state} size="sm" />
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/review/${status.pending.id}`}>
                              <FileCheck2 aria-hidden="true" />
                              {app.can('submission.review') ? 'Review' : 'Open review'}
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <CurrentDocumentChip status={status.currentDocument} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section aria-labelledby="upcoming-exp">
              <SectionHeader
                id="upcoming-exp"
                title="Upcoming expirations"
                description="Accepted documents approaching or past their dates"
                border={upcomingExpirations.length > 0}
              />
              {upcomingExpirations.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No expirations in the current window.
                </p>
              ) : (
                <ul className="divide-y">
                  {upcomingExpirations.map((status) => (
                    <li key={status.requirement.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border tone-warn">
                        <CalendarClock aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{status.requirement.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {status.currentExpiration
                            ? `Expires ${formatDate(status.currentExpiration)}`
                            : 'Expires soon'}
                          {status.daysUntilExpiration !== null
                            ? ` · ${describeRelativeDays(status.daysUntilExpiration)}`
                            : ''}
                        </p>
                      </div>
                      <CurrentDocumentChip status={status.currentDocument} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Section aria-labelledby="recent-activity">
              <SectionHeader
                id="recent-activity"
                title="Recent activity"
                description="Newest first"
                action={
                  activity.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => setTab('activity')}>
                      View all
                    </Button>
                  ) : null
                }
                border={recentActivity.length > 0}
              />
              {recentActivity.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No activity for this vendor yet.
                </p>
              ) : (
                <ol className="divide-y">
                  {recentActivity.map((event) => (
                    <li key={event.id} className="px-4 py-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <p className="min-w-0 text-sm">{event.summary}</p>
                        <Timestamp
                          value={event.created_at}
                          timezone={app.organization.timezone}
                          className="shrink-0 text-xs text-muted-foreground"
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actor_label} · {event.actor_role}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section aria-labelledby="vendor-info" className="p-4">
              <h2 id="vendor-info" className="type-title mb-3">
                Vendor info
              </h2>
              <KeyValueList
                columns={1}
                items={[
                  { label: 'Trade / category', value: vendor.category },
                  {
                    label: 'Owner / contact',
                    value: (
                      <span>
                        {vendor.contact_name}
                        <span className="block text-muted-foreground">{vendor.contact_email}</span>
                      </span>
                    ),
                  },
                  {
                    label: 'Properties',
                    value:
                      vendor.property_tags.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {vendor.property_tags.map((tag) => (
                            <Chip key={tag} tone="neutral" size="sm">
                              {tag}
                            </Chip>
                          ))}
                        </span>
                      ) : (
                        '—'
                      ),
                  },
                  {
                    label: 'Invitation',
                    value: INVITATION_LABEL[invitation.status],
                  },
                  {
                    label: 'Last reminder',
                    value: (
                      <Timestamp value={lastReminderAt} timezone={app.organization.timezone} />
                    ),
                  },
                  {
                    label: 'Record updated',
                    value: (
                      <Timestamp value={vendor.updated_at} timezone={app.organization.timezone} />
                    ),
                  },
                ]}
              />
              {canManage ? (
                <div className="mt-4 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2.5"
                    onClick={() => setTab('properties')}
                  >
                    Edit details & properties
                  </Button>
                </div>
              ) : null}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
          {activeRequirements.length === 0 ? (
            <AssignChecklistPanel vendorId={vendor.id} canManage={canManage} />
          ) : (
            <>
              <ul className="space-y-3">
                {activeRequirements.map((status) => (
                  <RequirementCard
                    key={status.requirement.id}
                    status={status}
                    vendor={vendor}
                    correctionReason={correctionReasons[status.requirement.id]}
                    context="internal"
                  />
                ))}
              </ul>
              {retiredRequirements.length > 0 ? (
                <details className="surface p-4">
                  <summary className="cursor-pointer rounded text-sm font-medium">
                    Retired requirements ({retiredRequirements.length})
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {retiredRequirements.map((status) => (
                      <RequirementCard
                        key={status.requirement.id}
                        status={status}
                        vendor={vendor}
                        correctionReason={correctionReasons[status.requirement.id]}
                        context="internal"
                      />
                    ))}
                  </ul>
                </details>
              ) : null}
              {canManage ? <AssignChecklistPanel vendorId={vendor.id} canManage compact /> : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {documentRows.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Submissions for this vendor will appear here once a document is uploaded for review or accepted."
            />
          ) : (
            <Section>
              <SectionHeader
                title="Documents on file"
                description="Current and latest submissions. Pending files open in the review split-screen."
                border
              />
              <ul className="divide-y">
                {documentRows.map((row) => (
                  <li
                    key={`${row.submission.id}-${row.role}`}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{row.requirementTitle}</p>
                        {row.role === 'current' ? (
                          <CurrentDocumentChip status={row.currentDocument} />
                        ) : (
                          <SubmissionStateChip state={row.submission.state} size="sm" />
                        )}
                        <Chip tone="neutral" size="sm">
                          {row.role === 'current' ? 'Current' : row.role === 'pending' ? 'Pending' : 'Latest'}
                        </Chip>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Version {row.submission.version_number}
                        {row.submission.expiration_date
                          ? ` · expires ${formatDate(row.submission.expiration_date)}`
                          : ''}
                        {' · '}
                        {row.submission.submitted_by_label}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {row.role === 'pending' ? (
                        <Button asChild size="sm">
                          <Link to={`/review/${row.submission.id}`}>
                            <FileCheck2 aria-hidden="true" />
                            {app.can('submission.review') ? 'Review' : 'Open review'}
                          </Link>
                        </Button>
                      ) : null}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <Eye aria-hidden="true" />
                            Preview
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>
                              {row.requirementTitle} · version {row.submission.version_number}
                            </DialogTitle>
                          </DialogHeader>
                          <DocumentPreview submissionId={row.submission.id} />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <RequestsPanel
            invitations={invitations}
            invitationStatus={invitation.status}
            requestEvents={requestEvents}
            lastReminderAt={lastReminderAt}
            timezone={app.organization.timezone}
            canInvite={canInvite}
            canRemind={canRemind}
            vendor={vendor}
          />
        </TabsContent>

        <TabsContent value="activity">
          {activity.length === 0 ? (
            <EmptyState
              title="No activity for this vendor yet"
              description="Adding requirements, sending an invitation and every submission or decision will appear here."
            />
          ) : (
            <Section>
              <ol className="divide-y">
                {activity.map((event) => (
                  <li key={event.id} className="px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <p className="min-w-0 text-sm">{event.summary}</p>
                      <Timestamp
                        value={event.created_at}
                        timezone={app.organization.timezone}
                        className="shrink-0 text-xs text-muted-foreground"
                      />
                    </div>
                    {event.reason ? (
                      <p className="mt-1 border-l-2 pl-2.5 text-sm text-muted-foreground">
                        {event.reason}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actor_label} · {event.actor_role}
                    </p>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <Section aria-labelledby="properties-list">
            <SectionHeader
              id="properties-list"
              title="Properties"
              description="Tags used to filter this vendor in the directory. A full Properties workspace is not part of this view."
              border={vendor.property_tags.length > 0}
            />
            {vendor.property_tags.length === 0 ? (
              <div className="space-y-2 px-4 py-8 text-center">
                <Building2
                  aria-hidden="true"
                  className="mx-auto size-8 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <p className="text-sm font-medium">No properties tagged yet</p>
                <p className="mx-auto max-w-prose text-sm text-muted-foreground">
                  Property tags help you find vendors by site. Add them below when you’re ready —
                  there’s no separate property product here.
                </p>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2 px-4 py-4">
                {vendor.property_tags.map((tag) => (
                  <li key={tag}>
                    <Chip tone="brand" size="default">
                      {tag}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <VendorDetailsForm
            vendorId={vendor.id}
            values={{
              company_name: vendor.company_name,
              category: vendor.category,
              contact_name: vendor.contact_name,
              contact_email: vendor.contact_email,
              property_tags: vendor.property_tags,
            }}
            recordVersion={vendor.record_version}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

function collectDocumentRows(statuses: RequirementStatus[]): {
  requirementTitle: string
  submission: Submission
  role: 'current' | 'pending' | 'latest'
  currentDocument: RequirementStatus['currentDocument']
}[] {
  const rows: {
    requirementTitle: string
    submission: Submission
    role: 'current' | 'pending' | 'latest'
    currentDocument: RequirementStatus['currentDocument']
  }[] = []
  const seen = new Set<string>()

  for (const status of statuses) {
    if (status.effective) {
      const key = `${status.effective.id}-current`
      if (!seen.has(key)) {
        seen.add(key)
        rows.push({
          requirementTitle: status.requirement.title,
          submission: status.effective,
          role: 'current',
          currentDocument: status.currentDocument,
        })
      }
    }
    if (status.pending && status.pending.id !== status.effective?.id) {
      const key = `${status.pending.id}-pending`
      if (!seen.has(key)) {
        seen.add(key)
        rows.push({
          requirementTitle: status.requirement.title,
          submission: status.pending,
          role: 'pending',
          currentDocument: status.currentDocument,
        })
      }
    } else if (
      status.latest &&
      status.latest.id !== status.effective?.id &&
      status.latest.id !== status.pending?.id
    ) {
      const key = `${status.latest.id}-latest`
      if (!seen.has(key)) {
        seen.add(key)
        rows.push({
          requirementTitle: status.requirement.title,
          submission: status.latest,
          role: 'latest',
          currentDocument: status.currentDocument,
        })
      }
    }
  }

  return rows
}

function RequestsPanel({
  invitations,
  invitationStatus,
  requestEvents,
  lastReminderAt,
  timezone,
  canInvite,
  canRemind,
  vendor,
}: {
  invitations: Invitation[]
  invitationStatus: ReturnType<typeof import('@/domain/invitations').invitationStatus>['status']
  requestEvents: ActivityEvent[]
  lastReminderAt: string | null
  timezone: string
  canInvite: boolean
  canRemind: boolean
  vendor: Vendor
}) {
  const sortedInvites = useMemo(
    () => [...invitations].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [invitations],
  )
  const reminders = requestEvents.filter((event) => event.event_type === 'reminder_sent')
  const empty = sortedInvites.length === 0 && reminders.length === 0

  if (empty) {
    return (
      <EmptyState
        title="No invitations or reminders yet"
        description="When you invite this vendor or request documents, those sends show up here. There’s no separate messaging inbox on this screen."
        action={
          vendor.lifecycle === 'active' && (canInvite || canRemind) ? (
            <div className="flex flex-wrap justify-center gap-2">
              {canInvite ? (
                <InviteVendorDialog
                  vendorId={vendor.id}
                  trigger={
                    <Button size="sm">
                      <Send aria-hidden="true" />
                      Send invitation
                    </Button>
                  }
                />
              ) : null}
              {canRemind ? (
                <RemindVendorDialog
                  vendorId={vendor.id}
                  trigger={
                    <Button size="sm" variant="outline">
                      <BellRing aria-hidden="true" />
                      Request documents
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <Section aria-labelledby="invitations-heading">
        <SectionHeader
          id="invitations-heading"
          title="Invitations"
          description={`Current status · ${INVITATION_LABEL[invitationStatus]}`}
          border={sortedInvites.length > 0}
        />
        {sortedInvites.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No invitation has been sent yet.
          </p>
        ) : (
          <ul className="divide-y">
            {sortedInvites.map((invite) => {
              const state = invite.revoked_at
                ? 'revoked'
                : invite.redeemed_at
                  ? 'accepted'
                  : 'sent'
              return (
                <li key={invite.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{invite.invited_email}</p>
                    <p className="text-sm text-muted-foreground">
                      Sent{' '}
                      <Timestamp value={invite.created_at} timezone={timezone} />
                      {' · '}
                      {invite.redeemed_at
                        ? 'Accepted'
                        : invite.revoked_at
                          ? 'Revoked'
                          : `Expires ${formatDateTime(invite.expires_at, timezone)}`}
                    </p>
                  </div>
                  <Chip
                    tone={state === 'accepted' ? 'ok' : state === 'revoked' ? 'neutral' : 'waiting'}
                    size="sm"
                  >
                    {state === 'accepted'
                      ? 'Accepted'
                      : state === 'revoked'
                        ? 'Revoked'
                        : 'Waiting on vendor'}
                  </Chip>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section aria-labelledby="reminders-heading">
        <SectionHeader
          id="reminders-heading"
          title="Document requests"
          description={
            lastReminderAt
              ? undefined
              : 'Reminders ask the vendor for missing or expiring documents'
          }
          border={reminders.length > 0}
        />
        {reminders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No document requests have been sent yet.
          </p>
        ) : (
          <ul className="divide-y">
            {reminders.map((event) => (
              <li key={event.id} className="px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="min-w-0 text-sm">{event.summary}</p>
                  <Timestamp
                    value={event.created_at}
                    timezone={timezone}
                    className="shrink-0 text-xs text-muted-foreground"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.actor_label} · {event.actor_role}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function AssignChecklistPanel({
  vendorId,
  canManage,
  compact = false,
}: {
  vendorId: string
  canManage: boolean
  compact?: boolean
}) {
  const [templateId, setTemplateId] = useState('')
  const templates = useServiceQuery(() => api.listTemplates(), [])
  const impact = useServiceQuery(
    () => (templateId ? api.previewChecklist(vendorId, templateId) : Promise.resolve(null)),
    [vendorId, templateId],
  )
  const action = useAction()

  if (!canManage) {
    return (
      <AccessDeniedState message="Only an admin or coordinator can assign a checklist to this vendor." />
    )
  }

  return (
    <Section className="space-y-3 p-4">
      <div className="space-y-1">
        <h2 className="type-title">
          {compact ? 'Add another checklist' : 'Assign a document checklist'}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Assigning copies the template&apos;s current items onto this vendor as a snapshot. Later
          edits to the template never change this vendor&apos;s requirements.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor={`assign-template-${compact ? 'more' : 'first'}`}>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger id={`assign-template-${compact ? 'more' : 'first'}`} className="w-full">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {(templates.data ?? [])
                .filter((entry) => !entry.template.archived_at)
                .map((entry) => (
                  <SelectItem key={entry.template.id} value={entry.template.id}>
                    {entry.template.name} · {entry.requiredCount} required
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {impact.data ? (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Readiness impact preview</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground">
            <span>
              Required items{' '}
              <span className="font-medium text-foreground tabular-nums">
                {impact.data.requiredBefore}
              </span>
              {' → '}
              <span className="font-medium text-foreground tabular-nums">
                {impact.data.requiredAfter}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              Status <ReadinessChip status={impact.data.currentStatus} size="sm" />
              {' → '}
              <ReadinessChip status={impact.data.projectedStatus} size="sm" />
            </span>
          </div>
          {impact.data.addedTitles.length > 0 ? (
            <ul className="space-y-0.5 text-muted-foreground">
              {impact.data.addedTitles.map((title) => (
                <li key={title} className="flex gap-1.5">
                  <Plus aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {templateId ? (
        <ReasonDialog
          trigger={<Button size="sm">Assign checklist</Button>}
          title="Assign these requirements?"
          description="A reason is recorded in the vendor's history so the checklist change is explainable."
          label="Reason for the checklist change"
          confirmLabel="Assign requirements"
          pending={action.pending}
          error={action.fieldErrors.reason ?? null}
          onConfirm={async (reason) => {
            const result = await action.run(
              () => api.assignChecklist(vendorId, templateId, reason),
              { success: 'Checklist assigned. Readiness recalculated.' },
            )
            if (result !== undefined) setTemplateId('')
            return result !== undefined
          }}
        />
      ) : null}
    </Section>
  )
}

function VendorDetailsForm({
  vendorId,
  values: initial,
  recordVersion,
  canManage,
}: {
  vendorId: string
  values: VendorFormValues
  recordVersion: number
  canManage: boolean
}) {
  const [values, setValues] = useState<VendorFormValues>(initial)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const action = useAction()
  const directory = useServiceQuery(() => api.listVendors({ lifecycle: 'all', pageSize: 1 }), [])
  const knownProperties = directory.data?.properties ?? []

  useEffect(() => {
    setValues(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)])

  if (!canManage) {
    return (
      <Section className="space-y-4 p-4">
        <KeyValueList
          items={[
            { label: 'Company', value: initial.company_name },
            { label: 'Category', value: initial.category },
            {
              label: 'Contact',
              value: `${initial.contact_name} (${initial.contact_email})`,
            },
            { label: 'Properties', value: initial.property_tags.join(', ') || '—' },
          ]}
        />
        <InlineNotice tone="neutral" title="Read-only">
          Your role can view vendor details but not edit them. Ask an admin or coordinator to make
          changes.
        </InlineNotice>
      </Section>
    )
  }

  return (
    <form
      noValidate
      className="surface space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void action.run(
          () =>
            api.updateVendor(vendorId, {
              ...values,
              expectedVersion: recordVersion,
              confirmDuplicate,
            }),
          { success: 'Vendor details saved.' },
        )
      }}
    >
      <h2 className="type-title">Edit vendor details</h2>
      <VendorFormFields
        values={values}
        onChange={setValues}
        fieldErrors={action.fieldErrors}
        properties={knownProperties}
        idPrefix="edit-vendor"
      />
      {action.conflict ? (
        <InlineNotice tone="warn" title="This looks like a duplicate">
          <p>{action.conflict}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setConfirmDuplicate(true)
              void action.run(
                () =>
                  api.updateVendor(vendorId, {
                    ...values,
                    expectedVersion: recordVersion,
                    confirmDuplicate: true,
                  }),
                { success: 'Vendor details saved.' },
              )
            }}
          >
            Save anyway
          </Button>
        </InlineNotice>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="submit" disabled={action.pending}>
          <Save aria-hidden="true" />
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={() => setValues(initial)}>
          Discard changes
        </Button>
      </div>
    </form>
  )
}
