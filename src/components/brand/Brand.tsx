import { cn } from '@/lib/utils'

/** Canonical Docket Tree brand lines from the kit. */
export const BRAND_NAME = 'Docket Tree'
export const BRAND_TAGLINE = 'Everything Connected. Nothing Lost.'

const MARK_SRC = '/brand/logo-mark.png'
const HORIZONTAL_SRC = '/brand/logo-horizontal.png'
const STACKED_SRC = '/brand/logo-stacked.png'
const STACKED_MONO_SRC = '/brand/logo-stacked-mono.png'

/** D + leaves mark — favicon / collapsed nav / compact chrome. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={MARK_SRC}
      alt=""
      width={32}
      height={32}
      decoding="async"
      className={cn('size-8 shrink-0 object-contain', className)}
      aria-hidden="true"
    />
  )
}

/** Horizontal lockup (mark + wordmark + tagline). Best for wide headers. */
export function BrandLockupHorizontal({
  className,
  mono = false,
}: {
  className?: string
  /** Dark mono asset for light surfaces when color lockup is too busy. */
  mono?: boolean
}) {
  return (
    <img
      src={mono ? STACKED_MONO_SRC : HORIZONTAL_SRC}
      alt={BRAND_NAME}
      width={220}
      height={65}
      decoding="async"
      className={cn('h-9 w-auto max-w-full object-contain object-left', className)}
    />
  )
}

/** Stacked lockup (mark above wordmark + tagline). Auth / marketing moments. */
export function BrandLockupStacked({ className }: { className?: string }) {
  return (
    <img
      src={STACKED_SRC}
      alt={BRAND_NAME}
      width={180}
      height={178}
      decoding="async"
      className={cn('h-auto w-44 max-w-full object-contain', className)}
    />
  )
}

/**
 * Compact product chrome: mark + Manrope wordmark (no tagline).
 * Org subtitle is optional for the sidebar.
 */
export function BrandWordmark({
  className,
  subtitle,
  markClassName,
}: {
  className?: string
  subtitle?: string
  markClassName?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark className={markClassName} />
      <span className="min-w-0">
        <span className="block truncate font-display text-sm leading-tight font-semibold tracking-tight text-foreground">
          {BRAND_NAME}
        </span>
        {subtitle ? (
          <span className="block truncate text-xs leading-tight text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  )
}
