/**
 * Organization isolation (requirements section 13): two organizations on one server, with
 * adversarial id substitution on every entity a request can name.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '@/domain/ids'
import type { Membership, Organization, User, Vendor } from '@/domain/types'
import { STAFF_PASSWORD, createTestServer, type TestServer } from './testServer'
import { vendorIdFor } from '../../server/seed/sampleData'

let server: TestServer
const CEDAR_ADMIN = 'dana.whitfield@example.com'
const OTHER_ADMIN = 'admin@northgate.example.com'
const OTHER_PASSWORD = 'northgate-admin-password'

interface OtherOrganization {
  organization: Organization
  vendor: Vendor
  requirementId: string
}

let other: OtherOrganization

beforeEach(async () => {
  server = await createTestServer()
  const timestamp = server.clock.nowIso()
  const organization: Organization = {
    id: newId(),
    name: 'Northgate Facilities',
    timezone: 'America/Chicago',
    support_email: 'ops@northgate.example.com',
    support_contact_name: 'Northgate operations',
    record_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  }
  const user: User = {
    id: newId(),
    display_name: 'Northgate Admin',
    email: OTHER_ADMIN,
    auth_subject: null,
    password_hash: await server.deps.identityProvider.hashPassword(OTHER_PASSWORD),
    password_updated_at: timestamp,
    status: 'active',
    last_login_at: null,
    created_at: timestamp,
  }
  const membership: Membership = {
    id: newId(),
    organization_id: organization.id,
    user_id: user.id,
    role: 'admin',
  }
  const vendor: Vendor = {
    id: newId(),
    organization_id: organization.id,
    company_name: 'Northgate Vendor',
    category: 'Electrical',
    contact_name: 'Nora Gate',
    contact_email: 'nora.gate@northgate.example.com',
    lifecycle: 'active',
    invited_at: null,
    property_tags: [],
    archived_at: null,
    archive_reason: null,
    record_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  }
  const requirementId = newId()
  await server.db.write(async (uow) => {
    await uow.organizations.put(organization)
    await uow.users.put(user)
    await uow.memberships.put(membership)
    await uow.vendors.put(vendor)
    await uow.requirements.put({
      id: requirementId,
      organization_id: organization.id,
      vendor_id: vendor.id,
      source_template_id: null,
      source_template_version: null,
      source_item_id: null,
      title: 'Insurance certificate',
      instructions: 'Upload the certificate.',
      required: true,
      expiration_required: true,
      collect_issue_date: false,
      sort_order: 0,
      due_date: null,
      retired_at: null,
      retired_reason: null,
      effective_submission_id: null,
      record_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    })
  })
  other = { organization, vendor, requirementId }
})

afterEach(() => {
  server.close()
})

describe('organization isolation', () => {
  it('never lists or reads another organization’s vendors', async () => {
    const cookie = await server.signIn(CEDAR_ADMIN, STAFF_PASSWORD)
    const list = await server.request('/api/vendors?lifecycle=all', { cookie })
    const names = list.body.rows.map((row: { vendor: { company_name: string } }) => row.vendor.company_name)
    expect(names).not.toContain('Northgate Vendor')

    const substituted = await server.request(`/api/vendors/${other.vendor.id}`, { cookie })
    expect(substituted.status).toBe(404)
  })

  it('refuses to mutate another organization’s records', async () => {
    const cookie = await server.signIn(CEDAR_ADMIN, STAFF_PASSWORD)

    const archived = await server.request(`/api/vendors/${other.vendor.id}/archive`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ reason: 'Adversarial id substitution' }),
    })
    expect(archived.status).toBe(404)

    const retired = await server.request(`/api/requirements/${other.requirementId}/retire`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ reason: 'Adversarial id substitution' }),
    })
    expect(retired.status).toBe(404)

    const invited = await server.request(`/api/vendors/${other.vendor.id}/invitation-preview`, { cookie })
    expect(invited.status).toBe(404)
  })

  it('keeps each administrator inside their own organization', async () => {
    const northgate = await server.signIn(OTHER_ADMIN, OTHER_PASSWORD)
    const session = await server.request('/api/session', { cookie: northgate })
    expect(session.body.organization.name).toBe('Northgate Facilities')

    const overview = await server.request('/api/overview', { cookie: northgate })
    expect(overview.body.counts.active).toBe(1)

    const cedarVendor = await server.request(`/api/vendors/${vendorIdFor('ironwood-pest-control')}`, {
      cookie: northgate,
    })
    expect(cedarVendor.status).toBe(404)

    const cedarExport = await server.request('/api/vendors-export?lifecycle=all', { cookie: northgate })
    expect(cedarExport.body.csv).not.toContain('Ironwood')
  })

  it('rejects a cross-organization reference at the database level', async () => {
    await expect(
      server.db.write(async (uow) => {
        await uow.requirements.put({
          id: newId(),
          // Cedar Grove's organization id with Northgate's vendor id.
          organization_id: (await uow.organizations.getAll()).find(
            (organization) => organization.name === 'Cedar Grove Property Operations',
          )!.id,
          vendor_id: other.vendor.id,
          source_template_id: null,
          source_template_version: null,
          source_item_id: null,
          title: 'Smuggled requirement',
          instructions: '',
          required: true,
          expiration_required: false,
          collect_issue_date: false,
          sort_order: 0,
          due_date: null,
          retired_at: null,
          retired_reason: null,
          effective_submission_id: null,
          record_version: 1,
          created_at: server.clock.nowIso(),
          updated_at: server.clock.nowIso(),
        })
      }),
    ).rejects.toThrow(/another organization/i)
  })
})
