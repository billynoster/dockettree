/**
 * Reminders (requirements FR-08, section 5.5).
 *
 * A reminder is persisted in the notification outbox as `queued` and delivered by the SMTP
 * worker. When SMTP is not configured the row stays queued: the app never claims delivery.
 */
import { todayInTimeZone } from '@/domain/dates'
import { conflict, notFound, rateLimited } from '@/domain/errors'
import { newId } from '@/domain/ids'
import {
  MANUAL_REMINDER_COOLDOWN_HOURS,
  digestIdempotencyKey,
  internalNoticeIdempotencyKey,
  planVendorReminder,
  type ReminderLine,
  type VendorReminderPlan,
} from '@/domain/reminders'
import type { IsoDate, Notification, Organization, UUID } from '@/domain/types'
import type { UnitOfWork } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, today, type ServiceContext } from './context'
import { loadVendorSnapshot, loadVendorSnapshots, sortByCreatedAtDesc, type VendorSnapshot } from './queries'

export interface ReminderPreview {
  vendor_id: UUID
  company_name: string
  recipient: string
  recipient_label: string
  subject: string
  body: string
  lines: ReminderLine[]
  internalLines: ReminderLine[]
  internalRecipient: string
  canSend: boolean
  /** Why sending is unavailable: archived, nothing actionable, or cooldown. */
  blockedReason: string | null
  cooldownUntil: string | null
}

function buildDigestBody(
  organizationName: string,
  contactName: string,
  lines: ReminderLine[],
  supportLine: string,
): string {
  return [
    `Hello ${contactName},`,
    '',
    `${organizationName} is waiting on the following documents:`,
    ...lines.map((line) => `- ${line.requirement_title}: ${line.detail}`),
    '',
    'Sign in to your vendor portal to upload each document.',
    supportLine,
  ].join('\n')
}

function digestSubject(lines: ReminderLine[]): string {
  const missing = lines.filter((line) => line.kind === 'missing_item').length
  const renewals = lines.filter((line) => line.kind === 'renewal').length
  if (missing > 0 && renewals > 0) {
    return `Reminder: ${missing} document${missing === 1 ? '' : 's'} needed, ${renewals} expiring`
  }
  if (renewals > 0) return `Reminder: ${renewals} document${renewals === 1 ? '' : 's'} expiring soon`
  return `Reminder: ${missing} document${missing === 1 ? '' : 's'} still needed`
}

async function planFor(
  ctx: ServiceContext,
  uow: UnitOfWork,
  snapshot: VendorSnapshot,
  todayValue: IsoDate,
  scheduled: boolean,
): Promise<VendorReminderPlan> {
  void uow
  return planVendorReminder(
    {
      vendor_id: snapshot.vendor.id,
      lifecycle: snapshot.vendor.lifecycle,
      invitedDate: snapshot.vendor.invited_at
        ? todayInTimeZone(new Date(snapshot.vendor.invited_at), ctx.timezone)
        : null,
      requirements: snapshot.requirementStatuses,
    },
    todayValue,
    { scheduled },
  )
}

export async function previewReminder(ctx: ServiceContext, vendorId: UUID): Promise<ReminderPreview> {
  return await ctx.db.read(async (uow) => {
    const todayValue = today(ctx)
    const snapshot = await loadVendorSnapshot(uow, vendorId, todayValue, ctx.organizationId)
    const organization = await uow.organizations.get(ctx.organizationId)
    const plan = await planFor(ctx, uow, snapshot, todayValue, false)
    const notifications = sortByCreatedAtDesc(await uow.notifications.where('by_vendor', vendorId))
    const lastManual = notifications.find((notification) => notification.manual && notification.type === 'vendor_digest')
    const cooldownUntil = lastManual
      ? new Date(new Date(lastManual.created_at).getTime() + MANUAL_REMINDER_COOLDOWN_HOURS * 3_600_000).toISOString()
      : null
    const withinCooldown = cooldownUntil !== null && cooldownUntil > nowIso(ctx)

    let blockedReason: string | null = null
    if (plan.skipReason === 'archived') {
      blockedReason = 'Reminders are disabled for archived vendors.'
    } else if (plan.skipReason === 'no_actionable_items' || plan.vendorLines.length === 0) {
      blockedReason =
        'Nothing actionable to remind about. Requirements that are only awaiting review are excluded.'
    } else if (withinCooldown) {
      blockedReason = `A manual reminder was already sent to this vendor within the last ${MANUAL_REMINDER_COOLDOWN_HOURS} hours.`
    }

    const organizationName = organization?.name ?? 'Your customer'
    const supportLine = organization
      ? `Questions? Contact ${organization.support_contact_name} at ${organization.support_email}.`
      : ''

    return {
      vendor_id: snapshot.vendor.id,
      company_name: snapshot.vendor.company_name,
      recipient: snapshot.vendor.contact_email,
      recipient_label: snapshot.vendor.contact_name,
      subject: digestSubject(plan.vendorLines),
      body: buildDigestBody(
        organizationName,
        snapshot.vendor.contact_name,
        plan.vendorLines,
        supportLine,
      ),
      lines: plan.vendorLines,
      internalLines: plan.internalLines,
      internalRecipient: organization?.support_email ?? 'vendor.operations@example.com',
      canSend: blockedReason === null,
      blockedReason,
      cooldownUntil,
    }
  })
}

export interface SendReminderResult {
  status: 'queued' | 'no_action' | 'deduplicated'
  notification_id: UUID | null
  message: string
}

/**
 * Manual reminder. It consumes the same daily digest slot as the scheduled job, so the
 * scheduled job will not send a duplicate on the same local date.
 */
export async function sendReminder(
  ctx: ServiceContext,
  vendorId: UUID,
  requestKey?: string,
): Promise<SendReminderResult> {
  requireCapability(ctx, 'reminder.send')
  const preview = await previewReminder(ctx, vendorId)
  if (!preview.canSend) {
    if (preview.blockedReason?.startsWith('A manual reminder')) {
      throw rateLimited(preview.blockedReason)
    }
    return { status: 'no_action', notification_id: null, message: preview.blockedReason ?? 'Nothing to send.' }
  }

  return await ctx.db.write(async (uow) => {
    const todayValue = today(ctx)
    const snapshot = await loadVendorSnapshot(uow, vendorId, todayValue, ctx.organizationId)
    const organization = await uow.organizations.get(ctx.organizationId)
    if (!organization) throw notFound('The organization record is missing.')
    const key = digestIdempotencyKey(ctx.organizationId, vendorId, todayValue)
    const existing = await uow.notifications.where('by_idempotency_key', key)
    if (existing.length > 0) {
      return {
        status: 'deduplicated' as const,
        notification_id: existing[0].id,
        message: `A reminder for ${snapshot.vendor.company_name} was already queued today. Deduplication prevented a second message.`,
      }
    }
    const plan = await planFor(ctx, uow, snapshot, todayValue, false)
    const notification = await writeDigest(uow, ctx, {
      organization,
      snapshot,
      lines: plan.vendorLines,
      key,
      manual: true,
      requestKey,
    })
    return {
      status: 'queued' as const,
      notification_id: notification.id,
      message: `Reminder queued for ${snapshot.vendor.contact_email}.`,
    }
  })
}

async function writeDigest(
  uow: UnitOfWork,
  ctx: ServiceContext,
  input: {
    organization: Organization
    snapshot: VendorSnapshot
    lines: ReminderLine[]
    key: string
    manual: boolean
    requestKey?: string
  },
): Promise<Notification> {
  const timestamp = nowIso(ctx)
  const notification: Notification = {
    id: newId(),
    organization_id: ctx.organizationId,
    vendor_id: input.snapshot.vendor.id,
    type: 'vendor_digest',
    recipient: input.snapshot.vendor.contact_email,
    recipient_label: input.snapshot.vendor.contact_name,
    subject: digestSubject(input.lines),
    body: buildDigestBody(
      input.organization.name,
      input.snapshot.vendor.contact_name,
      input.lines,
      `Questions? Contact ${input.organization.support_contact_name} at ${input.organization.support_email}.`,
    ),
    items: input.lines,
    status: 'queued',
    idempotency_key: input.key,
    attempt_count: 0,
    next_attempt_at: timestamp,
    sent_at: null,
    last_error: null,
    manual: input.manual,
    created_at: timestamp,
  }
  await uow.notifications.put(notification)
  await recordActivity(uow, ctx, {
    vendor_id: input.snapshot.vendor.id,
    event_type: 'reminder_sent',
    target_id: notification.id,
    summary: input.manual
      ? `Reminder queued for ${notification.recipient} (${input.lines.length} item${input.lines.length === 1 ? '' : 's'})`
      : `Daily digest queued for ${notification.recipient} (${input.lines.length} item${input.lines.length === 1 ? '' : 's'})`,
    metadata: { items: input.lines.length, manual: input.manual },
    vendor_visible: true,
    actor: input.manual
      ? undefined
      : { id: 'system', label: 'Scheduled reminder job', role: 'system' },
  })
  return notification
}

export interface DailyJobResult {
  localDate: IsoDate
  digestsCreated: number
  internalNoticesCreated: number
  skippedDuplicates: number
  vendorsEvaluated: number
  details: { company_name: string; outcome: string }[]
}

/**
 * The daily 09:00 organization-local job. It queues at most one digest per vendor per local
 * date and at most one catch-up per missed milestone.
 */
export async function runDailyReminderJob(ctx: ServiceContext): Promise<DailyJobResult> {
  requireCapability(ctx, 'reminder.send')
  return await ctx.db.write(async (uow) => {
    const todayValue = today(ctx)
    const organization = await uow.organizations.get(ctx.organizationId)
    if (!organization) throw notFound('The organization record is missing.')
    const snapshots = await loadVendorSnapshots(uow, ctx.organizationId, todayValue)
    const result: DailyJobResult = {
      localDate: todayValue,
      digestsCreated: 0,
      internalNoticesCreated: 0,
      skippedDuplicates: 0,
      vendorsEvaluated: 0,
      details: [],
    }

    for (const snapshot of snapshots) {
      if (snapshot.vendor.lifecycle === 'archived') continue
      result.vendorsEvaluated += 1
      const plan = await planFor(ctx, uow, snapshot, todayValue, true)

      if (plan.vendorLines.length > 0) {
        const key = digestIdempotencyKey(ctx.organizationId, snapshot.vendor.id, todayValue)
        const existing = await uow.notifications.where('by_idempotency_key', key)
        if (existing.length > 0) {
          result.skippedDuplicates += 1
          result.details.push({
            company_name: snapshot.vendor.company_name,
            outcome: 'Skipped: a reminder was already queued for today.',
          })
        } else {
          await writeDigest(uow, ctx, {
            organization,
            snapshot,
            lines: plan.vendorLines,
            key,
            manual: false,
          })
          result.digestsCreated += 1
          result.details.push({
            company_name: snapshot.vendor.company_name,
            outcome: `Digest queued with ${plan.vendorLines.length} item${plan.vendorLines.length === 1 ? '' : 's'}.`,
          })
        }
      }

      if (plan.internalLines.length > 0) {
        const key = internalNoticeIdempotencyKey(ctx.organizationId, snapshot.vendor.id, todayValue)
        const existing = await uow.notifications.where('by_idempotency_key', key)
        if (existing.length === 0) {
          const timestamp = nowIso(ctx)
          await uow.notifications.put({
            id: newId(),
            organization_id: ctx.organizationId,
            vendor_id: snapshot.vendor.id,
            type: 'internal_expiration_notice',
            recipient: organization.support_email,
            recipient_label: organization.support_contact_name,
            subject: `Expired required document: ${snapshot.vendor.company_name}`,
            body: [
              `${snapshot.vendor.company_name} has an expired required document.`,
              '',
              ...plan.internalLines.map((line) => `- ${line.requirement_title}: ${line.detail}`),
            ].join('\n'),
            items: plan.internalLines,
            status: 'queued',
            idempotency_key: key,
            attempt_count: 0,
            next_attempt_at: timestamp,
            sent_at: null,
            last_error: null,
            manual: false,
            created_at: timestamp,
          })
          result.internalNoticesCreated += 1
        } else {
          result.skippedDuplicates += 1
        }
      }
    }

    return result
  })
}

export interface OutboxEntry {
  notification: Notification
  vendorName: string | null
}

export async function listOutbox(
  ctx: ServiceContext,
  filters: { vendorId?: UUID | null; type?: Notification['type'] | null } = {},
): Promise<{ entries: OutboxEntry[]; total: number; vendors: { id: UUID; company_name: string }[] }> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const notifications = sortByCreatedAtDesc(await uow.notifications.getAll()).filter(
      (notification) => notification.organization_id === ctx.organizationId,
    )
    const vendors = await uow.vendors.where('by_organization', ctx.organizationId)
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]))
    const filtered = notifications.filter((notification) => {
      if (filters.vendorId && notification.vendor_id !== filters.vendorId) return false
      if (filters.type && notification.type !== filters.type) return false
      return true
    })
    return {
      entries: filtered.map((notification) => ({
        notification,
        vendorName: notification.vendor_id ? (vendorById.get(notification.vendor_id)?.company_name ?? null) : null,
      })),
      total: notifications.length,
      vendors: vendors
        .map((vendor) => ({ id: vendor.id, company_name: vendor.company_name }))
        .sort((a, b) => a.company_name.localeCompare(b.company_name)),
    }
  })
}

/** Puts a failed message back in the delivery queue for another attempt. */
export async function retryNotification(ctx: ServiceContext, notificationId: UUID): Promise<void> {
  requireCapability(ctx, 'reminder.send')
  await ctx.db.write(async (uow) => {
    const notification = await uow.notifications.get(notificationId)
    if (!notification || notification.organization_id !== ctx.organizationId) {
      throw notFound('That outbox entry no longer exists.')
    }
    if (notification.status === 'sent') {
      throw conflict('That message was already delivered.')
    }
    await uow.notifications.put({
      ...notification,
      status: 'queued',
      next_attempt_at: nowIso(ctx),
      last_error: null,
    })
  })
}
