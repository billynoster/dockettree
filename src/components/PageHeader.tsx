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
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Status chips shown under the title. */
  meta?: React.ReactNode
  back?: Crumb
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {back ? (
        <Link
          to={back.to}
          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[1.375rem] leading-tight font-semibold text-balance sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
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
