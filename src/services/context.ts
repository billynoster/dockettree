/** Shared service context: storage, clock and the authenticated session. */
import type { Clock } from '@/domain/clock'
import { todayInTimeZone } from '@/domain/dates'
import { forbidden } from '@/domain/errors'
import { ROLE_LABEL, can, type Capability } from '@/domain/permissions'
import type { IsoDate, IsoDateTime, Role, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'

/**
 * Identity of the caller. The server builds this from the session cookie and the stored
 * membership rows; nothing here is ever accepted from the browser.
 */
export interface Session {
  role: Role
  userId: UUID
  userLabel: string
  /** Active vendor context for a vendor contact. Null for internal roles. */
  vendorId: UUID | null
  /** Session record the request arrived on, when there is one. */
  sessionId?: UUID | null
  /**
   * Set for work the server itself performs, such as the scheduled reminder job. Capability
   * checks are skipped because no user is acting; activity events record a system actor.
   */
  system?: boolean
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

/** Server-side authorization check for the permission matrix in requirements section 3. */
export function requireCapability(ctx: ServiceContext, capability: Capability): void {
  if (ctx.session.system) return
  if (!can(ctx.session.role, capability)) {
    throw forbidden(`The ${ROLE_LABEL[ctx.session.role]} role cannot perform this action.`)
  }
}

export function isInternal(role: Role): boolean {
  return role !== 'vendor_contact'
}
