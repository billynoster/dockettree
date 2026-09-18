/**
 * Daily reminder scheduler (requirements section 5.5): runs the digest job once per
 * organization-local day at 09:00. Deduplication keys in the reminder service make a second
 * run on the same local date a no-op, so a restart cannot double-send.
 */
import type { Clock } from '@/domain/clock'
import { localTimeInTimeZone, todayInTimeZone } from '@/domain/dates'
import type { Organization, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { ServiceContext } from '@/services/context'
import { runDailyReminderJob } from '@/services/reminderService'

export const SCHEDULED_HOUR = '09:00'

export interface SchedulerRunSummary {
  organizationId: UUID
  localDate: string
  digestsCreated: number
  internalNoticesCreated: number
}

function systemContext(db: Database, clock: Clock, organization: Organization): ServiceContext {
  return {
    db,
    clock,
    organizationId: organization.id,
    timezone: organization.timezone,
    session: {
      role: 'admin',
      userId: 'system',
      userLabel: 'Scheduled reminder job',
      vendorId: null,
      system: true,
    },
  }
}

export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null
  private lastRunByOrganization = new Map<UUID, string>()
  private running = false

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** Runs the job for every organization whose local clock has reached 09:00 today. */
  async runDue(): Promise<SchedulerRunSummary[]> {
    const organizations = await this.db.read((uow) => uow.organizations.getAll())
    const summaries: SchedulerRunSummary[] = []
    for (const organization of organizations) {
      const localDate = todayInTimeZone(this.clock.now(), organization.timezone)
      if (this.lastRunByOrganization.get(organization.id) === localDate) continue
      if (localTimeInTimeZone(this.clock.now(), organization.timezone) < SCHEDULED_HOUR) continue
      const result = await runDailyReminderJob(systemContext(this.db, this.clock, organization))
      this.lastRunByOrganization.set(organization.id, localDate)
      summaries.push({
        organizationId: organization.id,
        localDate,
        digestsCreated: result.digestsCreated,
        internalNoticesCreated: result.internalNoticesCreated,
      })
    }
    return summaries
  }

  start(intervalMs = 60_000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.running) return
      this.running = true
      void this.runDue()
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
