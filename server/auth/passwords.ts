/**
 * Password hashing with scrypt from Node's crypto module: no external service, no API key.
 * Stored format: `scrypt$N$r$p$salt$derivedKey` (both values base64).
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { validationError } from '@/domain/errors'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>

const PARAMS = { N: 16_384, r: 8, p: 1 }
const KEY_LENGTH = 64
export const MINIMUM_PASSWORD_LENGTH = 12

export function assertPasswordPolicy(password: string, field = 'password'): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw validationError('Choose a longer password.', {
      [field]: `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    })
  }
  if (password.length > 200) {
    throw validationError('That password is too long.', { [field]: 'Use at most 200 characters.' })
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, n, r, p, salt, digest] = stored.split('$')
  if (scheme !== 'scrypt') return false
  try {
    const expected = Buffer.from(digest, 'base64')
    const derived = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
