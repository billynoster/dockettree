/**
 * Cloud SQL / pg pool construction. Cloud Run uses the Unix socket mounted at
 * `/cloudsql/PROJECT:REGION:INSTANCE` when `--add-cloudsql-instances` is set.
 * The official Node connector is used when CLOUD_SQL_USE_CONNECTOR=true (or no socket path).
 */
import { existsSync } from 'node:fs'
import pg from 'pg'
import type { PostgresConnection } from '../config'

const { Pool } = pg

export async function createPostgresPool(connection: PostgresConnection): Promise<{
  pool: pg.Pool
  close: () => Promise<void>
}> {
  if (connection.mode === 'url') {
    const pool = new Pool({ connectionString: connection.url, max: 5 })
    return { pool, close: () => pool.end() }
  }

  if (connection.mode === 'socket') {
    const pool = new Pool({
      user: connection.user,
      password: connection.password,
      database: connection.database,
      host: connection.socketPath,
      max: 5,
    })
    return { pool, close: () => pool.end() }
  }

  const { AuthTypes, Connector } = await import('@google-cloud/cloud-sql-connector')
  const connector = new Connector()
  const clientOpts = await connector.getOptions({
    instanceConnectionName: connection.connectionName,
    authType: AuthTypes.PASSWORD,
  })
  const pool = new Pool({
    ...clientOpts,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    max: 5,
  })
  return {
    pool,
    close: async () => {
      await pool.end()
      connector.close()
    },
  }
}

export function defaultCloudSqlSocketPath(connectionName: string): string {
  return `/cloudsql/${connectionName}`
}

export function cloudSqlSocketAvailable(socketPath: string): boolean {
  return existsSync(socketPath)
}
