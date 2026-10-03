import { useState } from 'react'
import { CheckCircle2, CircleAlert, LifeBuoy, LogOut } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { BrandMark } from '@/components/layout/AppShell'
import { ProgressMeter } from '@/components/Metrics'
import { RequirementCard } from '@/components/RequirementCard'
import { ScrollRegion } from '@/components/ScrollRegion'
import { Section, SectionHeader } from '@/components/Section'
import { ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { ReadinessChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { TextLinkExternal } from '@/components/ui/text-link'
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
        <div className="mx-auto flex min-h-(--header-height) max-w-5xl flex-wrap items-center gap-3 px-4 py-2">
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
                  <SelectTrigger id="portal-vendor-context" className="w-48 sm:w-56">
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
            <Button variant="outline" onClick={() => void app.signOut()}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl space-y-3 px-4 py-3 lg:py-4">
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
          <div className="animate-rise space-y-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start">
              <Section className="space-y-3 p-3 sm:p-3.5 lg:sticky lg:top-[calc(var(--header-height)+0.75rem)]">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h1 className="type-display text-[1.5rem] leading-tight">
                      {portal.data.vendor.company_name}
                    </h1>
                    <ReadinessChip status={portal.data.snapshot.readiness.status} />
                  </div>
                  <p className="type-meta">
                    Documents for {app.organization.name} · today {formatDate(today)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <ProgressMeter
                    value={portal.data.requiredSatisfied}
                    max={portal.data.requiredTotal}
                    label="Required documents accepted"
                    /* Ink while there is work left, green once everything is accepted. A clay bar
                     * reads as a warning to someone who has never seen this screen before. */
                    tone={
                      portal.data.requiredTotal > 0 &&
                      portal.data.requiredSatisfied >= portal.data.requiredTotal
                        ? 'ok'
                        : 'neutral'
                    }
                  />
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">
                      {portal.data.requiredSatisfied} of {portal.data.requiredTotal}
                    </span>{' '}
                    required accepted and current.
                  </p>
                </div>

                {blockers.length > 0 ? (
                  <div className="tone-warn space-y-1.5 rounded-lg border p-2.5">
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
                  <div className="tone-ok flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Everything {app.organization.name} asked for has been accepted. We will
                      contact you before anything expires.
                    </span>
                  </div>
                ) : null}

                {portal.data.readOnlyReason ? (
                  <InlineNotice tone="neutral" title="Uploads are paused">
                    {portal.data.readOnlyReason}
                  </InlineNotice>
                ) : null}

                <p className="type-meta leading-relaxed">
                  <strong className="font-medium text-foreground">Ready</strong> means required
                  documents are accepted and none has expired.
                </p>

                <p className="flex items-start gap-2 text-sm">
                  <LifeBuoy
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span>
                    Questions? Contact {portal.data.organization?.support_contact_name} at{' '}
                    <TextLinkExternal href={`mailto:${portal.data.organization?.support_email}`}>
                      {portal.data.organization?.support_email}
                    </TextLinkExternal>
                    .
                  </span>
                </p>
              </Section>

              <div className="min-w-0 space-y-3">
                <section className="space-y-2" aria-labelledby="portal-required">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id="portal-required" className="type-title">
                      Required documents
                      <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                        {portal.data.requirements.length}
                      </span>
                    </h2>
                  </div>
                  {portal.data.requirements.length === 0 ? (
                    <Section className="p-5 text-center text-sm text-muted-foreground">
                      No documents have been requested yet. {app.organization.name} will add them
                      and send you a message.
                    </Section>
                  ) : (
                    <ScrollRegion label="Required documents">
                      <ul className="space-y-2.5 pr-0.5">
                        {portal.data.requirements.map((entry) => (
                          <li key={entry.status.requirement.id}>
                            <RequirementCard
                              status={entry.status}
                              vendor={portal.data!.vendor}
                              correctionReason={entry.correctionReason}
                              context="portal"
                            />
                          </li>
                        ))}
                      </ul>
                    </ScrollRegion>
                  )}
                </section>

                {portal.data.optionalRequirements.length > 0 ? (
                  <section className="space-y-2" aria-labelledby="portal-optional">
                    <h2 id="portal-optional" className="type-title">
                      Optional documents
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        these never block readiness
                      </span>
                    </h2>
                    <ul className="space-y-2.5">
                      {portal.data.optionalRequirements.map((entry) => (
                        <li key={entry.status.requirement.id}>
                          <RequirementCard
                            status={entry.status}
                            vendor={portal.data!.vendor}
                            correctionReason={entry.correctionReason}
                            context="portal"
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <Section>
                  <SectionHeader
                    title="Your recent updates"
                    description="Newest first"
                    border={portal.data.events.length > 0}
                    className="px-3 py-2.5"
                  />
                  {portal.data.events.length === 0 ? (
                    <p className="px-3 pb-3 text-sm text-muted-foreground">
                      Nothing yet. Your uploads and our decisions will appear here.
                    </p>
                  ) : (
                    <ScrollRegion size="panel" label="Recent updates" className="max-h-48">
                      <ul className="divide-y">
                        {portal.data.events.map((event) => (
                          <li key={event.id} className="px-3 py-2">
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
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
                    </ScrollRegion>
                  )}
                </Section>

                <p className="pb-4 text-xs leading-relaxed text-muted-foreground">
                  You are signed in with the account created from your invitation. Only documents
                  for {portal.data.vendor.company_name} are visible to you.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
