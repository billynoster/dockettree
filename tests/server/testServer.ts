/** Boots the real HTTP app against a temporary SQLite database and a capturing mailer. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Hono } from 'hono'
import { fixedClock, type Clock } from '@/domain/clock'
import { createIdentityProvider, type IdentityProvider } from '../../server/auth/identityProvider'
import { clearLoginThrottle } from '../../server/auth/sessions'
import { hashToken, newToken } from '../../server/auth/tokens'
import { loadConfig, type FirebaseWebConfig } from '../../server/config'
import { SqliteDatabase } from '../../server/db/sqliteDatabase'
import { LocalBlobStore } from '../../server/files/localBlobStore'
import { createApp } from '../../server/http/app'
import type { AppDependencies, AppEnv } from '../../server/http/context'
import { NotificationDeliveryWorker } from '../../server/mail/deliveryWorker'
import { createCapturingMailer, type Mailer } from '../../server/mail/mailer'
import { seedSampleData } from '../../server/seed/sampleData'

export const STAFF_PASSWORD = 'test-staff-password'
export const VENDOR_PASSWORD = 'test-vendor-password'
export const TEST_INSTANT = '2026-09-17T12:00:00.000Z'

export interface TestServer {
  app: Hono<AppEnv>
  deps: AppDependencies
  db: SqliteDatabase
  mailer: Mailer
  clock: Clock
  close(): void
  /** Signs in and returns the cookie header to reuse on later requests. */
  signIn(email: string, password: string): Promise<string>
  request(
    pathname: string,
    init?: RequestInit & { cookie?: string },
  ): Promise<{ status: number; body: any; headers: Headers }>
}

export async function createTestServer(
  options: {
    seed?: boolean
    mailer?: Mailer
    firebase?: FirebaseWebConfig | null
    createIdentityProvider?: (db: SqliteDatabase, clock: Clock) => IdentityProvider
  } = {},
): Promise<TestServer> {
  clearLoginThrottle()
  const dataDir = mkdtempSync(path.join(tmpdir(), 'docksy-api-'))
  const blobs = new LocalBlobStore(path.join(dataDir, 'uploads'))
  const db = new SqliteDatabase({ file: path.join(dataDir, 'api.sqlite'), blobs })
  const clock = fixedClock(TEST_INSTANT)
  const mailer = options.mailer ?? createCapturingMailer()
  const config = loadConfig({
    dataDir,
    databaseFile: path.join(dataDir, 'api.sqlite'),
    uploadDir: path.join(dataDir, 'uploads'),
    runBackgroundJobs: false,
    publicUrl: 'http://127.0.0.1:43217',
    smtp: null,
    firebase: options.firebase ?? null,
  })
  const deps: AppDependencies = {
    config,
    db,
    clock,
    mailer,
    identityProvider: options.createIdentityProvider
      ? options.createIdentityProvider(db, clock)
      : createIdentityProvider(db, clock, options.firebase ?? null),
    tokens: { create: newToken, hash: hashToken },
    deliveryWorker: new NotificationDeliveryWorker(db, clock, mailer),
  }

  if (options.seed !== false) {
    await seedSampleData(db, new Date(TEST_INSTANT), {
      hashPassword: deps.identityProvider.hashPassword,
      hashToken,
      staffPassword: STAFF_PASSWORD,
      vendorPassword: VENDOR_PASSWORD,
    })
  }

  const app = createApp(deps)

  const request: TestServer['request'] = async (pathname, init = {}) => {
    const { cookie, ...rest } = init
    const headers = new Headers(rest.headers)
    if (cookie) headers.set('Cookie', cookie)
    if (rest.body && !(rest.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    const response = await app.request(`http://localhost${pathname}`, { ...rest, headers })
    const text = await response.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // Non-JSON responses (document bytes) are returned as text.
    }
    return { status: response.status, body, headers: response.headers }
  }

  return {
    app,
    deps,
    db,
    mailer,
    clock,
    request,
    async signIn(email, password) {
      const response = await app.request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const setCookie = response.headers.get('Set-Cookie')
      if (response.status !== 200 || !setCookie) {
        throw new Error(`Sign-in failed for ${email}: ${response.status} ${await response.text()}`)
      }
      return setCookie.split(';')[0]
    },
    close() {
      db.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export function samplePdf(name = 'document.pdf'): File {
  const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i)
  return new File([bytes], name, { type: 'application/pdf' })
}
