/**
 * Page template. Every screen is a `Page` holding a `PageHeader` and a stack of `Section`s, so the
 * vertical rhythm and the arrival animation are defined once instead of at each route.
 */
import { cn } from '@/lib/utils'

export function Page({
  children,
  className,
  width = 'full',
}: {
  children: React.ReactNode
  className?: string
  /** `reading` caps the measure for form-heavy screens such as Settings and Add vendor. */
  width?: 'full' | 'reading'
}) {
  return (
    <div
      className={cn(
        'animate-rise space-y-4 lg:space-y-5',
        width === 'reading' && 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
