/**
 * Invitation lifecycle (requirements section 5.5, FR-03): single-use hashed tokens, 7-day
 * expiry, revocation on resend, and account binding that grants portal access.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '@/domain/clock'
import { hashToken } from '../../server/auth/tokens'
import { vendorIdFor } from '../../server/seed/sampleData'
import { STAFF_PASSWORD, createTestServer, type TestServer } from './testServer'

let server: TestServer
const COORDINATOR = 'marcus.reyes@example.com'
const UNINVITED_VENDOR = 'willow-creek-signage'

beforeEach(async () => {
  server = await createTestServer()
})

afterEach(() => {
  server.close()
})

async function createInvitation(vendorSlug = UNINVITED_VENDOR) {
  const cookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
  const vendorId = vendorIdFor(vendorSlug)
  const preview = await server.request(`/api/vendors/${vendorId}/invitation-preview`, { cookie })
  const created = await server.request(`/api/vendors/${vendorId}/invitation`, {
    method: 'POST',
    cookie,
    body: JSON.stringify({
      expectedContactEmail: preview.body.recipient,
      requestKey: `invite-${vendorSlug}-1`,
    }),
  })
  expect(created.status).toBe(200)
  const token = new URL(created.body.accept_url).searchParams.get('token')!
  return { cookie, vendorId, token, recipient: preview.body.recipient as string, created }
}

describe('invitations', () => {
  it('stores only the token hash and never writes the token to history', async () => {
    const { token } = await createInvitation()
    const invitations = await server.db.read((uow) => uow.invitations.getAll())
    const stored = invitations.find((invitation) => invitation.token_hash === hashToken(token))
    expect(stored).toBeDefined()
    expect(JSON.stringify(invitations)).not.toContain(token)

    const events = await server.db.read((uow) => uow.activity.getAll())
    expect(JSON.stringify(events)).not.toContain(token)
    const notifications = await server.db.read((uow) => uow.notifications.getAll())
    const invitationMessage = notifications.find((row) => row.type === 'invitation' && row.status === 'queued')
    // The message itself has to carry the link; nothing else may.
    expect(invitationMessage?.body).toContain(token)
  })

  it('creates an account and a verified vendor membership, once', async () => {
    const { token, vendorId, recipient } = await createInvitation()
    const accepted = await server.request('/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({
        token,
        display_name: 'Nadia Brooks',
        password: 'a-long-enough-password',
      }),
    })
    expect(accepted.status).toBe(200)
    const cookie = accepted.headers.get('Set-Cookie')!.split(';')[0]

    const session = await server.request('/api/session', { cookie })
    expect(session.body.role).toBe('vendor_contact')
    expect(session.body.activeVendorId).toBe(vendorId)

    const portal = await server.request('/api/portal', { cookie })
    expect(portal.status).toBe(200)
    expect(portal.body.vendor.id).toBe(vendorId)

    const reuse = await server.request('/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, display_name: 'Someone Else', password: 'a-long-enough-password' }),
    })
    expect(reuse.status).toBe(409)

    const signedInAgain = await server.signIn(recipient, 'a-long-enough-password')
    expect(signedInAgain).toContain('docksy_session=')
  })

  it('reports invalid, revoked and expired links differently', async () => {
    const invalid = await server.request('/api/invitations/check?token=not-a-real-token')
    expect(invalid.status).toBe(404)

    const { token, cookie, vendorId } = await createInvitation()
    const detail = await server.request(`/api/vendors/${vendorId}`, { cookie })
    const invitationId = detail.body.invitations[0].id
    await server.request(`/api/invitations/${invitationId}`, { method: 'DELETE', cookie })
    const revoked = await server.request(`/api/invitations/check?token=${token}`)
    expect(revoked.status).toBe(403)
    expect(revoked.body.error.message).toContain('revoked')

    const later = await createInvitation('lakeside-window-care')
    // Eight days later the token is past its 7-day life.
    server.deps.clock = fixedClock('2026-09-25T12:00:00.000Z')
    const expired = await server.request(`/api/invitations/check?token=${later.token}`)
    expect(expired.status).toBe(403)
    expect(expired.body.error.message).toContain('expired')
  })

  it('revokes the previous unaccepted token when an invitation is resent', async () => {
    const { token, cookie, vendorId, recipient } = await createInvitation()
    const resent = await server.request(`/api/vendors/${vendorId}/invitation`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ expectedContactEmail: recipient, requestKey: 'invite-resend' }),
    })
    expect(resent.status).toBe(200)
    const newToken = new URL(resent.body.accept_url).searchParams.get('token')!

    expect((await server.request(`/api/invitations/check?token=${token}`)).status).toBe(403)
    expect((await server.request(`/api/invitations/check?token=${newToken}`)).status).toBe(200)
  })

  it('replays a repeated invitation request instead of sending twice', async () => {
    const { cookie, vendorId, recipient } = await createInvitation()
    const before = await server.db.read((uow) => uow.notifications.count())
    const replay = await server.request(`/api/vendors/${vendorId}/invitation`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        expectedContactEmail: recipient,
        requestKey: `invite-${UNINVITED_VENDOR}-1`,
      }),
    })
    expect(replay.status).toBe(200)
    expect(replay.body.replayed).toBe(true)
    expect(await server.db.read((uow) => uow.notifications.count())).toBe(before)
  })
})
