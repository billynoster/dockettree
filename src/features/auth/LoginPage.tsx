import { useState } from 'react'
import { LoaderCircle, LogIn } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/app/AppProvider'
import { PasswordField } from '@/components/PasswordField'
import { InlineNotice } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, isAppError } from '@/domain/errors'
import { AuthLayout } from './AuthLayout'

/** Email and password sign-in for staff and vendor contacts. */
export function LoginPage() {
  const { state, reload } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const submit = async () => {
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await api.login(email.trim(), password)
      await reload()
    } catch (caught) {
      setError(errorMessage(caught))
      setFieldErrors(isAppError(caught) ? caught.fieldErrors : {})
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      organizationName={state.info?.organizationName}
      points={[
        'See which vendors are ready to work, and exactly what still needs attention.',
        'Vendors upload insurance and agreements themselves; you review and move requests forward.',
        'Every decision, reminder and document version is recorded and cannot be edited after the fact.',
      ]}
    >
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="type-display">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            {state.info?.organizationName
              ? `Continue to ${state.info.organizationName}.`
              : 'Continue to your vendor documents.'}
          </p>
        </div>

        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email ? (
              <p id="login-email-error" className="text-sm text-destructive">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
          />

          {error && Object.keys(fieldErrors).length === 0 ? (
            <InlineNotice tone="danger" role="alert">
              {error}
            </InlineNotice>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogIn aria-hidden="true" />
            )}
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="space-y-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          <p>{state.info?.signInHint ?? 'Use the email and password your administrator gave you.'}</p>
          <p>
            Invited as a vendor contact? Open the link in your invitation email to choose a password
            first.
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}
