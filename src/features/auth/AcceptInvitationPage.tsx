import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { LoaderCircle, UserCheck } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/app/AppProvider'
import { PasswordField } from '@/components/PasswordField'
import { TextLink } from '@/components/ui/text-link'
import { ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/domain/dates'
import { errorMessage, isAppError } from '@/domain/errors'
import { AuthLayout } from './AuthLayout'
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
      <AuthLayout>
        <ErrorState
          title="That link is incomplete"
          message="The invitation link is missing its token. Ask your contact to send a new invitation."
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      organizationName={check.data?.organization_name}
      points={[
        'You upload each document once; we tell you the moment something needs replacing.',
        'You can see exactly which items are still outstanding and why anything was sent back.',
        'Only documents for your own company are ever visible to your account.',
      ]}
    >
      <div className="space-y-6">
        {check.loading ? <LoadingState label="Checking your invitation" rows={2} /> : null}
        {check.error ? (
          <ErrorState title="This invitation cannot be used" message={check.error} />
        ) : null}

        {check.data ? (
          <>
            <div className="space-y-1.5">
              <p className="type-eyebrow text-clay-text">
                Vendor invitation
              </p>
              <h1 className="type-display">
                {check.data.organization_name} needs documents from {check.data.company_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Create the sign-in for {check.data.invited_email}. This link works once and expires{' '}
                {formatDate(check.data.expires_at.slice(0, 10))}.
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
                  .acceptInvitation({
                    token,
                    ...values,
                    email: check.data?.invited_email,
                  })
                  .then(() => reload())
                  .catch((caught: unknown) => {
                    setError(errorMessage(caught))
                    setFieldErrors(isAppError(caught) ? caught.fieldErrors : {})
                  })
                  .finally(() => setPending(false))
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="accept-name">Your name</Label>
                <Input
                  id="accept-name"
                  autoFocus
                  autoComplete="name"
                  value={values.display_name}
                  aria-invalid={Boolean(fieldErrors.display_name)}
                  aria-describedby={fieldErrors.display_name ? 'accept-name-error' : undefined}
                  onChange={(event) => setValues({ ...values, display_name: event.target.value })}
                />
                {fieldErrors.display_name ? (
                  <p id="accept-name-error" className="text-sm text-destructive">
                    {fieldErrors.display_name}
                  </p>
                ) : null}
              </div>

              <PasswordField
                id="accept-password"
                label="Choose a password"
                autoComplete="new-password"
                value={values.password}
                onChange={(value) => setValues({ ...values, password: value })}
                error={fieldErrors.password}
                hint="At least 12 characters."
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
                  <UserCheck aria-hidden="true" />
                )}
                {pending ? 'Creating your account…' : 'Create account and open my portal'}
              </Button>
            </form>
          </>
        ) : null}

        <p className="border-t pt-4 text-xs text-muted-foreground">
          Already set a password?{' '}
          <TextLink to="/login">Sign in instead</TextLink>
          .
        </p>
      </div>
    </AuthLayout>
  )
}
