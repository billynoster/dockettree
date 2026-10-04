/**
 * Server configuration. Everything has a working local default: the app runs with no
 * environment variables and no API keys. SMTP and Firebase Auth are optional integrations.
 */
import path from 'node:path'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string | null
  password: string | null
  from: string
}

/** Browser Firebase config. Never include measurementId — Analytics is not initialized. */
export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

export interface ServerConfig {
  port: number
  host: string
  dataDir: string
  databaseFile: string
  uploadDir: string
  /** Sent with the Secure cookie flag when the app is served over HTTPS. */
  secureCookies: boolean
  publicUrl: string
  smtp: SmtpConfig | null
  /**
   * When set, the server verifies Firebase ID tokens and the browser uses the Firebase SDK.
   * When null, V1 local email/password + session cookies remain the identity provider.
   */
  firebase: FirebaseWebConfig | null
  /** Set false in tests so timers do not keep the process alive. */
  runBackgroundJobs: boolean
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === 'true' || value === '1' || value === 'yes'
}

function env(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

/**
 * Firebase is enabled only when the four required web-config values are present together.
 * `VITE_FIREBASE_*` is an optional local alias; Cloud Run should set `FIREBASE_*`.
 */
export function loadFirebaseConfig(): FirebaseWebConfig | null {
  const apiKey = env('FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY')
  const authDomain = env('FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN')
  const projectId = env('FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID')
  const appId = env('FIREBASE_APP_ID', 'VITE_FIREBASE_APP_ID')
  const present = [apiKey, authDomain, projectId, appId].filter(Boolean).length
  if (present === 0) return null
  if (present < 4) {
    console.warn(
      'Firebase env is incomplete; local-password auth will be used. Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID and FIREBASE_APP_ID together.',
    )
    return null
  }
  const storageBucket = env('FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_STORAGE_BUCKET')
  const messagingSenderId = env('FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID')
  return {
    apiKey: apiKey!,
    authDomain: authDomain!,
    projectId: projectId!,
    appId: appId!,
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  }
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataDir = overrides.dataDir ?? process.env.DOCKSY_DATA_DIR ?? path.resolve(process.cwd(), 'var')
  const port = overrides.port ?? Number(process.env.PORT ?? 43217)
  const host = overrides.host ?? process.env.HOST ?? '127.0.0.1'
  const smtpHost = process.env.SMTP_HOST
  return {
    port,
    host,
    dataDir,
    databaseFile: overrides.databaseFile ?? path.join(dataDir, 'docksy.sqlite'),
    uploadDir: overrides.uploadDir ?? path.join(dataDir, 'uploads'),
    secureCookies: overrides.secureCookies ?? bool(process.env.SECURE_COOKIES, false),
    publicUrl: overrides.publicUrl ?? process.env.PUBLIC_URL ?? `http://${host}:${port}`,
    smtp:
      overrides.smtp !== undefined
        ? overrides.smtp
        : smtpHost
          ? {
              host: smtpHost,
              port: Number(process.env.SMTP_PORT ?? 587),
              secure: bool(process.env.SMTP_SECURE, false),
              user: process.env.SMTP_USER ?? null,
              password: process.env.SMTP_PASSWORD ?? null,
              from: process.env.SMTP_FROM ?? 'docksy@localhost',
            }
          : null,
    firebase: overrides.firebase !== undefined ? overrides.firebase : loadFirebaseConfig(),
    runBackgroundJobs: overrides.runBackgroundJobs ?? bool(process.env.RUN_BACKGROUND_JOBS, true),
  }
}
