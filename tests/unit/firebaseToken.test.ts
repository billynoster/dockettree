import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { isAppError } from '@/domain/errors'
import { verifyFirebaseIdToken } from '../../server/auth/firebaseToken'

const PROJECT = 'docket-tree'

async function signedToken(input: {
  privateKey: CryptoKey
  kid: string
  claims?: Record<string, unknown>
  subject?: string
  issuer?: string
  audience?: string
  expires?: string
}) {
  return await new SignJWT({
    email: 'dana.whitfield@example.com',
    email_verified: true,
    ...(input.claims ?? {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: input.kid })
    .setSubject(input.subject ?? 'firebase-uid-dana')
    .setIssuer(input.issuer ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(input.audience ?? PROJECT)
    .setIssuedAt()
    .setExpirationTime(input.expires ?? '1h')
    .sign(input.privateKey)
}

describe('verifyFirebaseIdToken', () => {
  it('accepts a token signed by Google-style JWKS for the project', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    jwk.kid = 'test-key'
    jwk.alg = 'RS256'
    jwk.use = 'sig'
    const getKey = createLocalJWKSet({ keys: [jwk] })
    const token = await signedToken({ privateKey, kid: 'test-key' })
    await expect(verifyFirebaseIdToken(token, PROJECT, getKey)).resolves.toEqual({
      uid: 'firebase-uid-dana',
      email: 'dana.whitfield@example.com',
    })
  })

  it('rejects the wrong audience, issuer, or a missing email with the same sign-in message', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    jwk.kid = 'test-key'
    jwk.alg = 'RS256'
    const getKey = createLocalJWKSet({ keys: [jwk] })

    const wrongAud = await signedToken({ privateKey, kid: 'test-key', audience: 'other-project' })
    const wrongIss = await signedToken({
      privateKey,
      kid: 'test-key',
      issuer: 'https://securetoken.google.com/other-project',
    })
    const noEmail = await signedToken({ privateKey, kid: 'test-key', claims: { email: '' } })

    for (const token of [wrongAud, wrongIss, noEmail, 'not-a-jwt']) {
      try {
        await verifyFirebaseIdToken(token, PROJECT, getKey)
        throw new Error(`expected ${token} to fail`)
      } catch (error) {
        expect(isAppError(error)).toBe(true)
        if (isAppError(error)) {
          expect(error.message).toBe('That email and password do not match an active account.')
        }
      }
    }
  })
})
