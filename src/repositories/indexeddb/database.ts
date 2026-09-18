/** IndexedDB adapter: domain records and document blobs in one database. */
import { type IDBPDatabase, type IDBPTransaction, openDB } from 'idb'
import { AppError } from '@/domain/errors'
import type { BlobStore, Collection, Database, UnitOfWork } from '../types'

export const DB_NAME = 'vendor-readiness-demo'
export const DB_VERSION = 1
export const BLOB_STORE = 'blobs'

interface StoreDefinition {
  keyPath: string
  indexes?: { name: string; keyPath: string | string[]; unique?: boolean }[]
}

/** Store layout, keyed by the `UnitOfWork` property name. */
const STORE_DEFINITIONS: Record<string, StoreDefinition> = {
  organizations: { keyPath: 'id' },
  users: { keyPath: 'id' },
  memberships: { keyPath: 'id', indexes: [{ name: 'by_user', keyPath: 'user_id' }] },
  vendors: {
    keyPath: 'id',
    indexes: [
      { name: 'by_organization', keyPath: 'organization_id' },
      { name: 'by_lifecycle', keyPath: 'lifecycle' },
    ],
  },
  vendor_memberships: { keyPath: 'id', indexes: [{ name: 'by_vendor', keyPath: 'vendor_id' }] },
  templates: { keyPath: 'id', indexes: [{ name: 'by_organization', keyPath: 'organization_id' }] },
  template_items: { keyPath: 'id', indexes: [{ name: 'by_template', keyPath: 'template_id' }] },
  requirements: {
    keyPath: 'id',
    indexes: [
      { name: 'by_vendor', keyPath: 'vendor_id' },
      { name: 'by_organization', keyPath: 'organization_id' },
    ],
  },
  submissions: {
    keyPath: 'id',
    indexes: [
      { name: 'by_requirement', keyPath: 'requirement_id' },
      { name: 'by_vendor', keyPath: 'vendor_id' },
      { name: 'by_state', keyPath: 'state' },
    ],
  },
  files: { keyPath: 'id' },
  review_events: { keyPath: 'id', indexes: [{ name: 'by_submission', keyPath: 'submission_id' }] },
  invitations: { keyPath: 'id', indexes: [{ name: 'by_vendor', keyPath: 'vendor_id' }] },
  notifications: {
    keyPath: 'id',
    indexes: [
      { name: 'by_vendor', keyPath: 'vendor_id' },
      { name: 'by_idempotency_key', keyPath: 'idempotency_key', unique: true },
    ],
  },
  activity: {
    keyPath: 'id',
    indexes: [
      { name: 'by_vendor', keyPath: 'vendor_id' },
      { name: 'by_event_type', keyPath: 'event_type' },
    ],
  },
  import_batches: { keyPath: 'id', indexes: [{ name: 'by_request_key', keyPath: 'request_key', unique: true }] },
  requests: { keyPath: 'key' },
  demo_state: { keyPath: 'id' },
}

const UOW_STORE_NAMES: Record<keyof Omit<UnitOfWork, 'blobs'>, string> = {
  organizations: 'organizations',
  users: 'users',
  memberships: 'memberships',
  vendors: 'vendors',
  vendorMemberships: 'vendor_memberships',
  templates: 'templates',
  templateItems: 'template_items',
  requirements: 'requirements',
  submissions: 'submissions',
  files: 'files',
  reviewEvents: 'review_events',
  invitations: 'invitations',
  notifications: 'notifications',
  activity: 'activity',
  importBatches: 'import_batches',
  requests: 'requests',
  demoState: 'demo_state',
}

const ALL_STORE_NAMES = [...Object.keys(STORE_DEFINITIONS), BLOB_STORE]

type AnyTransaction = IDBPTransaction<unknown, string[], IDBTransactionMode>

function collection<T>(tx: AnyTransaction, storeName: string): Collection<T> {
  const store = () => tx.objectStore(storeName)
  return {
    async get(id) {
      return (await store().get(id)) as T | undefined
    },
    async getAll() {
      return (await store().getAll()) as T[]
    },
    async where(index, key) {
      return (await store().index(index).getAll(key)) as T[]
    },
    async put(value) {
      await (store() as unknown as { put(value: unknown): Promise<unknown> }).put(value)
    },
    async putMany(values) {
      const target = store() as unknown as { put(value: unknown): Promise<unknown> }
      await Promise.all(values.map((value) => target.put(value)))
    },
    async delete(id) {
      await (store() as unknown as { delete(key: string): Promise<void> }).delete(id)
    },
    async count() {
      return await store().count()
    },
  }
}

function blobStore(tx: AnyTransaction): BlobStore {
  const store = () => tx.objectStore(BLOB_STORE) as unknown as {
    get(key: string): Promise<Blob | undefined>
    put(value: Blob, key: string): Promise<unknown>
    delete(key: string): Promise<void>
  }
  return {
    async get(storageKey) {
      return await store().get(storageKey)
    },
    async put(storageKey, blob) {
      await store().put(blob, storageKey)
    },
    async delete(storageKey) {
      await store().delete(storageKey)
    },
  }
}

function unitOfWork(tx: AnyTransaction): UnitOfWork {
  const uow = { blobs: blobStore(tx) } as UnitOfWork
  for (const [key, storeName] of Object.entries(UOW_STORE_NAMES)) {
    // Each property is a thin view over the same transaction.
    ;(uow as unknown as Record<string, unknown>)[key] = collection(tx, storeName)
  }
  return uow
}

function wrapStorageError(error: unknown): never {
  if (error instanceof AppError) throw error
  const message = error instanceof Error ? error.message : String(error)
  if (/quota|storage|NotAllowed|SecurityError|indexedDB|Database/i.test(message)) {
    throw new AppError(
      'storage_unavailable',
      'Local demo storage is unavailable, so that change was not saved.',
      { detail: message },
    )
  }
  throw error
}

export class IndexedDbDatabase implements Database {
  private db: IDBPDatabase<unknown>

  constructor(db: IDBPDatabase<unknown>) {
    this.db = db
  }

  static async open(name = DB_NAME): Promise<IndexedDbDatabase> {
    try {
      const db = await openDB<unknown>(name, DB_VERSION, {
        upgrade(database) {
          for (const [storeName, definition] of Object.entries(STORE_DEFINITIONS)) {
            if (database.objectStoreNames.contains(storeName)) continue
            const store = database.createObjectStore(storeName, { keyPath: definition.keyPath })
            for (const index of definition.indexes ?? []) {
              store.createIndex(index.name, index.keyPath, { unique: index.unique ?? false })
            }
          }
          if (!database.objectStoreNames.contains(BLOB_STORE)) {
            database.createObjectStore(BLOB_STORE)
          }
        },
      })
      return new IndexedDbDatabase(db)
    } catch (error) {
      return wrapStorageError(error)
    }
  }

  async read<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    try {
      const tx = this.db.transaction(ALL_STORE_NAMES, 'readonly') as AnyTransaction
      const result = await work(unitOfWork(tx))
      await tx.done
      return result
    } catch (error) {
      return wrapStorageError(error)
    }
  }

  async write<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    try {
      const tx = this.db.transaction(ALL_STORE_NAMES, 'readwrite') as AnyTransaction
      const result = await work(unitOfWork(tx))
      await tx.done
      return result
    } catch (error) {
      return wrapStorageError(error)
    }
  }

  async clear(): Promise<void> {
    try {
      const tx = this.db.transaction(ALL_STORE_NAMES, 'readwrite') as AnyTransaction
      await Promise.all(
        ALL_STORE_NAMES.map((storeName) =>
          (tx.objectStore(storeName) as unknown as { clear(): Promise<void> }).clear(),
        ),
      )
      await tx.done
    } catch (error) {
      wrapStorageError(error)
    }
  }

  close(): void {
    this.db.close()
  }
}
