/**
 * SQLite adapter for the repository contracts in `src/repositories/types.ts`.
 *
 * One unit of work is one `BEGIN IMMEDIATE … COMMIT`. Units of work are serialized on a
 * single connection, so a multi-entity write (submission + requirement pointer + activity
 * event) is atomic and can never interleave with another writer. Document bytes live on
 * disk; blobs written inside a transaction that later rolls back are deleted again.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { AppError } from '@/domain/errors'
import type { BlobStore, Collection, Database, UnitOfWork } from '@/repositories/types'
import { TABLES, type TableName, type TableSpec } from './tables'

const SCHEMA_PATH = path.join(import.meta.dirname, 'schema.sql')

type Row = Record<string, unknown>

function toRow(spec: TableSpec, entity: Record<string, unknown>): Row {
  const row: Row = {}
  for (const [field, kind] of Object.entries(spec.columns)) {
    const value = entity[field]
    if (value === undefined || value === null) {
      row[field] = null
      continue
    }
    if (kind === 'bool') row[field] = value ? 1 : 0
    else if (kind === 'json') row[field] = JSON.stringify(value)
    else if (kind === 'int') row[field] = Number(value)
    else row[field] = String(value)
  }
  return row
}

function fromRow<T>(spec: TableSpec, row: Row | undefined): T | undefined {
  if (!row) return undefined
  const entity: Record<string, unknown> = {}
  for (const [field, kind] of Object.entries(spec.columns)) {
    const value = row[field]
    if (kind === 'bool') entity[field] = value === 1 || value === true
    else if (kind === 'json') entity[field] = value === null ? null : JSON.parse(String(value))
    else entity[field] = value ?? null
  }
  return entity as T
}

function wrapError(error: unknown): never {
  if (error instanceof AppError) throw error
  const message = error instanceof Error ? error.message : String(error)
  if (/SQLITE_BUSY|SQLITE_IOERR|SQLITE_READONLY|SQLITE_CANTOPEN|disk|locked/i.test(message)) {
    throw new AppError('storage_unavailable', 'The database is unavailable, so that change was not saved.', {
      detail: message,
    })
  }
  if (/UNIQUE constraint failed/i.test(message)) {
    throw new AppError('conflict', 'That record changed elsewhere. Reload and try again.', {
      detail: message,
    })
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    throw new AppError('validation', 'That change references a record in another organization.', {
      detail: message,
    })
  }
  throw error
}

class TrackedBlobStore implements BlobStore {
  private written: string[] = []
  private readonly inner: BlobStore

  constructor(inner: BlobStore) {
    this.inner = inner
  }

  async get(storageKey: string): Promise<Blob | undefined> {
    return await this.inner.get(storageKey)
  }

  async put(storageKey: string, blob: Blob): Promise<void> {
    await this.inner.put(storageKey, blob)
    this.written.push(storageKey)
  }

  async delete(storageKey: string): Promise<void> {
    await this.inner.delete(storageKey)
  }

  /** Removes files written by a transaction that did not commit. */
  async discardWrites(): Promise<void> {
    for (const key of this.written) {
      await this.inner.delete(key).catch(() => undefined)
    }
    this.written = []
  }
}

/** Work in progress for the current async context: the open write transaction, if any. */
interface WriteScope {
  blobs: TrackedBlobStore
}

export class SqliteDatabase implements Database {
  /** Write connection: owns every transaction, one at a time. */
  private readonly sql: BetterSqlite3.Database
  /**
   * Read connection. Reads therefore never block on a write and never observe another
   * request's uncommitted rows, and a transaction left open by a write cannot pin an old
   * snapshot for readers.
   */
  private readonly readSql: BetterSqlite3.Database
  private readonly blobs: BlobStore
  private queue: Promise<unknown> = Promise.resolve()
  private readonly scope = new AsyncLocalStorage<WriteScope>()

  constructor(options: { file: string; blobs: BlobStore }) {
    this.blobs = options.blobs
    try {
      this.sql = new BetterSqlite3(options.file)
      this.sql.pragma('journal_mode = WAL')
      this.sql.pragma('foreign_keys = ON')
      this.sql.pragma('busy_timeout = 5000')
      this.sql.exec(readFileSync(SCHEMA_PATH, 'utf8'))
      // Not opened read-only: a reader still has to be able to rebuild the WAL index.
      this.readSql = new BetterSqlite3(options.file)
      this.readSql.pragma('busy_timeout = 5000')
      this.readSql.pragma('foreign_keys = ON')
    } catch (error) {
      wrapError(error)
    }
  }

  /** The write connection inside a transaction, the read connection otherwise. */
  private connection(): BetterSqlite3.Database {
    return this.scope.getStore() ? this.sql : this.readSql
  }

  private collection<T>(name: TableName): Collection<T> {
    const spec = TABLES[name] as TableSpec
    const columns = Object.keys(spec.columns)
    const insert = `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${columns
      .map((column) => `@${column}`)
      .join(', ')}) ON CONFLICT(${spec.key}) DO UPDATE SET ${columns
      .filter((column) => column !== spec.key)
      .map((column) => `${column} = excluded.${column}`)
      .join(', ')}`

    const resolveColumn = (index: string): string => {
      const column = spec.indexes[index] ?? (index.startsWith('by_') ? index.slice(3) : index)
      if (!(column in spec.columns)) {
        throw new Error(`Unknown index ${index} on ${spec.table}`)
      }
      return column
    }

    return {
      get: async (id) =>
        fromRow<T>(
          spec,
          this.connection().prepare(`SELECT * FROM ${spec.table} WHERE ${spec.key} = ?`).get(id) as Row,
        ),
      getAll: async () =>
        (this.connection().prepare(`SELECT * FROM ${spec.table}`).all() as Row[]).map(
          (row) => fromRow<T>(spec, row) as T,
        ),
      where: async (index, key) => {
        const column = resolveColumn(index)
        const rows = this.connection()
          .prepare(`SELECT * FROM ${spec.table} WHERE ${column} = ?`)
          .all(key) as Row[]
        return rows.map((row) => fromRow<T>(spec, row) as T)
      },
      put: async (value) => {
        this.sql.prepare(insert).run(toRow(spec, value as Record<string, unknown>))
      },
      putMany: async (values) => {
        const statement = this.sql.prepare(insert)
        for (const value of values) statement.run(toRow(spec, value as Record<string, unknown>))
      },
      delete: async (id) => {
        this.sql.prepare(`DELETE FROM ${spec.table} WHERE ${spec.key} = ?`).run(id)
      },
      count: async () =>
        Number(
          (this.connection().prepare(`SELECT COUNT(*) AS total FROM ${spec.table}`).get() as {
            total: number
          }).total,
        ),
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
      blobs,
    } as UnitOfWork
  }

  /** Serializes write transactions so two of them never interleave on the connection. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task)
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /**
   * Reads never block and never see another request's uncommitted rows: they use the read
   * connection unless they are inside this context's own write transaction.
   */
  async read<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const scope = this.scope.getStore()
    try {
      return await work(this.unitOfWork(scope?.blobs ?? this.blobs))
    } catch (error) {
      return wrapError(error)
    }
  }

  /**
   * One write == one `BEGIN IMMEDIATE … COMMIT` on the write connection, serialized so two
   * transactions never interleave. A write nested inside another joins the open transaction
   * instead of waiting for it, so composed use cases still commit atomically.
   */
  async write<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const nested = this.scope.getStore()
    if (nested) {
      try {
        return await work(this.unitOfWork(nested.blobs))
      } catch (error) {
        return wrapError(error)
      }
    }

    return await this.enqueue(async () => {
      const tracked = new TrackedBlobStore(this.blobs)
      // Self-heal: a previous transaction that never finished must not poison this one.
      if (this.sql.inTransaction) {
        console.warn('[docksy] rolling back a transaction that was left open')
        this.sql.exec('ROLLBACK')
      }
      this.sql.exec('BEGIN IMMEDIATE')
      try {
        const result = await this.scope.run({ blobs: tracked }, () =>
          work(this.unitOfWork(tracked)),
        )
        this.sql.exec('COMMIT')
        return result
      } catch (error) {
        if (this.sql.inTransaction) this.sql.exec('ROLLBACK')
        await tracked.discardWrites()
        return wrapError(error)
      }
    })
  }

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      try {
        this.sql.exec('PRAGMA foreign_keys = OFF')
        this.sql.exec('BEGIN IMMEDIATE')
        for (const spec of Object.values(TABLES) as TableSpec[]) {
          this.sql.exec(`DELETE FROM ${spec.table}`)
        }
        this.sql.exec('COMMIT')
        await this.blobs.clearAll?.()
      } catch (error) {
        if (this.sql.inTransaction) this.sql.exec('ROLLBACK')
        wrapError(error)
      } finally {
        this.sql.exec('PRAGMA foreign_keys = ON')
      }
    })
  }

  close(): void {
    this.readSql.close()
    this.sql.close()
  }

  /** Column names actually present in the database, used by the schema drift test. */
  columnsOf(table: string): string[] {
    const rows = this.sql.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    return rows.map((row) => row.name)
  }
}
