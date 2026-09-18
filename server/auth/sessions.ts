/**
 * Authentication: password sign-in, server-side sessions and the principal that every
 * request is authorized against. Roles come from stored memberships, never from the client.
 */
import type { Clock } from '@/domain/clock'
import { forbidden, rateLimited, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import type { AuthSession, Role, User, UUID, Vendor } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { Credentials, IdentityProvider } from './identityProvider'
import { hashToken, newToken } from './tokens'

export const SESSION_COOKIE = 'docksy_session'
const SESSION_TTL_MS = 7 * 86_400_000
const MAX_ATTEMPTS = 8
const ATTEMPT_WINDOW_MS = 10 * 60_000

export interface VendorContext {
  id: UUID
  company_name: string
}

export interface Principal {
  user: User
  session: AuthSession
  organizationId: UUID
  role: Role
  /** Active vendor context for a vendor contact; null for staff. */
  vendorId: UUID | null
  /** Every vendor this contact is authorized for. Empty for staff. */
  vendorContexts: VendorContext[]
}

const attempts = new Map<string, { count: number; firstAt: number }>()

/** Simple in-process throttle. A restart clears it; documented as a V1 limitation. */
function checkAttempts(key: string, now: number): void {
  const entry = attempts.get(key)
  if (!entry) return
  if (now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.delete(key)
    return
  }
  if (entry.count >= MAX_ATTEMPTS) {
    throw rateLimited('Too many sign-in attempts. Wait a few minutes and try again.')
  }
}

function recordFailure(key: string, now: number): void {
  const entry = attempts.get(key)
  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now })
    return
  }
  entry.count += 1
}

export function clearLoginThrottle(): void {
  attempts.clear()
}

export interface SignInResult {
  token: string
  session: AuthSession
  user: User
}

/**
 * Verifies credentials through the identity provider port and opens a first-party session.
 * Roles are read from stored memberships afterwards; the provider never supplies them.
 */
export async function signIn(
  db: Database,
  clock: Clock,
  provider: IdentityProvider,
  input: { credentials: Credentials; throttleKey?: string },
): Promise<SignInResult> {
  const nowMs = clock.now().getTime()
  const identifier =
    input.credentials.kind === 'password' ? input.credentials.email.trim().toLowerCase() : 'unknown'
  const throttleKey = `${input.throttleKey ?? 'local'}:${identifier}`
  checkAttempts(throttleKey, nowMs)

  let identity
  try {
    identity = await provider.verify(input.credentials)
  } catch (error) {
    recordFailure(throttleKey, nowMs)
    throw error
  }
  attempts.delete(throttleKey)

  const user = await db.read((uow) => uow.users.get(identity.userId))
  if (!user) throw validationError('That account no longer exists.')

  const token = newToken()
  const timestamp = clock.nowIso()
  const vendorMemberships = await db.read((uow) => uow.vendorMemberships.where('by_user', user.id))
  const session: AuthSession = {
    id: newId(),
    user_id: user.id,
    token_hash: hashToken(token),
    active_vendor_id: vendorMemberships.find((membership) => membership.verified_at)?.vendor_id ?? null,
    created_at: timestamp,
    last_seen_at: timestamp,
    expires_at: new Date(nowMs + SESSION_TTL_MS).toISOString(),
    revoked_at: null,
  }
  await db.write(async (uow) => {
    await uow.sessions.put(session)
    await uow.users.put({ ...user, last_login_at: timestamp })
  })
  return { token, session, user }
}

export async function signOut(db: Database, clock: Clock, token: string | null): Promise<void> {
  if (!token) return
  const hash = hashToken(token)
  await db.write(async (uow) => {
    const matches = await uow.sessions.where('by_token_hash', hash)
    for (const session of matches) {
      await uow.sessions.put({ ...session, revoked_at: clock.nowIso() })
    }
  })
}

export async function revokeSessionsForUser(db: Database, clock: Clock, userId: UUID): Promise<void> {
  await db.write(async (uow) => {
    const sessions = await uow.sessions.where('by_user', userId)
    for (const session of sessions) {
      if (session.revoked_at) continue
      await uow.sessions.put({ ...session, revoked_at: clock.nowIso() })
    }
  })
}

/** Resolves the cookie token into a principal, or null when the caller is anonymous. */
export async function resolvePrincipal(
  db: Database,
  clock: Clock,
  token: string | null,
): Promise<Principal | null> {
  if (!token) return null
  const hash = hashToken(token)
  const timestamp = clock.nowIso()

  const resolved = await db.read(async (uow) => {
    const session = (await uow.sessions.where('by_token_hash', hash))[0]
    if (!session || session.revoked_at || session.expires_at <= timestamp) return null
    const user = await uow.users.get(session.user_id)
    if (!user || user.status !== 'active') return null

    const memberships = await uow.memberships.where('by_user', user.id)
    if (memberships.length > 0) {
      const membership = memberships[0]
      return {
        user,
        session,
        organizationId: membership.organization_id,
        role: membership.role as Role,
        vendorId: null,
        vendorContexts: [] as VendorContext[],
      }
    }

    const vendorMemberships = (await uow.vendorMemberships.where('by_user', user.id)).filter(
      (membership) => membership.verified_at !== null,
    )
    if (vendorMemberships.length === 0) return null
    const vendors: Vendor[] = []
    for (const membership of vendorMemberships) {
      const vendor = await uow.vendors.get(membership.vendor_id)
      if (vendor) vendors.push(vendor)
    }
    if (vendors.length === 0) return null
    const active =
      vendors.find((vendor) => vendor.id === session.active_vendor_id) ?? vendors[0]
    return {
      user,
      session,
      organizationId: active.organization_id,
      role: 'vendor_contact' as Role,
      vendorId: active.id,
      vendorContexts: vendors
        .map((vendor) => ({ id: vendor.id, company_name: vendor.company_name }))
        .sort((a, b) => a.company_name.localeCompare(b.company_name)),
    }
  })

  if (!resolved) return null

  // Rolling expiry keeps an active operator signed in without extending an idle session.
  const nextExpiry = new Date(clock.now().getTime() + SESSION_TTL_MS).toISOString()
  await db.write((uow) =>
    uow.sessions.put({ ...resolved.session, last_seen_at: timestamp, expires_at: nextExpiry }),
  )
  return { ...resolved, session: { ...resolved.session, last_seen_at: timestamp, expires_at: nextExpiry } }
}

/** Switches which authorized vendor a contact is acting for. */
export async function setActiveVendorContext(
  db: Database,
  principal: Principal,
  vendorId: UUID,
): Promise<void> {
  if (!principal.vendorContexts.some((context) => context.id === vendorId)) {
    throw forbidden('You are not authorized for that vendor.')
  }
  await db.write((uow) => uow.sessions.put({ ...principal.session, active_vendor_id: vendorId }))
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_MS / 1000}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearedSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
