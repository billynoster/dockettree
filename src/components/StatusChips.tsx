/**
 * Status chips: the product's vocabulary of states, each mapped once to a tone and an icon.
 *
 * `StatusChip` is the central API matching the Ready Vendors UI spec statuses. Domain helpers
 * (`ReadinessChip`, etc.) map calculated states onto that API so screens never pick tones themselves.
 */
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleHelp,
  Clock3,
  FileX2,
  Hourglass,
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

/** Spec statuses for brand display (docs/ready-vendors-ui-spec.md StatusChip). */
export type StatusChipStatus =
  | 'ready'
  | 'needs-action'
  | 'in-review'
  | 'waiting'
  | 'expiring'
  | 'critical'
  | 'not-started'

const STATUS_CHIP: Record<
  StatusChipStatus,
  { label: string; tone: ChipTone; icon: LucideIcon }
> = {
  ready: { label: 'Ready', tone: 'ok', icon: CheckCircle2 },
  'needs-action': { label: 'Needs Action', tone: 'warn', icon: CircleAlert },
  'in-review': { label: 'In Review', tone: 'info', icon: Clock3 },
  waiting: { label: 'Waiting on Vendor', tone: 'waiting', icon: Hourglass },
  expiring: { label: 'Expiring Soon', tone: 'warn', icon: CalendarClock },
  critical: { label: 'Critical', tone: 'danger', icon: CircleAlert },
  'not-started': { label: 'Not Started', tone: 'neutral', icon: CircleDashed },
}

/**
 * Central status chip. Always text + icon + tinted surface — never colour alone.
 * Example: ✓ Ready (CheckCircle2 + “Ready” on Soft Teal).
 */
export function StatusChip({
  status,
  size,
  className,
  label,
}: {
  status: StatusChipStatus
  size?: 'sm' | 'default'
  className?: string
  /** Override the default brand label when a surface needs more context. */
  label?: string
}) {
  const meta = STATUS_CHIP[status]
  return (
    <Chip tone={meta.tone} icon={meta.icon} size={size} className={className}>
      {label ?? meta.label}
    </Chip>
  )
}

export function statusChipTone(status: StatusChipStatus): ChipTone {
  return STATUS_CHIP[status].tone
}

/** Map domain readiness → spec StatusChip status (presentation only; math unchanged). */
export const READINESS_STATUS_CHIP: Record<ReadinessStatus, StatusChipStatus | null> = {
  ready: 'ready',
  awaiting_review: 'in-review',
  not_ready: 'needs-action',
  unconfigured: 'not-started',
  archived: null,
}

/** Needs Action uses amber (warn), not coral — reserve danger for expired / critical only. */
export const READINESS_TONE: Record<ReadinessStatus, ChipTone> = {
  ready: 'ok',
  awaiting_review: 'info',
  not_ready: 'warn',
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
  const mapped = READINESS_STATUS_CHIP[status]
  if (mapped) {
    return (
      <StatusChip
        status={mapped}
        size={size}
        className={className}
        label={READINESS_LABEL[status]}
      />
    )
  }
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
    <StatusChip
      status="expiring"
      size={size}
      label={
        nextExpiration
          ? `Expiring Soon · ${formatDate(nextExpiration)}`
          : undefined
      }
    />
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
  if (status === 'expiring_soon') {
    return <StatusChip status="expiring" />
  }
  if (status === 'expired') {
    return <StatusChip status="critical" label={CURRENT_DOCUMENT_LABEL[status]} />
  }
  if (status === 'accepted') {
    return <StatusChip status="ready" label={CURRENT_DOCUMENT_LABEL[status]} />
  }
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
  if (state === 'pending_review') {
    return <StatusChip status="in-review" size={size} label={SUBMISSION_STATE_LABEL[state]} />
  }
  if (state === 'accepted') {
    return <StatusChip status="ready" size={size} label={SUBMISSION_STATE_LABEL[state]} />
  }
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
  if (status === 'invited') {
    return <StatusChip status="waiting" label={INVITATION_LABEL[status]} />
  }
  if (status === 'accepted') {
    return <StatusChip status="ready" label={INVITATION_LABEL[status]} />
  }
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
