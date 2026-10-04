/**
 * Open SQLite+disk or Postgres+GCS from config. Local `npm run dev` never requires
 * cloud credentials: Postgres/GCS adapters load only when their env is set.
 */
import { mkdir } from 'node:fs/promises'
import type { Database, BlobStore } from '@/repositories/types'
import type { ServerConfig } from './config'
import { SqliteDatabase } from './db/sqliteDatabase'
import { LocalBlobStore } from './files/localBlobStore'

export interface OpenStorage {
  db: Database
  blobs: BlobStore
  databaseLabel: string
  documentsLabel: string
}

export async function openStorage(config: ServerConfig): Promise<OpenStorage> {
  const blobs = await openBlobStore(config)
  if (config.database.kind === 'postgres') {
    const { PostgresDatabase } = await import('./db/postgresDatabase')
    const { createPostgresPool } = await import('./db/postgresPool')
    const { pool } = await createPostgresPool(config.database.connection)
    const db = new PostgresDatabase({ pool, blobs })
    await db.applySchema()
    return {
      db,
      blobs,
      databaseLabel: postgresLabel(config),
      documentsLabel: blobLabel(config),
    }
  }

  await mkdir(config.dataDir, { recursive: true })
  await mkdir(config.uploadDir, { recursive: true, mode: 0o700 })
  const db = new SqliteDatabase({ file: config.database.file, blobs })
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[docksy] SQLite is in use in production. Data is ephemeral on Cloud Run unless DATABASE_URL / CLOUD_SQL_CONNECTION_NAME is set. Do not put SQLite on GCS FUSE.',
    )
  }
  return {
    db,
    blobs,
    databaseLabel: config.database.file,
    documentsLabel: blobLabel(config),
  }
}

async function openBlobStore(config: ServerConfig): Promise<BlobStore> {
  if (config.blobs.kind === 'gcs') {
    const { GcsBlobStore } = await import('./files/gcsBlobStore')
    return new GcsBlobStore(config.blobs.bucket)
  }
  await mkdir(config.blobs.directory, { recursive: true, mode: 0o700 })
  return new LocalBlobStore(config.blobs.directory)
}

function postgresLabel(config: ServerConfig): string {
  const connection = config.database.kind === 'postgres' ? config.database.connection : null
  if (!connection) return 'postgres'
  if (connection.mode === 'url') return 'postgres (DATABASE_URL)'
  if (connection.mode === 'socket') return `postgres (unix ${connection.socketPath})`
  return `postgres (connector ${connection.connectionName})`
}

function blobLabel(config: ServerConfig): string {
  return config.blobs.kind === 'gcs' ? `gs://${config.blobs.bucket}` : config.blobs.directory
}
