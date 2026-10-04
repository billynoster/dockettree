/**
 * Firebase Authentication (Email/Password) for the browser.
 *
 * Config is loaded at runtime from GET /api/public-config so Cloud Run env can change
 * without a client rebuild. Analytics is never initialized.
 */
import { AppError } from '@/domain/errors'

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

export interface PublicConfig {
  auth: {
    provider: string
    firebase: FirebaseWebConfig | null
  }
  billing?: {
    mode: 'mock' | 'stripe'
    trialDays: number
    publishableKey: string | null
    prices: {
      starterMonthly: boolean
      starterYearly: boolean
      growthMonthly: boolean
      growthYearly: boolean
      portfolioMonthly: boolean
      portfolioYearly: boolean
    }
  }
}

const GENERIC_FAILURE = 'That email and password do not match an active account.'

let cachedConfig: PublicConfig | null = null
let inflight: Promise<PublicConfig> | null = null

export async function loadPublicConfig(): Promise<PublicConfig> {
  if (cachedConfig) return cachedConfig
  if (!inflight) {
    inflight = fetch('/api/public-config', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          throw new AppError(
            'storage_unavailable',
            'The server could not be reached. Check your connection and try again.',
          )
        }
        const config = (await response.json()) as PublicConfig
        cachedConfig = config
        return config
      })
      .finally(() => {
        inflight = null
      })
  }
  return await inflight
}

export function prefetchPublicConfig(): void {
  void loadPublicConfig()
}

function firebaseCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code)
  }
  return ''
}

function mapFirebaseAuthError(error: unknown): never {
  const code = firebaseCode(error)
  if (code === 'auth/too-many-requests') {
    throw new AppError('rate_limited', 'Too many sign-in attempts. Wait a few minutes and try again.')
  }
  if (code === 'auth/network-request-failed') {
    throw new AppError(
      'storage_unavailable',
      'The server could not be reached. Check your connection and try again.',
    )
  }
  if (code === 'auth/invalid-email') {
    throw new AppError('validation', 'Enter a valid email address.', {
      fieldErrors: { email: 'Enter a valid email address.' },
    })
  }
  if (code === 'auth/weak-password') {
    throw new AppError('validation', 'Choose a longer password.', {
      fieldErrors: { password: 'Use at least 12 characters.' },
    })
  }
  throw new AppError('validation', GENERIC_FAILURE, {
    fieldErrors: { password: 'Check the email and password and try again.' },
  })
}

async function firebaseAuth(config: FirebaseWebConfig) {
  const { getApps, initializeApp } = await import('firebase/app')
  const { getAuth } = await import('firebase/auth')
  const existing = getApps()[0]
  const app =
    existing ??
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
      ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
      ...(config.messagingSenderId ? { messagingSenderId: config.messagingSenderId } : {}),
    })
  return getAuth(app)
}

async function signOutFirebase(auth: Awaited<ReturnType<typeof firebaseAuth>>): Promise<void> {
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

/** Sign in with Firebase when the server is in Firebase mode; otherwise return null. */
export async function firebaseIdTokenForLogin(email: string, password: string): Promise<string | null> {
  const config = await loadPublicConfig()
  if (!config.auth.firebase) return null
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const auth = await firebaseAuth(config.auth.firebase)
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
    const idToken = await credential.user.getIdToken()
    await signOutFirebase(auth)
    return idToken
  } catch (error) {
    mapFirebaseAuthError(error)
  }
}

/**
 * Create a Firebase email/password user (or sign in if that email already exists).
 * Returns an ID token when Firebase is configured, otherwise null.
 */
export async function provisionFirebasePasswordUser(
  email: string,
  password: string,
  options: { signInIfExists?: boolean } = {},
): Promise<string | null> {
  const config = await loadPublicConfig()
  if (!config.auth.firebase) return null
  const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth')
  const auth = await firebaseAuth(config.auth.firebase)
  const trimmed = email.trim()
  try {
    const credential = await createUserWithEmailAndPassword(auth, trimmed, password)
    const idToken = await credential.user.getIdToken()
    await signOutFirebase(auth)
    return idToken
  } catch (error) {
    if (firebaseCode(error) === 'auth/email-already-in-use') {
      if (!options.signInIfExists) return null
      try {
        const credential = await signInWithEmailAndPassword(auth, trimmed, password)
        const idToken = await credential.user.getIdToken()
        await signOutFirebase(auth)
        return idToken
      } catch (signInError) {
        mapFirebaseAuthError(signInError)
      }
    }
    mapFirebaseAuthError(error)
  }
}

export async function signOutFirebaseClient(): Promise<void> {
  if (!cachedConfig?.auth.firebase) return
  try {
    const auth = await firebaseAuth(cachedConfig.auth.firebase)
    await signOutFirebase(auth)
  } catch {
    // Cookie session is the source of truth; a Firebase sign-out miss is harmless.
  }
}
