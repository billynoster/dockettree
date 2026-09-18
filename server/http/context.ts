/** Per-request wiring: cookie -> principal -> ServiceContext. */
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Clock } from '@/domain/clock'
import { forbidden, notFound } from '@/domain/errors'
import type { Organization, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { ServiceContext } from '@/services/context'
import type { ServerConfig } from '../config'
import type { IdentityProvider } from '../auth/identityProvider'
import { SESSION_COOKIE, resolvePrincipal, type Principal } from '../auth/sessions'
import type { NotificationDeliveryWorker } from '../mail/deliveryWorker'
import type { Mailer } from '../mail/mailer'
import type { TokenFactory } from '@/services/invitationService'
import type { PasswordHasher } from '@/services/memberService'

export interface AppDependencies {
  config: ServerConfig
  db: Database
  clock: Clock
  mailer: Mailer
  identityProvider: IdentityProvider
  tokens: TokenFactory
  deliveryWorker: NotificationDeliveryWorker
}

export type AppEnv = {
  Variables: {
    deps: AppDependencies
    principal: Principal | null
  }
}

export function sessionToken(c: Context<AppEnv>): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null
}

export async function loadPrincipal(c: Context<AppEnv>): Promise<Principal | null> {
  const deps = c.get('deps')
  return await resolvePrincipal(deps.db, deps.clock, sessionToken(c))
}

export function requirePrincipal(c: Context<AppEnv>): Principal {
  const principal = c.get('principal')
  if (!principal) throw new UnauthenticatedError()
  return principal
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Sign in to continue.')
    this.name = 'UnauthenticatedError'
  }
}

export async function organizationOf(deps: AppDependencies, organizationId: UUID): Promise<Organization> {
  const organization = await deps.db.read((uow) => uow.organizations.get(organizationId))
  if (!organization) throw notFound('This server has no organization configured yet.')
  return organization
}

/** Builds the service context for an authenticated caller. */
export async function serviceContextFor(
  deps: AppDependencies,
  principal: Principal,
): Promise<ServiceContext> {
  const organization = await organizationOf(deps, principal.organizationId)
  return {
    db: deps.db,
    clock: deps.clock,
    organizationId: organization.id,
    timezone: organization.timezone,
    session: {
      role: principal.role,
      userId: principal.user.id,
      userLabel: principal.user.display_name,
      vendorId: principal.vendorId,
      sessionId: principal.session.id,
    },
  }
}

/**
 * Context for an anonymous request that is scoped by a token rather than a session, such as
 * invitation acceptance. The caller supplies the organization the token belongs to.
 */
export async function anonymousServiceContext(
  deps: AppDependencies,
  organizationId: UUID,
): Promise<ServiceContext> {
  const organization = await organizationOf(deps, organizationId)
  return {
    db: deps.db,
    clock: deps.clock,
    organizationId: organization.id,
    timezone: organization.timezone,
    session: {
      role: 'vendor_contact',
      userId: 'anonymous',
      userLabel: 'Invited vendor contact',
      vendorId: null,
    },
  }
}

/** The single organization this server hosts, or null before first-run setup. */
export async function primaryOrganization(deps: AppDependencies): Promise<Organization | null> {
  const organizations = await deps.db.read((uow) => uow.organizations.getAll())
  return organizations[0] ?? null
}

export function requireVendorContext(principal: Principal): UUID {
  if (principal.role !== 'vendor_contact' || !principal.vendorId) {
    throw forbidden('This page is only available to vendor contacts.')
  }
  return principal.vendorId
}

export const passwordHasherFor = (provider: IdentityProvider): PasswordHasher => ({
  hash: (password) => provider.hashPassword(password),
  assertPolicy: (password, field) => provider.assertPasswordPolicy(password, field),
})
