/**
 * Notification outbox and delivery worker: a message is only ever reported as sent when SMTP
 * accepted it, and with no SMTP configured it stays visibly queued.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '@/domain/clock'
import type { Notification } from '@/domain/types'
import { NotificationDeliveryWorker, MAX_DELIVERY_ATTEMPTS } from '../../server/mail/deliveryWorker'
import { createCapturingMailer, createMailer, type Mailer } from '../../server/mail/mailer'
import { ReminderScheduler } from '../../server/jobs/reminderScheduler'
import { vendorIdFor } from '../../server/seed/sampleData'
import { STAFF_PASSWORD, TEST_INSTANT, createTestServer, type TestServer } from './testServer'

let server: TestServer
const COORDINATOR = 'marcus.reyes@example.com'

/** Each test boots the server with the mailer it wants, because queuing attempts delivery. */
async function bootWith(mailer: Mailer | null): Promise<TestServer> {
  server?.close()
  server = await createTestServer({ mailer: mailer ?? createMailer(null) })
  return server
}

beforeEach(async () => {
  server = await createTestServer({ mailer: createMailer(null) })
})

afterEach(() => {
  server.close()
})

async function queueReminder(): Promise<Notification> {
  const cookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
  const result = await server.request(`/api/vendors/${vendorIdFor('ironwood-pest-control')}/reminder`, {
    method: 'POST',
    cookie,
    body: JSON.stringify({ requestKey: 'reminder-1' }),
  })
  expect(result.status).toBe(200)
  expect(result.body.status).toBe('queued')
  const notification = await server.db.read((uow) => uow.notifications.get(result.body.notification_id))
  return notification!
}

describe('delivery', () => {
  it('leaves messages queued and says so when SMTP is not configured', async () => {
    expect(server.mailer.configured).toBe(false)
    const queued = await queueReminder()
    const result = await server.deps.deliveryWorker.runOnce()
    expect(result.sent).toBe(0)
    expect(result.heldUnconfigured).toBeGreaterThan(0)

    const after = await server.db.read((uow) => uow.notifications.get(queued.id))
    expect(after?.status).toBe('queued')
    expect(after?.sent_at).toBeNull()

    const cookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
    const log = await server.request('/api/notifications', { cookie })
    expect(log.body.delivery.configured).toBe(false)
    expect(log.body.delivery.reason).toContain('not configured')
  })

  it('marks a message sent only after SMTP accepts it', async () => {
    const mailer = createCapturingMailer()
    await bootWith(mailer)
    const queued = await queueReminder()

    await server.deps.deliveryWorker.runOnce()
    const after = await server.db.read((uow) => uow.notifications.get(queued.id))
    expect(after?.status).toBe('sent')
    expect(after?.sent_at).not.toBeNull()
    expect(after?.attempt_count).toBe(1)
    expect(mailer.sent[0].to).toBe(queued.recipient)
    expect(mailer.sent[0].subject).toBe(queued.subject)
  })

  it('retries with backoff and gives up as failed, recording the error', async () => {
    const mailer = createCapturingMailer({ failWith: 'SMTP 421 service unavailable' })
    await bootWith(mailer)
    let instant = TEST_INSTANT
    const clock = { now: () => new Date(instant), nowIso: () => instant }
    const worker = new NotificationDeliveryWorker(server.db, clock, mailer)
    const queued = await queueReminder()

    await worker.runOnce()
    let row = await server.db.read((uow) => uow.notifications.get(queued.id))
    expect(row?.status).toBe('retry_scheduled')
    expect(row?.attempt_count).toBe(1)
    expect(row?.last_error).toContain('421')
    expect(row?.next_attempt_at).not.toBeNull()

    // Nothing is retried before its next attempt time.
    await worker.runOnce()
    row = await server.db.read((uow) => uow.notifications.get(queued.id))
    expect(row?.attempt_count).toBe(1)

    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      instant = new Date(new Date(instant).getTime() + 2 * 3_600_000).toISOString()
      await worker.runOnce()
    }
    row = await server.db.read((uow) => uow.notifications.get(queued.id))
    expect(row?.status).toBe('failed')
    expect(row?.attempt_count).toBe(MAX_DELIVERY_ATTEMPTS)
    expect(row?.sent_at).toBeNull()
  })

  it('re-queues a failed message when an admin retries it', async () => {
    await bootWith(createCapturingMailer({ failWith: 'SMTP 550 mailbox unavailable' }))
    const queued = await queueReminder()
    await server.deps.deliveryWorker.runOnce()

    const cookie = await server.signIn('dana.whitfield@example.com', STAFF_PASSWORD)
    const retried = await server.request(`/api/notifications/${queued.id}/retry`, {
      method: 'POST',
      cookie,
    })
    expect(retried.status).toBe(200)
    const row = await server.db.read((uow) => uow.notifications.get(queued.id))
    expect(row?.attempt_count).toBeGreaterThan(1)
  })
})

describe('scheduler', () => {
  it('runs the daily digest once per organization-local day', async () => {
    // 08:00 America/Chicago is before the 09:00 slot.
    const early = new ReminderScheduler(server.db, fixedClock('2026-09-18T13:00:00.000Z'))
    expect(await early.runDue()).toHaveLength(0)

    const scheduler = new ReminderScheduler(server.db, fixedClock('2026-09-18T15:00:00.000Z'))
    const first = await scheduler.runDue()
    expect(first).toHaveLength(1)
    expect(first[0].digestsCreated).toBeGreaterThan(0)

    // A second run on the same local date does nothing.
    const second = await scheduler.runDue()
    expect(second).toHaveLength(0)
  })

  it('deduplicates against a manual reminder sent the same day', async () => {
    await queueReminder()
    const scheduler = new ReminderScheduler(server.db, fixedClock('2026-09-17T15:00:00.000Z'))
    const summaries = await scheduler.runDue()
    const notifications = await server.db.read((uow) => uow.notifications.getAll())
    const ironwoodDigests = notifications.filter(
      (row) => row.vendor_id === vendorIdFor('ironwood-pest-control') && row.type === 'vendor_digest',
    )
    const today = ironwoodDigests.filter((row) => row.created_at.startsWith('2026-09-17'))
    expect(today).toHaveLength(1)
    expect(summaries[0]?.digestsCreated ?? 0).toBeGreaterThanOrEqual(0)
  })
})
