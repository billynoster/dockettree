/**
 * Postgres adapter for the repository contracts. One unit of work is one
 * `BEGIN … COMMIT` on a pooled client. Document bytes live in the injected BlobStore
 * (GCS in production); blobs written inside a transaction that later rolls back are deleted.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Pool, PoolClient } from 'pg'
import { AppError } from '@/domain/errors'
import type { BlobStore, Collection, Database, UnitOfWork } from '@/repositories/types'
import { TrackedBlobStore } from '../files/trackedBlobStore'
import { fromRow, resolveIndexColumn, toRow, upsertSql } from './rowMapping'
import { TABLES, type TableName, type TableSpec } from './tables'

const SCHEMA_PATH = path.join(import.meta.dirname, 'schema.postgres.sql')

export type PgQueryResult = { rows: Record<string, unknown>[] }

export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>
}

export interface PgClientLike extends PgQueryable {
  release(): void
}

export interface PgPoolLike extends PgQueryable {
  connect(): Promise<PgClientLike>
  end?: () => Promise<void>
}

interface WriteScope {
  client: PgQueryable
  blobs: TrackedBlobStore
}

export function wrapPostgresError(error: unknown): never {
  if (error instanceof AppError) throw error
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
  const message = error instanceof Error ? error.message : String(error)
  if (
    /ECONNREFUSED|ECONNRESET|ENOTFOUND|connection|timeout|terminat|too many clients|57P01|08006|08001|08004/i.test(
      `${code} ${message}`,
    )
  ) {
    throw new AppError('storage_unavailable', 'The database is unavailable, so that change was not saved.', {
      detail: message,
    })
  }
  if (code === '23505' || /duplicate key value|unique constraint/i.test(message)) {
    throw new AppError('conflict', 'That record changed elsewhere. Reload and try again.', {
      detail: message,
    })
  }
  if (code === '23503' || /foreign key constraint/i.test(message)) {
    throw new AppError('validation', 'That change references a record in another organization.', {
      detail: message,
    })
  }
  throw error
}

function asPool(pool: Pool | PgPoolLike): PgPoolLike {
  return pool as PgPoolLike
}

export class PostgresDatabase implements Database {
  private readonly pool: PgPoolLike
  private readonly blobs: BlobStore
  private readonly scope = new AsyncLocalStorage<WriteScope>()

  constructor(options: { pool: Pool | PgPoolLike; blobs: BlobStore }) {
    this.pool = asPool(options.pool)
    this.blobs = options.blobs
  }

  async applySchema(): Promise<void> {
    try {
      await this.pool.query(readFileSync(SCHEMA_PATH, 'utf8'))
    } catch (error) {
      wrapPostgresError(error)
    }
  }

  private connection(): PgQueryable {
    return this.scope.getStore()?.client ?? this.pool
  }

  private collection<T>(name: TableName): Collection<T> {
    const spec = TABLES[name] as TableSpec
    const { sql, columns } = upsertSql(spec, 'postgres')

    return {
      get: async (id) => {
        const result = await this.connection().query(`SELECT * FROM ${spec.table} WHERE ${spec.key} = $1`, [id])
        return fromRow<T>(spec, result.rows[0])
      },
      getAll: async () => {
        const result = await this.connection().query(`SELECT * FROM ${spec.table}`)
        return result.rows.map((row) => fromRow<T>(spec, row) as T)
      },
      where: async (index, key) => {
        const column = resolveIndexColumn(spec, index)
        const result = await this.connection().query(`SELECT * FROM ${spec.table} WHERE ${column} = $1`, [key])
        return result.rows.map((row) => fromRow<T>(spec, row) as T)
      },
      put: async (value) => {
        const row = toRow(spec, value as Record<string, unknown>, 'postgres')
        await this.connection().query(
          sql,
          columns.map((column) => row[column]),
        )
      },
      putMany: async (values) => {
        for (const value of values) {
          const row = toRow(spec, value as Record<string, unknown>, 'postgres')
          await this.connection().query(
            sql,
            columns.map((column) => row[column]),
          )
        }
      },
      delete: async (id) => {
        await this.connection().query(`DELETE FROM ${spec.table} WHERE ${spec.key} = $1`, [id])
      },
      count: async () => {
        const result = await this.connection().query(`SELECT COUNT(*) AS total FROM ${spec.table}`)
        return Number(result.rows[0]?.total ?? 0)
      },
    }
  }

  private unitOfWork(blobs: BlobStore): UnitOfWork {
    return {
      organizations: this.collection('organizations'),
      users: this.collection('users'),
      sessions: this.collection('sessions'),
      memberships: this.collection('memberships'),
      vendors: this.collection('vendors'),
      vendorMemberships: this.collection('vendorMemberships'),
      templates: this.collection('templates'),
      templateItems: this.collection('templateItems'),
      requirements: this.collection('requirements'),
      submissions: this.collection('submissions'),
      files: this.collection('files'),
      reviewEvents: this.collection('reviewEvents'),
      invitations: this.collection('invitations'),
      notifications: this.collection('notifications'),
      activity: this.collection('activity'),
      importBatches: this.collection('importBatches'),
      requests: this.collection('requests'),
      documentRequests: this.collection('documentRequests'),
      organizationBilling: this.collection('organizationBilling'),
      stripeWebhookEvents: this.collection('stripeWebhookEvents'),
      blobs,
    } as UnitOfWork
  }

  async read<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const scope = this.scope.getStore()
    try {
      return await work(this.unitOfWork(scope?.blobs ?? this.blobs))
    } catch (error) {
      return wrapPostgresError(error)
    }
  }

  async write<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const nested = this.scope.getStore()
    if (nested) {
      try {
        return await work(this.unitOfWork(nested.blobs))
      } catch (error) {
        return wrapPostgresError(error)
      }
    }

    const client = await this.pool.connect()
    const tracked = new TrackedBlobStore(this.blobs)
    try {
      await client.query('BEGIN')
      const result = await this.scope.run({ client, blobs: tracked }, () => work(this.unitOfWork(tracked)))
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Connection may already be broken.
      }
      await tracked.discardWrites()
      return wrapPostgresError(error)
    } finally {
      client.release()
    }
  }

  async clear(): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const spec of Object.values(TABLES) as TableSpec[]) {
        await client.query(`DELETE FROM ${spec.table}`)
      }
      await client.query('COMMIT')
      await this.blobs.clearAll?.()
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // ignore
      }
      wrapPostgresError(error)
    } finally {
      client.release()
    }
  }

  close(): void {
    void this.pool.end?.()
  }

  async columnsOf(table: string): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    )
    return result.rows.map((row) => String(row.column_name))
  }
}

export type { PoolClient }
