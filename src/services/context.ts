/** Shared service context: storage, injected clock and the (simulated) session. */
import { todayInTimeZone } from '@/domain/dates'
import { forbidden } from '@/domain/errors'
import { can, type Capability } from '@/domain/permissions'
import type { IsoDate, IsoDateTime, Role, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { Clock } from '@/demo/clock'

export interface Session {
  role: Role
  userId: UUID
  userLabel: string
  /** Vendor context for the vendor-contact role. Null for internal roles. */
  vendorId: UUID | null
}

export interface ServiceContext {
  db: Database
  clock: Clock
  session: Session
  organizationId: UUID
  timezone: string
}

/** Today in the organization timezone — the basis of every expiration comparison. */
export function today(ctx: ServiceContext): IsoDate {
  return todayInTimeZone(ctx.clock.now(), ctx.timezone)
}

export function nowIso(ctx: ServiceContext): IsoDateTime {
  return ctx.clock.nowIso()
}

export function requireCapability(ctx: ServiceContext, capability: Capability): void {
  if (!can(ctx.session.role, capability)) {
    throw forbidden(
      `The ${ctx.session.role.replace('_', ' ')} role cannot perform this action in the demo permission matrix.`,
    )
  }
}

export function isInternal(role: Role): boolean {
  return role !== 'vendor_contact'
}
