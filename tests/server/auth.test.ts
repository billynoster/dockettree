/**
 * Authentication and server-side authorization: the section 3 matrix, vendor scoping and
 * adversarial id substitution. These are HTTP-level tests, so they exercise exactly what a
 * browser (or a hostile client) can reach.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vendorIdFor } from '../../server/seed/sampleData'
import {
  STAFF_PASSWORD,
  VENDOR_PASSWORD,
  createTestServer,
  samplePdf,
  type TestServer,
} from './testServer'

let server: TestServer

const ADMIN = 'dana.whitfield@example.com'
const COORDINATOR = 'marcus.reyes@example.com'
const REVIEWER = 'priya.raman@example.com'
const IRONWOOD_CONTACT = 'damon.frazier@example.com'

beforeEach(async () => {
  server = await createTestServer()
})

afterEach(() => {
  server.close()
})

describe('sign-in', () => {
  it('rejects a Firebase ID token while this server is using local passwords', async () => {
    const response = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'not-a-real-token' }),
    })
    expect(response.status).toBe(422)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('rejects a wrong password with one message that does not reveal the account', async () => {
    const wrongPassword = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN, password: 'not-the-password' }),
    })
    const unknownEmail = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@example.com', password: 'not-the-password' }),
    })
    expect(wrongPassword.status).toBe(422)
    expect(unknownEmail.status).toBe(422)
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message)
    expect(wrongPassword.headers.get('Set-Cookie')).toBeNull()
  })

  it('throttles repeated failures for the same account', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await server.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: ADMIN, password: 'wrong' }),
      })
    }
    const blocked = await server.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN, password: STAFF_PASSWORD }),
    })
    expect(blocked.status).toBe(429)
  })

  it('reports the role stored on the membership, not anything the client sends', async () => {
    const cookie = await server.signIn(REVIEWER, STAFF_PASSWORD)
    const session = await server.request('/api/session', {
      cookie,
      headers: { 'X-Role': 'admin' },
    })
    expect(session.body.authenticated).toBe(true)
    expect(session.body.role).toBe('reviewer')
    expect(session.body.capabilities).toContain('submission.review')
    expect(session.body.capabilities).not.toContain('vendor.manage')
  })

  it('refuses everything without a session', async () => {
    for (const pathname of ['/api/overview', '/api/vendors', '/api/review', '/api/settings', '/api/portal']) {
      expect((await server.request(pathname)).status).toBe(401)
    }
  })

  it('signs out and invalidates the session cookie', async () => {
    const cookie = await server.signIn(ADMIN, STAFF_PASSWORD)
    expect((await server.request('/api/overview', { cookie })).status).toBe(200)
    await server.request('/api/auth/logout', { method: 'POST', cookie })
    expect((await server.request('/api/overview', { cookie })).status).toBe(401)
  })

  it('rejects a disabled account and ends its sessions', async () => {
    const adminCookie = await server.signIn(ADMIN, STAFF_PASSWORD)
    const reviewerCookie = await server.signIn(REVIEWER, STAFF_PASSWORD)
    const members = await server.request('/api/settings', { cookie: adminCookie })
    const reviewer = members.body.members.find(
      (member: { user: { email: string } }) => member.user.email === REVIEWER,
    )
    const disabled = await server.request(`/api/members/${reviewer.user.id}/status`, {
      method: 'POST',
      cookie: adminCookie,
      body: JSON.stringify({ status: 'disabled' }),
    })
    expect(disabled.status).toBe(200)
    expect((await server.request('/api/overview', { cookie: reviewerCookie })).status).toBe(401)
    await expect(server.signIn(REVIEWER, STAFF_PASSWORD)).rejects.toThrow()
  })

  it('keeps at least one active admin', async () => {
    const cookie = await server.signIn(ADMIN, STAFF_PASSWORD)
    const settings = await server.request('/api/settings', { cookie })
    const admin = settings.body.members.find(
      (member: { membership: { role: string } }) => member.membership.role === 'admin',
    )
    const demoted = await server.request(`/api/members/${admin.user.id}/role`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ role: 'coordinator' }),
    })
    expect(demoted.status).toBe(409)
  })
})

describe('permission matrix (requirements section 3)', () => {
  it('lets a coordinator manage vendors but not decide reviews', async () => {
    const cookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
    const queue = await server.request('/api/review', { cookie })
    expect(queue.status).toBe(200)
    const submissionId = queue.body.items[0].submission.id
    const decision = await server.request(`/api/review/${submissionId}`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ decision: 'accepted', expectedVersion: 1 }),
    })
    expect(decision.status).toBe(403)
  })

  it('lets a reviewer decide but not edit a vendor or manage templates', async () => {
    const cookie = await server.signIn(REVIEWER, STAFF_PASSWORD)
    const vendorId = vendorIdFor('ironwood-pest-control')
    const edit = await server.request(`/api/vendors/${vendorId}`, {
      method: 'PATCH',
      cookie,
      body: JSON.stringify({
        company_name: 'Renamed',
        category: 'Pest control',
        contact_name: 'Damon Frazier',
        contact_email: 'damon.frazier@example.com',
        property_tags: [],
        expectedVersion: 1,
      }),
    })
    expect(edit.status).toBe(403)

    const template = await server.request('/api/templates', {
      method: 'POST',
      cookie,
      body: JSON.stringify({ name: 'New', description: '', items: [] }),
    })
    expect(template.status).toBe(403)
  })

  it('only lets an admin manage members and settings', async () => {
    const cookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
    const patched = await server.request('/api/settings', {
      method: 'PATCH',
      cookie,
      body: JSON.stringify({
        name: 'Renamed org',
        timezone: 'America/Chicago',
        support_email: 'ops@example.com',
        support_contact_name: 'Ops',
        expectedVersion: 1,
      }),
    })
    expect(patched.status).toBe(403)

    const member = await server.request('/api/members', {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        display_name: 'New Person',
        email: 'new.person@example.com',
        role: 'reviewer',
        password: 'a-long-enough-password',
      }),
    })
    expect(member.status).toBe(403)
  })
})

describe('vendor contact scope', () => {
  it('sees its own portal and nothing else', async () => {
    const cookie = await server.signIn(IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const portal = await server.request('/api/portal', { cookie })
    expect(portal.status).toBe(200)
    expect(portal.body.vendor.company_name).toBe('Ironwood Pest Control')

    for (const pathname of ['/api/vendors', '/api/overview', '/api/review', '/api/notifications', '/api/templates']) {
      expect((await server.request(pathname, { cookie })).status).toBe(403)
    }
    const otherVendor = await server.request(`/api/vendors/${vendorIdFor('riverstone-mechanical')}`, {
      cookie,
    })
    expect(otherVendor.status).toBe(403)
  })

  it('cannot submit against another vendor’s requirement or read its documents', async () => {
    const staffCookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
    const otherVendor = await server.request(`/api/vendors/${vendorIdFor('riverstone-mechanical')}`, {
      cookie: staffCookie,
    })
    const otherRequirementId = otherVendor.body.snapshot.requirements[0].id
    const otherSubmissionId = otherVendor.body.snapshot.submissions[0].id

    const cookie = await server.signIn(IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const form = new FormData()
    form.set('file', samplePdf())
    form.set('issue_date', '')
    form.set('expiration_date', '2027-01-01')
    const upload = await server.request(`/api/requirements/${otherRequirementId}/submissions`, {
      method: 'POST',
      cookie,
      body: form,
    })
    expect(upload.status).toBe(403)

    const download = await server.request(`/api/submissions/${otherSubmissionId}/file`, { cookie })
    expect(download.status).toBe(403)
  })

  it('serves its own document bytes with headers that prevent inline execution', async () => {
    const cookie = await server.signIn(IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const portal = await server.request('/api/portal', { cookie })
    const submission = portal.body.snapshot.submissions[0]
    const download = await server.request(`/api/submissions/${submission.id}/file`, { cookie })
    expect(download.status).toBe(200)
    expect(download.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(download.headers.get('Cache-Control')).toContain('no-store')
    expect(download.headers.get('Content-Security-Policy')).toContain('sandbox')
  })
})

interface PortalRequirementShape {
  status: {
    pending: unknown
    requirement: { id: string; expiration_required: boolean }
  }
}

/** A required item with nothing pending and no expiration date to enter. */
function pendingFreeRequirement(portal: { requirements: PortalRequirementShape[] }) {
  const match = portal.requirements.find(
    (entry) => entry.status.pending === null && !entry.status.requirement.expiration_required,
  )
  if (!match) throw new Error('No submittable requirement in the sample portal')
  return match
}

describe('uploads', () => {
  it('rejects a file whose bytes are not a PDF, PNG or JPEG', async () => {
    const cookie = await server.signIn(IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const portal = await server.request('/api/portal', { cookie })
    const requirementId = pendingFreeRequirement(portal.body).status.requirement.id

    const form = new FormData()
    form.set('file', new File([new TextEncoder().encode('plain text')], 'notes.pdf', {
      type: 'application/pdf',
    }))
    form.set('issue_date', '')
    form.set('expiration_date', '')
    const rejected = await server.request(`/api/requirements/${requirementId}/submissions`, {
      method: 'POST',
      cookie,
      body: form,
    })
    expect(rejected.status).toBe(422)
    expect(rejected.body.error.fieldErrors.file).toBeTruthy()

    const after = await server.request('/api/portal', { cookie })
    const unchanged = after.body.requirements.find(
      (entry: { status: { requirement: { id: string } } }) =>
        entry.status.requirement.id === requirementId,
    )
    expect(unchanged.status.pending).toBeNull()
  })

  it('accepts a valid PDF and records the submission as pending review', async () => {
    const cookie = await server.signIn(IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const portal = await server.request('/api/portal', { cookie })
    const requirement = pendingFreeRequirement(portal.body)
    const form = new FormData()
    form.set('file', samplePdf('safety.pdf'))
    form.set('issue_date', '')
    form.set('expiration_date', '')
    const created = await server.request(
      `/api/requirements/${requirement.status.requirement.id}/submissions`,
      { method: 'POST', cookie, body: form },
    )
    expect(created.status).toBe(200)
    expect(created.body.version_number).toBeGreaterThanOrEqual(1)

    const after = await server.request('/api/portal', { cookie })
    const updated = after.body.requirements.find(
      (entry: { status: { requirement: { id: string } } }) =>
        entry.status.requirement.id === requirement.status.requirement.id,
    )
    expect(updated.status.pending.state).toBe('pending_review')
  })
})

describe('first-run setup', () => {
  it('creates the organization and first admin once, then refuses', async () => {
    const fresh = await createTestServer({ seed: false })
    try {
      const probe = await fresh.request('/api/session')
      expect(probe.body.setupRequired).toBe(true)

      const created = await fresh.request('/api/setup', {
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
      const session = await fresh.request('/api/session', { cookie })
      expect(session.body.role).toBe('admin')
      expect(session.body.setupRequired).toBe(false)

      const again = await fresh.request('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: 'Second org',
          timezone: 'America/Chicago',
          supportEmail: 'ops2@example.com',
          supportContactName: 'Ops',
          adminName: 'Someone Else',
          adminEmail: 'else@example.com',
          adminPassword: 'a-long-enough-password',
        }),
      })
      expect(again.status).toBe(409)
    } finally {
      fresh.close()
    }
  })

  it('enforces the password policy on setup', async () => {
    const fresh = await createTestServer({ seed: false })
    try {
      const created = await fresh.request('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: 'Northgate Facilities',
          timezone: 'America/Chicago',
          supportEmail: 'ops@example.com',
          supportContactName: 'Northgate operations',
          adminName: 'Ada Lovelace',
          adminEmail: 'ada@example.com',
          adminPassword: 'short',
        }),
      })
      expect(created.status).toBe(422)
      expect(created.body.error.fieldErrors.adminPassword).toBeTruthy()
    } finally {
      fresh.close()
    }
  })
})
