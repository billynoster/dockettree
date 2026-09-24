import { useEffect, useState } from 'react'
import { KeyRound, Play, Save, UserPlus } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { PasswordField } from '@/components/PasswordField'
import { Section, SectionBody, SectionHeader } from '@/components/Section'
import { ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Chip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
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
import { todayInTimeZone } from '@/domain/dates'
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
    <div className="animate-rise max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Organization details, the people who can sign in, and how this server delivers messages."
      />

      <Section>
        <SectionHeader
          title="Organization"
          description="Shown to vendors on their portal and in every message this server sends."
          border
        />
        <SectionBody className="space-y-4 pt-4">
          {/*
           * A read-only role sees the same fields, disabled, with one line explaining why. The
           * earlier full-width lock panel above the form said the same thing far more loudly.
           */}
          {canManage ? null : (
            <InlineNotice tone="neutral">
              These values are read-only for your role. Only an admin can change organization
              settings.
            </InlineNotice>
          )}
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  className="h-9"
                  value={form.name}
                  disabled={!canManage}
                  aria-invalid={Boolean(action.fieldErrors.name)}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
                {action.fieldErrors.name ? (
                  <p className="text-sm text-destructive">{action.fieldErrors.name}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-timezone">Timezone (IANA)</Label>
                <Select
                  value={form.timezone}
                  disabled={!canManage}
                  onValueChange={(value) => setForm({ ...form, timezone: value })}
                >
                  <SelectTrigger id="org-timezone" className="h-9 w-full">
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
              <div className="space-y-1.5">
                <Label htmlFor="org-support-name">Support contact name</Label>
                <Input
                  id="org-support-name"
                  className="h-9"
                  value={form.support_contact_name}
                  disabled={!canManage}
                  onChange={(event) =>
                    setForm({ ...form, support_contact_name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="org-support-email">Support email shown to vendors</Label>
                <Input
                  id="org-support-email"
                  type="email"
                  className="h-9"
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
            {action.error && Object.keys(action.fieldErrors).length === 0 ? (
              <InlineNotice tone="danger" role="alert">
                {action.error}
              </InlineNotice>
            ) : null}
            {canManage ? (
              <div className="border-t pt-4">
                <Button type="submit" disabled={action.pending}>
                  <Save aria-hidden="true" />
                  Save settings
                </Button>
              </div>
            ) : null}
          </form>
        </SectionBody>
      </Section>

      <ChangePasswordSection />

      <Section>
        <SectionHeader
          title="Internal members"
          description="Each member holds exactly one role, and the role decides what they can do."
          border
        />
        <SectionBody className="space-y-4 pt-4">
          <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
            {INTERNAL_ROLE_OPTIONS.map((role) => (
              <div key={role}>
                <dt className="font-medium">{ROLE_LABEL[role]}</dt>
                <dd className="leading-relaxed text-muted-foreground">{ROLE_SUMMARY[role]}</dd>
              </div>
            ))}
          </dl>
          {settings.loading && !settings.data ? (
            <LoadingState label="Loading members" rows={3} />
          ) : null}
          {settings.error ? (
            <ErrorState message={settings.error} onRetry={settings.reload} />
          ) : null}
          {settings.data ? (
            <ul className="divide-y rounded-lg border">
              {settings.data.members.map((member) => (
                <li
                  key={member.membership.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {member.user.display_name}
                      {member.user.id === app.user.id ? (
                        <Chip tone="brand" size="sm">
                          You
                        </Chip>
                      ) : null}
                      {member.user.status === 'disabled' ? (
                        <Chip tone="neutral" size="sm">
                          Disabled
                        </Chip>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.user.last_login_at ? (
                        <>
                          Last signed in{' '}
                          <Timestamp
                            value={member.user.last_login_at}
                            timezone={app.organization.timezone}
                          />
                        </>
                      ) : (
                        'Has not signed in yet'
                      )}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      <Select
                        value={member.membership.role}
                        onValueChange={(value) =>
                          void action.run(
                            () => api.changeMemberRole(member.user.id, value as InternalRole),
                            {
                              success: `${member.user.display_name} is now ${ROLE_LABEL[value as InternalRole].toLowerCase()}.`,
                              onSuccess: () => settings.reload(),
                            },
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label={`Role for ${member.user.display_name}`}
                          className="h-8 w-36"
                        >
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
                    <Chip tone="neutral">{ROLE_LABEL[member.membership.role]}</Chip>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {canManage ? <AddMemberForm onAdded={() => settings.reload()} /> : null}
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader title="Email delivery and reminders" border />
        <SectionBody className="space-y-3 pt-4">
          {app.delivery.configured ? (
            <InlineNotice tone="ok" title="SMTP is configured">
              Messages are queued in the notification log and delivered over SMTP with bounded
              retries.
            </InlineNotice>
          ) : (
            <InlineNotice tone="warn" title="Email delivery is not configured">
              {app.delivery.reason}
            </InlineNotice>
          )}
          <p className="text-sm leading-relaxed text-muted-foreground">
            The reminder job runs once per day at 09:00 {app.organization.timezone} and combines each
            vendor's actionable items into a single digest, so nobody receives four emails about the
            same checklist.
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
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader title="Sign-in" border />
        <SectionBody className="space-y-2 pt-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This server verifies email and password itself and stores a session for each sign-in.
            Firebase Authentication is the planned provider; it will replace the local adapter
            without changing any of the workflows above.
          </p>
          {settings.data ? (
            <p className="text-xs text-muted-foreground">
              Active identity provider:{' '}
              <code className="rounded bg-muted px-1 py-0.5">{settings.data.identity.provider}</code>
            </p>
          ) : null}
        </SectionBody>
      </Section>
    </div>
  )
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const action = useAction()

  return (
    <Section>
      <SectionHeader
        title="Your password"
        description="Changing it signs out every other session on your account."
        border
      />
      <SectionBody className="pt-4">
        <form
          noValidate
          className="space-y-4"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              error={action.fieldErrors.currentPassword}
            />
            <PasswordField
              id="new-password"
              label="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              error={action.fieldErrors.newPassword}
              hint="At least 12 characters."
            />
          </div>
          <Button type="submit" variant="outline" disabled={action.pending}>
            <KeyRound aria-hidden="true" />
            Change password
          </Button>
        </form>
      </SectionBody>
    </Section>
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
      className="space-y-3 rounded-lg border bg-muted/40 p-3"
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
      <h3 className="text-sm font-semibold">Add a member</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="member-name">Name</Label>
          <Input
            id="member-name"
            className="h-9"
            value={values.display_name}
            aria-invalid={Boolean(action.fieldErrors.display_name)}
            onChange={(event) => setValues({ ...values, display_name: event.target.value })}
          />
          {action.fieldErrors.display_name ? (
            <p className="text-sm text-destructive">{action.fieldErrors.display_name}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            type="email"
            className="h-9"
            value={values.email}
            aria-invalid={Boolean(action.fieldErrors.email)}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
          />
          {action.fieldErrors.email ? (
            <p className="text-sm text-destructive">{action.fieldErrors.email}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-role">Role</Label>
          <Select
            value={values.role}
            onValueChange={(value) => setValues({ ...values, role: value as InternalRole })}
          >
            <SelectTrigger id="member-role" className="h-9 w-full">
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
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ROLE_SUMMARY[values.role]}
          </p>
        </div>
        <PasswordField
          id="member-password"
          label="Temporary password"
          autoComplete="new-password"
          value={values.password}
          onChange={(value) => setValues({ ...values, password: value })}
          error={action.fieldErrors.password}
          hint="At least 12 characters. Share it directly and ask them to change it."
        />
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
        <PasswordField
          id={`reset-${userId}`}
          label="Temporary password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={action.fieldErrors.password}
          hint="At least 12 characters."
        />
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
