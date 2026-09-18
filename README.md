# Vendor Readiness — working local prototype (milestone A)

Know which vendors are ready to work, what's missing, and what expires next.

This repository is the **milestone A prototype** described in
`vendor-readiness-mvp-requirements.md`: a complete, interactive B2B application for operations
teams who request vendor documents, review submissions, track expirations and see which vendors
meet their organization's document requirements.

> **This is not a secure production service.** Demo role switching, portal links reachable by URL
> id, the demo date control and local browser persistence are simulations. There is no
> authentication, no server-enforced authorization, no private document storage and no email
> delivery. Nothing in this build may hold real customer documents. See
> [Remaining pilot release gates](#remaining-pilot-release-gates).

---

## Setup

Requires Node.js 22 or newer.

```bash
npm install
npm run dev            # http://127.0.0.1:43217
```

The app seeds itself on first load: 12 fictional vendors for "Cedar Grove Property Operations",
real generated sample PDFs and images, and an injected clock fixed to **2026-09-17**. Everything is
stored in your browser with IndexedDB, so a refresh keeps your work and **Reset demo** restores the
seeded fixtures.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 43217 |
| `npm run build` | `tsc -b` project typecheck plus a production build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm test` | Vitest business-rule and service tests (Node + fake-indexeddb) |
| `npm run e2e` | Playwright end-to-end gates (starts its own server on port 43218) |

First Playwright run only: `npx playwright install chromium --with-deps`.

## Test commands and results

Last full run on this branch:

```
npm run typecheck   →  clean (TypeScript 6, strict)
npm run build       →  clean (2229 modules, 752 kB JS / 222 kB gzip)
npm test            →  6 files, 73 tests passed
npm run e2e         →  25 tests passed (chromium, 1440×900 and 390×780)
```

**Unit / service tests** (`tests/unit`) cover the section 11 risk table directly:

- `readiness.test.ts` — the full readiness truth table: accepted with no expiration, expires today,
  expired yesterday, all-pending vs. Awaiting review, expired effective with a pending replacement,
  valid effective plus pending or rejected renewal, revocation with no fallback, optional items,
  retired requirements, archived vendors, and the dashboard partition.
- `dates.test.ts` — organization-local today, the UTC/local midnight expiration boundary, and the
  inclusive 30-day expiring window.
- `reminders.test.ts` — missing-item cadence (day 3, then every 7), no backfill of missed
  milestones, renewal milestones 30/14/7/0 and expired, pending-replacement suppression, internal
  expiration notices, and deduplication keys.
- `csv.test.ts` — formula neutralization (`=`, `+`, `-`, `@`, tab, CR), RFC 4180 quoting, import
  column/row validation, duplicate warnings and the 500-row cap.
- `seed.test.ts` — the exact seeded distribution and every documented edge case.
- `workflows.test.ts` — W1–W5 through the real services and the real IndexedDB adapter, including
  stale-review conflicts, idempotent retries, atomic imports, permission denials and archive
  behaviour.

**End-to-end gates** (`tests/e2e`) run the built app in Chromium: the complete demo script, refresh
persistence, demo reset, CSV import error recovery, export sanitization, keyboard-only review and
upload flows, dialog focus return, the 390 px viewport, direct links to deep routes, invalid file
rejection, expired-document acceptance blocking, reminder cooldown and deduplication, and archive
and restore.

## Five-minute demo walkthrough

Start on `/overview`. The amber **Demo tools** bar at the top switches roles, moves the demo date,
opens the simulated outbox and resets the demonstration.

1. **Overview → Not ready.** Confirm the partition: 10 active vendors = 4 Ready + 2 Awaiting review
   + 3 Not ready + 1 Unconfigured, with **Expiring soon 2** labelled as an overlapping secondary
   count and 7 submissions pending review. Click **Not ready** to land on the matching filter.
2. **Open Ironwood Pest Control** (missing safety acknowledgment). Read the blocker list, then press
   **Remind** to preview the recipient and item. Close it without sending.
3. **Open demo portal** for that vendor (or switch the demo role to *Vendor contact*). On the
   requirement card press **Submit document**, use **Download a sample PDF to upload** to get a real
   file, select it and submit. The requirement moves to *Pending review*.
4. **Switch the demo role to Reviewer** and open the review queue. Open the Ironwood submission,
   enter a correction reason and press **Request changes**.
5. **Back to the vendor portal.** The correction reason is shown. Submit a corrected version;
   switch to *Reviewer* and **Accept** it. Ironwood becomes **Ready** without a refresh, and version
   1 stays in history with its rejection.
6. **Open Cedar Line Landscaping** (Ready, Expiring soon, insurance expires 2026-09-30). Set the
   demo date to **2026-10-01**. Readiness becomes **Not ready** and the current document reads
   *Expired* — while the submission itself is still *Accepted*, because time never rewrites a review
   decision.
7. **Submit and accept a renewal.** The new version becomes effective, the previous version is
   marked *Superseded* in the same transaction, and both files and all decisions remain in history.
8. **Export and inspect.** On `/vendors`, filter and press **Export CSV** (all filtered rows, not
   just the page). Then open **Simulated outbox** to read the exact messages that a pilot would have
   sent — every entry is labelled *Not delivered*.

Reset with **Reset demo** in the demo bar when you are done.

## Demo driver scripts

`scripts/` holds the scripts used to verify and record the demo. They are optional helpers, not
part of the app:

```bash
node scripts/capture-screenshots.mjs <output-dir> [baseUrl]   # walkthrough screenshots
DISPLAY=:1 node scripts/demo-walkthrough.mjs [baseUrl] [pdf]  # submit -> correct -> accept -> Ready
DISPLAY=:1 node scripts/demo-renewal.mjs [baseUrl] [pdf]      # expiration -> renewal -> superseded
```

## Implemented scope

Routes: `/overview`, `/vendors`, `/vendors/new`, `/vendors/:id`, `/review`, `/review/:submissionId`,
`/requirements`, `/activity`, `/settings`, `/portal/:vendorId`, `/demo/outbox`.

- **Readiness engine (section 5.4)** — one pure module derives exactly one status per active vendor
  (Unconfigured → Not ready → Awaiting review → Ready) plus the overlapping *Expiring soon* flag and
  an ordered blocker list. Components never compute a second version.
- **Current document vs. latest submission** — always shown as two separate facts, so a combined
  label can never hide an expiring current document.
- **Vendor directory** — case-insensitive name/contact/email search, readiness / category /
  property / expiring / lifecycle filters combined with AND, sort by name, next expiration or
  updated date, 25-row pages, filters mirrored in the URL so dashboard links reproduce counts.
- **Add and edit vendors** — inline validation that preserves input, duplicate company-name warning
  with explicit confirmation, checklist preview, and *Save* separate from *Save and invite*.
- **Checklist templates** — create, edit (version bump), archive, and per-item required/optional,
  expiration and issue-date policy. Assignment copies a snapshot; template edits never change
  existing vendors. Assigning to a vendor shows a readiness impact preview and requires a reason.
- **Uploads** — real local files stored as blobs in IndexedDB, PDF/PNG/JPEG only, 10 MiB cap, magic
  byte sniffing rather than trusting the extension, visible progress, retry on failure, and one
  pending submission per requirement with withdrawal while pending.
- **Review** — oldest-first queue excluding archived vendors, document preview beside instructions
  and entered dates, accept or request changes with a mandatory reason, record-version checks that
  reject stale or repeated decisions, atomic supersede of the previous effective version, and
  acceptance revocation with a mandatory reason and no fallback.
- **Renewals** — everything expiration-driven flows from the injected clock, so advancing the demo
  date expires documents without touching review state.
- **Reminders (simulated)** — pure eligibility rules, preview before sending, 24-hour manual
  cooldown, one digest per vendor per organization-local date, internal expiration notices even when
  a replacement is pending, and a "run today's job" button that stands in for the pilot scheduler.
- **CSV import/export** — preview with the first 10 rows and every error, 500-row cap, one template
  for the batch, atomic and idempotent by request key, never auto-invites; export covers all
  filtered rows with formula-injection neutralization and no document bytes or storage keys.
- **Archive/restore** — confirmation with impact text, removal from active metrics, review queue and
  reminders, portal uploads disabled, full history retained, readiness recalculated on restore.
- **Activity** — append-only events for vendor changes, invitations, uploads (including "on behalf
  of"), withdrawals, decisions, revocations, reminders, checklist changes and archive/restore,
  filterable by vendor and event type. The portal sees only its own vendor-visible events.
- **Demo facilities** — role selector, vendor portal context, demo date control, simulated outbox
  with deduplication keys and failure/retry states, and a confirmed reset.

### Architecture

```
src/domain/        entity types, dates, readiness, reminders, permissions, validation, CSV — pure
src/repositories/  repository interfaces + the IndexedDB adapter (one transaction per unit of work)
src/services/      use cases: createVendor, submitDocument, reviewSubmission, sendReminder, …
src/features/      overview, vendors, review, requirements, activity, settings, portal, outbox
src/components/    status chips, document preview, dialogs, requirement card, layout, shadcn/ui
src/demo/          injected clock, seed fixtures, generated sample documents
```

Services take a `ServiceContext` (`db`, injected `clock`, simulated `session`, organization id,
timezone). Every multi-entity write — submission plus effective pointer plus activity event — runs
inside a single IndexedDB transaction, which is where a pilot would use a database transaction.
Replacing `src/repositories/indexeddb` with a server adapter is the intended milestone B path;
`src/domain` should not change.

Stack: React 19, TypeScript 6, Vite 8, React Router 8, Tailwind CSS 4, shadcn/ui (Radix), Zod 4,
`idb`, Vitest 5, Playwright 1.63. `package-lock.json` is committed.

### Decisions taken where the requirements left a choice

- **Component library.** shadcn/ui on Radix primitives, so dialog focus containment and return,
  labelled selects and checkbox semantics come from tested primitives.
- **Demo tools placement.** Requirements put demo controls on `/settings`; a demonstration also
  needs to switch role mid-flow, so the same controls appear in one clearly labelled amber demo bar
  and in a bordered "Demo tools (simulation only)" section on `/settings`.
- **Demo date semantics.** The date control stores `T12:00:00Z` for the chosen day, which is
  unambiguous for the default `America/Chicago` organization timezone.
- **"Next expiration" column** shows the earliest expiration among *effective required* documents.
  Optional item dates are visible on their own requirement cards.
- **Missing-item reminder cadence** requires an invitation before the scheduled job starts (day 3,
  then every 7 days, most recent milestone only). A manual reminder ignores the cadence but still
  excludes requirements whose only outstanding state is "awaiting review".
- **Manual reminders consume the daily digest slot** by writing the same
  `digest:<org>:<vendor>:<local-date>:email` key, so the simulated job cannot duplicate them.
- **Property tags** are a fixed list from the seeded properties, chosen with checkboxes; CSV import
  splits the `property_tags` cell on semicolons.
- **Sample files** are generated in the browser rather than committed as binaries: seeding writes
  real PDF and PNG bytes into IndexedDB, and the upload dialog offers "Download a sample PDF/PNG" so
  you can pick a real file from disk. Every sample is stamped
  `SAMPLE - NOT VALID FOR BUSINESS USE`.
- **Unsaved-change confirmation** on the add-vendor form uses a confirmation dialog on Cancel plus a
  `beforeunload` guard, rather than a router-level navigation blocker.
- **Requirement retire/reinstate** is admin-only (it changes what readiness means); assigning an
  additional checklist is available to coordinators, with a reason recorded either way.
- **Correction reasons** require at least 5 characters so the vendor-facing message is meaningful.
- **A vendor contact may withdraw** its own pending submission; coordinators and admins may withdraw
  on behalf; reviewers may not.
- **Retried simulated deliveries** flip a failed outbox entry to "simulated send" and increment the
  attempt counter, so failure and retry states are visible without inventing a delivery guarantee.

### Requirement conflicts and how they were resolved

1. **Demo controls: `/settings` only vs. a usable demonstration.** Section 6 places demo role and
   date controls in a distinct Demo tools area on `/settings`, while the section 10 script switches
   role and date repeatedly from other screens. Both surfaces exist and both are explicitly labelled
   simulation; no business rule changed.
2. **"Combined status" vs. the review queue count.** Section 5.2 forbids a combined status that
   hides an expiring current document, and section 5.4 requires exactly one readiness value. Vendor
   headers therefore show readiness *plus* the separate Expiring soon flag, and every requirement
   card shows current document and latest submission separately.
3. **Manual reminders vs. scheduled deduplication.** Section 5.5 asks for a 24-hour manual cooldown
   *and* one digest per organization/vendor/local-date/channel. A manual send therefore consumes
   that day's digest key; the 24-hour cooldown is enforced separately on manual sends, so a manual
   reminder late one day and early the next is still blocked by the cooldown.
4. **Expired documents may be submitted but not accepted.** Section 5.3 allows submitting an expired
   file with a warning; the reviewer's Accept action is disabled with an explanation instead, because
   accepting would create a satisfied requirement with an expired document.

## Known limitations

- **No security.** Roles are a demo selector, the portal is reachable by URL id, and everything is
  readable in your browser's IndexedDB. Do not put real documents here.
- **Single browser, single organization.** There is no server, no sync between browsers or tabs and
  no multi-organization isolation; the seeded organization id is fixed.
- **No malware scanning or server-side validation.** File type sniffing and size limits are
  client-side only, and `scan_status` is always `not_scanned`.
- **No email.** Invitations, reminders and correction notices exist only as simulated outbox
  entries. Invitation tokens are non-secret digest stand-ins, never emailed and never redeemable.
- **No scheduler.** The daily reminder job runs when you press the button on `/settings`.
- **Concurrency is demonstrated, not distributed.** Record-version checks reject stale decisions
  within one browser; a second tab writing simultaneously is not fully modelled.
- **Membership management is read-only**, and the internal member list is seeded.
- **Scale is untested.** Seeded data is 12 vendors; list queries load and derive readiness in
  memory. Pagination exists, but server-side paging and indexes are pilot work.
- **Storage failures are surfaced, not recovered.** If IndexedDB is unavailable (private browsing,
  blocked site data), the app explains the failure and offers a retry rather than degrading.
- **Not deployed.** No hosting, analytics, error monitoring or backups.

## Remaining pilot release gates

Milestone B is a separate scope. Before any real customer record is accepted (requirements
section 13):

- Organization isolation and vendor-level access enforced at the server and storage layers, verified
  with two organizations and adversarial id-substitution tests.
- Verified authentication; revocable invitations and sessions; internal roles enforced on every read,
  write, export, review and file preview. Private files served through short-lived authorized access,
  never public URLs.
- TLS, private object storage, secret management, server-side MIME and size checks, and malware
  scanning. Quarantined or failed scans cannot be reviewed or downloaded; expired upload
  authorizations fail safely.
- Append-only review and activity records, atomic version replacement, conflict handling, and
  database constraints that prevent cross-organization references.
- A persistent scheduler and notification queue with idempotency, bounded retry, delivery and bounce
  visibility, and accurate sent/failed states. Never log tokens, signed URLs or document contents.
- Backups enabled and a restore exercised; error monitoring and an operational support contact;
  documented recovery objectives and retention/deletion policy.
- Archive is not deletion: an authenticated, admin-assisted deletion process covering files, audit
  history and backups.
- Accessibility checks on all critical workflows, understandable upload failure recovery, and
  page/query behaviour verified with at least 1,000 vendors and 10,000 metadata records.
- Baseline metrics implemented: invitation-to-first-submission time, submission-to-decision time,
  first-pass acceptance rate, reminders per vendor, overdue required items — excluding synthetic and
  archived records.
- Pricing, support obligations, data handling terms and scope confirmed with pilot customers. No
  claim of certification, legal compliance or verified insurance coverage because a document was
  accepted.

All data in this repository is synthetic. "Ready" means an organization's own document requirements
have been met, not a legal determination, insurance verification or authorization to perform work.
