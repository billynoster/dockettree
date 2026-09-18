import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/app/AppProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage, isAppError } from '@/domain/errors'
import { COMMON_TIMEZONES } from '@/domain/validation'

/** First-run setup: create the organization and its first admin. Available only once. */
export function SetupPage() {
  const { reload } = useSession()
  const [values, setValues] = useState({
    organizationName: '',
    timezone: 'America/Chicago',
    supportEmail: '',
    supportContactName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const field = (
    key: keyof typeof values,
    label: string,
    options: { type?: string; hint?: string; autoComplete?: string } = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`setup-${key}`}>{label}</Label>
      <Input
        id={`setup-${key}`}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        value={values[key]}
        aria-invalid={Boolean(fieldErrors[key])}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      />
      {fieldErrors[key] ? (
        <p className="text-sm text-destructive">{fieldErrors[key]}</p>
      ) : options.hint ? (
        <p className="text-xs text-muted-foreground">{options.hint}</p>
      ) : null}
    </div>
  )

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-2xl space-y-6 rounded-lg border bg-background p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Set up Vendor Readiness</h1>
          <p className="text-sm text-muted-foreground">
            This server has no organization yet. Create it and the first admin account; you can add
            coordinators and reviewers afterwards in Settings.
          </p>
        </div>

        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            setPending(true)
            setError(null)
            setFieldErrors({})
            void api
              .setup(values)
              .then(() => reload())
              .catch((caught: unknown) => {
                setError(errorMessage(caught))
                setFieldErrors(isAppError(caught) ? caught.fieldErrors : {})
              })
              .finally(() => setPending(false))
          }}
        >
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Organization</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{field('organizationName', 'Organization name')}</div>
              <div className="space-y-1">
                <Label htmlFor="setup-timezone">Timezone (IANA)</Label>
                <Select
                  value={values.timezone}
                  onValueChange={(value) => setValues({ ...values, timezone: value })}
                >
                  <SelectTrigger id="setup-timezone">
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
                  Expiration dates are evaluated against today in this timezone.
                </p>
              </div>
              {field('supportContactName', 'Support contact name', {
                hint: 'Shown to vendors as the person or team to contact.',
              })}
              <div className="sm:col-span-2">
                {field('supportEmail', 'Support email shown to vendors', { type: 'email' })}
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">First admin</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('adminName', 'Your name')}
              {field('adminEmail', 'Your email', { type: 'email', autoComplete: 'username' })}
              <div className="sm:col-span-2">
                {field('adminPassword', 'Password', {
                  type: 'password',
                  autoComplete: 'new-password',
                  hint: 'At least 12 characters. Stored as a scrypt digest on this server.',
                })}
              </div>
            </div>
          </fieldset>

          {error && Object.keys(fieldErrors).length === 0 ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            <Rocket aria-hidden="true" />
            {pending ? 'Creating…' : 'Create organization'}
          </Button>
        </form>
      </div>
    </div>
  )
}
