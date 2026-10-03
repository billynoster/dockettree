/** Templates, activity, settings, members, notification outbox and invitation acceptance. */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { validationError } from '@/domain/errors'
import type { ActivityEventType, InternalRole } from '@/domain/types'
import { listActivity } from '@/services/activityService'
import {
  acceptInvitation,
  checkInvitation,
  organizationForInvitationToken,
} from '@/services/invitationService'
import {
  addMember,
  changeMemberRole,
  listMembers,
  resetMemberPassword,
  setMemberStatus,
} from '@/services/memberService'
import {
  getDocumentRequest,
  listDocumentRequests,
  listVendorDocumentRequests,
} from '@/services/documentRequestService'
import { listOutbox, retryNotification, runDailyReminderJob } from '@/services/reminderService'
import type { DocumentRequestState } from '@/domain/types'
import { updateOrganizationSettings } from '@/services/settingsService'
import {
  createTemplate,
  listTemplates,
  setTemplateArchived,
  updateTemplate,
} from '@/services/templateService'
import { SESSION_COOKIE, signIn } from '../../auth/sessions'
import {
  anonymousServiceContext,
  passwordHasherFor,
  primaryOrganization,
  requirePrincipal,
  serviceContextFor,
  type AppEnv,
} from '../context'
import { handle, param } from '../handler'

export const adminRoutes = new Hono<AppEnv>()

async function ctxOf(c: Parameters<Parameters<typeof handle>[0]>[0]) {
  return await serviceContextFor(c.get('deps'), requirePrincipal(c))
}

adminRoutes.get(
  '/templates',
  handle(async (c) => await listTemplates(await ctxOf(c))),
)

adminRoutes.post(
  '/templates',
  handle(async (c) => {
    const body = await c.req.json()
    return { template_id: await createTemplate(await ctxOf(c), body) }
  }),
)

adminRoutes.patch(
  '/templates/:templateId',
  handle(async (c) => {
    const body = await c.req.json()
    await updateTemplate(await ctxOf(c), param(c, 'templateId'), body)
    return { updated: true }
  }),
)

adminRoutes.post(
  '/templates/:templateId/archived',
  handle(async (c) => {
    const body = await c.req.json<{ archived?: boolean }>()
    await setTemplateArchived(await ctxOf(c), param(c, 'templateId'), body.archived ?? true)
    return { updated: true }
  }),
)

adminRoutes.get(
  '/activity',
  handle(async (c) => {
    const params = new URL(c.req.url).searchParams
    return await listActivity(await ctxOf(c), {
      vendorId: params.get('vendor') ?? 'all',
      eventType: (params.get('type') as ActivityEventType | null) ?? 'all',
      limit: Number(params.get('limit') ?? 200),
    })
  }),
)

adminRoutes.get(
  '/settings',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = requirePrincipal(c)
    const ctx = await serviceContextFor(deps, principal)
    const organization = await deps.db.read((uow) => uow.organizations.get(ctx.organizationId))
    return {
      organization,
      members: await listMembers(ctx),
      identity: {
        provider: deps.identityProvider.name,
        managesPasswords: deps.identityProvider.managesPasswords,
      },
      delivery: { configured: deps.mailer.configured, reason: deps.mailer.unavailableReason },
    }
  }),
)

adminRoutes.patch(
  '/settings',
  handle(async (c) => {
    const body = await c.req.json()
    return await updateOrganizationSettings(await ctxOf(c), body)
  }),
)

adminRoutes.post(
  '/members',
  handle(async (c) => {
    const deps = c.get('deps')
    const body = await c.req.json<{
      display_name?: string
      email?: string
      role?: InternalRole
      password?: string
    }>()
    if (body.role !== 'admin' && body.role !== 'coordinator' && body.role !== 'reviewer') {
      throw validationError('Choose a role.', { role: 'Choose admin, coordinator or reviewer.' })
    }
    return await addMember(await ctxOf(c), passwordHasherFor(deps.identityProvider), {
      display_name: body.display_name ?? '',
      email: body.email ?? '',
      role: body.role,
      password: body.password ?? '',
    })
  }),
)

adminRoutes.post(
  '/members/:userId/role',
  handle(async (c) => {
    const body = await c.req.json<{ role?: InternalRole }>()
    if (body.role !== 'admin' && body.role !== 'coordinator' && body.role !== 'reviewer') {
      throw validationError('Choose a role.')
    }
    await changeMemberRole(await ctxOf(c), param(c, 'userId'), body.role)
    return { updated: true }
  }),
)

adminRoutes.post(
  '/members/:userId/status',
  handle(async (c) => {
    const body = await c.req.json<{ status?: 'active' | 'disabled' }>()
    if (body.status !== 'active' && body.status !== 'disabled') {
      throw validationError('Choose a status.')
    }
    await setMemberStatus(await ctxOf(c), param(c, 'userId'), body.status)
    return { updated: true }
  }),
)

adminRoutes.post(
  '/members/:userId/password',
  handle(async (c) => {
    const deps = c.get('deps')
    const body = await c.req.json<{ password?: string }>()
    await resetMemberPassword(
      await ctxOf(c),
      passwordHasherFor(deps.identityProvider),
      param(c, 'userId'),
      body.password ?? '',
    )
    return { updated: true }
  }),
)

adminRoutes.get(
  '/requests',
  handle(async (c) => {
    const params = new URL(c.req.url).searchParams
    const state = params.get('state') as DocumentRequestState | 'open' | 'all' | null
    return await listDocumentRequests(await ctxOf(c), {
      vendorId: params.get('vendor'),
      state,
    })
  }),
)

adminRoutes.get(
  '/requests/:requestId',
  handle(async (c) => await getDocumentRequest(await ctxOf(c), param(c, 'requestId'))),
)

adminRoutes.get(
  '/vendors/:vendorId/requests',
  handle(async (c) => await listVendorDocumentRequests(await ctxOf(c), param(c, 'vendorId'))),
)

adminRoutes.get(
  '/notifications',
  handle(async (c) => {
    const deps = c.get('deps')
    const params = new URL(c.req.url).searchParams
    const result = await listOutbox(await ctxOf(c), {
      vendorId: params.get('vendor'),
      type: params.get('type') as 'invitation' | 'vendor_digest' | 'correction_requested' | null,
    })
    return {
      ...result,
      delivery: { configured: deps.mailer.configured, reason: deps.mailer.unavailableReason },
    }
  }),
)

adminRoutes.post(
  '/notifications/:notificationId/retry',
  handle(async (c) => {
    const deps = c.get('deps')
    await retryNotification(await ctxOf(c), param(c, 'notificationId'))
    const delivery = await deps.deliveryWorker.runOnce()
    return { queued: true, delivery }
  }),
)

/** Runs the daily digest job immediately; the scheduler runs it at 09:00 local time. */
adminRoutes.post(
  '/notifications/run-job',
  handle(async (c) => {
    const deps = c.get('deps')
    const result = await runDailyReminderJob(await ctxOf(c))
    void deps.deliveryWorker.runOnce().catch(() => undefined)
    return result
  }),
)

adminRoutes.get(
  '/invitations/check',
  handle(async (c) => {
    const deps = c.get('deps')
    const token = new URL(c.req.url).searchParams.get('token')
    if (!token) throw validationError('That invitation link is missing its token.')
    const organizationId =
      (await organizationForInvitationToken(
        await anonymousServiceContext(deps, (await primaryOrganization(deps))?.id ?? ''),
        deps.tokens,
        token,
      )) ?? (await primaryOrganization(deps))?.id
    if (!organizationId) throw validationError('That invitation link is not valid.')
    return await checkInvitation(
      await anonymousServiceContext(deps, organizationId),
      deps.tokens,
      token,
    )
  }),
)

adminRoutes.post(
  '/invitations/accept',
  handle(async (c) => {
    const deps = c.get('deps')
    const body = await c.req.json<{ token?: string; display_name?: string; password?: string }>()
    if (!body.token) throw validationError('That invitation link is missing its token.')
    const fallback = (await primaryOrganization(deps))?.id
    const organizationId =
      (await organizationForInvitationToken(
        await anonymousServiceContext(deps, fallback ?? ''),
        deps.tokens,
        body.token,
      )) ?? fallback
    if (!organizationId) throw validationError('That invitation link is not valid.')
    const result = await acceptInvitation(
      await anonymousServiceContext(deps, organizationId),
      deps.tokens,
      passwordHasherFor(deps.identityProvider),
      {
        token: body.token,
        display_name: body.display_name ?? '',
        password: body.password ?? '',
      },
    )
    // Sign the new contact in straight away so they land in their portal.
    const signedIn = await signIn(deps.db, deps.clock, deps.identityProvider, {
      credentials: { kind: 'password', email: result.email, password: body.password ?? '' },
    })
    setCookie(c, SESSION_COOKIE, signedIn.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: deps.config.secureCookies,
      maxAge: 7 * 86_400,
    })
    return result
  }),
)
