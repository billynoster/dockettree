/** Sign-in, sign-out, the current session and first-run setup. */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { conflict, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { capabilitiesFor } from '@/domain/permissions'
import type { Membership, Organization, User } from '@/domain/types'
import { isSyntacticallyValidEmail } from '@/domain/validation'
import { changeOwnPassword } from '@/services/memberService'
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  setActiveVendorContext,
  signIn,
  signOut,
} from '../../auth/sessions'
import {
  passwordHasherFor,
  primaryOrganization,
  requirePrincipal,
  serviceContextFor,
  sessionToken,
  type AppEnv,
} from '../context'
import { handle } from '../handler'

export const sessionRoutes = new Hono<AppEnv>()

sessionRoutes.get(
  '/session',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = c.get('principal')
    const organization = await primaryOrganization(deps)
    const base = {
      setupRequired: organization === null,
      provider: deps.identityProvider.name,
      signInHint: deps.identityProvider.signInHint,
      organizationName: organization?.name ?? null,
      delivery: {
        configured: deps.mailer.configured,
        reason: deps.mailer.unavailableReason,
      },
    }
    if (!principal || !organization) {
      return { ...base, authenticated: false as const }
    }
    return {
      ...base,
      authenticated: true as const,
      user: {
        id: principal.user.id,
        display_name: principal.user.display_name,
        email: principal.user.email,
        last_login_at: principal.user.last_login_at,
      },
      role: principal.role,
      capabilities: capabilitiesFor(principal.role),
      organization,
      vendorContexts: principal.vendorContexts,
      activeVendorId: principal.vendorId,
      managesPasswords: deps.identityProvider.managesPasswords,
    }
  }),
)

sessionRoutes.post(
  '/auth/login',
  handle(async (c) => {
    const deps = c.get('deps')
    const body = await c.req.json<{ email?: string; password?: string }>()
    if (!body.email || !body.password) {
      throw validationError('Enter your email and password.', {
        email: body.email ? '' : 'Enter your email address.',
        password: body.password ? '' : 'Enter your password.',
      })
    }
    const result = await signIn(deps.db, deps.clock, deps.identityProvider, {
      credentials: { kind: 'password', email: body.email, password: body.password },
      throttleKey: c.req.header('x-forwarded-for') ?? 'local',
    })
    setCookie(c, SESSION_COOKIE, result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: deps.config.secureCookies,
      maxAge: 7 * 86_400,
    })
    return { user_id: result.user.id }
  }),
)

sessionRoutes.post(
  '/auth/logout',
  handle(async (c) => {
    const deps = c.get('deps')
    await signOut(deps.db, deps.clock, sessionToken(c))
    c.header('Set-Cookie', clearedSessionCookie(deps.config.secureCookies))
    return { signed_out: true }
  }),
)

sessionRoutes.post(
  '/auth/password',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = requirePrincipal(c)
    const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>()
    const ctx = await serviceContextFor(deps, principal)
    await changeOwnPassword(
      ctx,
      passwordHasherFor(deps.identityProvider),
      (password, hash) => deps.identityProvider.verifyPassword(password, hash),
      {
        currentPassword: body.currentPassword ?? '',
        newPassword: body.newPassword ?? '',
      },
    )
    return { updated: true }
  }),
)

sessionRoutes.post(
  '/session/vendor-context',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = requirePrincipal(c)
    const body = await c.req.json<{ vendorId?: string }>()
    if (!body.vendorId) throw validationError('Choose a vendor.')
    await setActiveVendorContext(deps.db, principal, body.vendorId)
    return { active_vendor_id: body.vendorId }
  }),
)

/**
 * First-run setup. Available only while the server has no organization, so it cannot be used
 * to add a second administrator later.
 */
sessionRoutes.post(
  '/setup',
  handle(async (c) => {
    const deps = c.get('deps')
    if (await primaryOrganization(deps)) {
      throw conflict('This server is already set up. Sign in instead.')
    }
    const body = await c.req.json<{
      organizationName?: string
      timezone?: string
      supportEmail?: string
      supportContactName?: string
      adminName?: string
      adminEmail?: string
      adminPassword?: string
    }>()

    const fieldErrors: Record<string, string> = {}
    const organizationName = (body.organizationName ?? '').trim()
    const timezone = (body.timezone ?? 'America/Chicago').trim()
    const supportEmail = (body.supportEmail ?? '').trim().toLowerCase()
    const supportContactName = (body.supportContactName ?? '').trim()
    const adminName = (body.adminName ?? '').trim()
    const adminEmail = (body.adminEmail ?? '').trim().toLowerCase()
    const adminPassword = body.adminPassword ?? ''

    if (organizationName.length < 2) fieldErrors.organizationName = 'Enter your organization name.'
    if (supportContactName.length < 2) {
      fieldErrors.supportContactName = 'Enter the team or person vendors should contact.'
    }
    if (!isSyntacticallyValidEmail(supportEmail)) {
      fieldErrors.supportEmail = 'Enter a valid support email address.'
    }
    if (adminName.length < 2) fieldErrors.adminName = 'Enter your name.'
    if (!isSyntacticallyValidEmail(adminEmail)) fieldErrors.adminEmail = 'Enter a valid email address.'
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    } catch {
      fieldErrors.timezone = 'Choose a valid IANA timezone, for example America/Chicago.'
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw validationError('Fix the highlighted fields.', fieldErrors)
    }
    deps.identityProvider.assertPasswordPolicy(adminPassword, 'adminPassword')
    const passwordHash = await deps.identityProvider.hashPassword(adminPassword)

    const timestamp = deps.clock.nowIso()
    const organization: Organization = {
      id: newId(),
      name: organizationName,
      timezone,
      support_email: supportEmail,
      support_contact_name: supportContactName,
      record_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    }
    const user: User = {
      id: newId(),
      display_name: adminName,
      email: adminEmail,
      auth_subject: null,
      password_hash: passwordHash,
      password_updated_at: timestamp,
      status: 'active',
      last_login_at: null,
      created_at: timestamp,
    }
    const membership: Membership = {
      id: newId(),
      organization_id: organization.id,
      user_id: user.id,
      role: 'admin',
    }
    await deps.db.write(async (uow) => {
      await uow.organizations.put(organization)
      await uow.users.put(user)
      await uow.memberships.put(membership)
    })

    const result = await signIn(deps.db, deps.clock, deps.identityProvider, {
      credentials: { kind: 'password', email: adminEmail, password: adminPassword },
    })
    setCookie(c, SESSION_COOKIE, result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: deps.config.secureCookies,
      maxAge: 7 * 86_400,
    })
    return { organization_id: organization.id, user_id: user.id }
  }),
)
