/**
 * Status chips: the product's vocabulary of states, each mapped once to a tone and an icon.
 *
 * These are molecules over the `Chip` atom. A screen never picks a tone for a domain state itself,
 * so "Not ready" is the same colour and the same icon on every surface.
 */
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock3,
  FileX2,
  MailCheck,
  MailWarning,
  MailX,
  Send,
  type LucideIcon,
} from 'lucide-react'
import { Chip, ToneDot, type ChipTone } from '@/components/ui/chip'
import { formatDate } from '@/domain/dates'
import { CURRENT_DOCUMENT_LABEL, READINESS_LABEL, SUBMISSION_STATE_LABEL } from '@/domain/readiness'
import type { CurrentDocumentStatus, ReadinessStatus, SubmissionState } from '@/domain/types'
import { INVITATION_LABEL, type InvitationStatus } from '@/domain/invitations'

export { Chip, ToneDot, type ChipTone }

export const READINESS_TONE: Record<ReadinessStatus, ChipTone> = {
  ready: 'ok',
  awaiting_review: 'info',
  not_ready: 'danger',
  unconfigured: 'neutral',
  archived: 'neutral',
}

const READINESS_ICON: Record<ReadinessStatus, LucideIcon> = {
  ready: CheckCircle2,
  awaiting_review: Clock3,
  not_ready: CircleAlert,
  unconfigured: CircleHelp,
  archived: Archive,
}

export function ReadinessChip({
  status,
  size,
  className,
}: {
  status: ReadinessStatus
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <Chip tone={READINESS_TONE[status]} icon={READINESS_ICON[status]} size={size} className={className}>
      {READINESS_LABEL[status]}
    </Chip>
  )
}

export function ExpiringSoonChip({
  nextExpiration,
  size,
}: {
  nextExpiration?: string | null
  size?: 'sm' | 'default'
}) {
  return (
    <Chip tone="warn" icon={CalendarClock} size={size}>
      Expiring soon
      {nextExpiration ? <span className="font-normal">· {formatDate(nextExpiration)}</span> : null}
    </Chip>
  )
}

const DOCUMENT_TONE: Record<CurrentDocumentStatus, ChipTone> = {
  accepted: 'ok',
  expiring_soon: 'warn',
  expired: 'danger',
  none: 'neutral',
}

const DOCUMENT_ICON: Record<CurrentDocumentStatus, LucideIcon> = {
  accepted: CheckCircle2,
  expiring_soon: CalendarClock,
  expired: CircleAlert,
  none: FileX2,
}

export function CurrentDocumentChip({ status }: { status: CurrentDocumentStatus }) {
  return (
    <Chip tone={DOCUMENT_TONE[status]} icon={DOCUMENT_ICON[status]}>
      {CURRENT_DOCUMENT_LABEL[status]}
    </Chip>
  )
}

export const SUBMISSION_TONE: Record<SubmissionState, ChipTone> = {
  pending_review: 'info',
  accepted: 'ok',
  changes_requested: 'danger',
  withdrawn: 'neutral',
  superseded: 'neutral',
  revoked: 'danger',
}

export function SubmissionStateChip({
  state,
  size,
}: {
  state: SubmissionState
  size?: 'sm' | 'default'
}) {
  return (
    <Chip tone={SUBMISSION_TONE[state]} size={size}>
      {SUBMISSION_STATE_LABEL[state]}
    </Chip>
  )
}

const INVITATION_TONE: Record<InvitationStatus, ChipTone> = {
  not_invited: 'neutral',
  invited: 'info',
  accepted: 'ok',
  expired: 'warn',
  revoked: 'neutral',
}

const INVITATION_ICON: Record<InvitationStatus, LucideIcon> = {
  not_invited: MailX,
  invited: Send,
  accepted: MailCheck,
  expired: MailWarning,
  revoked: MailX,
}

export function InvitationChip({ status }: { status: InvitationStatus }) {
  return (
    <Chip tone={INVITATION_TONE[status]} icon={INVITATION_ICON[status]}>
      {INVITATION_LABEL[status]}
    </Chip>
  )
}

/** Required / Optional on a requirement or template item. */
export function RequiredChip({ required, size = 'sm' }: { required: boolean; size?: 'sm' | 'default' }) {
  return (
    <Chip tone={required ? 'brand' : 'neutral'} size={size}>
      {required ? 'Required' : 'Optional'}
    </Chip>
  )
}
