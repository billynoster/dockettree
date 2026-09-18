/** Organization settings and demo session state (requirements section 6 `/settings`, FR-14). */
import { notFound, validationError } from '@/domain/errors'
import type { DemoState, Membership, Organization, User, UUID } from '@/domain/types'
import { fieldErrorsFrom, organizationSettingsSchema } from '@/domain/validation'
import type { Database } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'

export async function getOrganization(db: Database, organizationId: UUID): Promise<Organization | undefined> {
  return await db.read((uow) => uow.organizations.get(organizationId))
}

export async function getDemoState(db: Database): Promise<DemoState | undefined> {
  return await db.read((uow) => uow.demoState.get('demo_state'))
}

export async function saveDemoState(db: Database, state: DemoState): Promise<void> {
  await db.write((uow) => uow.demoState.put(state))
}

export interface OrganizationMember {
  user: User
  membership: Membership
}

export async function listMembers(ctx: ServiceContext): Promise<OrganizationMember[]> {
  return await ctx.db.read(async (uow) => {
    const memberships = (await uow.memberships.getAll()).filter(
      (membership) => membership.organization_id === ctx.organizationId,
    )
    const users = await uow.users.getAll()
    const userById = new Map(users.map((user) => [user.id, user]))
    return memberships
      .map((membership) => ({ membership, user: userById.get(membership.user_id) }))
      .filter((entry): entry is OrganizationMember => entry.user !== undefined)
      .sort((a, b) => a.user.display_name.localeCompare(b.user.display_name))
  })
}

export interface OrganizationSettingsInput {
  name: string
  timezone: string
  support_email: string
  support_contact_name: string
  expectedVersion: number
}

export async function updateOrganizationSettings(
  ctx: ServiceContext,
  input: OrganizationSettingsInput,
): Promise<Organization> {
  requireCapability(ctx, 'settings.manage')
  const parsed = organizationSettingsSchema.safeParse(input)
  if (!parsed.success) {
    throw validationError('Fix the highlighted fields.', fieldErrorsFrom(parsed.error))
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: parsed.data.timezone })
  } catch {
    throw validationError('That timezone is not recognized.', {
      timezone: 'Choose a valid IANA timezone, for example America/Chicago.',
    })
  }

  return await ctx.db.write(async (uow) => {
    const organization = await uow.organizations.get(ctx.organizationId)
    if (!organization) throw notFound('The organization record is missing.')
    const changed: string[] = []
    if (organization.name !== parsed.data.name) changed.push('name')
    if (organization.timezone !== parsed.data.timezone) changed.push('timezone')
    if (organization.support_email !== parsed.data.support_email) changed.push('support email')
    if (organization.support_contact_name !== parsed.data.support_contact_name) {
      changed.push('support contact')
    }
    const updated: Organization = {
      ...organization,
      ...parsed.data,
      updated_at: nowIso(ctx),
      record_version: organization.record_version + 1,
    }
    await uow.organizations.put(updated)
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'settings_updated',
      target_id: organization.id,
      summary:
        changed.length > 0
          ? `Updated organization settings: ${changed.join(', ')}`
          : 'Saved organization settings with no changes',
      metadata: { timezone: updated.timezone },
    })
    return updated
  })
}
