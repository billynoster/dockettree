/**
 * Server configuration. Everything has a working local default: the app runs with no
 * environment variables and no API keys. SMTP is the only optional integration.
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
  /** Set false in tests so timers do not keep the process alive. */
  runBackgroundJobs: boolean
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === 'true' || value === '1' || value === 'yes'
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
    runBackgroundJobs: overrides.runBackgroundJobs ?? bool(process.env.RUN_BACKGROUND_JOBS, true),
  }
}
