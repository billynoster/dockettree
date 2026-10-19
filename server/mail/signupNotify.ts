/**
 * Founder notification when a new organization is created via /signup or /setup.
 * Uses the same notification outbox + delivery worker as invites/reminders.
 * Best-effort: never throws — signup/setup must succeed even if mail is down.
 */
import { newId } from '@/domain/ids'
import type { Clock } from '@/domain/clock'
import type { Notification, Organization, User } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { NotificationDeliveryWorker } from './deliveryWorker'

export type SignupNotifySource = 'signup' | 'setup'

export interface SignupNotifyInput {
  db: Database
  clock: Clock
  deliveryWorker: NotificationDeliveryWorker
  /** From SIGNUP_NOTIFY_EMAIL. When null/empty, skip and log. */
  notifyEmail: string | null
  organization: Pick<Organization, 'id' | 'name' | 'created_at'>
  admin: Pick<User, 'display_name' | 'email'>
  source: SignupNotifySource
}

function buildBody(input: {
  organization: Pick<Organization, 'id' | 'name' | 'created_at'>
  admin: Pick<User, 'display_name' | 'email'>
  source: SignupNotifySource
}): string {
  const via = input.source === 'setup' ? 'first-run /setup' : 'self-serve /signup'
  return [
    `A new Docket Tree organization was created via ${via}.`,
    '',
    `Organization: ${input.organization.name}`,
    `Organization ID: ${input.organization.id}`,
    `Admin: ${input.admin.display_name} <${input.admin.email}>`,
    `Created: ${input.organization.created_at}`,
    '',
    'This message does not include passwords or other secrets.',
  ].join('\n')
}

/**
 * Queue a founder signup notice and kick the delivery worker.
 * Returns the notification id when queued, or null when skipped / on failure.
 */
export async function notifyOrganizationSignup(input: SignupNotifyInput): Promise<string | null> {
  const recipient = input.notifyEmail?.trim() ?? ''
  if (!recipient) {
    console.info(
      '[signup-notify] SIGNUP_NOTIFY_EMAIL is unset; skipping founder notification for org %s',
      input.organization.id,
    )
    return null
  }

  try {
    const timestamp = input.clock.nowIso()
    const notification: Notification = {
      id: newId(),
      organization_id: input.organization.id,
      vendor_id: null,
      type: 'signup_notice',
      recipient,
      recipient_label: 'Docket Tree founder',
      subject: `New Docket Tree signup: ${input.organization.name}`,
      body: buildBody({
        organization: input.organization,
        admin: input.admin,
        source: input.source,
      }),
      items: [],
      status: 'queued',
      idempotency_key: `signup-notice:${input.organization.id}`,
      attempt_count: 0,
      next_attempt_at: timestamp,
      sent_at: null,
      last_error: null,
      manual: true,
      created_at: timestamp,
    }

    await input.db.write(async (uow) => {
      await uow.notifications.put(notification)
    })

    // Same fire-and-forget kick as invites/reminders — never block signup on SMTP.
    void input.deliveryWorker.runOnce().catch((error) => {
      console.error('[signup-notify] delivery worker error after queue:', error)
    })

    console.info(
      '[signup-notify] queued founder notice for org %s → %s',
      input.organization.id,
      recipient,
    )
    return notification.id
  } catch (error) {
    console.error('[signup-notify] failed to queue founder notice (signup still succeeds):', error)
    return null
  }
}
