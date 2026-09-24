import { useState } from 'react'
import { LoaderCircle, Rocket } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/app/AppProvider'
import { PasswordField } from '@/components/PasswordField'
import { InlineNotice } from '@/components/States'
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
import { AuthLayout } from './AuthLayout'

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
    options: { type?: string; hint?: string; autoComplete?: string; placeholder?: string } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`setup-${key}`}>{label}</Label>
      <Input
        id={`setup-${key}`}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        placeholder={options.placeholder}
        className="h-9"
        value={values[key]}
        aria-invalid={Boolean(fieldErrors[key])}
        aria-describedby={fieldErrors[key] ? `setup-${key}-error` : undefined}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      />
      {fieldErrors[key] ? (
        <p id={`setup-${key}-error`} className="text-sm text-destructive">
          {fieldErrors[key]}
        </p>
      ) : options.hint ? (
        <p className="text-xs text-muted-foreground">{options.hint}</p>
      ) : null}
    </div>
  )

  return (
    <AuthLayout
      wide
      points={[
        'Nothing is created until you submit this form, and it can only be run once on this server.',
        'You become the first admin and can add coordinators and reviewers afterwards in Settings.',
        'The timezone you pick is the one every expiration date is judged against.',
      ]}
    >
      <div className="space-y-6">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
            First-run setup
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Create your organization</h1>
          <p className="text-sm text-muted-foreground">
            This server has no organization yet. Create it together with the first admin account.
          </p>
        </div>

        <form
          noValidate
          className="space-y-6"
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
            <legend className="mb-1 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Organization
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {field('organizationName', 'Organization name', {
                  placeholder: 'Cedar Grove Property Operations',
                })}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-timezone">Timezone (IANA)</Label>
                <Select
                  value={values.timezone}
                  onValueChange={(value) => setValues({ ...values, timezone: value })}
                >
                  <SelectTrigger id="setup-timezone" className="h-9 w-full">
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
                placeholder: 'Cedar Grove vendor operations',
              })}
              <div className="sm:col-span-2">
                {field('supportEmail', 'Support email shown to vendors', {
                  type: 'email',
                  placeholder: 'vendor.operations@example.com',
                })}
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">
              First admin
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('adminName', 'Your name')}
              {field('adminEmail', 'Your email', { type: 'email', autoComplete: 'username' })}
              <div className="sm:col-span-2">
                <PasswordField
                  id="setup-adminPassword"
                  label="Password"
                  autoComplete="new-password"
                  value={values.adminPassword}
                  onChange={(value) => setValues({ ...values, adminPassword: value })}
                  error={fieldErrors.adminPassword}
                  hint="At least 12 characters. Stored as a scrypt digest on this server."
                />
              </div>
            </div>
          </fieldset>

          {error && Object.keys(fieldErrors).length === 0 ? (
            <InlineNotice tone="danger" role="alert">
              {error}
            </InlineNotice>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Rocket aria-hidden="true" />
            )}
            {pending ? 'Creating…' : 'Create organization'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}
