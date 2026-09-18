/** End-to-end service tests for workflows W1–W5 and the section 11 risk table. */
import { beforeEach, describe, expect, it } from 'vitest'
import { isAppError } from '@/domain/errors'
import { previewImport, importVendors } from '@/services/importService'
import { exportVendorStatus } from '@/services/exportService'
import { inviteVendor, previewInvitation } from '@/services/invitationService'
import { getVendorPortal } from '@/services/portalService'
import { listOutbox, previewReminder, runDailyReminderJob, sendReminder } from '@/services/reminderService'
import { getReviewDetail, listReviewQueue, reviewSubmission, revokeAcceptance } from '@/services/reviewService'
import { submitDocument, withdrawSubmission } from '@/services/submissionService'
import { listTemplates, updateTemplate } from '@/services/templateService'
import {
  archiveVendor,
  createVendor,
  getVendorSnapshot,
  listVendors,
  restoreVendor,
} from '@/services/vendorService'
import { listActivity } from '@/services/activityService'
import {
  createHarness,
  emptyFile,
  oversizedFile,
  samplePdfFile,
  textFileDisguisedAsPdf,
  testTokens,
  vendorIdFor,
  type Harness,
} from '../harness'

let harness: Harness

beforeEach(async () => {
  harness = await createHarness('admin')
})

async function requirementIdByTitle(vendorSlug: string, title: string) {
  const snapshot = await getVendorSnapshot(harness.admin(), vendorIdFor(vendorSlug))
  const status = snapshot.requirementStatuses.find((entry) => entry.requirement.title === title)
  if (!status) throw new Error(`No requirement ${title}`)
  return status.requirement.id
}

describe('W2/W3 — submit, correct and accept', () => {
  it('walks the demo script from Not ready to Ready', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const requirementId = await requirementIdByTitle('ironwood-pest-control', 'Safety acknowledgment')

    harness.actAs('vendor_contact', vendorId)
    const first = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile('safety.pdf'),
      dates: { issue_date: '', expiration_date: '' },
    })
    expect(first.version_number).toBe(1)

    let snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.readiness.status).toBe('awaiting_review')

    harness.actAs('reviewer')
    const detail = await getReviewDetail(harness.ctx, first.submission_id)
    await reviewSubmission(harness.ctx, {
      submissionId: first.submission_id,
      expectedVersion: detail.submission.record_version,
      decision: 'changes_requested',
      reason: 'The signature block is blank on page 2. Please sign and date it.',
    })

    snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.readiness.status).toBe('not_ready')
    expect(snapshot.readiness.blockers[0].reason).toBe('changes_requested')

    harness.actAs('vendor_contact', vendorId)
    const portal = await getVendorPortal(harness.ctx, vendorId)
    const safety = portal.requirements.find(
      (entry) => entry.status.requirement.title === 'Safety acknowledgment',
    )
    expect(safety?.correctionReason).toContain('signature block')

    const second = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile('safety-signed.pdf'),
      dates: { issue_date: '', expiration_date: '' },
    })
    expect(second.version_number).toBe(2)

    harness.actAs('reviewer')
    const secondDetail = await getReviewDetail(harness.ctx, second.submission_id)
    const decision = await reviewSubmission(harness.ctx, {
      submissionId: second.submission_id,
      expectedVersion: secondDetail.submission.record_version,
      decision: 'accepted',
    })
    expect(decision.readinessStatus).toBe('ready')

    snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.readiness.status).toBe('ready')
    // The rejected version is preserved.
    const versions = snapshot.submissions
      .filter((submission) => submission.requirement_id === requirementId)
      .map((submission) => `${submission.version_number}:${submission.state}`)
      .sort()
    expect(versions).toEqual(['1:changes_requested', '2:accepted'])
  })

  it('queues a correction notice and never claims delivery', async () => {
    const vendorId = vendorIdFor('lakeside-window-care')
    const queue = await listReviewQueue(harness.ctx, { vendorId })
    const target = queue.items[0]
    harness.actAs('reviewer')
    await reviewSubmission(harness.ctx, {
      submissionId: target.submission.id,
      expectedVersion: target.submission.record_version,
      decision: 'changes_requested',
      reason: 'The uploaded page is cut off on the right edge.',
    })
    const outbox = await listOutbox(harness.ctx, { vendorId, type: 'correction_requested' })
    expect(outbox.entries).toHaveLength(1)
    expect(outbox.entries[0].notification.status).toBe('queued')
    expect(outbox.entries[0].notification.status).toBe('queued')
  })

  it('requires a correction reason', async () => {
    const queue = await listReviewQueue(harness.ctx)
    harness.actAs('reviewer')
    await expect(
      reviewSubmission(harness.ctx, {
        submissionId: queue.items[0].submission.id,
        expectedVersion: queue.items[0].submission.record_version,
        decision: 'changes_requested',
        reason: '  ',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects a stale second decision with a conflict', async () => {
    const queue = await listReviewQueue(harness.ctx)
    const target = queue.items[0]
    harness.actAs('reviewer')
    await reviewSubmission(harness.ctx, {
      submissionId: target.submission.id,
      expectedVersion: target.submission.record_version,
      decision: 'accepted',
    })
    await expect(
      reviewSubmission(harness.ctx, {
        submissionId: target.submission.id,
        expectedVersion: target.submission.record_version,
        decision: 'changes_requested',
        reason: 'Second reviewer disagrees with the first decision.',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('allows only one pending submission per requirement and supports withdrawal', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const requirementId = await requirementIdByTitle('ironwood-pest-control', 'Safety acknowledgment')
    harness.actAs('vendor_contact', vendorId)
    const first = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile(),
      dates: { issue_date: '', expiration_date: '' },
    })
    await expect(
      submitDocument(harness.ctx, {
        requirementId,
        file: samplePdfFile(),
        dates: { issue_date: '', expiration_date: '' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const submission = await harness.ctx.db.read((uow) => uow.submissions.get(first.submission_id))
    await withdrawSubmission(harness.ctx, first.submission_id, submission!.record_version)
    const after = await getVendorSnapshot(harness.admin(), vendorId)
    expect(
      after.submissions.find((entry) => entry.id === first.submission_id)?.state,
    ).toBe('withdrawn')
    // A new submission is possible after withdrawal, and history is retained.
    const replacement = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile(),
      dates: { issue_date: '', expiration_date: '' },
    })
    expect(replacement.version_number).toBe(2)
  })

  it('never creates a submission for an invalid file', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const requirementId = await requirementIdByTitle('ironwood-pest-control', 'Safety acknowledgment')
    harness.actAs('vendor_contact', vendorId)

    for (const file of [oversizedFile(), textFileDisguisedAsPdf(), emptyFile()]) {
      await expect(
        submitDocument(harness.ctx, {
          requirementId,
          file,
          dates: { issue_date: '', expiration_date: '' },
        }),
      ).rejects.toMatchObject({ code: 'validation' })
    }
    const snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.submissions.filter((entry) => entry.requirement_id === requirementId)).toHaveLength(0)
  })

  it('requires an expiration date when the requirement demands one', async () => {
    const vendorId = vendorIdFor('lakeside-window-care')
    const requirementId = await requirementIdByTitle('lakeside-window-care', 'Insurance certificate')
    const pending = (await listReviewQueue(harness.ctx, { vendorId })).items.find(
      (item) => item.requirement.id === requirementId,
    )
    await withdrawSubmission(harness.ctx, pending!.submission.id, pending!.submission.record_version)

    harness.actAs('vendor_contact', vendorId)
    await expect(
      submitDocument(harness.ctx, {
        requirementId,
        file: samplePdfFile(),
        dates: { issue_date: '', expiration_date: '' },
      }),
    ).rejects.toMatchObject({ code: 'validation' })

    const warned = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile(),
      dates: { issue_date: '2025-01-01', expiration_date: '2026-01-01' },
    })
    expect(warned.warning).toContain('already passed')

    // An expired document cannot be accepted.
    harness.actAs('reviewer')
    const detail = await getReviewDetail(harness.ctx, warned.submission_id)
    expect(detail.canAccept).toBe(false)
    await expect(
      reviewSubmission(harness.ctx, {
        submissionId: warned.submission_id,
        expectedVersion: detail.submission.record_version,
        decision: 'accepted',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('W4 — renewal', () => {
  it('expires a document as the clock advances without changing the review state', async () => {
    const vendorId = vendorIdFor('cedar-line-landscaping')
    let snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.readiness.status).toBe('ready')
    const insurance = snapshot.requirementStatuses.find(
      (status) => status.requirement.title === 'Insurance certificate',
    )
    expect(insurance?.effective?.state).toBe('accepted')

    harness.setToday('2026-10-01')
    snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.readiness.status).toBe('not_ready')
    const afterInsurance = snapshot.requirementStatuses.find(
      (status) => status.requirement.title === 'Insurance certificate',
    )
    expect(afterInsurance?.effective?.state).toBe('accepted')
    expect(afterInsurance?.currentDocument).toBe('expired')
  })

  it('supersedes the previous effective version when a renewal is accepted', async () => {
    const vendorId = vendorIdFor('cedar-line-landscaping')
    const requirementId = await requirementIdByTitle('cedar-line-landscaping', 'Insurance certificate')
    const before = await getVendorSnapshot(harness.admin(), vendorId)
    const originalEffectiveId = before.requirementStatuses.find(
      (status) => status.requirement.id === requirementId,
    )?.effective?.id

    harness.actAs('vendor_contact', vendorId)
    const renewal = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile('insurance-2027.pdf'),
      dates: { issue_date: '2026-09-30', expiration_date: '2027-09-30' },
    })

    // The existing accepted document still satisfies the requirement while pending.
    let snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    expect(snapshot.readiness.status).toBe('ready')

    harness.actAs('reviewer')
    const detail = await getReviewDetail(harness.ctx, renewal.submission_id)
    const result = await reviewSubmission(harness.ctx, {
      submissionId: renewal.submission_id,
      expectedVersion: detail.submission.record_version,
      decision: 'accepted',
    })
    expect(result.supersededSubmissionId).toBe(originalEffectiveId)

    snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    const status = snapshot.requirementStatuses.find((entry) => entry.requirement.id === requirementId)
    expect(status?.effective?.id).toBe(renewal.submission_id)
    expect(status?.currentExpiration).toBe('2027-09-30')
    expect(snapshot.readiness.expiringSoon).toBe(false)
    const old = snapshot.submissions.find((entry) => entry.id === originalEffectiveId)
    expect(old?.state).toBe('superseded')
    expect(old?.superseded_by_submission_id).toBe(renewal.submission_id)
  })

  it('leaves no fallback after revoking an acceptance', async () => {
    const vendorId = vendorIdFor('northgate-electric')
    const requirementId = await requirementIdByTitle('northgate-electric', 'Insurance certificate')
    const snapshot = await getVendorSnapshot(harness.admin(), vendorId)
    const effective = snapshot.requirementStatuses.find(
      (status) => status.requirement.id === requirementId,
    )?.effective
    expect(effective).toBeTruthy()

    await revokeAcceptance(harness.ctx, effective!.id, 'The certificate names a different legal entity.')
    const after = await getVendorSnapshot(harness.admin(), vendorId)
    const status = after.requirementStatuses.find((entry) => entry.requirement.id === requirementId)
    expect(status?.effective).toBeNull()
    expect(status?.satisfied).toBe(false)
    expect(after.readiness.status).toBe('not_ready')
    expect(after.readiness.blockers[0].reason).toBe('revoked')
  })
})

describe('W1 — add, invite and permissions', () => {
  it('creates a vendor with a checklist snapshot and no invitation', async () => {
    const result = await createVendor(harness.ctx, {
      company_name: 'Beacon Hill Glass',
      category: 'Window care',
      contact_name: 'Petra Ames',
      contact_email: 'petra.ames@example.com',
      property_tags: ['Riverfront Offices'],
      template_id: (await listTemplates(harness.ctx))[0].template.id,
    })
    const snapshot = await getVendorSnapshot(harness.admin(), result.vendor_id)
    expect(snapshot.vendor.invited_at).toBeNull()
    expect(snapshot.readiness.status).toBe('not_ready')
    expect(snapshot.requirements.length).toBeGreaterThan(0)

    const preview = await previewInvitation(harness.ctx, result.vendor_id)
    expect(preview.recipient).toBe('petra.ames@example.com')
    expect(preview.body).toContain('Set up your account')

    await inviteVendor(harness.ctx, testTokens, {
      vendorId: result.vendor_id,
      expectedContactEmail: 'petra.ames@example.com',
      linkBase: 'http://127.0.0.1:43217',
    })
    const invited = await getVendorSnapshot(harness.admin(), result.vendor_id)
    expect(invited.vendor.invited_at).not.toBeNull()
  })

  it('warns about duplicate company names until confirmed', async () => {
    await expect(
      createVendor(harness.ctx, {
        company_name: 'ironwood pest control',
        category: 'Pest control',
        contact_name: 'Someone Else',
        contact_email: 'someone.else@example.com',
        property_tags: [],
        template_id: null,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const confirmed = await createVendor(harness.ctx, {
      company_name: 'ironwood pest control',
      category: 'Pest control',
      contact_name: 'Someone Else',
      contact_email: 'someone.else@example.com',
      property_tags: [],
      template_id: null,
      confirmDuplicate: true,
    })
    expect(confirmed.vendor_id).toBeTruthy()
  })

  it('replays a repeated create request instead of writing twice', async () => {
    const input = {
      company_name: 'Quarry Ridge Paving',
      category: 'Other',
      contact_name: 'Lena Fox',
      contact_email: 'lena.fox@example.com',
      property_tags: [],
      template_id: null,
      requestKey: 'create-vendor-request-1',
    }
    const first = await createVendor(harness.ctx, input)
    const second = await createVendor(harness.ctx, input)
    expect(second.replayed).toBe(true)
    expect(second.vendor_id).toBe(first.vendor_id)
    const list = await listVendors(harness.ctx, { search: 'Quarry Ridge' })
    expect(list.total).toBe(1)
  })

  it('enforces the demo permission matrix', async () => {
    harness.actAs('coordinator')
    const queue = await listReviewQueue(harness.ctx)
    await expect(
      reviewSubmission(harness.ctx, {
        submissionId: queue.items[0].submission.id,
        expectedVersion: queue.items[0].submission.record_version,
        decision: 'accepted',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    harness.actAs('reviewer')
    await expect(
      createVendor(harness.ctx, {
        company_name: 'Reviewer Attempt',
        category: 'Other',
        contact_name: 'No One',
        contact_email: 'no.one@example.com',
        property_tags: [],
        template_id: null,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    harness.actAs('vendor_contact', vendorIdFor('ironwood-pest-control'))
    await expect(
      getVendorPortal(harness.ctx, vendorIdFor('bluewater-janitorial')),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('W5 — monitor, archive, import and export', () => {
  it('removes archived vendors from metrics, queue and reminders and restores them', async () => {
    const vendorId = vendorIdFor('lakeside-window-care')
    const before = await listVendors(harness.ctx, {})
    await archiveVendor(harness.ctx, vendorId, 'Vendor paused work for the season.')

    const after = await listVendors(harness.ctx, {})
    expect(after.total).toBe(before.total - 1)
    expect(after.counts.archived).toBe(3)
    const queue = await listReviewQueue(harness.ctx)
    expect(queue.items.some((item) => item.vendor.id === vendorId)).toBe(false)
    const reminder = await previewReminder(harness.ctx, vendorId)
    expect(reminder.canSend).toBe(false)
    expect(reminder.blockedReason).toContain('archived')

    harness.actAs('vendor_contact', vendorId)
    const requirementId = await requirementIdByTitle('lakeside-window-care', 'Safety acknowledgment')
    await expect(
      submitDocument(harness.ctx, {
        requirementId,
        file: samplePdfFile(),
        dates: { issue_date: '', expiration_date: '' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    harness.actAs('admin')
    await restoreVendor(harness.ctx, vendorId)
    const restored = await getVendorSnapshot(harness.admin(), vendorId)
    expect(restored.readiness.status).toBe('awaiting_review')
  })

  it('imports vendors atomically and idempotently without inviting them', async () => {
    const header = 'company_name,category,contact_name,contact_email,property_tags'
    const badCsv = `${header}\nGoodVendor,Cleaning,Ann Lee,ann.lee@example.com,\nBadVendor,Cleaning,,bad-email,\n`
    const before = await listVendors(harness.ctx, {})
    await expect(
      importVendors(harness.ctx, { text: badCsv, templateId: null, requestKey: 'import-1' }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect((await listVendors(harness.ctx, {})).total).toBe(before.total)

    const goodCsv = `${header}\nAlder Court Cleaning,Cleaning,Ann Lee,ann.lee@example.com,Riverfront Offices;Westfield Plaza\nBriar Path Snow,Snow removal,Ben Ito,ben.ito@example.com,\n`
    const preview = await previewImport(harness.ctx, goodCsv)
    expect(preview.issues).toHaveLength(0)
    expect(preview.candidates).toHaveLength(2)

    const templateId = (await listTemplates(harness.ctx))[0].template.id
    const first = await importVendors(harness.ctx, {
      text: goodCsv,
      templateId,
      requestKey: 'import-2',
    })
    expect(first.created).toBe(2)
    const repeat = await importVendors(harness.ctx, {
      text: goodCsv,
      templateId,
      requestKey: 'import-2',
    })
    expect(repeat.replayed).toBe(true)
    expect((await listVendors(harness.ctx, {})).total).toBe(before.total + 2)

    const imported = await getVendorSnapshot(harness.admin(), first.vendorIds[0])
    expect(imported.vendor.invited_at).toBeNull()
    expect(imported.requirements.length).toBeGreaterThan(0)
  })

  it('exports every filtered row with neutralized formulas and no file bytes', async () => {
    await createVendor(harness.ctx, {
      company_name: '=cmd|calc',
      category: 'Other',
      contact_name: 'Formula Test',
      contact_email: 'formula.test@example.com',
      property_tags: [],
      template_id: null,
    })
    const all = await exportVendorStatus(harness.ctx, {})
    expect(all.csv).toContain("'=cmd|calc")
    expect(all.csv).not.toContain('%PDF')
    expect(all.csv).not.toContain('blob/')
    expect(all.rowCount).toBe(11)

    const notReady = await exportVendorStatus(harness.ctx, { readiness: ['not_ready'] })
    expect(notReady.rowCount).toBe(3)
    expect(notReady.csv).toContain('Insurance certificate expired')
  })

  it('applies filters with AND and searches name and email case-insensitively', async () => {
    const byEmail = await listVendors(harness.ctx, { search: 'DAMON.FRAZIER@EXAMPLE.COM' })
    expect(byEmail.rows).toHaveLength(1)
    expect(byEmail.rows[0].vendor.company_name).toBe('Ironwood Pest Control')

    const combined = await listVendors(harness.ctx, {
      readiness: ['ready'],
      property: 'Westfield Plaza',
    })
    expect(combined.rows.map((row) => row.vendor.company_name)).toEqual([
      'Cedar Line Landscaping',
      'Northgate Electric',
    ])

    const expiring = await listVendors(harness.ctx, { expiringSoonOnly: true })
    expect(expiring.total).toBe(2)

    const empty = await listVendors(harness.ctx, { search: 'no such vendor' })
    expect(empty.filteredEmpty).toBe(true)
  })
})

describe('reminders', () => {
  it('previews actionable items, then enforces cooldown and daily deduplication', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const preview = await previewReminder(harness.ctx, vendorId)
    expect(preview.canSend).toBe(true)
    expect(preview.lines.map((line) => line.requirement_title)).toEqual(['Safety acknowledgment'])

    const sent = await sendReminder(harness.ctx, vendorId)
    expect(sent.status).toBe('queued')
    await expect(sendReminder(harness.ctx, vendorId)).rejects.toMatchObject({ code: 'rate_limited' })

    // The manual reminder consumed today's digest slot.
    const job = await runDailyReminderJob(harness.ctx)
    expect(job.skippedDuplicates).toBeGreaterThan(0)
    expect(job.details.some((detail) => detail.company_name === 'Ironwood Pest Control' && detail.outcome.startsWith('Skipped'))).toBe(true)
  })

  it('refuses to remind about items that are only awaiting review', async () => {
    const preview = await previewReminder(harness.ctx, vendorIdFor('lakeside-window-care'))
    expect(preview.canSend).toBe(false)
    expect(preview.blockedReason).toContain('awaiting review')
  })

  it('notifies the coordinator about expirations even when a replacement is pending', async () => {
    const job = await runDailyReminderJob(harness.ctx)
    expect(job.internalNoticesCreated).toBeGreaterThan(0)
    const outbox = await listOutbox(harness.ctx, { type: 'internal_expiration_notice' })
    expect(outbox.entries[0].notification.recipient).toContain('@example.com')
    expect(outbox.entries[0].notification.status).toBe('queued')
  })

  it('never sends the same digest twice on one local date', async () => {
    const first = await runDailyReminderJob(harness.ctx)
    const second = await runDailyReminderJob(harness.ctx)
    expect(first.digestsCreated).toBeGreaterThan(0)
    expect(second.digestsCreated).toBe(0)
  })
})

describe('templates and history', () => {
  it('leaves existing vendor assignments unchanged when a template is edited', async () => {
    const templates = await listTemplates(harness.ctx)
    const standard = templates.find((entry) => entry.template.name === 'Standard service vendor')!
    const before = await getVendorSnapshot(harness.admin(), vendorIdFor('bluewater-janitorial'))

    await updateTemplate(harness.ctx, standard.template.id, {
      name: 'Standard service vendor',
      description: standard.template.description,
      items: [
        ...standard.items.map((item) => ({
          id: item.id,
          title: item.title,
          instructions: item.instructions,
          required: item.required,
          expiration_required: item.expiration_required,
          collect_issue_date: item.collect_issue_date,
        })),
        {
          title: 'Background check attestation',
          instructions: 'Upload the signed attestation for crew members entering occupied space.',
          required: true,
          expiration_required: false,
          collect_issue_date: false,
        },
      ],
    })

    const after = await getVendorSnapshot(harness.admin(), vendorIdFor('bluewater-janitorial'))
    expect(after.requirements).toHaveLength(before.requirements.length)
    expect(after.readiness.status).toBe(before.readiness.status)
    const updatedTemplate = (await listTemplates(harness.ctx)).find(
      (entry) => entry.template.id === standard.template.id,
    )!
    expect(updatedTemplate.template.version).toBe(2)
    expect(updatedTemplate.items).toHaveLength(standard.items.length + 1)
  })

  it('records an append-only activity trail for every mutation', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const requirementId = await requirementIdByTitle('ironwood-pest-control', 'Safety acknowledgment')
    harness.actAs('coordinator')
    await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile(),
      dates: { issue_date: '', expiration_date: '' },
    })
    const activity = await listActivity(harness.ctx, { vendorId })
    expect(activity.events[0].event_type).toBe('document_submitted_on_behalf')
    expect(activity.events[0].summary).toContain('on behalf of')
    expect(activity.events.some((event) => event.event_type === 'vendor_created')).toBe(true)
  })

  it('shows a vendor only its own portal events', async () => {
    const vendorId = vendorIdFor('harborview-plumbing')
    harness.actAs('vendor_contact', vendorId)
    const activity = await listActivity(harness.ctx, {})
    expect(activity.events.every((event) => event.vendor_id === vendorId)).toBe(true)
    expect(activity.events.every((event) => event.vendor_visible)).toBe(true)
  })
})

describe('typed errors', () => {
  it('uses documented error codes', async () => {
    try {
      await getVendorSnapshot(harness.admin(), 'missing-vendor-id')
      throw new Error('expected failure')
    } catch (error) {
      expect(isAppError(error)).toBe(true)
      if (isAppError(error)) expect(error.code).toBe('not_found')
    }
  })
})
