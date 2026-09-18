/**
 * Identity provider port.
 *
 * V1 ships the interim `local-password` adapter: credentials are verified against scrypt
 * digests in the `users` table. Firebase Authentication is the planned provider; replacing
 * this adapter (verify an ID token, map the Firebase uid onto `users.auth_subject`) is the
 * only change needed, because sessions, authorization and every product flow depend on the
 * port rather than on passwords.
 */
import type { Clock } from '@/domain/clock'
import { validationError } from '@/domain/errors'
import type { User, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'
import { assertPasswordPolicy, hashPassword, verifyPassword } from './passwords'

/** What the browser sends to sign in. A Firebase adapter would receive `{ idToken }`. */
export interface PasswordCredentials {
  kind: 'password'
  email: string
  password: string
}

export type Credentials = PasswordCredentials

export interface VerifiedIdentity {
  /** Stable identifier from the provider. Null for local accounts, which key on email. */
  subject: string | null
  email: string
  userId: UUID
}

export interface IdentityProvider {
  readonly name: string
  /** True when this server owns passwords; false once an external provider does. */
  readonly managesPasswords: boolean
  /** Copy shown on the sign-in screen. */
  readonly signInHint: string
  verify(credentials: Credentials): Promise<VerifiedIdentity>
  hashPassword(password: string): Promise<string>
  assertPasswordPolicy(password: string, field?: string): void
  verifyPassword(password: string, hash: string | null): Promise<boolean>
}

const GENERIC_FAILURE = 'That email and password do not match an active account.'

export function createLocalPasswordProvider(db: Database, clock: Clock): IdentityProvider {
  void clock
  return {
    name: 'local-password',
    managesPasswords: true,
    signInHint: 'Use the email and password your administrator gave you.',
    async verify(credentials) {
      if (credentials.kind !== 'password') {
        throw validationError('This server only accepts email and password sign-in.')
      }
      const email = credentials.email.trim().toLowerCase()
      const user: User | undefined = await db.read(
        async (uow) => (await uow.users.where('by_email', email))[0],
      )
      const ok = user ? await verifyPassword(credentials.password, user.password_hash) : false
      if (!user || !ok || user.status !== 'active') {
        // One message for every failure so the form cannot enumerate accounts.
        throw validationError(GENERIC_FAILURE, {
          password: 'Check the email and password and try again.',
        })
      }
      return { subject: user.auth_subject, email: user.email, userId: user.id }
    },
    hashPassword,
    assertPasswordPolicy,
    verifyPassword,
  }
}
