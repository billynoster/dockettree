/**
 * Vendor invitations (requirements FR-03, section 5.5).
 *
 * An invitation carries a single-use token that is stored only as a hash. Redeeming it
 * verifies the invited email, creates the vendor contact's account and binds a verified
 * vendor membership — portal access comes from that membership, never from a URL id.
 */
import { conflict, forbidden, notFound, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { invitationIdempotencyKey } from '@/domain/reminders'
import type { Invitation, Notification, User, UUID, VendorMembership } from '@/domain/types'
import { isSyntacticallyValidEmail } from '@/domain/validation'
import { withIdempotency } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'
import type { PasswordHasher } from './memberService'
import { invitationStatus, loadVendorInvitations } from './queries'

export const INVITATION_TTL_DAYS = 7

/** Injected so token generation and hashing stay in the server layer. */
export interface TokenFactory {
  create(): string
  hash(token: string): string
}

export interface InvitationPreview {
  vendor_id: UUID
  company_name: string
  recipient: string
  recipient_label: string
  subject: string
  body: string
  expires_at: string
  /** Set when resending: the previous unaccepted invitation will be revoked. */
  revokesPreviousInvitation: boolean
  requiredItemTitles: string[]
  alreadyHasAccount: boolean
}

function invitationBody(input: {
  contactName: string
  organizationName: string
  companyName: string
  requiredItemTitles: string[]
  acceptUrl: string
  expiresOn: string
  supportLine: string
}): string {
  return [
    `Hello ${input.contactName},`,
    '',
    `${input.organizationName} has requested vendor documents from ${input.companyName}.`,
    input.requiredItemTitles.length > 0
      ? `Required documents: ${input.requiredItemTitles.join(', ')}.`
      : 'No required documents are assigned yet; a coordinator will add them shortly.',
    '',
    'Set up your account and upload each document here:',
    input.acceptUrl,
    '',
    `This invitation link works once and expires on ${input.expiresOn}.`,
    input.supportLine,
  ].join('\n')
}

export async function previewInvitation(
  ctx: ServiceContext,
  vendorId: UUID,
): Promise<InvitationPreview> {
  requireCapability(ctx, 'invitation.send')
  return await ctx.db.read(async (uow) => {
    const vendor = await uow.vendors.get(vendorId)
    if (!vendor || vendor.organization_id !== ctx.organizationId) {
      throw notFound('That vendor no longer exists.')
    }
    const organization = await uow.organizations.get(ctx.organizationId)
    const requirements = await uow.requirements.where('by_vendor', vendorId)
    const invitations = await loadVendorInvitations(uow, vendorId)
    const current = invitationStatus(invitations, nowIso(ctx))
    const expiresAt = new Date(
      ctx.clock.now().getTime() + INVITATION_TTL_DAYS * 86_400_000,
    ).toISOString()
    const requiredItemTitles = requirements
      .filter((requirement) => requirement.required && requirement.retired_at === null)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((requirement) => requirement.title)
    const existingUser = (await uow.users.where('by_email', vendor.contact_email.toLowerCase()))[0]

    return {
      vendor_id: vendor.id,
      company_name: vendor.company_name,
      recipient: vendor.contact_email,
      recipient_label: vendor.contact_name,
      subject: `${organization?.name ?? 'Your customer'} needs documents from ${vendor.company_name}`,
      body: invitationBody({
        contactName: vendor.contact_name,
        organizationName: organization?.name ?? 'Your customer',
        companyName: vendor.company_name,
        requiredItemTitles,
        acceptUrl: '(a single-use link is generated when you send the invitation)',
        expiresOn: expiresAt.slice(0, 10),
        supportLine: organization
          ? `Questions? Contact ${organization.support_contact_name} at ${organization.support_email}.`
          : '',
      }),
      expires_at: expiresAt,
      revokesPreviousInvitation: current.status === 'invited' || current.status === 'expired',
      requiredItemTitles,
      alreadyHasAccount: existingUser !== undefined,
    }
  })
}

export interface InviteVendorInput {
  vendorId: UUID
  /** Guards against inviting after the contact email changed in another tab. */
  expectedContactEmail: string
  /** Absolute base URL used to build the acceptance link, e.g. `https://docksy.example`. */
  linkBase: string
  requestKey?: string
}

export interface InviteVendorResult {
  invitation_id: UUID
  notification_id: UUID
  /** Returned once so an operator can hand over the link when email is not configured. */
  accept_url: string
  replayed: boolean
}

export async function inviteVendor(
  ctx: ServiceContext,
  tokens: TokenFactory,
  input: InviteVendorInput,
): Promise<InviteVendorResult> {
  requireCapability(ctx, 'invitation.send')
  const token = tokens.create()
  const result = await ctx.db.write(async (uow) =>
    withIdempotency(uow, input.requestKey ?? null, nowIso(ctx), async () => {
      const vendor = await uow.vendors.get(input.vendorId)
      if (!vendor || vendor.organization_id !== ctx.organizationId) {
        throw notFound('That vendor no longer exists.')
      }
      if (vendor.lifecycle === 'archived') {
        throw conflict('Archived vendors cannot be invited. Restore the vendor first.')
      }
      if (vendor.contact_email !== input.expectedContactEmail) {
        throw conflict(
          `The contact email changed to ${vendor.contact_email}. Review the recipient before sending the invitation.`,
        )
      }
      if (!isSyntacticallyValidEmail(vendor.contact_email)) {
        throw validationError('This vendor needs a valid contact email before an invitation can be sent.')
      }

      const timestamp = nowIso(ctx)
      // Resending revokes any previous unaccepted token, so only one link is ever live.
      const existing = await uow.invitations.where('by_vendor', vendor.id)
      for (const invitation of existing) {
        if (!invitation.redeemed_at && !invitation.revoked_at) {
          await uow.invitations.put({ ...invitation, revoked_at: timestamp })
        }
      }

      const invitation: Invitation = {
        id: newId(),
        organization_id: ctx.organizationId,
        vendor_id: vendor.id,
        invited_email: vendor.contact_email,
        token_hash: tokens.hash(token),
        expires_at: new Date(
          new Date(timestamp).getTime() + INVITATION_TTL_DAYS * 86_400_000,
        ).toISOString(),
        redeemed_at: null,
        redeemed_by_user_id: null,
        revoked_at: null,
        created_by: ctx.session.userId,
        created_at: timestamp,
      }
      await uow.invitations.put(invitation)
      await uow.vendors.put({
        ...vendor,
        invited_at: timestamp,
        updated_at: timestamp,
        record_version: vendor.record_version + 1,
      })

      const requirements = await uow.requirements.where('by_vendor', vendor.id)
      const organization = await uow.organizations.get(ctx.organizationId)
      const acceptUrl = `${input.linkBase.replace(/\/$/, '')}/invitations/accept?token=${token}`
      const requiredItemTitles = requirements
        .filter((requirement) => requirement.required && requirement.retired_at === null)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((requirement) => requirement.title)

      const notification: Notification = {
        id: newId(),
        organization_id: ctx.organizationId,
        vendor_id: vendor.id,
        type: 'invitation',
        recipient: vendor.contact_email,
        recipient_label: vendor.contact_name,
        subject: `${organization?.name ?? 'Your customer'} needs documents from ${vendor.company_name}`,
        body: invitationBody({
          contactName: vendor.contact_name,
          organizationName: organization?.name ?? 'Your customer',
          companyName: vendor.company_name,
          requiredItemTitles,
          acceptUrl,
          expiresOn: invitation.expires_at.slice(0, 10),
          supportLine: organization
            ? `Questions? Contact ${organization.support_contact_name} at ${organization.support_email}.`
            : '',
        }),
        items: requirements
          .filter((requirement) => requirement.required && requirement.retired_at === null)
          .map((requirement) => ({
            requirement_id: requirement.id,
            requirement_title: requirement.title,
            milestone_key: 'invitation',
            detail: 'Requested with the invitation.',
            submission_version: null,
          })),
        status: 'queued',
        idempotency_key: invitationIdempotencyKey(ctx.organizationId, invitation.id),
        attempt_count: 0,
        next_attempt_at: timestamp,
        sent_at: null,
        last_error: null,
        manual: true,
        created_at: timestamp,
      }
      await uow.notifications.put(notification)

      await recordActivity(uow, ctx, {
        vendor_id: vendor.id,
        event_type: 'invitation_sent',
        target_id: invitation.id,
        summary: `Invitation created for ${vendor.contact_email}`,
        // The token itself is never written to history or logs.
        metadata: { recipient: vendor.contact_email, expires_at: invitation.expires_at },
        vendor_visible: true,
      })

      return { invitation_id: invitation.id, notification_id: notification.id, accept_url: acceptUrl }
    }),
  )
  return { ...result.value, replayed: result.replayed }
}

export async function revokeInvitation(ctx: ServiceContext, invitationId: UUID): Promise<void> {
  requireCapability(ctx, 'invitation.send')
  await ctx.db.write(async (uow) => {
    const invitation = await uow.invitations.get(invitationId)
    if (!invitation || invitation.organization_id !== ctx.organizationId) {
      throw notFound('That invitation no longer exists.')
    }
    if (invitation.revoked_at) return
    const timestamp = nowIso(ctx)
    await uow.invitations.put({ ...invitation, revoked_at: timestamp })
    await recordActivity(uow, ctx, {
      vendor_id: invitation.vendor_id,
      event_type: 'invitation_revoked',
      target_id: invitation.id,
      summary: `Revoked the invitation sent to ${invitation.invited_email}`,
      vendor_visible: true,
    })
  })
}

export interface InvitationCheck {
  company_name: string
  organization_name: string
  invited_email: string
  expires_at: string
  needsPassword: boolean
}

/**
 * Distinct recovery copy for invalid, used, expired and revoked links, without revealing
 * anything about the vendor record behind the token.
 */
async function findInvitation(ctx: ServiceContext, tokens: TokenFactory, token: string) {
  const hash = tokens.hash(token)
  return await ctx.db.read(async (uow) => {
    const invitation = (await uow.invitations.where('by_token_hash', hash))[0]
    if (!invitation) return { invitation: null as Invitation | null, vendor: null, organization: null }
    const vendor = await uow.vendors.get(invitation.vendor_id)
    const organization = await uow.organizations.get(invitation.organization_id)
    return { invitation, vendor: vendor ?? null, organization: organization ?? null }
  })
}

function assertUsable(invitation: Invitation | null, nowInstant: string): Invitation {
  if (!invitation) {
    throw notFound('That invitation link is not valid. Ask your contact to send a new invitation.')
  }
  if (invitation.revoked_at) {
    throw forbidden('That invitation was revoked. Ask your contact to send a new invitation.')
  }
  if (invitation.redeemed_at) {
    throw conflict('That invitation was already used. Sign in with the password you created.')
  }
  if (invitation.expires_at <= nowInstant) {
    throw forbidden('That invitation expired. Ask your contact to send a new invitation.')
  }
  return invitation
}

/** Organization that owns an invitation token, so an anonymous request can be scoped. */
export async function organizationForInvitationToken(
  ctx: ServiceContext,
  tokens: TokenFactory,
  token: string,
): Promise<UUID | null> {
  const hash = tokens.hash(token)
  return await ctx.db.read(async (uow) => {
    const invitation = (await uow.invitations.where('by_token_hash', hash))[0]
    return invitation?.organization_id ?? null
  })
}

export async function checkInvitation(
  ctx: ServiceContext,
  tokens: TokenFactory,
  token: string,
): Promise<InvitationCheck> {
  const { invitation, vendor, organization } = await findInvitation(ctx, tokens, token)
  const usable = assertUsable(invitation, nowIso(ctx))
  if (!vendor) throw notFound('That invitation link is no longer valid.')
  const existing = await ctx.db.read(
    async (uow) => (await uow.users.where('by_email', usable.invited_email.toLowerCase()))[0],
  )
  return {
    company_name: vendor.company_name,
    organization_name: organization?.name ?? 'Ready Vendors',
    invited_email: usable.invited_email,
    expires_at: usable.expires_at,
    needsPassword: existing?.password_hash === null || existing === undefined,
  }
}

export interface AcceptInvitationInput {
  token: string
  display_name: string
  password: string
}

export interface AcceptInvitationResult {
  user_id: UUID
  vendor_id: UUID
  email: string
}

/** Creates or binds the vendor contact account and marks the token used, in one transaction. */
export async function acceptInvitation(
  ctx: ServiceContext,
  tokens: TokenFactory,
  hasher: PasswordHasher,
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const displayName = input.display_name.trim()
  if (displayName.length < 2) {
    throw validationError('Enter your name.', { display_name: 'Enter your name.' })
  }
  hasher.assertPolicy(input.password)
  const passwordHash = await hasher.hash(input.password)
  const hash = tokens.hash(input.token)

  return await ctx.db.write(async (uow) => {
    const invitation = assertUsable(
      (await uow.invitations.where('by_token_hash', hash))[0] ?? null,
      nowIso(ctx),
    )
    const vendor = await uow.vendors.get(invitation.vendor_id)
    if (!vendor || vendor.organization_id !== ctx.organizationId) {
      throw notFound('That invitation link is no longer valid.')
    }
    const timestamp = nowIso(ctx)
    const email = invitation.invited_email.toLowerCase()

    let user = (await uow.users.where('by_email', email))[0]
    if (user) {
      const staffMemberships = await uow.memberships.where('by_user', user.id)
      if (staffMemberships.length > 0) {
        throw conflict('That email already belongs to a staff account. Sign in with it instead.')
      }
      user = {
        ...user,
        display_name: displayName,
        password_hash: passwordHash,
        password_updated_at: timestamp,
        status: 'active',
      }
    } else {
      user = {
        id: newId(),
        display_name: displayName,
        email,
        auth_subject: null,
        password_hash: passwordHash,
        password_updated_at: timestamp,
        status: 'active',
        last_login_at: null,
        created_at: timestamp,
      }
    }
    await uow.users.put(user)

    const memberships = await uow.vendorMemberships.where('by_vendor', vendor.id)
    const existing = memberships.find((membership) => membership.user_id === user.id)
    const membership: VendorMembership = existing
      ? { ...existing, verified_at: timestamp }
      : {
          id: newId(),
          organization_id: vendor.organization_id,
          vendor_id: vendor.id,
          user_id: user.id,
          verified_at: timestamp,
        }
    await uow.vendorMemberships.put(membership)
    await uow.invitations.put({
      ...invitation,
      redeemed_at: timestamp,
      redeemed_by_user_id: user.id,
    })

    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: 'invitation_accepted',
      target_id: invitation.id,
      summary: `${displayName} accepted the invitation for ${vendor.company_name}`,
      metadata: { recipient: invitation.invited_email },
      vendor_visible: true,
      actor: { id: user.id, label: displayName, role: 'vendor_contact' },
    })

    return { user_id: user.id, vendor_id: vendor.id, email } satisfies AcceptInvitationResult
  })
}

export type { User as InvitedUser }
