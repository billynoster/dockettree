import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Play, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { AccessDeniedState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addDays } from '@/domain/dates'
import { can, ROLE_LABEL, ROLE_SUMMARY } from '@/domain/permissions'
import type { Role } from '@/domain/types'
import { COMMON_TIMEZONES } from '@/domain/validation'
import { runDailyReminderJob } from '@/services/reminderService'
import { listMembers, updateOrganizationSettings } from '@/services/settingsService'
import { listVendors } from '@/services/vendorService'

const ROLES: Role[] = ['admin', 'coordinator', 'reviewer', 'vendor_contact']

export function SettingsPage() {
  const app = useApp()
  const canManage = can(app.role, 'settings.manage')
  const members = useServiceQuery((ctx) => listMembers(ctx), [])
  const vendors = useServiceQuery(
    (ctx) => listVendors(ctx, { lifecycle: 'all', pageSize: 200, sort: 'name' }),
    [],
  )
  const action = useAction()
  const jobAction = useAction()
  const [form, setForm] = useState({
    name: app.organization.name,
    timezone: app.organization.timezone,
    support_email: app.organization.support_email,
    support_contact_name: app.organization.support_contact_name,
  })

  useEffect(() => {
    setForm({
      name: app.organization.name,
      timezone: app.organization.timezone,
      support_email: app.organization.support_email,
      support_contact_name: app.organization.support_contact_name,
    })
  }, [app.organization])

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Organization details used across the app, plus the demo tools that stand in for production services."
      />

      <section className="space-y-4 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Organization</h2>
        {!canManage ? (
          <AccessDeniedState message="Only an admin can change organization settings." />
        ) : null}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void action.run(
              (ctx) =>
                updateOrganizationSettings(ctx, {
                  ...form,
                  expectedVersion: app.organization.record_version,
                }),
              { success: 'Organization settings saved. Dates now use the selected timezone.' },
            )
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={form.name}
                disabled={!canManage}
                aria-invalid={Boolean(action.fieldErrors.name)}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              {action.fieldErrors.name ? (
                <p className="text-sm text-destructive">{action.fieldErrors.name}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-timezone">Timezone (IANA)</Label>
              <Select
                value={form.timezone}
                disabled={!canManage}
                onValueChange={(value) => setForm({ ...form, timezone: value })}
              >
                <SelectTrigger id="org-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((timezone) => (
                    <SelectItem key={timezone} value={timezone}>
                      {timezone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Expirations are evaluated against today in this timezone.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-support-name">Support contact name</Label>
              <Input
                id="org-support-name"
                value={form.support_contact_name}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, support_contact_name: event.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="org-support-email">Support email shown to vendors</Label>
              <Input
                id="org-support-email"
                type="email"
                value={form.support_email}
                disabled={!canManage}
                aria-invalid={Boolean(action.fieldErrors.support_email)}
                onChange={(event) => setForm({ ...form, support_email: event.target.value })}
              />
              {action.fieldErrors.support_email ? (
                <p className="text-sm text-destructive">{action.fieldErrors.support_email}</p>
              ) : null}
            </div>
          </div>
          {action.error ? <ErrorState message={action.error} /> : null}
          {canManage ? (
            <Button type="submit" disabled={action.pending}>
              <Save aria-hidden="true" />
              Save settings
            </Button>
          ) : null}
        </form>
      </section>

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Internal members</h2>
        <p className="text-sm text-muted-foreground">
          Read-only in the prototype. Authorized membership management arrives with authentication
          in the pilot.
        </p>
        <ul className="divide-y rounded-md border">
          {(members.data ?? []).map((member) => (
            <li key={member.membership.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {member.user.display_name}
                <span className="block text-xs text-muted-foreground">{member.user.email}</span>
              </span>
              <span className="text-muted-foreground">{ROLE_LABEL[member.membership.role]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="space-y-4 rounded-lg border-2 border-amber-300 bg-amber-50/60 p-4"
        aria-labelledby="demo-tools-heading"
      >
        <div>
          <h2 id="demo-tools-heading" className="text-sm font-semibold text-amber-950">
            Demo tools (simulation only)
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            These controls exist because the prototype has no server, authentication, scheduler or
            email provider. They are not a production authorization or delivery mechanism.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-950">Demo role</h3>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <Button
                key={role}
                size="sm"
                variant={app.role === role ? 'default' : 'outline'}
                className={app.role === role ? '' : 'bg-background'}
                onClick={() =>
                  void app.setRole(
                    role,
                    role === 'vendor_contact'
                      ? (app.activeVendorId ?? vendors.data?.rows[0]?.vendor.id ?? null)
                      : undefined,
                  )
                }
              >
                {ROLE_LABEL[role]}
              </Button>
            ))}
          </div>
          <p className="text-sm text-amber-900">{ROLE_SUMMARY[app.role]}</p>
          {app.role === 'vendor_contact' ? (
            <div className="space-y-1">
              <Label htmlFor="settings-vendor-context">Vendor portal context</Label>
              <Select
                value={app.activeVendorId ?? ''}
                onValueChange={(value) => void app.setActiveVendor(value)}
              >
                <SelectTrigger id="settings-vendor-context" className="max-w-sm bg-background">
                  <SelectValue placeholder="Choose a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {(vendors.data?.rows ?? []).map((row) => (
                    <SelectItem key={row.vendor.id} value={row.vendor.id}>
                      {row.vendor.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {app.activeVendorId ? (
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link to={`/portal/${app.activeVendorId}`}>Open this vendor's demo portal</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-950">Demo date</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Demo date"
              value={app.demoDate}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              onChange={(event) => {
                if (event.target.value) void app.setDemoDate(event.target.value)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="bg-background"
              onClick={() => void app.setDemoDate(addDays(app.demoDate, 30))}
            >
              Advance 30 days
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-background"
              onClick={() => void app.setDemoDate('2026-09-17')}
            >
              Back to 2026-09-17
            </Button>
          </div>
          <p className="text-sm text-amber-900">
            The injected clock drives every expiration calculation. The pilot uses server time
            instead.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-950">Simulated reminder job</h3>
          <Button
            size="sm"
            variant="outline"
            className="bg-background"
            disabled={jobAction.pending}
            onClick={() =>
              void jobAction.run((ctx) => runDailyReminderJob(ctx), {
                success: (result) =>
                  `Simulated job for ${result.localDate}: ${result.digestsCreated} vendor digest${result.digestsCreated === 1 ? '' : 's'}, ${result.internalNoticesCreated} internal notice${result.internalNoticesCreated === 1 ? '' : 's'}, ${result.skippedDuplicates} skipped as duplicates.`,
              })
            }
          >
            <Play aria-hidden="true" />
            Run today's reminder job
          </Button>
          <p className="text-sm text-amber-900">
            Stands in for the pilot's daily 09:00 organization-local job. One digest per vendor per
            local date; nothing is delivered.
          </p>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to="/demo/outbox">Open the simulated outbox</Link>
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-950">Reset</h3>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="bg-background">
                <RotateCcw aria-hidden="true" />
                Reset demo data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the demonstration?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every demo record, uploaded document and outbox entry in this browser is deleted,
                  then the seeded vendors and the demo date 2026-09-17 are restored.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await app.resetDemo()
                      toast.success('Demo data reset.')
                    } catch {
                      toast.error('The reset failed. Local storage may be unavailable.')
                    }
                  }}
                >
                  Reset demo data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </div>
  )
}
