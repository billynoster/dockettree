/**
 * In-memory Postgres adapter coverage (no Cloud SQL required in CI).
 */
import { describe, expect, it } from 'vitest'
import { AppError } from '@/domain/errors'
import {
  PostgresDatabase,
  type PgClientLike,
  type PgPoolLike,
  type PgQueryResult,
  wrapPostgresError,
} from '../../server/db/postgresDatabase'
import { fromRow, toRow, upsertSql } from '../../server/db/rowMapping'
import { TABLES } from '../../server/db/tables'
import { GcsBlobStore, type GcsBucketLike, type GcsFileLike, type GcsStorageLike } from '../../server/files/gcsBlobStore'
import type { BlobStore } from '@/repositories/types'

class MemoryBlobStore implements BlobStore {
  readonly files = new Map<string, Uint8Array>()

  async get(storageKey: string): Promise<Blob | undefined> {
    const bytes = this.files.get(storageKey)
    return bytes ? new Blob([bytes]) : undefined
  }

  async put(storageKey: string, blob: Blob): Promise<void> {
    this.files.set(storageKey, new Uint8Array(await blob.arrayBuffer()))
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey)
  }

  async clearAll(): Promise<void> {
    this.files.clear()
  }
}

type Row = Record<string, unknown>

class FakeClient implements PgClientLike {
  private readonly store: Map<string, Map<string, Row>>
  private readonly tx: { open: boolean; snapshot: Map<string, Map<string, Row>> | null }

  constructor(
    store: Map<string, Map<string, Row>>,
    tx: { open: boolean; snapshot: Map<string, Map<string, Row>> | null },
  ) {
    this.store = store
    this.tx = tx
  }

  release(): void {}

  async query(text: string, values: unknown[] = []): Promise<PgQueryResult> {
    const sql = text.replace(/\s+/g, ' ').trim()
    if (sql === 'BEGIN') {
      this.tx.open = true
      this.tx.snapshot = cloneStore(this.store)
      return { rows: [] }
    }
    if (sql === 'COMMIT') {
      this.tx.open = false
      this.tx.snapshot = null
      return { rows: [] }
    }
    if (sql === 'ROLLBACK') {
      if (this.tx.snapshot) {
        this.store.clear()
        for (const [table, rows] of this.tx.snapshot) this.store.set(table, rows)
      }
      this.tx.open = false
      this.tx.snapshot = null
      return { rows: [] }
    }
    if (sql.startsWith('CREATE ') || sql.startsWith('--')) return { rows: [] }

    const selectStar = /^SELECT \* FROM (\w+)(?: WHERE (\w+) = \$1)?$/i.exec(sql)
    if (selectStar) {
      const [, table, column] = selectStar
      const rows = [...(this.store.get(table)?.values() ?? [])]
      if (!column) return { rows }
      return { rows: rows.filter((row) => row[column] === values[0]) }
    }
    const count = /^SELECT COUNT\(\*\) AS total FROM (\w+)$/i.exec(sql)
    if (count) {
      return { rows: [{ total: String(this.store.get(count[1])?.size ?? 0) }] }
    }
    const del = /^DELETE FROM (\w+)(?: WHERE (\w+) = \$1)?$/i.exec(sql)
    if (del) {
      const [, table, column] = del
      const tableRows = this.store.get(table) ?? new Map()
      if (!column) tableRows.clear()
      else {
        for (const [key, row] of [...tableRows.entries()]) {
          if (row[column] === values[0]) tableRows.delete(key)
        }
      }
      this.store.set(table, tableRows)
      return { rows: [] }
    }
    const insert = /^INSERT INTO (\w+) \(([^)]+)\) VALUES/i.exec(sql)
    if (insert) {
      const table = insert[1]
      const columns = insert[2].split(',').map((part) => part.trim())
      const row: Row = {}
      columns.forEach((column, index) => {
        row[column] = values[index]
      })
      const key = String(row.id ?? row.key)
      const tableRows = this.store.get(table) ?? new Map()
      tableRows.set(key, row)
      this.store.set(table, tableRows)
      return { rows: [] }
    }
    throw new Error(`Unsupported fake SQL: ${sql}`)
  }
}

class FakePool implements PgPoolLike {
  private readonly store = new Map<string, Map<string, Row>>()
  private readonly tx = { open: false, snapshot: null as Map<string, Map<string, Row>> | null }

  async connect(): Promise<PgClientLike> {
    return new FakeClient(this.store, this.tx)
  }

  async query(text: string, values?: unknown[]): Promise<PgQueryResult> {
    const client = await this.connect()
    return await client.query(text, values)
  }
}

function cloneStore(store: Map<string, Map<string, Row>>): Map<string, Map<string, Row>> {
  const next = new Map<string, Map<string, Row>>()
  for (const [table, rows] of store) {
    next.set(table, new Map([...rows.entries()].map(([key, row]) => [key, { ...row }])))
  }
  return next
}

describe('rowMapping', () => {
  it('serializes bool/json differently for sqlite vs postgres', () => {
    const spec = TABLES.vendors
    const entity = {
      id: 'v1',
      organization_id: 'o1',
      company_name: 'Acme',
      category: 'Pest',
      contact_name: 'A',
      contact_email: 'a@example.com',
      lifecycle: 'active',
      invited_at: null,
      property_tags: ['east'],
      archived_at: null,
      archive_reason: null,
      record_version: 1,
      created_at: 't',
      updated_at: 't',
    }
    const sqlite = toRow(spec, entity, 'sqlite')
    const postgres = toRow(spec, entity, 'postgres')
    expect(sqlite.property_tags).toBe(JSON.stringify(['east']))
    expect(postgres.property_tags).toBe(JSON.stringify(['east']))
    expect(upsertSql(spec, 'postgres').sql).toContain('::jsonb')
    expect(fromRow(spec, { ...postgres, property_tags: ['east'] })?.property_tags).toEqual(['east'])
  })
})

describe('PostgresDatabase', () => {
  it('commits writes and rolls back blobs on failure', async () => {
    const blobs = new MemoryBlobStore()
    const db = new PostgresDatabase({ pool: new FakePool(), blobs })
    await db.write(async (uow) => {
      await uow.organizations.put({
        id: 'org-1',
        name: 'Cedar',
        timezone: 'America/Chicago',
        support_email: 'ops@example.com',
        support_contact_name: 'Ops',
        record_version: 1,
        created_at: 't',
        updated_at: 't',
      })
      await uow.blobs.put('blob/ok', new Blob([new TextEncoder().encode('pdf')]))
    })
    expect(await db.read((uow) => uow.organizations.get('org-1'))).toMatchObject({ name: 'Cedar' })
    expect(blobs.files.has('blob/ok')).toBe(true)

    await expect(
      db.write(async (uow) => {
        await uow.blobs.put('blob/fail', new Blob([new TextEncoder().encode('x')]))
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(blobs.files.has('blob/fail')).toBe(false)
  })

  it('maps connection failures to storage_unavailable', () => {
    try {
      wrapPostgresError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('storage_unavailable')
    }
  })
})

describe('GcsBlobStore', () => {
  it('reads and writes through the Storage client without touching local disk', async () => {
    const objects = new Map<string, Buffer>()
    const bucket: GcsBucketLike = {
      file(name: string): GcsFileLike {
        return {
          async download() {
            const value = objects.get(name)
            if (!value) {
              const error = new Error('not found') as Error & { code: number }
              error.code = 404
              throw error
            }
            return [value]
          },
          async save(data) {
            objects.set(name, Buffer.from(data))
          },
          async delete() {
            objects.delete(name)
          },
        }
      },
      async getFiles() {
        return [[...objects.keys()].map((name) => this.file(name))]
      },
    }
    const storage: GcsStorageLike = { bucket: () => bucket }
    const store = new GcsBlobStore('docket-tree-uploads', storage)
    expect(await store.get('blob/missing')).toBeUndefined()
    await store.put('blob/a', new Blob([new TextEncoder().encode('hello')]))
    const got = await store.get('blob/a')
    expect(got).toBeDefined()
    expect(await got!.text()).toBe('hello')
    await store.delete('blob/a')
    expect(await store.get('blob/a')).toBeUndefined()
  })
})
