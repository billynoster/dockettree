/**
 * HTTP application. Everything under `/api` requires an authenticated session except
 * sign-in, the session probe, first-run setup and invitation acceptance. In production the
 * same process also serves the built browser client.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { loadPrincipal, type AppDependencies, type AppEnv } from './context'
import { adminRoutes } from './routes/admin'
import { billingRoutes } from './routes/billing'
import { documentRoutes } from './routes/documents'
import { sessionRoutes } from './routes/session'
import { testingRoutes } from './routes/testing'
import { vendorRoutes } from './routes/vendors'

const CLIENT_DIR = path.resolve(process.cwd(), 'dist')

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('deps', deps)
    c.set('principal', null)
    await next()
  })

  app.use('/api/*', async (c, next) => {
    c.set('principal', await loadPrincipal(c))
    await next()
  })

  app.route('/api', sessionRoutes)
  app.route('/api', billingRoutes)
  app.route('/api', vendorRoutes)
  app.route('/api', documentRoutes)
  app.route('/api', adminRoutes)
  if (process.env.DOCKSY_ENABLE_TEST_RESET === 'true') {
    app.route('/api', testingRoutes)
  }

  app.get('/api/health', (c) => c.json({ status: 'ok' }))

  if (existsSync(CLIENT_DIR)) {
    app.use('/assets/*', serveStatic({ root: path.relative(process.cwd(), CLIENT_DIR) }))
    app.get('/favicon.svg', serveStatic({ path: path.join(path.relative(process.cwd(), CLIENT_DIR), 'favicon.svg') }))
    // Client-side routing: any non-API path returns the app shell.
    app.get('*', async (c) => {
      if (c.req.path.startsWith('/api/')) return c.notFound()
      const html = await readFile(path.join(CLIENT_DIR, 'index.html'), 'utf8')
      return c.html(html)
    })
  }

  return app
}
