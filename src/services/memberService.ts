/**
 * Internal member administration (requirements section 3: "Manage internal members and
 * settings" is admin-only). Password hashing is injected so the domain layer stays free of
 * crypto details.
 */
import { conflict, forbidden, notFound, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import type { InternalRole, Membership, User, UUID } from '@/domain/types'
import { isSyntacticallyValidEmail } from '@/domain/validation'
import type { UnitOfWork } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'

export interface MemberRow {
  user: User
  membership: Membership
  /** True when the account has never signed in and still needs its first password. */
  awaitingFirstPassword: boolean
}

export async function listMembers(ctx: ServiceContext): Promise<MemberRow[]> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const memberships = await uow.memberships.where('by_organization', ctx.organizationId)
    const rows: MemberRow[] = []
    for (const membership of memberships) {
      const user = await uow.users.get(membership.user_id)
      if (!user) continue
      rows.push({ user, membership, awaitingFirstPassword: user.password_hash === null })
    }
    return rows.sort((a, b) => a.user.display_name.localeCompare(b.user.display_name))
  })
}

export interface AddMemberInput {
  display_name: string
  email: string
  role: InternalRole
  password: string
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  assertPolicy(password: string, field?: string): void
}

export async function addMember(
  ctx: ServiceContext,
  hasher: PasswordHasher,
  input: AddMemberInput,
): Promise<MemberRow> {
  requireCapability(ctx, 'settings.manage')
  const email = input.email.trim().toLowerCase()
  const displayName = input.display_name.trim()
  const fieldErrors: Record<string, string> = {}
  if (displayName.length < 2) fieldErrors.display_name = 'Enter the person’s name.'
  if (!isSyntacticallyValidEmail(email)) fieldErrors.email = 'Enter a valid email address.'
  if (Object.keys(fieldErrors).length > 0) throw validationError('Fix the highlighted fields.', fieldErrors)
  hasher.assertPolicy(input.password)
  const passwordHash = await hasher.hash(input.password)

  return await ctx.db.write(async (uow) => {
    const existing = (await uow.users.where('by_email', email))[0]
    if (existing) {
      const memberships = await uow.memberships.where('by_user', existing.id)
      if (memberships.some((membership) => membership.organization_id === ctx.organizationId)) {
        throw conflict('Someone with that email is already a member of this organization.')
      }
      throw conflict('That email already belongs to another account on this server.')
    }
    const timestamp = nowIso(ctx)
    const user: User = {
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
    const membership: Membership = {
      id: newId(),
      organization_id: ctx.organizationId,
      user_id: user.id,
      role: input.role,
    }
    await uow.users.put(user)
    await uow.memberships.put(membership)
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'member_added',
      target_id: user.id,
      summary: `Added ${user.display_name} as ${input.role}`,
      metadata: { email: user.email, role: input.role },
    })
    return { user, membership, awaitingFirstPassword: false }
  })
}

async function assertRemainingAdmin(
  ctx: ServiceContext,
  uow: UnitOfWork,
  changingUserId: UUID,
): Promise<void> {
  const memberships = await uow.memberships.where('by_organization', ctx.organizationId)
  const otherAdmins: string[] = []
  for (const membership of memberships) {
    if (membership.role !== 'admin' || membership.user_id === changingUserId) continue
    const user = await uow.users.get(membership.user_id)
    if (user && user.status === 'active') otherAdmins.push(user.id)
  }
  if (otherAdmins.length === 0) {
    throw conflict('This organization must keep at least one active admin.')
  }
}

export async function changeMemberRole(
  ctx: ServiceContext,
  userId: UUID,
  role: InternalRole,
): Promise<void> {
  requireCapability(ctx, 'settings.manage')
  await ctx.db.write(async (uow) => {
    const memberships = await uow.memberships.where('by_user', userId)
    const membership = memberships.find((entry) => entry.organization_id === ctx.organizationId)
    if (!membership) throw notFound('That member is not part of this organization.')
    if (membership.role === role) return
    if (membership.role === 'admin') await assertRemainingAdmin(ctx, uow, userId)
    const user = await uow.users.get(userId)
    await uow.memberships.put({ ...membership, role })
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'member_updated',
      target_id: userId,
      summary: `Changed ${user?.display_name ?? 'a member'} to ${role}`,
      metadata: { role },
    })
  })
}

export async function setMemberStatus(
  ctx: ServiceContext,
  userId: UUID,
  status: 'active' | 'disabled',
): Promise<void> {
  requireCapability(ctx, 'settings.manage')
  if (status === 'disabled' && userId === ctx.session.userId) {
    throw forbidden('You cannot disable your own account.')
  }
  await ctx.db.write(async (uow) => {
    const user = await uow.users.get(userId)
    if (!user) throw notFound('That member no longer exists.')
    const memberships = await uow.memberships.where('by_user', userId)
    const membership = memberships.find((entry) => entry.organization_id === ctx.organizationId)
    if (!membership) throw notFound('That member is not part of this organization.')
    if (status === 'disabled' && membership.role === 'admin') {
      await assertRemainingAdmin(ctx, uow, userId)
    }
    await uow.users.put({ ...user, status })
    if (status === 'disabled') {
      const sessions = await uow.sessions.where('by_user', userId)
      for (const session of sessions) {
        if (!session.revoked_at) await uow.sessions.put({ ...session, revoked_at: nowIso(ctx) })
      }
    }
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: status === 'disabled' ? 'member_removed' : 'member_updated',
      target_id: userId,
      summary:
        status === 'disabled'
          ? `Disabled ${user.display_name} and signed out their sessions`
          : `Re-enabled ${user.display_name}`,
      metadata: { status },
    })
  })
}

/** Admin-assisted password reset: sets a new password and signs the account out everywhere. */
export async function resetMemberPassword(
  ctx: ServiceContext,
  hasher: PasswordHasher,
  userId: UUID,
  password: string,
): Promise<void> {
  requireCapability(ctx, 'settings.manage')
  hasher.assertPolicy(password)
  const passwordHash = await hasher.hash(password)
  await ctx.db.write(async (uow) => {
    const user = await uow.users.get(userId)
    if (!user) throw notFound('That member no longer exists.')
    const timestamp = nowIso(ctx)
    await uow.users.put({ ...user, password_hash: passwordHash, password_updated_at: timestamp })
    const sessions = await uow.sessions.where('by_user', userId)
    for (const session of sessions) {
      if (!session.revoked_at) await uow.sessions.put({ ...session, revoked_at: timestamp })
    }
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'member_updated',
      target_id: userId,
      summary: `Reset the password for ${user.display_name}`,
    })
  })
}

/** Self-service change for the signed-in account. */
export async function changeOwnPassword(
  ctx: ServiceContext,
  hasher: PasswordHasher,
  verify: (password: string, hash: string | null) => Promise<boolean>,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  hasher.assertPolicy(input.newPassword, 'newPassword')
  const user = await ctx.db.read((uow) => uow.users.get(ctx.session.userId))
  if (!user) throw notFound('That account no longer exists.')
  if (!(await verify(input.currentPassword, user.password_hash))) {
    throw validationError('That current password is not correct.', {
      currentPassword: 'Check your current password.',
    })
  }
  const passwordHash = await hasher.hash(input.newPassword)
  await ctx.db.write(async (uow) => {
    const timestamp = nowIso(ctx)
    await uow.users.put({ ...user, password_hash: passwordHash, password_updated_at: timestamp })
    const sessions = await uow.sessions.where('by_user', user.id)
    for (const session of sessions) {
      if (session.id === ctx.session.sessionId || session.revoked_at) continue
      await uow.sessions.put({ ...session, revoked_at: timestamp })
    }
  })
}
