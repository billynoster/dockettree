/** Properties directory and readiness reports. */
import { Hono } from 'hono'
import {
  createProperty,
  listProperties,
  setPropertyArchived,
  setPropertyVendors,
  updateProperty,
} from '@/services/propertyService'
import { exportReadinessReportCsv, getReadinessReport } from '@/services/reportService'
import { requirePrincipal, serviceContextFor, type AppEnv } from '../context'
import { handle, param } from '../handler'

export const propertyRoutes = new Hono<AppEnv>()

async function ctxOf(c: Parameters<Parameters<typeof handle>[0]>[0]) {
  return await serviceContextFor(c.get('deps'), requirePrincipal(c))
}

propertyRoutes.get(
  '/properties',
  handle(async (c) => await listProperties(await ctxOf(c))),
)

propertyRoutes.post(
  '/properties',
  handle(async (c) => {
    const body = await c.req.json()
    return await createProperty(await ctxOf(c), body)
  }),
)

propertyRoutes.patch(
  '/properties/:propertyId',
  handle(async (c) => {
    const body = await c.req.json()
    return await updateProperty(await ctxOf(c), param(c, 'propertyId'), body)
  }),
)

propertyRoutes.post(
  '/properties/:propertyId/archived',
  handle(async (c) => {
    const body = await c.req.json<{ archived?: boolean; reason?: string }>()
    return await setPropertyArchived(
      await ctxOf(c),
      param(c, 'propertyId'),
      body.archived ?? true,
      body.reason,
    )
  }),
)

propertyRoutes.put(
  '/properties/:propertyId/vendors',
  handle(async (c) => {
    const body = await c.req.json<{ vendor_ids?: string[] }>()
    return await setPropertyVendors(await ctxOf(c), param(c, 'propertyId'), body.vendor_ids ?? [])
  }),
)

propertyRoutes.get(
  '/reports/readiness',
  handle(async (c) => await getReadinessReport(await ctxOf(c))),
)

propertyRoutes.get(
  '/reports/readiness.csv',
  handle(async (c) => await exportReadinessReportCsv(await ctxOf(c))),
)
