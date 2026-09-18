/**
 * Notification delivery worker.
 *
 * Rows are queued by the services inside their own transaction; this worker is the only
 * thing that attempts delivery. Attempts are bounded and backed off, and every outcome is
 * recorded on the row so the outbox never overstates what happened.
 */
import type { Clock } from '@/domain/clock'
import type { Notification } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { Mailer } from './mailer'

export const MAX_DELIVERY_ATTEMPTS = 5
const BACKOFF_MINUTES = [1, 5, 15, 60]

export interface DeliveryRunResult {
  attempted: number
  sent: number
  failed: number
  /** Rows left untouched because SMTP is not configured. */
  heldUnconfigured: number
}

export class NotificationDeliveryWorker {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
  ) {}

  private async due(): Promise<Notification[]> {
    const nowInstant = this.clock.nowIso()
    return await this.db.read(async (uow) => {
      const queued = [
        ...(await uow.notifications.where('by_status', 'queued')),
        ...(await uow.notifications.where('by_status', 'retry_scheduled')),
      ]
      return queued
        .filter((row) => row.next_attempt_at === null || row.next_attempt_at <= nowInstant)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }

  async runOnce(): Promise<DeliveryRunResult> {
    const pending = await this.due()
    const result: DeliveryRunResult = { attempted: 0, sent: 0, failed: 0, heldUnconfigured: 0 }
    if (!this.mailer.configured) {
      result.heldUnconfigured = pending.length
      return result
    }

    for (const notification of pending) {
      result.attempted += 1
      const attempt = notification.attempt_count + 1
      try {
        await this.mailer.send({
          to: notification.recipient,
          toName: notification.recipient_label,
          subject: notification.subject,
          body: notification.body,
        })
        await this.db.write((uow) =>
          uow.notifications.put({
            ...notification,
            status: 'sent',
            attempt_count: attempt,
            sent_at: this.clock.nowIso(),
            next_attempt_at: null,
            last_error: null,
          }),
        )
        result.sent += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const exhausted = attempt >= MAX_DELIVERY_ATTEMPTS
        const delayMinutes = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)]
        await this.db.write((uow) =>
          uow.notifications.put({
            ...notification,
            status: exhausted ? 'failed' : 'retry_scheduled',
            attempt_count: attempt,
            next_attempt_at: exhausted
              ? null
              : new Date(this.clock.now().getTime() + delayMinutes * 60_000).toISOString(),
            last_error: message.slice(0, 500),
          }),
        )
        result.failed += 1
      }
    }
    return result
  }

  start(intervalMs = 30_000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.running) return
      this.running = true
      void this.runOnce()
        .catch(() => undefined)
        .finally(() => {
          this.running = false
        })
    }, intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }
}
