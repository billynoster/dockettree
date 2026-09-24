import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * Link atom. Clay is the only place chromatic colour signals "interactive", so every in-text link
 * goes through here rather than repeating the colour and underline offset at each call site.
 *
 * `quiet` is for links inside a row that already reads as one target — the colour would compete
 * with the row, so the link inherits the surrounding ink and only underlines on hover.
 */
export function TextLink({
  className,
  quiet = false,
  ...props
}: LinkProps & { quiet?: boolean }) {
  return (
    <Link
      className={cn(
        'rounded-sm underline-offset-[3px] transition-colors duration-(--duration-quick) hover:underline',
        quiet ? 'font-medium text-foreground hover:text-clay-text' : 'font-medium text-clay-text',
        className,
      )}
      {...props}
    />
  )
}

/** Same treatment for an external or protocol link, where react-router must not intercept. */
export function TextLinkExternal({
  className,
  ...props
}: React.ComponentProps<'a'>) {
  return (
    <a
      className={cn(
        'rounded-sm font-medium text-clay-text underline-offset-[3px] transition-colors duration-(--duration-quick) hover:underline',
        className,
      )}
      {...props}
    />
  )
}
