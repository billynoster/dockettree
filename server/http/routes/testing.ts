/**
 * Test-support routes. Mounted only when `DOCKSY_ENABLE_TEST_RESET=true`, which the end-to-end
 * runner sets and a real deployment never does.
 *
 * It exists because SQLite allows exactly one process to own a database file: a test harness
 * that wrote to the file directly would invalidate the running server's connections.
 */
import { Hono } from 'hono'
import { hashPassword } from '../../auth/passwords'
import { hashToken } from '../../auth/tokens'
import { seedSampleData } from '../../seed/sampleData'
import type { AppEnv } from '../context'
import { handle } from '../handler'

export const testingRoutes = new Hono<AppEnv>()

testingRoutes.post(
  '/testing/reseed',
  handle(async (c) => {
    const deps = c.get('deps')
    const body = await c.req
      .json<{ staffPassword?: string; vendorPassword?: string }>()
      .catch(() => ({}) as { staffPassword?: string; vendorPassword?: string })
    await seedSampleData(deps.db, deps.clock.now(), {
      hashPassword,
      hashToken,
      staffPassword: body.staffPassword ?? 'cedar-grove-staff-2026',
      vendorPassword: body.vendorPassword ?? 'cedar-grove-vendor-2026',
    })
    return { reseeded: true, vendors: await deps.db.read((uow) => uow.vendors.count()) }
  }),
)
