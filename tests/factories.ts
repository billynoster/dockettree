import type { AssignedRequirement, Submission, SubmissionState } from '@/domain/types'

let counter = 0
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`

export function makeRequirement(overrides: Partial<AssignedRequirement> = {}): AssignedRequirement {
  const id = overrides.id ?? nextId('req')
  return {
    id,
    organization_id: 'org-1',
    vendor_id: 'vendor-1',
    source_template_id: 'template-1',
    source_template_version: 1,
    source_item_id: 'item-1',
    title: 'Insurance certificate',
    instructions: 'Upload the certificate.',
    required: true,
    expiration_required: true,
    collect_issue_date: false,
    sort_order: 0,
    due_date: null,
    retired_at: null,
    retired_reason: null,
    effective_submission_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    record_version: 1,
    ...overrides,
  }
}

export function makeSubmission(
  requirement: AssignedRequirement,
  state: SubmissionState,
  overrides: Partial<Submission> = {},
): Submission {
  return {
    id: overrides.id ?? nextId('sub'),
    organization_id: requirement.organization_id,
    vendor_id: requirement.vendor_id,
    requirement_id: requirement.id,
    version_number: overrides.version_number ?? 1,
    state,
    file_object_id: nextId('file'),
    issue_date: null,
    expiration_date: null,
    submitted_by: 'user-1',
    submitted_by_label: 'Vendor contact',
    submitted_on_behalf: false,
    submitted_at: '2026-09-01T12:00:00.000Z',
    decided_at: null,
    withdrawn_at: null,
    superseded_by_submission_id: null,
    record_version: 1,
    ...overrides,
  }
}
