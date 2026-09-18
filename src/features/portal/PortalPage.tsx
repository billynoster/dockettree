import { Link, useParams } from 'react-router'
import { ArrowLeft, CircleHelp } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { DemoToolbar } from '@/components/layout/DemoToolbar'
import { RequirementCard } from '@/components/RequirementCard'
import { AccessDeniedState, ErrorState, LoadingState } from '@/components/States'
import { ReadinessChip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatDate, formatDateTime } from '@/domain/dates'
import { getVendorPortal } from '@/services/portalService'

/**
 * Vendor portal. In the prototype the vendor context is the URL id, which is a demo
 * convenience only; the pilot resolves the portal from an authenticated vendor membership.
 */
export function PortalPage() {
  const app = useApp()
  const { vendorId = '' } = useParams()
  const portal = useServiceQuery((ctx) => getVendorPortal(ctx, vendorId), [vendorId])

  return (
    <div className="min-h-dvh bg-muted">
      <DemoToolbar />
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold">Vendor document portal</p>
            <p className="text-xs text-muted-foreground">
              {app.organization.name} · demo portal for {portal.data?.vendor.company_name ?? 'a vendor'}
            </p>
          </div>
          {app.role !== 'vendor_contact' ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/vendors/${vendorId}`}>
                <ArrowLeft aria-hidden="true" />
                Back to the internal vendor page
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        {portal.loading && !portal.data ? <LoadingState label="Loading your checklist" rows={4} /> : null}
        {portal.error ? (
          portal.errorCode === 'forbidden' ? (
            <AccessDeniedState
              message={portal.error}
              action={
                app.activeVendorId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/portal/${app.activeVendorId}`}>Open my own portal</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ErrorState
              title={portal.errorCode === 'not_found' ? 'Portal not found' : 'Something went wrong'}
              message={portal.error}
              onRetry={portal.reload}
            />
          )
        ) : null}

        {portal.data ? (
          <>
            <section className="space-y-3 rounded-lg border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-lg font-semibold">{portal.data.vendor.company_name}</h1>
                  <p className="text-sm text-muted-foreground">
                    Documents requested by {app.organization.name}
                  </p>
                </div>
                <ReadinessChip status={portal.data.snapshot.readiness.status} />
              </div>

              <div className="space-y-1">
                <Progress
                  value={
                    portal.data.requiredTotal === 0
                      ? 0
                      : (portal.data.requiredSatisfied / portal.data.requiredTotal) * 100
                  }
                  aria-label="Required documents accepted"
                />
                <p className="text-sm">
                  {portal.data.requiredSatisfied} of {portal.data.requiredTotal} required documents
                  are accepted and current.
                </p>
              </div>

              <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong>Ready</strong> means your required documents have been accepted and are
                  current. Today is {formatDate(app.demoDate)} in {app.organization.timezone}.
                </span>
              </p>

              {portal.data.snapshot.readiness.blockers.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold">What is still needed</h2>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                    {portal.data.snapshot.readiness.blockers.map((blocker) => (
                      <li key={blocker.requirement_id}>{blocker.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {portal.data.readOnlyReason ? (
                <p className="rounded-md border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
                  {portal.data.readOnlyReason}
                </p>
              ) : null}

              <p className="text-sm text-muted-foreground">
                Questions? Contact {portal.data.organization?.support_contact_name} at{' '}
                <span className="font-medium">{portal.data.organization?.support_email}</span>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Required documents</h2>
              {portal.data.requirements.length === 0 ? (
                <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                  No documents have been requested yet. {app.organization.name} will add them and
                  send you a message.
                </p>
              ) : (
                <ul className="space-y-3">
                  {portal.data.requirements.map((entry) => (
                    <RequirementCard
                      key={entry.status.requirement.id}
                      status={entry.status}
                      vendor={portal.data!.vendor}
                      correctionReason={entry.correctionReason}
                      context="portal"
                    />
                  ))}
                </ul>
              )}
            </section>

            {portal.data.optionalRequirements.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">
                  Optional documents{' '}
                  <span className="font-normal text-muted-foreground">
                    (these never block readiness)
                  </span>
                </h2>
                <ul className="space-y-3">
                  {portal.data.optionalRequirements.map((entry) => (
                    <RequirementCard
                      key={entry.status.requirement.id}
                      status={entry.status}
                      vendor={portal.data!.vendor}
                      correctionReason={entry.correctionReason}
                      context="portal"
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rounded-lg border bg-background">
              <h2 className="border-b px-4 py-3 text-sm font-semibold">Your recent updates</h2>
              <ul className="divide-y">
                {portal.data.events.map((event) => (
                  <li key={event.id} className="px-4 py-3">
                    <p className="text-sm">{event.summary}</p>
                    {event.reason ? (
                      <p className="mt-1 text-sm text-muted-foreground">{event.reason}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(event.created_at, app.organization.timezone)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <p className="pb-6 text-xs text-muted-foreground">
              Demonstration portal. Access is granted by this URL for the demo only. A pilot release
              requires a verified invitation and an authenticated vendor membership before any
              document is visible.
            </p>
          </>
        ) : null}
      </main>
    </div>
  )
}
