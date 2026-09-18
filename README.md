# Docksy Vendor Readiness — V1

Know which vendors are ready to work, what's missing, and what expires next.

Vendor Readiness is a self-hosted B2B application for operations teams who request vendor
documents, review submissions, track expirations, and need to see which vendors meet their
organization's document requirements. V1 is a real product, not a demo: it authenticates people,
enforces permissions on the server, keeps records in SQLite and documents in a private directory,
and records every notification it produces with its true delivery state.

- One Node process serves the API and the browser client.
- Staff and vendor contacts sign in with an email and password; roles come from stored memberships.
- Documents never leave the server except through an authorized route.
- Email is optional: with no SMTP configured, messages are queued and the app says so rather than
  claiming delivery.
- No API keys, cloud accounts or external services are needed to run it.

---

## Setup

Requires Node.js 22 or newer.

```bash
npm install
npm run dev            # http://127.0.0.1:43217
```

`npm run dev` starts two processes: the API (port 43218) and the Vite dev server (port 43217) that
proxies `/api` to it. Open <http://127.0.0.1:43217>.

The first run has an empty database, so the app opens its **setup** screen: create the organization
(name, timezone, support contact) and the first admin account. Everything else is done in the app.

### Optional sample data

To evaluate the app with a populated organization:

```bash
npm run db:seed
```

This **replaces** the contents of the database with the fictional "Cedar Grove Property Operations"
dataset from the requirements: 12 vendors (4 Ready — 2 of them Expiring soon, 2 Awaiting review,
3 Not ready, 1 Unconfigured, 2 Archived), real generated sample PDFs and images marked
`SAMPLE — NOT VALID FOR BUSINESS USE`, and fictional history. It prints the accounts it creates:

| Account | Role | Password |
| --- | --- | --- |
| `dana.whitfield@example.com` | Admin | `cedar-grove-staff-2026` |
| `marcus.reyes@example.com` | Coordinator | `cedar-grove-staff-2026` |
| `priya.raman@example.com` | Reviewer | `cedar-grove-staff-2026` |
| any seeded vendor contact, e.g. `damon.frazier@example.com` | Vendor contact | `cedar-grove-vendor-2026` |

Sample passwords are printed on purpose and are meant for a local evaluation only. Override them
with `SAMPLE_STAFF_PASSWORD` and `SAMPLE_VENDOR_PASSWORD`.

### Running it for real

```bash
npm run build          # typecheck + client build
npm start              # one process serves the API and the built client on PORT
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `43217` / `127.0.0.1` | Where the server listens |
| `DOCKSY_DATA_DIR` | `./var` | SQLite database and stored documents |
| `PUBLIC_URL` | `http://HOST:PORT` | Base URL used in invitation links |
| `SECURE_COOKIES` | `false` | Set `true` when served over HTTPS |
| `SMTP_HOST` | — | Enables email delivery; without it messages stay queued |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | `587` / `false` / — / — / `docksy@localhost` | SMTP details |
| `RUN_BACKGROUND_JOBS` | `true` | Daily reminder job and the delivery worker |

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | API plus client dev server |
| `npm run build` | `tsc -b` across client, server and Node configs, then the client build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm test` | Vitest: domain, service and HTTP API suites |
| `npm run e2e` | Playwright: builds and boots the server on port 43219 with its own data directory |
| `npm run db:seed` | Load the sample dataset (`--force` to overwrite a real organization) |
| `npm run db:reset` | Delete every record and stored document (asks for confirmation) |

First Playwright run only: `npx playwright install chromium --with-deps`.

## Test commands and results

Last full run on this branch:

```
npm run typecheck   →  clean (TypeScript 6, strict, client + server)
npm run build       →  clean (678 kB JS / 202 kB gzip)
npm test            →  11 files, 108 tests passed
npm run e2e         →  33 tests passed (chromium, 1440×900 and 390×780)
npx oxlint          →  no errors (5 warnings: shadcn/ui fast-refresh and set-state-in-effect)
```

**Domain and service tests** (`tests/unit`) run the real service layer against the real SQLite
adapter and local file store, with the clock pinned so date boundaries are deterministic. They
cover the requirements section 11 risk table: the readiness truth table (accepted with no
expiration, expires today, expired yesterday, all-pending vs. Awaiting review, expired effective
with a pending replacement, valid effective plus a pending or rejected renewal, revocation with no
fallback, optional and retired items, archived vendors, the dashboard partition), organization-local
today and the UTC/local midnight boundary, reminder milestones and deduplication keys, CSV formula
neutralization, template edits not touching existing assignments, stale review conflicts, repeated
request idempotency, and the exact sample-data distribution.

**Server tests** (`tests/server`) drive the HTTP API:

- `auth.test.ts` — sign-in with one indistinguishable failure message, throttling, sign-out, a
  disabled account losing its sessions, the last-admin guard, the section 3 matrix per role, vendor
  contacts confined to their own portal and documents, upload byte validation, response headers that
  prevent inline execution, and first-run setup being available exactly once.
- `isolation.test.ts` — two organizations on one server: no listing, reading or mutating across
  them, adversarial id substitution on vendors, requirements and invitations, and a composite
  foreign key that rejects a cross-organization reference at the database level.
- `invitations.test.ts` — hashed single-use tokens, distinct copy for invalid, revoked, used and
  expired links, account plus verified membership creation, resend revoking the previous token, and
  a repeated request not sending twice.
- `delivery.test.ts` — queued with no SMTP configured, sent only after SMTP accepts, bounded retries
  with backoff then failure with the recorded error, admin retry, and the daily scheduler running
  once per organization-local day and deduplicating against a manual reminder.
- `layering.test.ts` — the browser bundle imports server modules for types only and never touches
  the database or file system; the SQLite schema matches the row mapping.

**End-to-end tests** (`tests/e2e`) cover sign-in and access denial, invitation to portal, member
administration, W1–W5 (add and invite, submit, request changes and accept, renewal superseding an
older version, remind, import, export, archive and restore), an expired document that cannot be
accepted, revocation with no fallback, keyboard-only review and upload, dialog focus return, deep
links, and the 390 px layouts.

## What V1 includes

**Operations**: overview with the four readiness counts plus the overlapping Expiring soon flag and
a prioritized attention list; vendor directory with search, combined filters, sorting, pagination
and CSV export; vendor detail with blockers, requirement cards that show the current document and
the latest submission separately, invitation and reminder actions, archive and restore; a review
queue with oldest-first ordering and a decision screen with document preview, prior version
reference and mandatory correction reasons; reusable requirement templates that snapshot on
assignment; the organization activity timeline; settings with timezone, support contact and member
administration.

**Vendor portal**: a signed-in vendor contact sees only their own checklist, correction reasons,
progress and history, uploads with real progress and retry, and can withdraw a pending submission.
Contacts authorized for several vendors switch context explicitly.

**Server**: email and password sign-in behind an identity-provider port, sessions as hashed opaque
tokens in the database with rolling expiry and revocation, the section 3 permission matrix enforced
on every read, mutation and file access, organization scoping backed by composite foreign keys,
uploads validated by magic bytes and size on the server, documents stored outside any web root,
an append-only activity and review history written in the same transaction as the change it
describes, a notification outbox with idempotency keys and bounded retries, and a daily reminder job
at 09:00 organization-local time.

### Architecture

```
src/domain/        pure rules: types, dates, readiness, reminders, validation, csv   (shared)
src/services/      use cases: createVendor, submitDocument, reviewSubmission, …      (server only)
src/repositories/  storage contracts                                                 (shared types)
server/            http api, sqlite adapter, auth, file store, mailer, scheduler, seed
src/api/           browser HTTP client mirroring the service surface
src/app|features|components/   browser UI; reaches the core only over /api
```

Readiness is derived in exactly one place (`src/domain/readiness.ts`) and the browser never
evaluates it independently. The browser may import **types** from the service layer but never
values; `tests/server/layering.test.ts` enforces that boundary.

### Decisions taken where the requirements left a choice

- **Auth**: interim email and password (scrypt, minimum 12 characters) behind an
  `IdentityProvider` port. **Firebase Authentication is the planned provider**; swapping it in means
  writing one adapter that verifies an ID token and maps the uid onto `users.auth_subject`, with no
  change to sessions, authorization or any product flow. V1 deliberately ships no Firebase client
  and needs no API keys.
- **Database**: SQLite via `better-sqlite3`, WAL, foreign keys on, real columns and indexes.
- **Documents**: a private directory (`$DOCKSY_DATA_DIR/uploads`), mode 0600, served only through
  `GET /api/submissions/:id/file` after an authorization check.
- **Email**: optional SMTP through `nodemailer`. Unconfigured is a supported state, not a failure.
- **Invitations**: single-use token, hashed with SHA-256, 7-day expiry, revoked on resend. Because a
  self-hosted server may have no SMTP, the acceptance link is shown once to the operator who sent it
  so they can pass it on deliberately.
- **Password resets**: admin-assisted. An admin sets a temporary password and every session for that
  account is revoked. There is no self-service reset email.
- **Sample data**: never loaded automatically; `npm run db:seed` is explicit.
- **Deployment**: single process, single organization per install in practice (the data model and
  tests support several, and each administrator only ever sees their own).

## Known limitations

- **One process per database.** SQLite gives a database file to one process; do not run two servers
  against the same `DOCKSY_DATA_DIR`. Automated tests reset data through a test-only endpoint that
  is mounted only when `DOCKSY_ENABLE_TEST_RESET=true` for exactly this reason.
- **No malware scanning.** Uploads are checked for type and size on the server; `scan_status` is
  recorded as `not_scanned`. Quarantine behaviour is not implemented.
- **Email delivery is best-effort.** With SMTP configured, messages are retried up to five times
  with backoff and then marked failed with the SMTP error. There is no bounce or complaint handling.
- **Sign-in throttling is per process and in memory.** A restart clears it, and it does not
  coordinate across instances.
- **No self-service password reset, no SSO, no SCIM, no multi-factor authentication.**
- **Vendor list derivation is in memory.** Filtering and readiness run over the organization's
  vendors on each request. It is indexed and fast at the scale this is built for, but it has not
  been profiled at 1,000+ vendors and 10,000+ submissions.
- **No backups, monitoring or retention policy.** Copy `$DOCKSY_DATA_DIR` while the server is
  stopped; nothing is automated, and no recovery objective is implied.
- **Archive is not deletion.** There is no self-service deletion path for a vendor's documents.
- **No AI review, billing, inspections, e-signatures or third-party integrations**, by design.
- Accepting a document is a record of receipt. It is not a legal determination, insurance
  verification, or authorization to perform work, and the app never says "compliant".

## Requirement conflicts, resolved without changing the business rules

The requirements document describes a milestone-A prototype in places; V1 follows the pilot column
of its section 2 table instead. The section 3–5 permissions, states and calculations are unchanged.

1. **Simulation surfaces.** Sections 2, 5.5 and 6 specify demo role switching, an injected demo
   date, a "Simulated" outbox, `/portal/:vendorId` and a Reset demo control. V1 removes all of them:
   the clock is the system clock, roles come from memberships, the portal comes from a verified
   membership, and the outbox reports real states. The calculations those surfaces fed are untouched.
2. **"Simulated" wording** (section 5.5) is replaced by real delivery states, plus an explicit
   "queued — email delivery is not configured" state when there is no SMTP. Nothing ever claims a
   message was delivered when it was not.
3. **Exactly one readiness status** (5.4) versus *a combined status must not hide an expiring
   document* (5.2): the vendor shows one readiness chip plus a separate Expiring soon flag, and each
   requirement shows its current document and its latest submission separately.
4. **Manual reminder cooldown** (24 hours per vendor) versus **one digest per organization, vendor,
   local date and channel**: a manual send consumes that day's digest key, and the 24-hour cooldown
   is enforced separately on manual sends.
5. **Expired files may be submitted with a warning but cannot be accepted** (5.3): the submission is
   accepted into the queue with a warning, and the reviewer's Accept button is disabled with an
   explanation until a new version carries a valid expiration date.

## Remaining gates before real customer data

From requirements section 13, still open: malware scanning with quarantine, backup and restore
exercised, error monitoring, documented recovery objectives and a retention/deletion policy,
admin-assisted deletion consistent with a customer agreement, load and query behaviour verified at
1,000 vendors and 10,000 metadata records, the baseline product metrics (invitation-to-first-
submission, submission-to-decision, first-pass acceptance rate, reminders per vendor, overdue
required items), and the commercial terms. TLS termination, secret management and host hardening are
deployment concerns this repository does not configure for you.
