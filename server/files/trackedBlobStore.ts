/**
 * Records keys written during a unit of work so a rolled-back transaction can delete them.
 */
import type { BlobStore } from '@/repositories/types'

export class TrackedBlobStore implements BlobStore {
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
