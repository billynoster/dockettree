/** Server entry point: wire storage, auth, mail and jobs, then listen. */
import { serve } from '@hono/node-server'
import { systemClock } from '@/domain/clock'
import { createIdentityProvider } from './auth/identityProvider'
import { hashToken, newToken } from './auth/tokens'
import { loadConfig } from './config'
import { createApp } from './http/app'
import type { AppDependencies } from './http/context'
import { ReminderScheduler } from './jobs/reminderScheduler'
import { NotificationDeliveryWorker } from './mail/deliveryWorker'
import { createMailer } from './mail/mailer'
import { openStorage } from './storage'

export async function createServer(overrides: Parameters<typeof loadConfig>[0] = {}) {
  const config = loadConfig(overrides)
  const { db, databaseLabel, documentsLabel } = await openStorage(config)
  const clock = systemClock()
  const mailer = createMailer(config.smtp)
  const deliveryWorker = new NotificationDeliveryWorker(db, clock, mailer)
  const scheduler = new ReminderScheduler(db, clock)

  const deps: AppDependencies = {
    config,
    db,
    clock,
    mailer,
    identityProvider: createIdentityProvider(db, clock, config.firebase),
    tokens: { create: newToken, hash: hashToken },
    deliveryWorker,
  }

  return { config, db, deps, app: createApp(deps), deliveryWorker, scheduler, databaseLabel, documentsLabel }
}

async function main(): Promise<void> {
  const { config, app, deliveryWorker, scheduler, databaseLabel, documentsLabel } = await createServer()
  if (config.runBackgroundJobs) {
    deliveryWorker.start()
    scheduler.start()
  }
  serve({ fetch: app.fetch, hostname: config.host, port: config.port })
  const delivery = config.smtp ? `SMTP ${config.smtp.host}:${config.smtp.port}` : 'not configured (messages stay queued)'
  console.log(`Docket Tree listening on http://${config.host}:${config.port}`)
  console.log(`  database: ${databaseLabel}`)
  console.log(`  documents: ${documentsLabel}`)
  console.log(`  email delivery: ${delivery}`)
  console.log(
    `  identity: ${
      config.firebase ? `firebase (${config.firebase.projectId})` : 'local-password'
    }`,
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
