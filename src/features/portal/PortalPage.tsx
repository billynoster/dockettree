import { useState } from 'react'
import { CheckCircle2, CircleAlert, LifeBuoy, LogOut } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { BrandMark } from '@/components/layout/AppShell'
import { ProgressMeter } from '@/components/Metrics'
import { RequirementCard } from '@/components/RequirementCard'
import { Section, SectionHeader } from '@/components/Section'
import { ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { ReadinessChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { formatDate, todayInTimeZone } from '@/domain/dates'

/**
 * Vendor portal. The vendor context comes from the signed-in contact's verified membership, so
 * there is no vendor id in the URL and no document is reachable without an authorized session.
 *
 * This is the one screen used by people outside the operations team, often once every twelve
 * months. It therefore leads with a single answer — what is still needed — before any detail.
 */
export function PortalPage() {
  const app = useApp()
  const [switching, setSwitching] = useState(false)
  const portal = useServiceQuery(() => api.portal(), [app.activeVendorId])
  const today = todayInTimeZone(new Date(), app.organization.timezone)
  const blockers = portal.data?.snapshot.readiness.blockers ?? []

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-backdrop-filter:bg-card/75">
        <div className="mx-auto flex min-h-(--header-height) max-w-4xl flex-wrap items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight font-semibold">Vendor document portal</p>
              <p className="truncate text-xs text-muted-foreground">
                {app.organization.name} · {app.user.display_name}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {app.vendorContexts.length > 1 ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="portal-vendor-context" className="sr-only">
                  Vendor
                </Label>
                <Select
                  value={app.activeVendorId ?? ''}
                  disabled={switching}
                  onValueChange={(value) => {
                    setSwitching(true)
                    void api
                      .setVendorContext(value)
                      .then(() => app.reloadSession())
                      .finally(() => setSwitching(false))
                  }}
                >
                  <SelectTrigger id="portal-vendor-context" className="h-9 w-48 sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {app.vendorContexts.map((context) => (
                      <SelectItem key={context.id} value={context.id}>
                        {context.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button variant="outline" size="sm" className="h-9" onClick={() => void app.signOut()}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        {portal.loading && !portal.data ? (
          <LoadingState label="Loading your checklist" rows={4} />
        ) : null}
        {portal.error ? (
          <ErrorState
            title={portal.errorCode === 'not_found' ? 'Portal not found' : 'Something went wrong'}
            message={portal.error}
            onRetry={portal.reload}
          />
        ) : null}

        {portal.data ? (
          <div className="animate-rise space-y-5">
            <Section className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {portal.data.vendor.company_name}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Documents requested by {app.organization.name}
                  </p>
                </div>
                <ReadinessChip status={portal.data.snapshot.readiness.status} />
              </div>

              <div className="space-y-2">
                <ProgressMeter
                  value={portal.data.requiredSatisfied}
                  max={portal.data.requiredTotal}
                  label="Required documents accepted"
                  tone={
                    portal.data.requiredTotal > 0 &&
                    portal.data.requiredSatisfied >= portal.data.requiredTotal
                      ? 'ok'
                      : 'brand'
                  }
                />
                <p className="text-sm">
                  <span className="font-medium tabular-nums">
                    {portal.data.requiredSatisfied} of {portal.data.requiredTotal}
                  </span>{' '}
                  required documents are accepted and current.
                </p>
              </div>

              {blockers.length > 0 ? (
                <div className="tone-warn space-y-2 rounded-lg border p-3.5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <CircleAlert aria-hidden="true" className="size-4" />
                    What is still needed
                  </h2>
                  <ul className="space-y-1 text-sm">
                    {blockers.map((blocker) => (
                      <li key={blocker.requirement_id} className="flex gap-2">
                        <span aria-hidden="true" className="pt-px">
                          •
                        </span>
                        {blocker.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : portal.data.requiredTotal > 0 ? (
                <div className="tone-ok flex items-start gap-2 rounded-lg border p-3.5 text-sm">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Everything {app.organization.name} asked for has been accepted. We will contact
                    you before anything expires.
                  </span>
                </div>
              ) : null}

              {portal.data.readOnlyReason ? (
                <InlineNotice tone="neutral" title="Uploads are paused">
                  {portal.data.readOnlyReason}
                </InlineNotice>
              ) : null}

              <p className="text-xs leading-relaxed text-muted-foreground">
                <strong className="font-medium text-foreground">Ready</strong> means your required
                documents have been accepted and none of them has expired. Dates are judged against
                today, {formatDate(today)} in {app.organization.timezone}.
              </p>
            </Section>

            <section className="space-y-3" aria-labelledby="portal-required">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="portal-required" className="text-[0.9375rem] font-semibold">
                  Required documents
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                    {portal.data.requirements.length}
                  </span>
                </h2>
              </div>
              {portal.data.requirements.length === 0 ? (
                <Section className="p-6 text-center text-sm text-muted-foreground">
                  No documents have been requested yet. {app.organization.name} will add them and
                  send you a message.
                </Section>
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
              <section className="space-y-3" aria-labelledby="portal-optional">
                <h2 id="portal-optional" className="text-[0.9375rem] font-semibold">
                  Optional documents
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    these never block readiness
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

            <Section>
              <SectionHeader
                title="Your recent updates"
                description="Everything we have recorded on your account, newest first."
                border={portal.data.events.length > 0}
              />
              {portal.data.events.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Nothing yet. Your uploads and our decisions will appear here.
                </p>
              ) : (
                <ul className="divide-y">
                  {portal.data.events.map((event) => (
                    <li key={event.id} className="px-4 py-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <p className="min-w-0 text-sm">{event.summary}</p>
                        <Timestamp
                          value={event.created_at}
                          timezone={app.organization.timezone}
                          className="shrink-0 text-xs text-muted-foreground"
                        />
                      </div>
                      {event.reason ? (
                        <p className="mt-1 border-l-2 pl-2.5 text-sm text-muted-foreground">
                          {event.reason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2.5 text-sm">
                <LifeBuoy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  Questions about a document? Contact{' '}
                  {portal.data.organization?.support_contact_name} at{' '}
                  <a
                    href={`mailto:${portal.data.organization?.support_email}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {portal.data.organization?.support_email}
                  </a>
                  .
                </span>
              </p>
            </Section>

            <p className="pb-6 text-xs leading-relaxed text-muted-foreground">
              You are signed in with the account created from your invitation. Only documents for{' '}
              {portal.data.vendor.company_name} are visible to you.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  )
}
