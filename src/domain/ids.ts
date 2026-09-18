import type { UUID } from './types'

export function newId(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return formatUuid(bytes)
}

function formatUuid(bytes: Uint8Array): UUID {
  const patched = new Uint8Array(bytes)
  patched[6] = (patched[6] & 0x0f) | 0x40
  patched[8] = (patched[8] & 0x3f) | 0x80
  const hex = [...patched].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Deterministic UUID for the optional sample dataset so test assertions stay stable across
 * reseeds. Never used for records created at runtime.
 */
export function stableId(key: string): UUID {
  const bytes = new Uint8Array(16)
  let h1 = 0x811c9dc5
  let h2 = 0xc2b2ae35
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0
  }
  for (let i = 0; i < 16; i += 1) {
    h1 = Math.imul(h1 ^ (h1 >>> 13), 0x5bd1e995) >>> 0
    h2 = Math.imul(h2 ^ (h2 >>> 15), 0x27d4eb2f) >>> 0
    bytes[i] = (i % 2 === 0 ? h1 : h2) & 0xff
  }
  return formatUuid(bytes)
}