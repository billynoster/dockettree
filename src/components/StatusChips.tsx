/**
 * Semantic status chips: colour plus an icon plus text, so status never depends on colour
 * alone (requirements section 6 accessibility acceptance criteria).
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

const base =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'

const READINESS_STYLE: Record<ReadinessStatus, string> = {
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  awaiting_review: 'border-sky-200 bg-sky-50 text-sky-800',
  not_ready: 'border-rose-200 bg-rose-50 text-rose-800',
  unconfigured: 'border-slate-200 bg-slate-100 text-slate-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-600',
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
  className,
}: {
  status: ReadinessStatus
  className?: string
}) {
  const Icon = READINESS_ICON[status]
  return (
    <span className={cn(base, READINESS_STYLE[status], className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {READINESS_LABEL[status]}
    </span>
  )
}

export function ExpiringSoonChip({ nextExpiration }: { nextExpiration?: string | null }) {
  return (
    <span className={cn(base, 'border-amber-300 bg-amber-50 text-amber-900')}>
      <CalendarClock aria-hidden="true" className="size-3.5" />
      Expiring soon
      {nextExpiration ? <span className="font-normal">· {formatDate(nextExpiration)}</span> : null}
    </span>
  )
}

const DOCUMENT_STYLE: Record<CurrentDocumentStatus, string> = {
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  expiring_soon: 'border-amber-300 bg-amber-50 text-amber-900',
  expired: 'border-rose-200 bg-rose-50 text-rose-800',
  none: 'border-slate-200 bg-slate-100 text-slate-700',
}

const DOCUMENT_ICON: Record<CurrentDocumentStatus, typeof CheckCircle2> = {
  accepted: CheckCircle2,
  expiring_soon: CalendarClock,
  expired: CircleAlert,
  none: FileX2,
}

export function CurrentDocumentChip({ status }: { status: CurrentDocumentStatus }) {
  const Icon = DOCUMENT_ICON[status]
  return (
    <span className={cn(base, DOCUMENT_STYLE[status])}>
      <Icon aria-hidden="true" className="size-3.5" />
      {CURRENT_DOCUMENT_LABEL[status]}
    </span>
  )
}

const SUBMISSION_STYLE: Record<SubmissionState, string> = {
  pending_review: 'border-sky-200 bg-sky-50 text-sky-800',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  changes_requested: 'border-rose-200 bg-rose-50 text-rose-800',
  withdrawn: 'border-slate-200 bg-slate-100 text-slate-700',
  superseded: 'border-slate-200 bg-slate-100 text-slate-700',
  revoked: 'border-rose-200 bg-rose-50 text-rose-800',
}

export function SubmissionStateChip({ state }: { state: SubmissionState }) {
  return (
    <span className={cn(base, SUBMISSION_STYLE[state])}>
      {SUBMISSION_STATE_LABEL[state]}
    </span>
  )
}

const INVITATION_STYLE: Record<InvitationStatus, string> = {
  not_invited: 'border-slate-200 bg-slate-100 text-slate-700',
  invited: 'border-sky-200 bg-sky-50 text-sky-800',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  expired: 'border-amber-300 bg-amber-50 text-amber-900',
  revoked: 'border-slate-200 bg-slate-100 text-slate-700',
}

const INVITATION_ICON: Record<InvitationStatus, typeof MailCheck> = {
  not_invited: MailX,
  invited: Send,
  accepted: MailCheck,
  expired: MailWarning,
  revoked: MailX,
}

export function InvitationChip({ status }: { status: InvitationStatus }) {
  const Icon = INVITATION_ICON[status]
  return (
    <span className={cn(base, INVITATION_STYLE[status])}>
      <Icon aria-hidden="true" className="size-3.5" />
      {INVITATION_LABEL[status]}
    </span>
  )
}

