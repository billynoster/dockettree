import { api } from '@/api/client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import {
  Archive,
  ArchiveRestore,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Plus,
  Save,
  Send,
} from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { ReasonDialog } from '@/components/ReasonDialog'
import { RequirementCard } from '@/components/RequirementCard'
import { RequirementMeter } from '@/components/Metrics'
import { KeyValueList, Section } from '@/components/Section'
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
  ExpiringSoonChip,
  InvitationChip,
  ReadinessChip,
} from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate, formatDateTime } from '@/domain/dates'
import { READINESS_EXPLANATION } from '@/domain/readiness'
import { InviteVendorDialog } from './InviteVendorDialog'
import { RemindVendorDialog } from './RemindVendorDialog'
import { VendorFormFields, type VendorFormValues } from './VendorFormFields'

export function VendorDetailPage() {
  const app = useApp()
  const { vendorId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'requirements'
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

  const { snapshot, invitation, correctionReasons, activity, lastReminderAt } = detail.data
  const vendor = snapshot.vendor
  const readiness = snapshot.readiness
  const canManage = app.can('vendor.manage')
  const canArchive = app.can('vendor.archive')
  const activeRequirements = snapshot.requirementStatuses.filter(
    (status) => status.requirement.retired_at === null,
  )
  const retiredRequirements = snapshot.requirementStatuses.filter(
    (status) => status.requirement.retired_at !== null,
  )

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        back={{ label: 'All vendors', to: '/vendors' }}
        title={vendor.company_name}
        description={
          <>
            {vendor.category}
            {vendor.property_tags.length > 0 ? ` · ${vendor.property_tags.join(', ')}` : ''} ·{' '}
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
          </>
        }
        actions={
          <>
            {canManage && vendor.lifecycle === 'active' ? (
              <>
                <InviteVendorDialog
                  vendorId={vendor.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Send aria-hidden="true" />
                      {invitation.status === 'not_invited' ? 'Send invitation' : 'Resend invitation'}
                    </Button>
                  }
                />
                <RemindVendorDialog
                  vendorId={vendor.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      <BellRing aria-hidden="true" />
                      Remind
                    </Button>
                  }
                />
              </>
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
          Archived {formatDateTime(vendor.archived_at, app.organization.timezone)}.{' '}
          {vendor.archive_reason} Documents and history are kept, and portal uploads are disabled
          until the vendor is restored.
        </InlineNotice>
      ) : null}

      <Section className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <RequirementMeter
              satisfied={readiness.requiredSatisfied}
              total={readiness.requiredTotal}
              className="text-base"
            />
            <span className="text-sm text-muted-foreground">required items satisfied</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {READINESS_EXPLANATION[readiness.status]}
          </p>

          {readiness.blockers.length > 0 ? (
            <div className="space-y-1.5">
              <h2 className="text-[0.8125rem] font-semibold">
                What is blocking readiness ({readiness.blockers.length})
              </h2>
              <ul className="space-y-1 text-sm">
                {readiness.blockers.map((blocker) => (
                  <li key={blocker.requirement_id} className="flex gap-2">
                    <CircleAlert
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-tone-danger"
                    />
                    {blocker.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : readiness.status === 'ready' ? (
            <p className="flex items-center gap-2 text-sm font-medium text-tone-ok">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              No blockers. Every required document is accepted and current.
            </p>
          ) : null}
        </div>

        <KeyValueList
          items={[
            { label: 'Next required expiration', value: formatDate(readiness.nextExpiration) },
            {
              label: 'Invitation sent',
              value: (
                <Timestamp value={vendor.invited_at} timezone={app.organization.timezone} />
              ),
            },
            {
              label: 'Last reminder',
              value: <Timestamp value={lastReminderAt} timezone={app.organization.timezone} />,
            },
            {
              label: 'Record updated',
              value: <Timestamp value={vendor.updated_at} timezone={app.organization.timezone} />,
            },
          ]}
        />
      </Section>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams)
          next.set('tab', value)
          setSearchParams(next, { replace: true })
        }}
      >
        <TabsList variant="line" className="mb-1 border-b pb-0">
          <TabsTrigger value="requirements">
            Requirements
            <span className="text-muted-foreground tabular-nums">{activeRequirements.length}</span>
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">
            Activity
            <span className="text-muted-foreground tabular-nums">{activity.length}</span>
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="details">
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
      </Tabs>
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
        <h2 className="text-[0.9375rem] font-semibold">
          {compact ? 'Add another checklist' : 'Assign a document checklist'}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Assigning copies the template's current items onto this vendor as a snapshot. Later edits
          to the template never change this vendor's requirements.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor={`assign-template-${compact ? 'more' : 'first'}`}>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger id={`assign-template-${compact ? 'more' : 'first'}`} className="h-9 w-full">
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
  // Property tags are free text; suggest the ones already used in this organization.
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
          () => api.updateVendor(vendorId, {
              ...values,
              expectedVersion: recordVersion,
              confirmDuplicate,
            }),
          { success: 'Vendor details saved.' },
        )
      }}
    >
      <h2 className="text-[0.9375rem] font-semibold">Vendor details</h2>
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
                () => api.updateVendor(vendorId, {
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
