/**
 * Development API process. The Vite dev server owns port 43217 and proxies `/api` here, so
 * invitation links still point at the address the browser is using.
 */
import { serve } from '@hono/node-server'
import { createServer } from './main'

const API_PORT = Number(process.env.API_PORT ?? 43218)
const WEB_PORT = Number(process.env.WEB_PORT ?? 43217)

const { app, config, deliveryWorker, scheduler } = await createServer({
  port: API_PORT,
  publicUrl: process.env.PUBLIC_URL ?? `http://127.0.0.1:${WEB_PORT}`,
})

deliveryWorker.start()
scheduler.start()
serve({ fetch: app.fetch, hostname: config.host, port: API_PORT })
console.log(`API listening on http://${config.host}:${API_PORT} (client: ${config.publicUrl})`)
console.log(`  database: ${config.databaseFile}`)
console.log(
  `  email delivery: ${config.smtp ? `SMTP ${config.smtp.host}:${config.smtp.port}` : 'not configured (messages stay queued)'}`,
)
