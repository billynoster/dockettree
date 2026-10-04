import { afterEach, describe, expect, it } from 'vitest'
import { validationError } from '@/domain/errors'
import { createFirebaseIdentityProvider } from '../../server/auth/identityProvider'
import { vendorIdFor } from '../../server/seed/sampleData'
import { STAFF_PASSWORD, createTestServer, type TestServer } from './testServer'

const ADMIN = 'dana.whitfield@example.com'
const COORDINATOR = 'marcus.reyes@example.com'
const FIREBASE_WEB = {
  apiKey: 'test-api-key',
  authDomain: 'docket-tree.firebaseapp.com',
  projectId: 'docket-tree',
  appId: '1:test:web:test',
}

const GENERIC = 'That email and password do not match an active account.'

describe('public auth config', () => {
  it('omits Firebase when env is unset so local preview keeps working', async () => {
    const server = await createTestServer()
    try {
      const response = await server.request('/api/public-config')
      expect(response.status).toBe(200)
      expect(response.body.auth.provider).toBe('local-password')
      expect(response.body.auth.firebase).toBeNull()
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      server.close()
    }
  })

  it('returns runtime Firebase web config without Analytics', async () => {
    const server = await createTestServer({
      firebase: FIREBASE_WEB,
      createIdentityProvider: (db, clock) =>
        createFirebaseIdentityProvider(db, clock, {
          projectId: FIREBASE_WEB.projectId,
          verifyIdToken: async () => {
            throw validationError(GENERIC)
          },
        }),
    })
    try {
      const response = await server.request('/api/public-config')
      expect(response.status).toBe(200)
      expect(response.body.auth.provider).toBe('firebase')
      expect(response.body.auth.firebase).toEqual(FIREBASE_WEB)
      expect(JSON.stringify(response.body)).not.toContain('measurementId')
    } finally {
      server.close()
    }
  })
})

describe('Firebase ID token exchange', () => {
  let server: TestServer

  afterEach(() => {
    server?.close()
  })

  async function boot(verify: (idToken: string) => Promise<{ uid: string; email: string }>) {
    server = await createTestServer({
      firebase: FIREBASE_WEB,
      createIdentityProvider: (db, clock) =>
        createFirebaseIdentityProvider(db, clock, {
          projectId: FIREBASE_WEB.projectId,
          verifyIdToken: verify,
        }),
    })
    return server
  }

  it('rejects a raw email/password body when Firebase is the provider', async () => {
    await boot(async () => ({ uid: 'x', email: ADMIN }))
    const response = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN, password: STAFF_PASSWORD }),
    })
    expect(response.status).toBe(422)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('exchanges a valid ID token, links uid onto the local user, and opens a session', async () => {
    await boot(async (idToken) => {
      if (idToken !== 'good-token') throw validationError(GENERIC)
      return { uid: 'firebase-uid-dana', email: ADMIN }
    })
    const response = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'good-token' }),
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('Set-Cookie')!.split(';')[0]
    const session = await server.request('/api/session', { cookie })
    expect(session.body.authenticated).toBe(true)
    expect(session.body.provider).toBe('firebase')
    expect(session.body.managesPasswords).toBe(false)
    expect(session.body.user.email).toBe(ADMIN)

    const user = await server.db.read(async (uow) => (await uow.users.where('by_email', ADMIN))[0])
    expect(user?.auth_subject).toBe('firebase-uid-dana')
  })

  it('uses the same failure message for a bad token and an unknown email', async () => {
    await boot(async (idToken) => {
      if (idToken === 'unknown') return { uid: 'nobody', email: 'nobody@example.com' }
      throw validationError(GENERIC, { password: 'Check the email and password and try again.' })
    })
    const badToken = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'nope' }),
    })
    const unknown = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'unknown' }),
    })
    expect(badToken.status).toBe(422)
    expect(unknown.status).toBe(422)
    expect(badToken.body.error.message).toBe(unknown.body.error.message)
  })

  it('still signs an invited vendor in without an ID token so accept cannot get stuck', async () => {
    await boot(async (idToken) => {
      if (idToken === 'coordinator') return { uid: 'uid-marcus', email: COORDINATOR }
      throw validationError(GENERIC)
    })
    const login = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'coordinator' }),
    })
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0]
    const vendorId = vendorIdFor('willow-creek-signage')
    const preview = await server.request(`/api/vendors/${vendorId}/invitation-preview`, { cookie })
    const created = await server.request(`/api/vendors/${vendorId}/invitation`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        expectedContactEmail: preview.body.recipient,
        requestKey: 'invite-firebase-1',
      }),
    })
    expect(created.status).toBe(200)
    const token = new URL(created.body.accept_url).searchParams.get('token')!

    const accepted = await server.request('/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({
        token,
        display_name: 'Beatriz Ortiz',
        password: 'a-long-enough-password',
      }),
    })
    expect(accepted.status).toBe(200)
    const vendorCookie = accepted.headers.get('Set-Cookie')!.split(';')[0]
    const portal = await server.request('/api/portal', { cookie: vendorCookie })
    expect(portal.status).toBe(200)
    expect(portal.body.vendor.id).toBe(vendorId)
  })

  it('keeps first-run setup local and still signs the admin in without a Firebase token', async () => {
    server = await createTestServer({
      seed: false,
      firebase: FIREBASE_WEB,
      createIdentityProvider: (db, clock) =>
        createFirebaseIdentityProvider(db, clock, {
          projectId: FIREBASE_WEB.projectId,
          verifyIdToken: async () => {
            throw validationError(GENERIC)
          },
        }),
    })
    const created = await server.request('/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        organizationName: 'Northgate Facilities',
        timezone: 'America/Chicago',
        supportEmail: 'ops@example.com',
        supportContactName: 'Northgate operations',
        adminName: 'Ada Lovelace',
        adminEmail: 'ada@example.com',
        adminPassword: 'a-long-enough-password',
      }),
    })
    expect(created.status).toBe(200)
    const cookie = created.headers.get('Set-Cookie')!.split(';')[0]
    const session = await server.request('/api/session', { cookie })
    expect(session.body.role).toBe('admin')
    expect(session.body.provider).toBe('firebase')
  })
})
