import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { UserCheck } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/app/AppProvider'
import { ErrorState, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, isAppError } from '@/domain/errors'
import { useServiceQueryPublic } from './useServiceQueryPublic'

/**
 * Invitation acceptance: verifies the single-use token, then creates the vendor contact's
 * account and signs them in. Invalid, used, expired and revoked links get their own message
 * and never reveal anything about the vendor record.
 */
export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const { reload } = useSession()
  const check = useServiceQueryPublic(() => api.checkInvitation(token), [token], token.length > 0)
  const [values, setValues] = useState({ display_name: '', password: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  if (!token) {
    return (
      <Frame>
        <ErrorState
          title="That link is incomplete"
          message="The invitation link is missing its token. Ask your contact to send a new invitation."
        />
      </Frame>
    )
  }

  return (
    <Frame>
      {check.loading ? <LoadingState label="Checking your invitation" rows={2} /> : null}
      {check.error ? (
        <ErrorState title="This invitation cannot be used" message={check.error} />
      ) : null}

      {check.data ? (
        <>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">
              {check.data.organization_name} requested documents from {check.data.company_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Create your sign-in for {check.data.invited_email}. This link works once and expires on{' '}
              {check.data.expires_at.slice(0, 10)}.
            </p>
          </div>

          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              setPending(true)
              setError(null)
              setFieldErrors({})
              void api
                .acceptInvitation({ token, ...values })
                .then(() => reload())
                .catch((caught: unknown) => {
                  setError(errorMessage(caught))
                  setFieldErrors(isAppError(caught) ? caught.fieldErrors : {})
                })
                .finally(() => setPending(false))
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="accept-name">Your name</Label>
              <Input
                id="accept-name"
                value={values.display_name}
                aria-invalid={Boolean(fieldErrors.display_name)}
                onChange={(event) => setValues({ ...values, display_name: event.target.value })}
              />
              {fieldErrors.display_name ? (
                <p className="text-sm text-destructive">{fieldErrors.display_name}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="accept-password">Choose a password</Label>
              <Input
                id="accept-password"
                type="password"
                autoComplete="new-password"
                value={values.password}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
              />
              {fieldErrors.password ? (
                <p className="text-sm text-destructive">{fieldErrors.password}</p>
              ) : (
                <p className="text-xs text-muted-foreground">At least 12 characters.</p>
              )}
            </div>

            {error && Object.keys(fieldErrors).length === 0 ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={pending}>
              <UserCheck aria-hidden="true" />
              {pending ? 'Creating your account…' : 'Create account and open my portal'}
            </Button>
          </form>
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Already set a password? <Link to="/login" className="underline">Sign in instead</Link>.
      </p>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-background p-6 shadow-sm">
        {children}
      </div>
    </div>
  )
}
