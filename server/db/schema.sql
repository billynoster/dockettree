-- Docksy Vendor Readiness — SQLite schema (requirements section 8).
-- Every customer-owned row carries organization_id, and composite foreign keys make a
-- cross-organization reference impossible at the database level.

CREATE TABLE IF NOT EXISTS organizations (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  timezone             TEXT NOT NULL,
  support_email        TEXT NOT NULL,
  support_contact_name TEXT NOT NULL,
  record_version       INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  display_name        TEXT NOT NULL,
  email               TEXT NOT NULL COLLATE NOCASE,
  auth_subject        TEXT,
  password_hash       TEXT,
  password_updated_at TEXT,
  status              TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  last_login_at       TEXT,
  created_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_subject_unique ON users (auth_subject)
  WHERE auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  active_vendor_id TEXT,
  created_at       TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  revoked_at       TEXT
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS memberships (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'coordinator', 'reviewer')),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_by_user ON memberships (user_id);
CREATE INDEX IF NOT EXISTS memberships_by_organization ON memberships (organization_id);

CREATE TABLE IF NOT EXISTS vendors (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  company_name    TEXT NOT NULL,
  category        TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  contact_email   TEXT NOT NULL,
  lifecycle       TEXT NOT NULL CHECK (lifecycle IN ('active', 'archived')),
  invited_at      TEXT,
  property_tags   TEXT NOT NULL DEFAULT '[]',
  archived_at     TEXT,
  archive_reason  TEXT,
  record_version  INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS vendors_by_organization ON vendors (organization_id);
CREATE INDEX IF NOT EXISTS vendors_by_lifecycle ON vendors (lifecycle);

CREATE TABLE IF NOT EXISTS vendor_memberships (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  vendor_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verified_at     TEXT,
  UNIQUE (vendor_id, user_id),
  FOREIGN KEY (organization_id, vendor_id) REFERENCES vendors (organization_id, id)
);
CREATE INDEX IF NOT EXISTS vendor_memberships_by_vendor ON vendor_memberships (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_memberships_by_user ON vendor_memberships (user_id);

CREATE TABLE IF NOT EXISTS templates (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  version         INTEGER NOT NULL DEFAULT 1,
  archived_at     TEXT,
  record_version  INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS templates_by_organization ON templates (organization_id);

CREATE TABLE IF NOT EXISTS template_items (
  id                  TEXT PRIMARY KEY,
  template_id         TEXT NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  instructions        TEXT NOT NULL DEFAULT '',
  required            INTEGER NOT NULL,
  expiration_required INTEGER NOT NULL,
  collect_issue_date  INTEGER NOT NULL,
  sort_order          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS template_items_by_template ON template_items (template_id);

CREATE TABLE IF NOT EXISTS requirements (
  id                      TEXT PRIMARY KEY,
  organization_id         TEXT NOT NULL,
  vendor_id               TEXT NOT NULL,
  source_template_id      TEXT,
  source_template_version INTEGER,
  source_item_id          TEXT,
  title                   TEXT NOT NULL,
  instructions            TEXT NOT NULL DEFAULT '',
  required                INTEGER NOT NULL,
  expiration_required     INTEGER NOT NULL,
  collect_issue_date      INTEGER NOT NULL,
  sort_order              INTEGER NOT NULL,
  due_date                TEXT,
  retired_at              TEXT,
  retired_reason          TEXT,
  effective_submission_id TEXT,
  record_version          INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, vendor_id) REFERENCES vendors (organization_id, id)
);
CREATE INDEX IF NOT EXISTS requirements_by_vendor ON requirements (vendor_id);
CREATE INDEX IF NOT EXISTS requirements_by_organization ON requirements (organization_id);

CREATE TABLE IF NOT EXISTS files (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations (id),
  storage_key       TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  detected_mime     TEXT NOT NULL,
  byte_size         INTEGER NOT NULL,
  scan_status       TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id                          TEXT PRIMARY KEY,
  organization_id             TEXT NOT NULL,
  vendor_id                   TEXT NOT NULL,
  requirement_id              TEXT NOT NULL,
  version_number              INTEGER NOT NULL,
  state                       TEXT NOT NULL CHECK (
    state IN ('pending_review', 'accepted', 'changes_requested', 'withdrawn', 'superseded', 'revoked')
  ),
  file_object_id              TEXT NOT NULL,
  issue_date                  TEXT,
  expiration_date             TEXT,
  submitted_by                TEXT NOT NULL,
  submitted_by_label          TEXT NOT NULL,
  submitted_on_behalf         INTEGER NOT NULL,
  submitted_at                TEXT NOT NULL,
  decided_at                  TEXT,
  withdrawn_at                TEXT,
  superseded_by_submission_id TEXT,
  record_version              INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, id),
  UNIQUE (requirement_id, version_number),
  FOREIGN KEY (organization_id, requirement_id) REFERENCES requirements (organization_id, id),
  FOREIGN KEY (organization_id, file_object_id) REFERENCES files (organization_id, id)
);
CREATE INDEX IF NOT EXISTS submissions_by_requirement ON submissions (requirement_id);
CREATE INDEX IF NOT EXISTS submissions_by_vendor ON submissions (vendor_id);
CREATE INDEX IF NOT EXISTS submissions_by_state ON submissions (state);

CREATE TABLE IF NOT EXISTS review_events (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  submission_id   TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  actor_label     TEXT NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('accepted', 'changes_requested', 'revoked')),
  reason          TEXT,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (organization_id, submission_id) REFERENCES submissions (organization_id, id)
);
CREATE INDEX IF NOT EXISTS review_events_by_submission ON review_events (submission_id);

CREATE TABLE IF NOT EXISTS invitations (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL,
  vendor_id           TEXT NOT NULL,
  invited_email       TEXT NOT NULL,
  token_hash          TEXT NOT NULL UNIQUE,
  expires_at          TEXT NOT NULL,
  redeemed_at         TEXT,
  redeemed_by_user_id TEXT,
  revoked_at          TEXT,
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY (organization_id, vendor_id) REFERENCES vendors (organization_id, id)
);
CREATE INDEX IF NOT EXISTS invitations_by_vendor ON invitations (vendor_id);

CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  vendor_id       TEXT,
  type            TEXT NOT NULL,
  recipient       TEXT NOT NULL,
  recipient_label TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  items           TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'retry_scheduled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  sent_at         TEXT,
  last_error      TEXT,
  manual          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_by_vendor ON notifications (vendor_id);
CREATE INDEX IF NOT EXISTS notifications_by_status ON notifications (status);

CREATE TABLE IF NOT EXISTS activity_events (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  vendor_id       TEXT,
  actor_id        TEXT NOT NULL,
  actor_label     TEXT NOT NULL,
  actor_role      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  target_id       TEXT,
  summary         TEXT NOT NULL,
  reason          TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  vendor_visible  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_events_by_vendor ON activity_events (vendor_id);
CREATE INDEX IF NOT EXISTS activity_events_by_event_type ON activity_events (event_type);
CREATE INDEX IF NOT EXISTS activity_events_by_organization ON activity_events (organization_id, created_at);

CREATE TABLE IF NOT EXISTS import_batches (
  id                 TEXT PRIMARY KEY,
  organization_id    TEXT NOT NULL REFERENCES organizations (id),
  request_key        TEXT NOT NULL UNIQUE,
  row_count          INTEGER NOT NULL,
  status             TEXT NOT NULL,
  template_id        TEXT,
  created_at         TEXT NOT NULL,
  created_vendor_ids TEXT NOT NULL DEFAULT '[]'
);

-- Idempotency ledger: a repeated request key returns the first result instead of writing twice.
CREATE TABLE IF NOT EXISTS request_records (
  key         TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Document/info asks for the Requests inbox (distinct from request_records above).
CREATE TABLE IF NOT EXISTS document_requests (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations (id),
  vendor_id        TEXT NOT NULL REFERENCES vendors (id),
  requirement_id   TEXT,
  item_title       TEXT NOT NULL,
  detail           TEXT,
  source           TEXT NOT NULL,
  state            TEXT NOT NULL,
  notification_id  TEXT,
  submission_id    TEXT,
  created_by       TEXT NOT NULL,
  sent_at          TEXT NOT NULL,
  viewed_at        TEXT,
  uploaded_at      TEXT,
  in_review_at     TEXT,
  completed_at     TEXT,
  closed_reason    TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS document_requests_by_organization ON document_requests (organization_id, sent_at);
CREATE INDEX IF NOT EXISTS document_requests_by_vendor ON document_requests (vendor_id);
CREATE INDEX IF NOT EXISTS document_requests_by_requirement ON document_requests (requirement_id);
CREATE INDEX IF NOT EXISTS document_requests_by_notification ON document_requests (notification_id);
CREATE INDEX IF NOT EXISTS document_requests_by_state ON document_requests (state);

-- Stripe Test-mode subscription mapping (org ↔ customer / subscription status).
CREATE TABLE IF NOT EXISTS organization_billing (
  organization_id         TEXT PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  stripe_price_id         TEXT,
  plan_id                 TEXT,
  billing_interval        TEXT,
  status                  TEXT NOT NULL DEFAULT 'none',
  founding_rate_applied   INTEGER NOT NULL DEFAULT 0,
  trial_ends_at           TEXT,
  current_period_ends_at  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_billing_by_customer
  ON organization_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS organization_billing_by_subscription
  ON organization_billing (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
