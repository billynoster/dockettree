/** Opaque tokens for sessions and invitations. Only the SHA-256 digest is ever stored. */
import { createHash, randomBytes } from 'node:crypto'

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
