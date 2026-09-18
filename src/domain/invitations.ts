/** Invitation state shown on the vendor header badge, derived from stored invitations. */
import type { Invitation } from './types'

export type InvitationStatus = 'not_invited' | 'invited' | 'accepted' | 'expired' | 'revoked'

function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function invitationStatus(
  invitations: Invitation[],
  nowInstant: string,
): { status: InvitationStatus; invitation: Invitation | null } {
  const latest = sortByCreatedAtDesc(invitations)[0] ?? null
  if (!latest) return { status: 'not_invited', invitation: null }
  if (latest.revoked_at) return { status: 'revoked', invitation: latest }
  if (latest.redeemed_at) return { status: 'accepted', invitation: latest }
  if (latest.expires_at < nowInstant) return { status: 'expired', invitation: latest }
  return { status: 'invited', invitation: latest }
}

export const INVITATION_LABEL: Record<InvitationStatus, string> = {
  not_invited: 'Not invited',
  invited: 'Invitation sent',
  accepted: 'Invitation accepted',
  expired: 'Invitation expired',
  revoked: 'Invitation revoked',
}
