/** Simulated invitations (requirements FR-03, section 5.5). No email is ever sent. */
import { conflict, notFound, validationError } from '@/domain/errors'
import { newId, tokenDigest } from '@/domain/ids'
import { invitationIdempotencyKey } from '@/domain/reminders'
import type { Invitation, Notification, UUID } from '@/domain/types'
import { isSyntacticallyValidEmail } from '@/domain/validation'
import { withIdempotency } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'
import { invitationStatus, loadVendorInvitations } from './queries'

export const INVITATION_TTL_DAYS = 7

export interface InvitationPreview {
  vendor_id: UUID
  company_name: string
  recipient: string
  recipient_label: string
  subject: string
  body: string
  /** Portal link that the simulated message would contain. */
  portalPath: string
  expires_at: string
  /** Set when resending: the previous unaccepted invitation will be revoked. */
  revokesPreviousInvitation: boolean
  requiredItemTitles: string[]
}

export async function previewInvitation(
  ctx: ServiceContext,
  vendorId: UUID,
): Promise<InvitationPreview> {
  return await ctx.db.read(async (uow) => {
    const vendor = await uow.vendors.get(vendorId)
    if (!vendor) throw notFound('That vendor no longer exists.')
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

    return {
      vendor_id: vendor.id,
      company_name: vendor.company_name,
      recipient: vendor.contact_email,
      recipient_label: vendor.contact_name,
      subject: `${organization?.name ?? 'Your customer'} needs documents from ${vendor.company_name}`,
      body: [
        `Hello ${vendor.contact_name},`,
        '',
        `${organization?.name ?? 'Your customer'} has requested vendor documents from ${vendor.company_name}.`,
        requiredItemTitles.length > 0
          ? `Required documents: ${requiredItemTitles.join(', ')}.`
          : 'No required documents are assigned yet; a coordinator will add them shortly.',
        '',
        'Open your vendor portal to upload each document and enter the dates shown on it.',
        `Questions? Contact ${organization?.support_contact_name ?? 'vendor operations'} at ${organization?.support_email ?? 'support@example.com'}.`,
        '',
        'Simulated message. No email is sent by this prototype.',
      ].join('\n'),
      portalPath: `/portal/${vendor.id}`,
      expires_at: expiresAt,
      revokesPreviousInvitation: current.status === 'invited' || current.status === 'expired',
      requiredItemTitles,
    }
  })
}

export interface InviteVendorInput {
  vendorId: UUID
  /** Guards against inviting after the contact email changed in another tab. */
  expectedContactEmail: string
  requestKey?: string
}

export async function inviteVendor(
  ctx: ServiceContext,
  input: InviteVendorInput,
): Promise<{ invitation_id: UUID; replayed: boolean }> {
  requireCapability(ctx, 'invitation.send')
  const result = await ctx.db.write(async (uow) =>
    withIdempotency(uow, input.requestKey ?? null, nowIso(ctx), async () => {
      const vendor = await uow.vendors.get(input.vendorId)
      if (!vendor) throw notFound('That vendor no longer exists.')
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
      // Resending revokes any previous unaccepted token.
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
        token_hash: tokenDigest(`${vendor.id}:${timestamp}:${newId()}`),
        expires_at: new Date(
          new Date(timestamp).getTime() + INVITATION_TTL_DAYS * 86_400_000,
        ).toISOString(),
        redeemed_at: null,
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
      const notification: Notification = {
        id: newId(),
        organization_id: ctx.organizationId,
        vendor_id: vendor.id,
        type: 'invitation',
        recipient: vendor.contact_email,
        recipient_label: vendor.contact_name,
        subject: `${organization?.name ?? 'Your customer'} needs documents from ${vendor.company_name}`,
        body: [
          `Hello ${vendor.contact_name},`,
          '',
          `${organization?.name ?? 'Your customer'} has requested vendor documents from ${vendor.company_name}.`,
          'Open your vendor portal to see the checklist and upload each document.',
          '',
          `This invitation expires ${invitation.expires_at.slice(0, 10)}.`,
          '',
          'Simulated message. No email was sent by this prototype.',
        ].join('\n'),
        items: requirements
          .filter((requirement) => requirement.required && requirement.retired_at === null)
          .map((requirement) => ({
            requirement_id: requirement.id,
            requirement_title: requirement.title,
            milestone_key: 'invitation',
            detail: 'Requested with the invitation.',
            submission_version: null,
          })),
        status: 'simulated_sent',
        idempotency_key: invitationIdempotencyKey(ctx.organizationId, invitation.id),
        attempt_count: 1,
        next_attempt_at: null,
        sent_at: timestamp,
        last_error: null,
        manual: true,
        created_at: timestamp,
      }
      await uow.notifications.put(notification)

      await recordActivity(uow, ctx, {
        vendor_id: vendor.id,
        event_type: 'invitation_sent',
        target_id: invitation.id,
        summary: `Simulated invitation sent to ${vendor.contact_email}`,
        metadata: { recipient: vendor.contact_email, simulated: true, expires_at: invitation.expires_at },
        vendor_visible: true,
      })

      return { invitation_id: invitation.id }
    }),
  )
  return { invitation_id: result.value.invitation_id, replayed: result.replayed }
}

export async function revokeInvitation(ctx: ServiceContext, invitationId: UUID): Promise<void> {
  requireCapability(ctx, 'invitation.send')
  await ctx.db.write(async (uow) => {
    const invitation = await uow.invitations.get(invitationId)
    if (!invitation) throw notFound('That invitation no longer exists.')
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
