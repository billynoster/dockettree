/**
 * Viewport-aware scroll containers for list/detail screens. The page chrome stays put; only the
 * overflowing list scrolls, so status, filters and the first rows stay above the fold on a laptop.
 */
import { cn } from '@/lib/utils'

/** Remaining viewport after the sticky app header and typical page chrome (title + toolbar). */
const LIST_MAX =
  'max-h-[min(36rem,calc(100dvh-var(--header-height)-10.5rem))] lg:max-h-[calc(100dvh-var(--header-height)-10.5rem)]'

/** Shorter panel for a column beside other above-the-fold content (overview split). */
const PANEL_MAX =
  'max-h-[min(22rem,calc(100dvh-var(--header-height)-14rem))] lg:max-h-[calc(100dvh-var(--header-height)-12.5rem)]'

export function ScrollRegion({
  children,
  className,
  size = 'list',
  label,
}: {
  children: React.ReactNode
  className?: string
  size?: 'list' | 'panel'
  /** Accessible name when the region is a landmark-style scroll box. */
  label?: string
}) {
  return (
    <div
      role={label ? 'region' : undefined}
      aria-label={label}
      tabIndex={label ? 0 : undefined}
      className={cn(
        'min-h-0 overflow-y-auto overscroll-contain',
        size === 'list' ? LIST_MAX : PANEL_MAX,
        className,
      )}
    >
      {children}
    </div>
  )
}
