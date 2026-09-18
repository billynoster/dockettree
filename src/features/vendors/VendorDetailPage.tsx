import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Archive, ArchiveRestore, BellRing, ExternalLink, Save, Send } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { ReasonDialog } from '@/components/ReasonDialog'
import { RequirementCard } from '@/components/RequirementCard'
import { AccessDeniedState, ErrorState, LoadingState } from '@/components/States'
import {
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
import { PROPERTIES } from '@/demo/fixtures'
import { formatDate, formatDateTime } from '@/domain/dates'
import { can } from '@/domain/permissions'
import { READINESS_EXPLANATION } from '@/domain/readiness'
import { listTemplates } from '@/services/templateService'
import {
  archiveVendor,
  assignTemplate,
  getVendorDetail,
  previewAssignTemplate,
  restoreVendor,
  updateVendor,
} from '@/services/vendorService'
import { InviteVendorDialog } from './InviteVendorDialog'
import { RemindVendorDialog } from './RemindVendorDialog'
import { VendorFormFields, type VendorFormValues } from './VendorFormFields'

export function VendorDetailPage() {
  const app = useApp()
  const { vendorId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'requirements'
  const detail = useServiceQuery((ctx) => getVendorDetail(ctx, vendorId), [vendorId])
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
  const canManage = can(app.role, 'vendor.manage')
  const canArchive = can(app.role, 'vendor.archive')
  const activeRequirements = snapshot.requirementStatuses.filter(
    (status) => status.requirement.retired_at === null,
  )
  const retiredRequirements = snapshot.requirementStatuses.filter(
    (status) => status.requirement.retired_at !== null,
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={vendor.company_name}
        description={
          <>
            {vendor.category}
            {vendor.property_tags.length > 0 ? ` · ${vendor.property_tags.join(', ')}` : ''} ·{' '}
            {vendor.contact_name} ({vendor.contact_email})
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={`/portal/${vendor.id}`}>
                <ExternalLink aria-hidden="true" />
                Open demo portal
              </Link>
            </Button>
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
                      (ctx) => archiveVendor(ctx, vendor.id, reason),
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
                    void lifecycleAction.run((ctx) => restoreVendor(ctx, vendor.id), {
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

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ReadinessChip status={readiness.status} />
          {readiness.expiringSoon ? (
            <ExpiringSoonChip nextExpiration={readiness.nextExpiration} />
          ) : null}
          <InvitationChip status={invitation.status} />
          <span className="text-sm text-muted-foreground">
            {readiness.requiredSatisfied} of {readiness.requiredTotal} required items satisfied
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{READINESS_EXPLANATION[readiness.status]}</p>

        {vendor.lifecycle === 'archived' ? (
          <p className="rounded-md border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
            Archived {formatDateTime(vendor.archived_at, app.organization.timezone)}.{' '}
            {vendor.archive_reason}
          </p>
        ) : null}

        {readiness.blockers.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold">
              Blockers ({readiness.blockers.length})
            </h2>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
              {readiness.blockers.map((blocker) => (
                <li key={blocker.requirement_id}>{blocker.label}</li>
              ))}
            </ul>
          </div>
        ) : readiness.status === 'ready' ? (
          <p className="text-sm text-emerald-800">
            No blockers. Every required document is accepted and current.
          </p>
        ) : null}

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Next required expiration</dt>
            <dd>{formatDate(readiness.nextExpiration)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Invitation sent</dt>
            <dd>{formatDateTime(vendor.invited_at, app.organization.timezone)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Last simulated reminder</dt>
            <dd>{formatDateTime(lastReminderAt, app.organization.timezone)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Record updated</dt>
            <dd>{formatDateTime(vendor.updated_at, app.organization.timezone)}</dd>
          </div>
        </dl>
      </section>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams)
          next.set('tab', value)
          setSearchParams(next, { replace: true })
        }}
      >
        <TabsList>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
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
                <details className="rounded-lg border bg-background p-4">
                  <summary className="cursor-pointer text-sm font-medium">
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
          <ul className="divide-y rounded-lg border bg-background">
            {activity.map((event) => (
              <li key={event.id} className="px-4 py-3">
                <p className="text-sm">{event.summary}</p>
                {event.reason ? (
                  <p className="mt-1 text-sm text-muted-foreground">Reason: {event.reason}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.actor_label} · {event.actor_role} ·{' '}
                  {formatDateTime(event.created_at, app.organization.timezone)}
                </p>
              </li>
            ))}
          </ul>
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
  const templates = useServiceQuery((ctx) => listTemplates(ctx), [])
  const impact = useServiceQuery(
    (ctx) => (templateId ? previewAssignTemplate(ctx, vendorId, templateId) : Promise.resolve(null)),
    [vendorId, templateId],
  )
  const action = useAction()

  if (!canManage) {
    return (
      <AccessDeniedState message="Only an admin or coordinator can assign a checklist to this vendor." />
    )
  }

  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <h2 className="text-sm font-semibold">
        {compact ? 'Add another checklist' : 'Assign a document checklist'}
      </h2>
      <p className="text-sm text-muted-foreground">
        Assigning copies the template's current items onto this vendor. Later template edits never
        change this vendor's requirements.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`assign-template-${compact ? 'more' : 'first'}`}>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger id={`assign-template-${compact ? 'more' : 'first'}`}>
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
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Readiness impact preview</p>
          <p className="text-muted-foreground">
            Required items {impact.data.requiredBefore} → {impact.data.requiredAfter}. Status{' '}
            {impact.data.currentStatus.replace('_', ' ')} → {impact.data.projectedStatus.replace('_', ' ')}.
          </p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {impact.data.addedTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
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
              (ctx) => assignTemplate(ctx, vendorId, templateId, reason),
              { success: 'Checklist assigned. Readiness recalculated.' },
            )
            if (result !== undefined) setTemplateId('')
            return result !== undefined
          }}
        />
      ) : null}
    </section>
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

  useEffect(() => {
    setValues(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)])

  if (!canManage) {
    return (
      <div className="space-y-3 rounded-lg border bg-background p-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Company</dt>
            <dd>{initial.company_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{initial.category}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Contact</dt>
            <dd>
              {initial.contact_name} ({initial.contact_email})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Properties</dt>
            <dd>{initial.property_tags.join(', ') || '—'}</dd>
          </div>
        </dl>
        <AccessDeniedState message="Your demo role can view vendor details but not edit them." />
      </div>
    )
  }

  return (
    <form
      className="space-y-4 rounded-lg border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void action.run(
          (ctx) =>
            updateVendor(ctx, vendorId, {
              ...values,
              expectedVersion: recordVersion,
              confirmDuplicate,
            }),
          { success: 'Vendor details saved.' },
        )
      }}
    >
      <h2 className="text-sm font-semibold">Vendor details</h2>
      <VendorFormFields
        values={values}
        onChange={setValues}
        fieldErrors={action.fieldErrors}
        properties={PROPERTIES}
        idPrefix="edit-vendor"
      />
      {action.conflict ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">{action.conflict}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmDuplicate(true)
              void action.run(
                (ctx) =>
                  updateVendor(ctx, vendorId, {
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
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={action.pending}>
          <Save aria-hidden="true" />
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={() => setValues(initial)}>
          Reset form
        </Button>
      </div>
    </form>
  )
}
