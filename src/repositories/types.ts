/**
 * Repository interfaces. Services depend only on these, so storage can change without
 * touching domain rules or use cases. Local/dev uses SQLite + local disk; production
 * uses Postgres + GCS when those env vars are set.
 */
import type {
  ActivityEvent,
  AssignedRequirement,
  AuthSession,
  DocumentRequest,
  FileObject,
  ImportBatch,
  Invitation,
  Membership,
  Notification,
  Organization,
  OrganizationBilling,
  Property,
  RequestRecord,
  RequirementTemplate,
  ReviewEvent,
  StripeWebhookEvent,
  Submission,
  TemplateItem,
  User,
  UUID,
  Vendor,
  VendorMembership,
  VendorProperty,
} from '@/domain/types'

export interface Collection<T> {
  get(id: string): Promise<T | undefined>
  getAll(): Promise<T[]>
  /** Index lookup, e.g. `where('by_vendor', vendorId)`. */
  where(index: string, key: string | number): Promise<T[]>
  put(value: T): Promise<void>
  putMany(values: T[]): Promise<void>
  delete(id: string): Promise<void>
  count(): Promise<number>
}

export interface BlobStore {
  get(storageKey: string): Promise<Blob | undefined>
  put(storageKey: string, blob: Blob): Promise<void>
  delete(storageKey: string): Promise<void>
  /** Optional bulk removal, used when the whole dataset is reset. */
  clearAll?(): Promise<void>
}

/**
 * One unit of work == one database transaction. Multi-entity writes (submission +
 * requirement pointer + activity event) must all happen inside a single `write` call.
 */
export interface UnitOfWork {
  organizations: Collection<Organization>
  users: Collection<User>
  sessions: Collection<AuthSession>
  memberships: Collection<Membership>
  vendors: Collection<Vendor>
  properties: Collection<Property>
  vendorProperties: Collection<VendorProperty>
  vendorMemberships: Collection<VendorMembership>
  templates: Collection<RequirementTemplate>
  templateItems: Collection<TemplateItem>
  requirements: Collection<AssignedRequirement>
  submissions: Collection<Submission>
  files: Collection<FileObject>
  reviewEvents: Collection<ReviewEvent>
  invitations: Collection<Invitation>
  notifications: Collection<Notification>
  activity: Collection<ActivityEvent>
  importBatches: Collection<ImportBatch>
  requests: Collection<RequestRecord>
  documentRequests: Collection<DocumentRequest>
  organizationBilling: Collection<OrganizationBilling>
  stripeWebhookEvents: Collection<StripeWebhookEvent>
  blobs: BlobStore
}

export interface Database {
  read<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T>
  write<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T>
  /** Removes every record and stored document. Used by tests and `npm run db:reset`. */
  clear(): Promise<void>
  close(): void
}

export interface IdempotencyResult<T> {
  value: T
  replayed: boolean
}

/** Return a previous result for the same request key instead of writing twice. */
export async function withIdempotency<T>(
  uow: UnitOfWork,
  requestKey: string | null,
  createdAt: string,
  work: () => Promise<T>,
): Promise<IdempotencyResult<T>> {
  if (!requestKey) {
    return { value: await work(), replayed: false }
  }
  const existing = await uow.requests.get(requestKey)
  if (existing) {
    return { value: JSON.parse(existing.result_json) as T, replayed: true }
  }
  const value = await work()
  await uow.requests.put({
    key: requestKey,
    result_json: JSON.stringify(value ?? null),
    created_at: createdAt,
  })
  return { value, replayed: false }
}

export type VendorId = UUID
