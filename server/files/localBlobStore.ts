/**
 * Document bytes on the local filesystem, outside any web root. Nothing serves this
 * directory statically: bytes leave the server only through the authorized file route.
 */
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '@/domain/errors'
import type { BlobStore } from '@/repositories/types'

const SAFE_KEY = /^[A-Za-z0-9/_-]+$/

export class LocalBlobStore implements BlobStore {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  private resolve(storageKey: string): string {
    if (!SAFE_KEY.test(storageKey) || storageKey.includes('..')) {
      throw new AppError('validation', 'That storage key is not allowed.')
    }
    return path.join(this.root, storageKey)
  }

  async get(storageKey: string): Promise<Blob | undefined> {
    try {
      const bytes = await readFile(this.resolve(storageKey))
      return new Blob([new Uint8Array(bytes)])
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new AppError('storage_unavailable', 'That document could not be read from storage.', {
        detail: (error as Error).message,
      })
    }
  }

  async put(storageKey: string, blob: Blob): Promise<void> {
    const target = this.resolve(storageKey)
    try {
      await mkdir(path.dirname(target), { recursive: true })
      const temporary = `${target}.${process.pid}.tmp`
      await writeFile(temporary, new Uint8Array(await blob.arrayBuffer()), { mode: 0o600 })
      await rename(temporary, target)
    } catch (error) {
      throw new AppError('storage_unavailable', 'That document could not be written to storage.', {
        detail: (error as Error).message,
      })
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolve(storageKey))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async clearAll(): Promise<void> {
    await rm(this.root, { recursive: true, force: true })
    await mkdir(this.root, { recursive: true, mode: 0o700 })
  }
}
