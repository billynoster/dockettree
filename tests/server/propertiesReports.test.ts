import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STAFF_PASSWORD, createTestServer, type TestServer } from './testServer'

const ADMIN = 'dana.whitfield@example.com'
const COORDINATOR = 'marcus.reyes@example.com'

describe('properties and readiness reports', () => {
  let server: TestServer
  let adminCookie: string
  let coordinatorCookie: string

  beforeEach(async () => {
    server = await createTestServer()
    adminCookie = await server.signIn(ADMIN, STAFF_PASSWORD)
    coordinatorCookie = await server.signIn(COORDINATOR, STAFF_PASSWORD)
  })

  afterEach(() => {
    server.close()
  })

  it('lists seeded properties with vendor links and usage', async () => {
    const response = await server.request('/api/properties', { cookie: adminCookie })
    expect(response.status).toBe(200)
    expect(response.body.properties.length).toBeGreaterThanOrEqual(3)
    expect(response.body.usage.activeCount).toBeGreaterThanOrEqual(3)
    const riverfront = response.body.properties.find(
      (entry: { property: { name: string }; vendorCount: number }) =>
        entry.property.name === 'Riverfront Offices',
    )
    expect(riverfront?.vendorCount).toBeGreaterThan(0)
  })

  it('creates a property and links vendors without hard-blocking', async () => {
    const create = await server.request('/api/properties', {
      method: 'POST',
      cookie: coordinatorCookie,
      body: JSON.stringify({
        name: 'Harbor Annex',
        address: '1 Harbor Way',
        notes: 'Overflow site',
      }),
    })
    expect(create.status).toBe(200)
    expect(create.body.property_id).toBeTruthy()

    const vendors = await server.request('/api/vendors?lifecycle=all&pageSize=50', {
      cookie: coordinatorCookie,
    })
    expect(vendors.status).toBe(200)
    const vendorIds = (vendors.body.rows as { vendor: { id: string } }[])
      .slice(0, 2)
      .map((row) => row.vendor.id)

    const link = await server.request(`/api/properties/${create.body.property_id}/vendors`, {
      method: 'PUT',
      cookie: coordinatorCookie,
      body: JSON.stringify({ vendor_ids: vendorIds }),
    })
    expect(link.status).toBe(200)
    expect(link.body.vendorCount).toBe(2)

    for (const vendorId of vendorIds) {
      const detail = await server.request(`/api/vendors/${vendorId}`, { cookie: coordinatorCookie })
      expect(detail.status).toBe(200)
      expect(detail.body.snapshot.vendor.property_tags).toContain('Harbor Annex')
    }
  })

  it('serves readiness report and CSV export', async () => {
    const report = await server.request('/api/reports/readiness', { cookie: adminCookie })
    expect(report.status).toBe(200)
    expect(report.body.totals.active_vendors).toBeGreaterThan(0)
    expect(
      (report.body.by_property as { property_name: string }[]).some(
        (row) => row.property_name === 'Riverfront Offices',
      ),
    ).toBe(true)

    const csv = await server.request('/api/reports/readiness.csv', { cookie: adminCookie })
    expect(csv.status).toBe(200)
    expect(csv.body.filename).toMatch(/^readiness-report-/)
    expect(csv.body.csv).toContain('company_name')
    expect(csv.body.rowCount).toBe(report.body.vendors.length)
  })

  it('exposes Properties and Reports outside Coming later via session shell routes', async () => {
    // Smoke: authenticated GETs succeed (nav wiring is covered by UI).
    const properties = await server.request('/api/properties', { cookie: adminCookie })
    const reports = await server.request('/api/reports/readiness', { cookie: adminCookie })
    expect(properties.status).toBe(200)
    expect(reports.status).toBe(200)
  })
})
