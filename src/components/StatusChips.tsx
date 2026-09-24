/**
 * Semantic status chips: colour plus an icon plus text, so status never depends on colour
 * alone (requirements section 6 accessibility acceptance criteria).
 *
 * Colour comes from the `tone-*` token classes rather than literal palette utilities, so the
 * whole product recolours from one place and every tone keeps its checked text contrast.
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/domain/dates'
import { CURRENT_DOCUMENT_LABEL, READINESS_LABEL, SUBMISSION_STATE_LABEL } from '@/domain/readiness'
import type { CurrentDocumentStatus, ReadinessStatus, SubmissionState } from '@/domain/types'
import { INVITATION_LABEL, type InvitationStatus } from '@/domain/invitations'

export type ChipTone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral' | 'brand'

const TONE_CLASS: Record<ChipTone, string> = {
  ok: 'tone-ok',
  info: 'tone-info',
  warn: 'tone-warn',
  danger: 'tone-danger',
  neutral: 'tone-neutral',
  brand: 'tone-brand',
}

/** Shared chip shell. `sm` is for dense table cells, `default` for headers and detail pages. */
export function Chip({
  tone,
  icon: Icon,
  children,
  size = 'default',
  className,
}: {
  tone: ChipTone
  icon?: typeof CheckCircle2
  children: React.ReactNode
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-px text-[0.6875rem]' : 'px-2 py-0.5 text-xs',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden="true" className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      ) : null}
      {children}
    </span>
  )
}

const READINESS_TONE: Record<ReadinessStatus, ChipTone> = {
  ready: 'ok',
  awaiting_review: 'info',
  not_ready: 'danger',
  unconfigured: 'neutral',
  archived: 'neutral',
}

const READINESS_ICON: Record<ReadinessStatus, typeof CheckCircle2> = {
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

const DOCUMENT_ICON: Record<CurrentDocumentStatus, typeof CheckCircle2> = {
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

const SUBMISSION_TONE: Record<SubmissionState, ChipTone> = {
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

const INVITATION_ICON: Record<InvitationStatus, typeof MailCheck> = {
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
