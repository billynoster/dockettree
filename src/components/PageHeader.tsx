import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  to: string
}

/**
 * The top of every screen. A detail page gets a back link rather than a full breadcrumb trail:
 * the hierarchy here is only ever two levels deep, and one clear return path beats a chain of
 * small targets, especially at 390px.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  back,
  className,
  compact = false,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Status chips shown under the title. */
  meta?: React.ReactNode
  back?: Crumb
  className?: string
  /**
   * Workspace screens: one-line meta description and tighter title/actions row so the primary
   * list or split pane starts higher on a laptop viewport.
   */
  compact?: boolean
}) {
  return (
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-2', className)}>
      {back ? (
        <Link
          to={back.to}
          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-(--duration-quick) hover:text-clay-text"
        >
          <ChevronLeft aria-hidden="true" className="size-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-start sm:justify-between',
          compact ? 'gap-2 sm:gap-4' : 'gap-2.5 sm:gap-5',
        )}
      >
        <div className={cn('min-w-0', compact ? 'space-y-0.5' : 'space-y-1')}>
          <h1 className="type-display">{title}</h1>
          {description ? (
            <p
              className={cn(
                'max-w-3xl text-muted-foreground',
                compact ? 'type-meta line-clamp-2 sm:line-clamp-1' : 'type-body',
              )}
            >
              {description}
            </p>
          ) : null}
          {meta ? <div className="flex flex-wrap items-center gap-2 pt-0.5">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
