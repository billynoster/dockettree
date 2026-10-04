/**
 * Verify Firebase Authentication ID tokens using Google's public JWKS.
 *
 * No service-account JSON is required: the token is a JWT signed by
 * `securetoken@system.gserviceaccount.com`, checked against project ID as audience and issuer.
 * Analytics / Hosting / Firestore are not used.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { validationError } from '@/domain/errors'

export const FIREBASE_SIGNIN_FAILURE = 'That email and password do not match an active account.'

export interface FirebaseTokenClaims {
  uid: string
  email: string
}

const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
)

const defaultJwks = createRemoteJWKSet(FIREBASE_JWKS_URL)

function fail(): never {
  throw validationError(FIREBASE_SIGNIN_FAILURE, {
    password: 'Check the email and password and try again.',
  })
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
  getKey: JWTVerifyGetKey = defaultJwks,
): Promise<FirebaseTokenClaims> {
  const token = idToken.trim()
  if (!token || !projectId) fail()

  let payload
  try {
    ;({ payload } = await jwtVerify(token, getKey, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
      clockTolerance: 5,
    }))
  } catch {
    fail()
  }

  const uid = typeof payload.sub === 'string' ? payload.sub : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!uid || !email) fail()
  return { uid, email }
}
