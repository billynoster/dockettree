/** Append-only activity history (requirements FR-12). Events are never edited in the UI. */
import { newId } from '@/domain/ids'
import type { ActivityEvent, ActivityEventType, UUID } from '@/domain/types'
import type { UnitOfWork } from '@/repositories/types'
import { nowIso, type ServiceContext } from './context'
import { sortByCreatedAtDesc } from './queries'

export interface ActivityInput {
  vendor_id: UUID | null
  event_type: ActivityEventType
  target_id?: UUID | null
  summary: string
  reason?: string | null
  metadata?: Record<string, string | number | boolean | null>
  /** Whether the vendor portal may see this event. */
  vendor_visible?: boolean
  actor?: { id: UUID | 'system'; label: string; role: ActivityEvent['actor_role'] }
}

/** Create an event inside the caller's transaction so history and data commit together. */
export async function recordActivity(
  uow: UnitOfWork,
  ctx: ServiceContext,
  input: ActivityInput,
): Promise<ActivityEvent> {
  const event: ActivityEvent = {
    id: newId(),
    organization_id: ctx.organizationId,
    vendor_id: input.vendor_id,
    actor_id: input.actor?.id ?? ctx.session.userId,
    actor_label: input.actor?.label ?? ctx.session.userLabel,
    actor_role: input.actor?.role ?? ctx.session.role,
    event_type: input.event_type,
    target_id: input.target_id ?? null,
    summary: input.summary,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
    vendor_visible: input.vendor_visible ?? false,
    created_at: nowIso(ctx),
  }
  await uow.activity.put(event)
  return event
}

export interface ActivityQuery {
  vendorId?: UUID | 'all'
  eventType?: ActivityEventType | 'all'
  limit?: number
}

export async function listActivity(
  ctx: ServiceContext,
  query: ActivityQuery = {},
): Promise<{ events: ActivityEvent[]; total: number }> {
  return await ctx.db.read(async (uow) => {
    const all = await uow.activity.getAll()
    let events = all.filter((event) => event.organization_id === ctx.organizationId)
    if (ctx.session.role === 'vendor_contact') {
      events = events.filter(
        (event) => event.vendor_visible && event.vendor_id === ctx.session.vendorId,
      )
    }
    if (query.vendorId && query.vendorId !== 'all') {
      events = events.filter((event) => event.vendor_id === query.vendorId)
    }
    if (query.eventType && query.eventType !== 'all') {
      events = events.filter((event) => event.event_type === query.eventType)
    }
    const sorted = sortByCreatedAtDesc(events)
    return { events: sorted.slice(0, query.limit ?? sorted.length), total: sorted.length }
  })
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityEventType, string> = {
  vendor_created: 'Vendor added',
  vendor_updated: 'Vendor updated',
  vendor_archived: 'Vendor archived',
  vendor_restored: 'Vendor restored',
  vendor_imported: 'Vendor imported',
  checklist_assigned: 'Checklist assigned',
  requirement_added: 'Requirement added',
  requirement_retired: 'Requirement retired',
  requirement_updated: 'Requirement updated',
  invitation_sent: 'Invitation sent',
  invitation_revoked: 'Invitation revoked',
  document_submitted: 'Document submitted',
  document_submitted_on_behalf: 'Document submitted on behalf',
  document_withdrawn: 'Submission withdrawn',
  submission_accepted: 'Submission accepted',
  submission_changes_requested: 'Changes requested',
  acceptance_revoked: 'Acceptance revoked',
  reminder_sent: 'Reminder sent',
  template_created: 'Template created',
  template_updated: 'Template updated',
  template_archived: 'Template archived',
  settings_updated: 'Settings updated',
  invitation_accepted: 'Invitation accepted',
  member_added: 'Member added',
  member_updated: 'Member updated',
  member_removed: 'Member removed',
}
