import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/app/AppProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, isAppError } from '@/domain/errors'

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
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Vendor Readiness</h1>
          <p className="text-sm text-muted-foreground">
            {state.info?.organizationName ?? 'Sign in to continue.'}
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
          <div className="space-y-1">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email}</p> : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) => setPassword(event.target.value)}
            />
            {fieldErrors.password ? (
              <p className="text-sm text-destructive">{fieldErrors.password}</p>
            ) : null}
          </div>

          {error && Object.keys(fieldErrors).length === 0 ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            <LogIn aria-hidden="true" />
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          {state.info?.signInHint ?? 'Use the email and password your administrator gave you.'} If you
          were invited as a vendor contact, open the link in your invitation to set a password first.
        </p>
      </div>
    </div>
  )
}
