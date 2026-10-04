/**
 * Document bytes in a GCS bucket. Keys match the local blob store (`blob/<uuid>`).
 * Used only when GCS_BUCKET is set; production Cloud Run must not write uploads to container disk.
 */
import { Storage, type Bucket } from '@google-cloud/storage'
import { AppError } from '@/domain/errors'
import type { BlobStore } from '@/repositories/types'

const SAFE_KEY = /^[A-Za-z0-9/_-]+$/

export interface GcsFileLike {
  download(): Promise<[Buffer]>
  save(data: Buffer | Uint8Array, options?: { resumable?: boolean }): Promise<unknown>
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>
}

export interface GcsBucketLike {
  file(name: string): GcsFileLike
  getFiles(options?: { prefix?: string }): Promise<[GcsFileLike[]]>
}

export interface GcsStorageLike {
  bucket(name: string): GcsBucketLike
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code: unknown }).code : undefined
  return code === 404 || code === 'ENOENT' || code === '404'
}

export class GcsBlobStore implements BlobStore {
  private readonly bucket: GcsBucketLike
  readonly bucketName: string

  constructor(bucketName: string, storage: GcsStorageLike | Storage = new Storage()) {
    this.bucketName = bucketName.replace(/^gs:\/\//, '')
    // Storage.Bucket is structurally compatible for the methods we call; the official
    // getFiles overload returns extra tuple slots we do not use.
    this.bucket = storage.bucket(this.bucketName) as unknown as GcsBucketLike
  }

  private objectName(storageKey: string): string {
    if (!SAFE_KEY.test(storageKey) || storageKey.includes('..')) {
      throw new AppError('validation', 'That storage key is not allowed.')
    }
    return storageKey
  }

  async get(storageKey: string): Promise<Blob | undefined> {
    try {
      const [bytes] = await this.bucket.file(this.objectName(storageKey)).download()
      return new Blob([new Uint8Array(bytes)])
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw new AppError('storage_unavailable', 'That document could not be read from storage.', {
        detail: (error as Error).message,
      })
    }
  }

  async put(storageKey: string, blob: Blob): Promise<void> {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await this.bucket.file(this.objectName(storageKey)).save(Buffer.from(bytes), { resumable: false })
    } catch (error) {
      throw new AppError('storage_unavailable', 'That document could not be written to storage.', {
        detail: (error as Error).message,
      })
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.bucket.file(this.objectName(storageKey)).delete({ ignoreNotFound: true })
    } catch (error) {
      if (!isNotFound(error)) {
        throw new AppError('storage_unavailable', 'That document could not be removed from storage.', {
          detail: (error as Error).message,
        })
      }
    }
  }

  async clearAll(): Promise<void> {
    const [files] = await this.bucket.getFiles({ prefix: 'blob/' })
    for (const file of files) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined)
    }
  }
}

export type { Bucket }
