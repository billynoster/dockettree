/**
 * Reusable readiness callout: Ready to work / N items need attention + next action.
 * Presentation only — readiness math stays in domain/readiness.
 */
import { ArrowRight, CheckCircle2, CircleAlert, ClipboardList, Clock3 } from 'lucide-react'
import { Link } from 'react-router'
import { RequirementMeter } from '@/components/Metrics'
import { READINESS_TONE, ExpiringSoonChip, ReadinessChip } from '@/components/StatusChips'
import { TONE_SOLID } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/domain/dates'
import { READINESS_EXPLANATION, type VendorReadiness } from '@/domain/readiness'
import { cn } from '@/lib/utils'

export function attentionItemCount(readiness: VendorReadiness): number {
  if (readiness.status === 'ready') return readiness.expiringSoon ? 1 : 0
  if (readiness.status === 'unconfigured') return 1
  if (readiness.blockers.length > 0) return readiness.blockers.length
  return Math.max(0, readiness.requiredTotal - readiness.requiredSatisfied)
}

export function readinessSummaryTitle(readiness: VendorReadiness): string {
  if (readiness.status === 'ready' && !readiness.expiringSoon) return 'Ready to work'
  if (readiness.status === 'ready' && readiness.expiringSoon) return 'Ready — one item is expiring soon'
  if (readiness.status === 'unconfigured') return 'Not started yet'
  if (readiness.status === 'archived') return 'Archived'
  const n = attentionItemCount(readiness)
  if (n === 1) return '1 item needs attention'
  return `${n} items need attention`
}

export function readinessNextAction(readiness: VendorReadiness): {
  label: string
  hint: string
  href?: string
} {
  if (readiness.status === 'archived') {
    return {
      label: 'Restore to bring this vendor back into active readiness',
      hint: 'Archived vendors stay out of dashboard counts and reminders.',
    }
  }
  if (readiness.status === 'unconfigured') {
    return {
      label: 'Assign a document checklist',
      hint: 'Requirements must be assigned before readiness can be measured.',
    }
  }
  if (readiness.status === 'awaiting_review') {
    return {
      label: 'Review pending submissions',
      hint: 'Documents are waiting for a decision before work can move forward.',
      href: '/review',
    }
  }
  if (readiness.status === 'ready') {
    if (readiness.expiringSoon && readiness.nextExpiration) {
      return {
        label: 'Request an updated document',
        hint: `Next expiration ${formatDate(readiness.nextExpiration)}.`,
      }
    }
    return {
      label: 'Nothing needed right now',
      hint: 'Everything currently required is in place.',
    }
  }
  const top = readiness.blockers[0]
  return {
    label: top ? top.label : 'Request missing documents',
    hint: 'Clear what’s missing or expired so this vendor can work.',
  }
}

export function ReadinessSummary({
  readiness,
  action,
  className,
  compact = false,
}: {
  readiness: VendorReadiness
  /** Optional primary control (invite, request documents, assign checklist). */
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  const title = readinessSummaryTitle(readiness)
  const next = readinessNextAction(readiness)
  const ready = readiness.status === 'ready' && !readiness.expiringSoon
  const accentTone =
    readiness.status === 'ready' && readiness.expiringSoon
      ? 'warn'
      : READINESS_TONE[readiness.status]
  const Icon = ready
    ? CheckCircle2
    : readiness.status === 'awaiting_review'
      ? Clock3
      : readiness.status === 'unconfigured'
        ? ClipboardList
        : CircleAlert

  return (
    <section
      aria-labelledby="readiness-summary-title"
      className={cn('surface relative overflow-hidden pl-1', className)}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONE_SOLID[accentTone])} />
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
          compact ? 'p-4' : 'p-4 sm:p-5',
        )}
      >
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-[10px] border bg-card',
                ready && 'tone-ok',
                readiness.status === 'awaiting_review' && 'tone-info',
                (readiness.status === 'not_ready' ||
                  readiness.status === 'unconfigured' ||
                  (readiness.status === 'ready' && readiness.expiringSoon)) &&
                  'tone-warn',
                readiness.status === 'archived' && 'tone-neutral',
              )}
            >
              <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="readiness-summary-title" className="type-title text-foreground">
                  {title}
                </h2>
                <ReadinessChip status={readiness.status} size="sm" />
                {readiness.expiringSoon ? (
                  <ExpiringSoonChip nextExpiration={readiness.nextExpiration} size="sm" />
                ) : null}
              </div>
              <p className="type-meta max-w-prose text-muted-foreground">
                {READINESS_EXPLANATION[readiness.status]}
              </p>
            </div>
          </div>

          {readiness.status !== 'unconfigured' && readiness.status !== 'archived' ? (
            <div className="flex flex-wrap items-center gap-3 text-foreground">
              <RequirementMeter
                satisfied={readiness.requiredSatisfied}
                total={readiness.requiredTotal}
              />
              <span className="text-sm text-muted-foreground">required items in place</span>
            </div>
          ) : null}

          {readiness.blockers.length > 0 ? (
            <ul className="space-y-1.5">
              {readiness.blockers.slice(0, 4).map((blocker) => (
                <li
                  key={blocker.requirement_id}
                  className="flex gap-2 text-sm text-foreground"
                >
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-tone-warn"
                  />
                  <span>{blocker.label}</span>
                </li>
              ))}
              {readiness.blockers.length > 4 ? (
                <li className="pl-5 text-sm text-muted-foreground">
                  +{readiness.blockers.length - 4} more
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="rounded-[12px] border border-border bg-card px-3 py-2.5 text-foreground">
            <p className="type-eyebrow">Next</p>
            <p className="mt-0.5 text-sm font-medium">{next.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{next.hint}</p>
            {next.href ? (
              <Button asChild variant="ghost" size="sm" className="-ml-2.5 mt-1.5">
                <Link to={next.href}>
                  Open review queue
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </section>
  )
}
