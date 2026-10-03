/**
 * Entity types for the Docket Tree domain (requirements section 8).
 *
 * Readiness is always derived (see `readiness.ts`); it is never stored on an entity.
 */

export type UUID = string
/** Date-only ISO value, `YYYY-MM-DD`. */
export type IsoDate = string
/** Instant, ISO 8601 in UTC. */
export type IsoDateTime = string

export type InternalRole = 'admin' | 'coordinator' | 'reviewer'
export type Role = InternalRole | 'vendor_contact'

export const INTERNAL_ROLES: InternalRole[] = ['admin', 'coordinator', 'reviewer']

export type VendorLifecycle = 'active' | 'archived'

export type SubmissionState =
  | 'pending_review'
  | 'accepted'
  | 'changes_requested'
  | 'withdrawn'
  | 'superseded'
  | 'revoked'

/** Derived vendor readiness. `archived` is a lifecycle presentation, not a readiness bucket. */
export type ReadinessStatus =
  | 'ready'
  | 'awaiting_review'
  | 'not_ready'
  | 'unconfigured'
  | 'archived'

/** Current effective document state for one requirement. */
export type CurrentDocumentStatus = 'accepted' | 'expiring_soon' | 'expired' | 'none'

export type ReviewDecision = 'accepted' | 'changes_requested' | 'revoked'

export type NotificationType =
  | 'invitation'
  | 'vendor_digest'
  | 'correction_requested'
  | 'internal_expiration_notice'

/**
 * Lifecycle of one document/info ask in the Requests inbox.
 * Mapped onto outbox sends, portal opens, submissions, and review decisions.
 */
export type DocumentRequestState =
  | 'sent'
  | 'viewed'
  | 'uploaded'
  | 'in_review'
  | 'completed'

/** How the ask was originated. Does not change readiness math. */
export type DocumentRequestSource = 'reminder' | 'correction' | 'manual'

/**
 * Delivery state of an outbox row. `queued` means the message is persisted and waiting:
 * either for the next delivery attempt or, when SMTP is not configured, indefinitely.
 */
export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'retry_scheduled'

export type ActivityEventType =
  | 'vendor_created'
  | 'vendor_updated'
  | 'vendor_archived'
  | 'vendor_restored'
  | 'vendor_imported'
  | 'checklist_assigned'
  | 'requirement_added'
  | 'requirement_retired'
  | 'requirement_updated'
  | 'invitation_sent'
  | 'invitation_revoked'
  | 'document_submitted'
  | 'document_submitted_on_behalf'
  | 'document_withdrawn'
  | 'submission_accepted'
  | 'submission_changes_requested'
  | 'acceptance_revoked'
  | 'reminder_sent'
  | 'template_created'
  | 'template_updated'
  | 'template_archived'
  | 'settings_updated'
  | 'invitation_accepted'
  | 'member_added'
  | 'member_updated'
  | 'member_removed'

export interface Timestamps {
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export interface Organization extends Timestamps {
  id: UUID
  name: string
  /** IANA timezone used to determine "today" for every date calculation. */
  timezone: string
  support_email: string
  support_contact_name: string
  record_version: number
}

export type UserStatus = 'active' | 'disabled'

export interface User {
  id: UUID
  display_name: string
  email: string
  /** Reserved for a future identity provider subject; null for password accounts. */
  auth_subject: string | null
  /** scrypt digest. Null until the account has been given a password. */
  password_hash: string | null
  password_updated_at: IsoDateTime | null
  status: UserStatus
  last_login_at: IsoDateTime | null
  created_at: IsoDateTime
}

/** Server-side session record. The raw token exists only in the client cookie. */
export interface AuthSession {
  id: UUID
  user_id: UUID
  token_hash: string
  /** Explicit active vendor context for a vendor contact with several memberships. */
  active_vendor_id: UUID | null
  created_at: IsoDateTime
  last_seen_at: IsoDateTime
  expires_at: IsoDateTime
  revoked_at: IsoDateTime | null
}

export interface Membership {
  id: UUID
  organization_id: UUID
  user_id: UUID
  role: InternalRole
}

export interface Vendor extends Timestamps {
  id: UUID
  organization_id: UUID
  company_name: string
  category: string
  contact_name: string
  contact_email: string
  lifecycle: VendorLifecycle
  invited_at: IsoDateTime | null
  property_tags: string[]
  archived_at: IsoDateTime | null
  archive_reason: string | null
  record_version: number
}

export interface VendorMembership {
  id: UUID
  organization_id: UUID
  vendor_id: UUID
  user_id: UUID
  verified_at: IsoDateTime | null
}

export interface RequirementTemplate extends Timestamps {
  id: UUID
  organization_id: UUID
  name: string
  description: string
  version: number
  archived_at: IsoDateTime | null
  record_version: number
}

export interface TemplateItem {
  id: UUID
  template_id: UUID
  title: string
  instructions: string
  required: boolean
  expiration_required: boolean
  collect_issue_date: boolean
  sort_order: number
}

/** A point-in-time copy of a template item, attached to one vendor. */
export interface AssignedRequirement extends Timestamps {
  id: UUID
  organization_id: UUID
  vendor_id: UUID
  source_template_id: UUID | null
  source_template_version: number | null
  source_item_id: UUID | null
  title: string
  instructions: string
  required: boolean
  expiration_required: boolean
  collect_issue_date: boolean
  sort_order: number
  due_date: IsoDate | null
  retired_at: IsoDateTime | null
  retired_reason: string | null
  /** Latest accepted submission that currently satisfies this requirement. */
  effective_submission_id: UUID | null
  record_version: number
}

export interface Submission {
  id: UUID
  organization_id: UUID
  vendor_id: UUID
  requirement_id: UUID
  version_number: number
  state: SubmissionState
  file_object_id: UUID
  issue_date: IsoDate | null
  expiration_date: IsoDate | null
  submitted_by: UUID
  submitted_by_label: string
  /** True when an internal user uploaded for the vendor. */
  submitted_on_behalf: boolean
  submitted_at: IsoDateTime
  decided_at: IsoDateTime | null
  withdrawn_at: IsoDateTime | null
  superseded_by_submission_id: UUID | null
  record_version: number
}

export interface FileObject {
  id: UUID
  organization_id: UUID
  storage_key: string
  original_filename: string
  detected_mime: string
  byte_size: number
  /** V1 validates type and size server-side but does not run a malware scanner. */
  scan_status: 'not_scanned' | 'clean' | 'quarantined'
  created_by: UUID
  created_at: IsoDateTime
}

export interface ReviewEvent {
  id: UUID
  organization_id: UUID
  submission_id: UUID
  actor_id: UUID
  actor_label: string
  decision: ReviewDecision
  reason: string | null
  created_at: IsoDateTime
}

export interface Invitation {
  id: UUID
  organization_id: UUID
  vendor_id: UUID
  invited_email: string
  /** SHA-256 of the single-use token. The raw token is never stored or logged. */
  token_hash: string
  expires_at: IsoDateTime
  redeemed_at: IsoDateTime | null
  redeemed_by_user_id: UUID | null
  revoked_at: IsoDateTime | null
  created_by: UUID
  created_at: IsoDateTime
}

export interface NotificationItem {
  requirement_id: UUID | null
  requirement_title: string
  /** Reminder milestone this line was generated from, e.g. `renewal:7`. */
  milestone_key: string
  detail: string
  submission_version: number | null
}

export interface Notification {
  id: UUID
  organization_id: UUID
  vendor_id: UUID | null
  type: NotificationType
  recipient: string
  recipient_label: string
  subject: string
  body: string
  items: NotificationItem[]
  status: NotificationStatus
  idempotency_key: string
  attempt_count: number
  next_attempt_at: IsoDateTime | null
  sent_at: IsoDateTime | null
  last_error: string | null
  /** True when a person pressed Send reminder rather than the scheduled daily job. */
  manual: boolean
  created_at: IsoDateTime
}

export interface ActivityEvent {
  id: UUID
  organization_id: UUID
  vendor_id: UUID | null
  actor_id: UUID | 'system'
  actor_label: string
  actor_role: Role | 'system'
  event_type: ActivityEventType
  target_id: UUID | null
  summary: string
  reason: string | null
  /** Safe metadata only: never document bytes, tokens or full document content. */
  metadata: Record<string, string | number | boolean | null>
  /** Events the vendor portal is allowed to see. */
  vendor_visible: boolean
  created_at: IsoDateTime
}

export interface ImportBatch {
  id: UUID
  organization_id: UUID
  request_key: string
  row_count: number
  status: 'completed' | 'failed'
  template_id: UUID | null
  created_at: IsoDateTime
  created_vendor_ids: UUID[]
}

/** Idempotency ledger: request key -> serialized result. */
export interface RequestRecord {
  key: string
  result_json: string
  created_at: IsoDateTime
}

/**
 * One document/info ask tracked in the Requests inbox.
 * Distinct from `RequestRecord` (HTTP idempotency ledger → SQLite `request_records`).
 */
export interface DocumentRequest {
  id: UUID
  organization_id: UUID
  vendor_id: UUID
  requirement_id: UUID | null
  item_title: string
  detail: string | null
  source: DocumentRequestSource
  state: DocumentRequestState
  notification_id: UUID | null
  submission_id: UUID | null
  created_by: UUID | 'system'
  sent_at: IsoDateTime
  viewed_at: IsoDateTime | null
  uploaded_at: IsoDateTime | null
  in_review_at: IsoDateTime | null
  completed_at: IsoDateTime | null
  closed_reason: string | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}
