import { useEffect, useState } from 'react'
import { KeyRound, Play, Save, UserPlus } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { AccessDeniedState, ErrorState, LoadingState } from '@/components/States'
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
import { formatDateTime, todayInTimeZone } from '@/domain/dates'
import { ROLE_LABEL, ROLE_SUMMARY } from '@/domain/permissions'
import type { InternalRole } from '@/domain/types'
import { COMMON_TIMEZONES } from '@/domain/validation'

const INTERNAL_ROLE_OPTIONS: InternalRole[] = ['admin', 'coordinator', 'reviewer']

export function SettingsPage() {
  const app = useApp()
  const canManage = app.can('settings.manage')
  const settings = useServiceQuery(() => api.settings(), [])
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

  const today = todayInTimeZone(new Date(), form.timezone)

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Organization details, the people who can sign in, and how this server delivers messages."
      />

      <section className="space-y-4 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Organization</h2>
        {!canManage ? (
          <AccessDeniedState message="Only an admin can change organization settings." />
        ) : null}
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void action.run(
              () =>
                api.updateSettings({
                  ...form,
                  expectedVersion: app.organization.record_version,
                }),
              {
                success: 'Organization settings saved. Dates now use the selected timezone.',
                onSuccess: () => app.reloadSession(),
              },
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
                Expirations are evaluated against today in this timezone. Today is {today}.
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

      <ChangePasswordSection />

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <div>
          <h2 className="text-sm font-semibold">Internal members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each member has one role: {ROLE_SUMMARY.admin.toLowerCase()}
          </p>
        </div>
        {settings.loading && !settings.data ? <LoadingState label="Loading members" rows={3} /> : null}
        {settings.error ? <ErrorState message={settings.error} onRetry={settings.reload} /> : null}
        {settings.data ? (
          <ul className="divide-y rounded-md border">
            {settings.data.members.map((member) => (
              <li
                key={member.membership.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span>
                  {member.user.display_name}
                  {member.user.status === 'disabled' ? (
                    <span className="ml-2 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      Disabled
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">{member.user.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {member.user.last_login_at
                      ? `Last signed in ${formatDateTime(member.user.last_login_at, app.organization.timezone)}`
                      : 'Has not signed in yet'}
                  </span>
                </span>
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={member.membership.role}
                      onValueChange={(value) =>
                        void action.run(() => api.changeMemberRole(member.user.id, value as InternalRole), {
                          success: `${member.user.display_name} is now ${value}.`,
                          onSuccess: () => settings.reload(),
                        })
                      }
                    >
                      <SelectTrigger aria-label={`Role for ${member.user.display_name}`} className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERNAL_ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ResetPasswordDialog
                      userId={member.user.id}
                      name={member.user.display_name}
                      onDone={() => settings.reload()}
                    />
                    {member.user.id === app.user.id ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void action.run(
                            () =>
                              api.setMemberStatus(
                                member.user.id,
                                member.user.status === 'active' ? 'disabled' : 'active',
                              ),
                            {
                              success:
                                member.user.status === 'active'
                                  ? `${member.user.display_name} can no longer sign in.`
                                  : `${member.user.display_name} can sign in again.`,
                              onSuccess: () => settings.reload(),
                            },
                          )
                        }
                      >
                        {member.user.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">{ROLE_LABEL[member.membership.role]}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {canManage ? <AddMemberForm onAdded={() => settings.reload()} /> : null}
      </section>

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Email delivery and reminders</h2>
        <p className="text-sm text-muted-foreground">
          {app.delivery.configured
            ? 'Messages are queued in the notification log and delivered over SMTP with bounded retries.'
            : app.delivery.reason}
        </p>
        <p className="text-sm text-muted-foreground">
          The reminder job runs once per day at 09:00 {app.organization.timezone} and combines each
          vendor's actionable items into one digest.
        </p>
        {app.can('reminder.send') ? (
          <Button
            variant="outline"
            size="sm"
            disabled={jobAction.pending}
            onClick={() =>
              void jobAction.run(() => api.runReminderJob(), {
                success: (result) =>
                  `Reminder job finished: ${result.digestsCreated} digest${result.digestsCreated === 1 ? '' : 's'} queued, ${result.skippedDuplicates} skipped as duplicates.`,
              })
            }
          >
            <Play aria-hidden="true" />
            Run the reminder job now
          </Button>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Sign-in</h2>
        <p className="text-sm text-muted-foreground">
          This server verifies email and password itself and stores a session for each sign-in.
          Firebase Authentication is the planned provider; it will replace the local adapter without
          changing any of the workflows above.
        </p>
        {settings.data ? (
          <p className="text-xs text-muted-foreground">
            Active identity provider: <code>{settings.data.identity.provider}</code>
          </p>
        ) : null}
      </section>
    </div>
  )
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const action = useAction()

  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <h2 className="text-sm font-semibold">Your password</h2>
      <form
        noValidate
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          void action.run(() => api.changePassword(currentPassword, newPassword), {
            success: 'Password updated. Other sessions were signed out.',
            skipRefresh: true,
            onSuccess: () => {
              setCurrentPassword('')
              setNewPassword('')
            },
          })
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            aria-invalid={Boolean(action.fieldErrors.currentPassword)}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          {action.fieldErrors.currentPassword ? (
            <p className="text-sm text-destructive">{action.fieldErrors.currentPassword}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            aria-invalid={Boolean(action.fieldErrors.newPassword)}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          {action.fieldErrors.newPassword ? (
            <p className="text-sm text-destructive">{action.fieldErrors.newPassword}</p>
          ) : (
            <p className="text-xs text-muted-foreground">At least 12 characters.</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="outline" disabled={action.pending}>
            <KeyRound aria-hidden="true" />
            Change password
          </Button>
        </div>
      </form>
    </section>
  )
}

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const [values, setValues] = useState({
    display_name: '',
    email: '',
    role: 'coordinator' as InternalRole,
    password: '',
  })
  const action = useAction()

  return (
    <form
      noValidate
      className="space-y-3 rounded-md border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void action.run(() => api.addMember(values), {
          success: `${values.display_name} can now sign in as ${values.role}.`,
          onSuccess: () => {
            setValues({ display_name: '', email: '', role: 'coordinator', password: '' })
            onAdded()
          },
        })
      }}
    >
      <h3 className="text-sm font-medium">Add a member</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="member-name">Name</Label>
          <Input
            id="member-name"
            value={values.display_name}
            aria-invalid={Boolean(action.fieldErrors.display_name)}
            onChange={(event) => setValues({ ...values, display_name: event.target.value })}
          />
          {action.fieldErrors.display_name ? (
            <p className="text-sm text-destructive">{action.fieldErrors.display_name}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            type="email"
            value={values.email}
            aria-invalid={Boolean(action.fieldErrors.email)}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
          />
          {action.fieldErrors.email ? (
            <p className="text-sm text-destructive">{action.fieldErrors.email}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="member-role">Role</Label>
          <Select
            value={values.role}
            onValueChange={(value) => setValues({ ...values, role: value as InternalRole })}
          >
            <SelectTrigger id="member-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERNAL_ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABEL[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{ROLE_SUMMARY[values.role]}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="member-password">Temporary password</Label>
          <Input
            id="member-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            aria-invalid={Boolean(action.fieldErrors.password)}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />
          {action.fieldErrors.password ? (
            <p className="text-sm text-destructive">{action.fieldErrors.password}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least 12 characters. Share it directly and ask them to change it.
            </p>
          )}
        </div>
      </div>
      {action.error && Object.keys(action.fieldErrors).length === 0 ? (
        <p className="text-sm text-destructive">{action.error}</p>
      ) : null}
      <Button type="submit" size="sm" disabled={action.pending}>
        <UserPlus aria-hidden="true" />
        Add member
      </Button>
    </form>
  )
}

function ResetPasswordDialog({
  userId,
  name,
  onDone,
}: {
  userId: string
  name: string
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const action = useAction()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reset password
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the password for {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Set a temporary password and share it directly. All of their sessions are signed out.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`reset-${userId}`}>Temporary password</Label>
          <Input
            id={`reset-${userId}`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {action.fieldErrors.password ? (
            <p className="text-sm text-destructive">{action.fieldErrors.password}</p>
          ) : (
            <p className="text-xs text-muted-foreground">At least 12 characters.</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void action
                .run(() => api.resetMemberPassword(userId, password), {
                  success: `Password reset for ${name}.`,
                  onSuccess: () => {
                    setPassword('')
                    onDone()
                  },
                })
                .then(() => undefined)
            }}
          >
            Reset password
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
