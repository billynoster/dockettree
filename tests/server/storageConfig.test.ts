/**
 * Config branching for local SQLite/disk vs Cloud SQL Postgres + GCS.
 */
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  gcsBucketFromEnv,
  loadBlobConfig,
  loadConfig,
  loadDatabaseConfig,
  postgresEnvIsSet,
  resolvePostgresConnection,
} from '../../server/config'

const KEYS = [
  'DATABASE_URL',
  'CLOUD_SQL_CONNECTION_NAME',
  'INSTANCE_CONNECTION_NAME',
  'INSTANCE_UNIX_SOCKET',
  'CLOUD_SQL_USE_CONNECTOR',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'GCS_BUCKET',
  'DOCKSY_GCS_BUCKET',
  'DOCKSY_DATA_DIR',
] as const

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

function stashEnv(): void {
  for (const key of KEYS) saved[key] = process.env[key]
}

function restoreEnv(): void {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function clearCloudEnv(): void {
  for (const key of KEYS) delete process.env[key]
}

beforeEach(() => {
  stashEnv()
  clearCloudEnv()
})

afterEach(() => {
  restoreEnv()
})

describe('storage config branching', () => {
  it('defaults to SQLite + local uploads with no cloud env (npm run dev)', () => {
    expect(postgresEnvIsSet()).toBe(false)
    expect(gcsBucketFromEnv()).toBeUndefined()
    const config = loadConfig()
    expect(config.database).toEqual({
      kind: 'sqlite',
      file: path.join(config.dataDir, 'docksy.sqlite'),
    })
    expect(config.blobs).toEqual({ kind: 'local', directory: path.join(config.dataDir, 'uploads') })
  })

  it('selects Postgres unix socket when CLOUD_SQL_CONNECTION_NAME is set', () => {
    process.env.CLOUD_SQL_CONNECTION_NAME = 'docket-tree-510523:us-central1:docket-tree-db'
    process.env.DATABASE_USER = 'docksy'
    process.env.DATABASE_PASSWORD = 'from-secret'
    process.env.DATABASE_NAME = 'docksy'
    expect(postgresEnvIsSet()).toBe(true)
    expect(resolvePostgresConnection()).toEqual({
      mode: 'socket',
      socketPath: '/cloudsql/docket-tree-510523:us-central1:docket-tree-db',
      user: 'docksy',
      password: 'from-secret',
      database: 'docksy',
    })
    expect(loadDatabaseConfig('/tmp/x.sqlite')).toEqual({
      kind: 'postgres',
      connection: resolvePostgresConnection(),
    })
  })

  it('honors INSTANCE_UNIX_SOCKET and DATABASE_URL', () => {
    process.env.INSTANCE_UNIX_SOCKET = '/cloudsql/docket-tree-510523:us-central1:docket-tree-db'
    process.env.DATABASE_USER = 'docksy'
    expect(resolvePostgresConnection().mode).toBe('socket')

    clearCloudEnv()
    process.env.DATABASE_URL = 'postgresql://docksy@localhost/docksy'
    expect(resolvePostgresConnection()).toEqual({
      mode: 'url',
      url: 'postgresql://docksy@localhost/docksy',
    })
  })

  it('uses the Cloud SQL connector when CLOUD_SQL_USE_CONNECTOR=true', () => {
    process.env.CLOUD_SQL_CONNECTION_NAME = 'docket-tree-510523:us-central1:docket-tree-db'
    process.env.CLOUD_SQL_USE_CONNECTOR = 'true'
    process.env.DATABASE_USER = 'docksy'
    process.env.DATABASE_PASSWORD = 'from-secret'
    process.env.DATABASE_NAME = 'docksy'
    expect(resolvePostgresConnection()).toEqual({
      mode: 'connector',
      connectionName: 'docket-tree-510523:us-central1:docket-tree-db',
      user: 'docksy',
      password: 'from-secret',
      database: 'docksy',
    })
  })

  it('selects GCS when GCS_BUCKET is set and strips gs://', () => {
    process.env.GCS_BUCKET = 'gs://docket-tree-uploads'
    expect(gcsBucketFromEnv()).toBe('docket-tree-uploads')
    expect(loadBlobConfig('/tmp/uploads')).toEqual({ kind: 'gcs', bucket: 'docket-tree-uploads' })
  })

  it('allows overrides to keep tests on SQLite even if env mentions Postgres', () => {
    process.env.CLOUD_SQL_CONNECTION_NAME = 'docket-tree-510523:us-central1:docket-tree-db'
    process.env.GCS_BUCKET = 'docket-tree-uploads'
    const config = loadConfig({
      database: { kind: 'sqlite', file: '/tmp/test.sqlite' },
      blobs: { kind: 'local', directory: '/tmp/uploads' },
    })
    expect(config.database.kind).toBe('sqlite')
    expect(config.blobs.kind).toBe('local')
  })
})
