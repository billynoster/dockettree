import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
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
import { prefetchPublicConfig } from '@/lib/firebaseAuth'
import { AuthLayout } from './AuthLayout'

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

/** Self-serve Start Free Trial: create org + admin, then hand off to pricing / Checkout. */
export function SignupPage() {
  const { reload } = useSession()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const afterPath =
    safeInternalPath(searchParams.get('from')) ?? '/pricing?trial=1'

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

  useEffect(() => {
    prefetchPublicConfig()
  }, [])

  const field = (
    key: keyof typeof values,
    label: string,
    options: { type?: string; hint?: string; autoComplete?: string; placeholder?: string } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`signup-${key}`}>{label}</Label>
      <Input
        id={`signup-${key}`}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        placeholder={options.placeholder}
        value={values[key]}
        aria-invalid={Boolean(fieldErrors[key])}
        aria-describedby={fieldErrors[key] ? `signup-${key}-error` : undefined}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      />
      {fieldErrors[key] ? (
        <p id={`signup-${key}-error`} className="text-sm text-destructive">
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
        'Create your organization and admin account — no credit card until you pick a plan.',
        'Next you choose a plan and start a 30-day free trial through Stripe Checkout (Test mode).',
        'Vendors never pay. Internal teammates are unlimited on every plan.',
      ]}
    >
      <div className="space-y-6">
        <div className="space-y-1.5">
          <p className="type-eyebrow text-clay-text">Start free trial</p>
          <h1 className="type-display">Create your organization</h1>
          <p className="text-sm text-muted-foreground">
            Set up Docket Tree for your property ops team. After this, you will choose a plan and
            start your 30-day trial.
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
              .signup(values)
              .then(async () => {
                await reload()
                navigate(afterPath, { replace: true })
              })
              .catch((caught: unknown) => {
                setError(errorMessage(caught))
                setFieldErrors(isAppError(caught) ? caught.fieldErrors : {})
              })
              .finally(() => setPending(false))
          }}
        >
          <fieldset className="space-y-4">
            <legend className="mb-1 type-eyebrow">Organization</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {field('organizationName', 'Organization name', {
                  placeholder: 'Cedar Grove Property Operations',
                })}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-timezone">Timezone (IANA)</Label>
                <Select
                  value={values.timezone}
                  onValueChange={(value) => setValues({ ...values, timezone: value })}
                >
                  <SelectTrigger id="signup-timezone" className="w-full">
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
            <legend className="mb-1 type-eyebrow">Your admin account</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('adminName', 'Your name')}
              {field('adminEmail', 'Your email', { type: 'email', autoComplete: 'username' })}
              <div className="sm:col-span-2">
                <PasswordField
                  id="signup-adminPassword"
                  label="Password"
                  autoComplete="new-password"
                  value={values.adminPassword}
                  onChange={(value) => setValues({ ...values, adminPassword: value })}
                  error={fieldErrors.adminPassword}
                  hint="At least 12 characters."
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
            {pending ? 'Creating…' : 'Create account & continue'}
          </Button>
        </form>

        <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-clay-text underline-offset-4 hover:underline">
            Sign in
          </Link>
          . Prefer to compare plans first?{' '}
          <Link to="/pricing" className="text-clay-text underline-offset-4 hover:underline">
            View pricing
          </Link>
          .
        </p>
      </div>
    </AuthLayout>
  )
}
