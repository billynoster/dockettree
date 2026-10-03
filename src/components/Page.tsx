/**
 * Page template. Every screen is a `Page` holding a `PageHeader` and a stack of `Section`s, so the
 * vertical rhythm and the arrival animation are defined once instead of at each route.
 *
 * `density="workspace"` tightens gaps for list/queue screens that keep filters and the first rows
 * above the fold; the default keeps a little more air for reading-heavy forms.
 */
import { cn } from '@/lib/utils'

export function Page({
  children,
  className,
  width = 'full',
  density = 'default',
}: {
  children: React.ReactNode
  className?: string
  /** `reading` caps the measure for form-heavy screens such as Settings and Add vendor. */
  width?: 'full' | 'reading'
  density?: 'default' | 'workspace'
}) {
  return (
    <div
      className={cn(
        'animate-rise',
        density === 'workspace' ? 'space-y-3' : 'space-y-3 lg:space-y-4',
        width === 'reading' && 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
