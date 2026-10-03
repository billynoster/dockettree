import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Tone atom. Every coloured label in the product is a Chip, so a status can only be recoloured by
 * changing a token. A chip always carries text, and almost always an icon, because status must
 * never depend on colour alone (requirements section 6).
 *
 * `waiting` is the Sky / Waiting on Vendor tone from the Docket Tree UI spec.
 */
export type ChipTone = 'ok' | 'info' | 'waiting' | 'warn' | 'danger' | 'neutral' | 'brand'

export const TONE_CLASS: Record<ChipTone, string> = {
  ok: 'tone-ok',
  info: 'tone-info',
  waiting: 'tone-waiting',
  warn: 'tone-warn',
  danger: 'tone-danger',
  neutral: 'tone-neutral',
  brand: 'tone-brand',
}

/** Solid fills for dots, meters and bars. Each clears 3:1 against paper and card. */
export const TONE_SOLID: Record<ChipTone, string> = {
  ok: 'bg-tone-ok',
  info: 'bg-tone-info',
  waiting: 'bg-tone-waiting',
  warn: 'bg-tone-warn',
  danger: 'bg-tone-danger',
  neutral: 'bg-tone-neutral',
  brand: 'bg-clay',
}

export function Chip({
  tone,
  icon: Icon,
  children,
  size = 'default',
  className,
}: {
  tone: ChipTone
  icon?: LucideIcon
  children: React.ReactNode
  /** `sm` is for dense table cells and inline metadata. */
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-px text-[0.6875rem]' : 'px-2.5 py-0.5 text-xs',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className={size === 'sm' ? 'size-3' : 'size-3.5'} /> : null}
      {children}
    </span>
  )
}

/** Small filled circle used to anchor a row or a tile to its status. Always beside a text label. */
export function ToneDot({ tone, className }: { tone: ChipTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', TONE_SOLID[tone], className)}
    />
  )
}
