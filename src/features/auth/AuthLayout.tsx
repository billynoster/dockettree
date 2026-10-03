import { CheckCircle2 } from 'lucide-react'
import { BrandMark } from '@/components/layout/AppShell'
import { cn } from '@/lib/utils'

/**
 * Shared frame for sign-in, first-run setup and invitation acceptance.
 *
 * On desktop a narrow brand column sits beside the form so an unauthenticated visitor — often a
 * vendor's office manager who has never seen this product — can tell what they are signing in to
 * before typing a password. Below 1024px the column collapses to a single line of context so the
 * form stays above the fold on a phone.
 */
export function AuthLayout({
  children,
  organizationName,
  points,
  wide = false,
}: {
  children: React.ReactNode
  organizationName?: string | null
  points?: string[]
  /** Setup needs a two-column form, so its card is allowed to be wider. */
  wide?: boolean
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between bg-primary px-10 py-12 text-primary-foreground lg:flex">
        <div className="space-y-6">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
            <span aria-hidden="true" className="size-3 rounded-full bg-primary-foreground" />
          </span>
          <div className="space-y-2">
            <p className="type-display text-primary-foreground">Ready Vendors</p>
            <p className="text-sm leading-relaxed text-primary-foreground/80">
              Know who can work. Know what&apos;s next.
            </p>
            <p className="text-sm leading-relaxed text-primary-foreground/80">
              {organizationName
                ? `Vendor readiness for ${organizationName}.`
                : 'A clearer way to keep vendors ready for property operations teams.'}
            </p>
          </div>
          {points && points.length > 0 ? (
            <ul className="space-y-3 pt-2 text-sm text-primary-foreground/90">
              {points.map((point) => (
                <li key={point} className="flex gap-2.5">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 opacity-80" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-primary-foreground/65">
          Every document, decision and reminder is stored on your own server. Nothing is sent to a
          third party.
        </p>
      </aside>

      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-8 lg:min-h-0">
        <div className={cn('w-full', wide ? 'max-w-2xl' : 'max-w-sm')}>
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="size-9" />
            <span>
              <span className="block text-sm leading-tight font-semibold">Ready Vendors</span>
              {organizationName ? (
                <span className="block text-xs text-muted-foreground">{organizationName}</span>
              ) : (
                <span className="block text-xs text-muted-foreground">
                  Know who can work. Know what&apos;s next.
                </span>
              )}
            </span>
          </div>
          <div className="surface-raised p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
