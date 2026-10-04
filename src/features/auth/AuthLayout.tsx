import { CheckCircle2 } from 'lucide-react'
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BrandLockupStacked,
  BrandWordmark,
} from '@/components/brand/Brand'
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
        <div className="space-y-8">
          <div className="rounded-2xl bg-[var(--paper)] px-6 py-7 shadow-[var(--shadow-raised)]">
            <BrandLockupStacked className="mx-auto w-40" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-[0.12em] text-primary-foreground/85 uppercase">
              {BRAND_TAGLINE}
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
          <div className="mb-6 lg:hidden">
            <BrandWordmark
              subtitle={organizationName ?? BRAND_TAGLINE}
              markClassName="size-9"
            />
            <span className="sr-only">{BRAND_NAME}</span>
          </div>
          <div className="surface-raised p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
