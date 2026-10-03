/** Server entry point: wire storage, auth, mail and jobs, then listen. */
import { mkdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { systemClock } from '@/domain/clock'
import { createLocalPasswordProvider } from './auth/identityProvider'
import { hashToken, newToken } from './auth/tokens'
import { loadConfig } from './config'
import { SqliteDatabase } from './db/sqliteDatabase'
import { LocalBlobStore } from './files/localBlobStore'
import { createApp } from './http/app'
import type { AppDependencies } from './http/context'
import { ReminderScheduler } from './jobs/reminderScheduler'
import { NotificationDeliveryWorker } from './mail/deliveryWorker'
import { createMailer } from './mail/mailer'

export async function createServer(overrides: Parameters<typeof loadConfig>[0] = {}) {
  const config = loadConfig(overrides)
  await mkdir(config.dataDir, { recursive: true })
  await mkdir(config.uploadDir, { recursive: true, mode: 0o700 })

  const clock = systemClock()
  const blobs = new LocalBlobStore(config.uploadDir)
  const db = new SqliteDatabase({ file: config.databaseFile, blobs })
  const mailer = createMailer(config.smtp)
  const deliveryWorker = new NotificationDeliveryWorker(db, clock, mailer)
  const scheduler = new ReminderScheduler(db, clock)

  const deps: AppDependencies = {
    config,
    db,
    clock,
    mailer,
    identityProvider: createLocalPasswordProvider(db, clock),
    tokens: { create: newToken, hash: hashToken },
    deliveryWorker,
  }

  return { config, db, deps, app: createApp(deps), deliveryWorker, scheduler }
}

async function main(): Promise<void> {
  const { config, app, deliveryWorker, scheduler } = await createServer()
  if (config.runBackgroundJobs) {
    deliveryWorker.start()
    scheduler.start()
  }
  serve({ fetch: app.fetch, hostname: config.host, port: config.port })
  const delivery = config.smtp ? `SMTP ${config.smtp.host}:${config.smtp.port}` : 'not configured (messages stay queued)'
  console.log(`Ready Vendors listening on http://${config.host}:${config.port}`)
  console.log(`  database: ${config.databaseFile}`)
  console.log(`  documents: ${config.uploadDir}`)
  console.log(`  email delivery: ${delivery}`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
