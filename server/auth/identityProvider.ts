/**
 * Identity provider port.
 *
 * Two adapters:
 * - `local-password` (default): scrypt digests in `users`. Used when Firebase env is unset.
 * - `firebase`: verify a Firebase ID token (Google public keys + project ID), then map
 *   `uid` onto `users.auth_subject` (or onto the local user with the same email on first sign-in).
 *
 * Sessions, authorization and product flows depend on this port rather than on passwords.
 */
import type { Clock } from '@/domain/clock'
import { validationError } from '@/domain/errors'
import type { User, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { FirebaseWebConfig } from '../config'
import { FIREBASE_SIGNIN_FAILURE, verifyFirebaseIdToken } from './firebaseToken'
import { assertPasswordPolicy, hashPassword, verifyPassword } from './passwords'

/** What the browser sends to sign in. */
export interface PasswordCredentials {
  kind: 'password'
  email: string
  password: string
}

export interface IdTokenCredentials {
  kind: 'idToken'
  idToken: string
}

export type Credentials = PasswordCredentials | IdTokenCredentials

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

export type FirebaseTokenVerifier = (idToken: string) => Promise<{ uid: string; email: string }>

const GENERIC_FAILURE = FIREBASE_SIGNIN_FAILURE

function rejectGeneric(): never {
  throw validationError(GENERIC_FAILURE, {
    password: 'Check the email and password and try again.',
  })
}

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
        rejectGeneric()
      }
      return { subject: user.auth_subject, email: user.email, userId: user.id }
    },
    hashPassword,
    assertPasswordPolicy,
    verifyPassword,
  }
}

/**
 * Production identity provider. The browser signs in with the Firebase SDK, then exchanges
 * the ID token for a first-party session cookie. Local password hashes are still stored for
 * first-run setup, invitations and an emergency fallback if Firebase env is later removed.
 */
export function createFirebaseIdentityProvider(
  db: Database,
  clock: Clock,
  options: { projectId: string; verifyIdToken?: FirebaseTokenVerifier },
): IdentityProvider {
  void clock
  const verifyIdToken =
    options.verifyIdToken ?? ((idToken: string) => verifyFirebaseIdToken(idToken, options.projectId))
  return {
    name: 'firebase',
    managesPasswords: false,
    signInHint: 'Use the email and password for your Docket Tree account.',
    async verify(credentials) {
      if (credentials.kind !== 'idToken') {
        throw validationError('This server signs in with Firebase Authentication.')
      }
      const claims = await verifyIdToken(credentials.idToken)
      const uid = claims.uid
      const email = claims.email.trim().toLowerCase()

      const bySubject: User | undefined = await db.read(
        async (uow) => (await uow.users.where('by_auth_subject', uid))[0],
      )
      if (bySubject) {
        if (bySubject.status !== 'active') rejectGeneric()
        return { subject: uid, email: bySubject.email, userId: bySubject.id }
      }

      const byEmail: User | undefined = await db.read(
        async (uow) => (await uow.users.where('by_email', email))[0],
      )
      if (!byEmail || byEmail.status !== 'active') rejectGeneric()
      if (byEmail.auth_subject && byEmail.auth_subject !== uid) rejectGeneric()

      const linked: User = { ...byEmail, auth_subject: uid }
      await db.write(async (uow) => {
        await uow.users.put(linked)
      })
      return { subject: uid, email: linked.email, userId: linked.id }
    },
    hashPassword,
    assertPasswordPolicy,
    verifyPassword,
  }
}

/** Firebase when web config is present; local-password otherwise (this cloud preview). */
export function createIdentityProvider(
  db: Database,
  clock: Clock,
  firebase: FirebaseWebConfig | null,
  verifyIdToken?: FirebaseTokenVerifier,
): IdentityProvider {
  if (firebase) {
    return createFirebaseIdentityProvider(db, clock, {
      projectId: firebase.projectId,
      verifyIdToken,
    })
  }
  return createLocalPasswordProvider(db, clock)
}
