/**
 * Optional sample dataset (requirements section 10). Loaded only by `npm run db:seed`, never
 * automatically: a fresh install starts empty and is configured through /setup.
 *
 * Organization "Cedar Grove Property Operations", 12 fictional vendors:
 * 4 Ready (2 of them Expiring soon), 3 Not ready, 2 Awaiting review, 1 Unconfigured,
 * 2 Archived. All documents are generated sample files stamped SAMPLE. Fixed sample dates
 * are shifted on seed so the documented distribution holds on any calendar day.
 */
import { addDays, daysBetween, todayInTimeZone } from '@/domain/dates'
import { stableId } from '@/domain/ids'
import { digestIdempotencyKey, invitationIdempotencyKey } from '@/domain/reminders'
import type {
  ActivityEvent,
  AssignedRequirement,
  FileObject,
  Invitation,
  IsoDate,
  IsoDateTime,
  Membership,
  Notification,
  Organization,
  Property,
  RequirementTemplate,
  ReviewEvent,
  Submission,
  SubmissionState,
  TemplateItem,
  User,
  UUID,
  Vendor,
  VendorMembership,
  VendorProperty,
} from '@/domain/types'
import type { Database } from '@/repositories/types'
import { createSamplePdf, createSamplePng } from './sampleFiles'

/** Every fixed date in this file is written relative to this day. */
const SEED_ANCHOR_DATE: IsoDate = '2026-09-17'

export interface SeedOptions {
  /** Hashes the shared sample password for every seeded account. */
  hashPassword(password: string): Promise<string>
  /** SHA-256 used for the already-redeemed sample invitation tokens. */
  hashToken(value: string): string
  staffPassword: string
  vendorPassword: string
}

export const ORGANIZATION_ID = stableId('org:cedar-grove')
export const DEFAULT_TIMEZONE = 'America/Chicago'
export const PROPERTIES = ['Riverfront Offices', 'Maple Business Park', 'Westfield Plaza']

export const ADMIN_USER_ID = stableId('user:dana')
export const COORDINATOR_USER_ID = stableId('user:marcus')
export const REVIEWER_USER_ID = stableId('user:priya')

export const STANDARD_TEMPLATE_ID = stableId('template:standard-service-vendor')
export const GROUNDS_TEMPLATE_ID = stableId('template:grounds-exterior-vendor')

type RequirementKey = 'insurance' | 'agreement' | 'safety' | 'brochure'

interface RequirementDefinition {
  key: RequirementKey
  title: string
  instructions: string
  required: boolean
  expiration_required: boolean
  collect_issue_date: boolean
}

/** "Standard service vendor" template items, in checklist order. */
const STANDARD_ITEMS: RequirementDefinition[] = [
  {
    key: 'insurance',
    title: 'Insurance certificate',
    instructions:
      'Upload the certificate of insurance your agent provides, as a single PDF or clear photo. Enter the policy issue date and the expiration date shown on the certificate. Cedar Grove records the document you send; we do not analyze or verify coverage.',
    required: true,
    expiration_required: true,
    collect_issue_date: true,
  },
  {
    key: 'agreement',
    title: 'Service agreement',
    instructions:
      'Upload the signed Cedar Grove service agreement, including all pages, as one PDF. No dates are required for this item.',
    required: true,
    expiration_required: false,
    collect_issue_date: false,
  },
  {
    key: 'safety',
    title: 'Safety acknowledgment',
    instructions:
      'Upload the signed site safety acknowledgment for the crew lead who will be on site. A scanned page or clear photo is fine.',
    required: true,
    expiration_required: false,
    collect_issue_date: false,
  },
  {
    key: 'brochure',
    title: 'Company brochure',
    instructions:
      'Optional. Upload a brochure or capability sheet so our coordinators know what services you offer.',
    required: false,
    expiration_required: false,
    collect_issue_date: false,
  },
]

const GROUNDS_ITEMS: RequirementDefinition[] = [
  STANDARD_ITEMS[0],
  STANDARD_ITEMS[1],
  STANDARD_ITEMS[3],
]

interface SubmissionSpec {
  state: SubmissionState
  /** Days before the seed date the vendor submitted this version. */
  submittedDaysAgo: number
  issue?: IsoDate
  expiration?: IsoDate
  /** True for the version the requirement's effective pointer references. */
  effective?: boolean
  /** Review reason, required for changes_requested and revoked. */
  reason?: string
  /** Days before the seed date the decision was recorded. */
  decidedDaysAgo?: number
  onBehalf?: boolean
}

interface RequirementSpec {
  key: RequirementKey
  submissions: SubmissionSpec[]
}

interface VendorSpec {
  slug: string
  company_name: string
  category: string
  contact_name: string
  contact_email: string
  property_tags: string[]
  invitedDaysAgo: number | null
  archivedDaysAgo?: number
  archiveReason?: string
  /** Null means no checklist assigned at all (Unconfigured). */
  template: 'standard' | 'grounds' | null
  requirements: RequirementSpec[]
  createdDaysAgo: number
  /** Documented expectation, asserted by tests. */
  expected: 'ready' | 'not_ready' | 'awaiting_review' | 'unconfigured' | 'archived'
  expectedExpiringSoon?: boolean
}

const VENDOR_SPECS: VendorSpec[] = [
  {
    slug: 'riverstone-mechanical',
    company_name: 'Riverstone Mechanical Services',
    category: 'HVAC / Mechanical',
    contact_name: 'Alan Prewitt',
    contact_email: 'alan.prewitt@example.com',
    property_tags: ['Riverfront Offices'],
    invitedDaysAgo: 120,
    createdDaysAgo: 124,
    template: 'standard',
    expected: 'ready',
    expectedExpiringSoon: true,
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 118,
            issue: '2025-10-05',
            expiration: '2026-10-05',
            effective: true,
            decidedDaysAgo: 117,
          },
          {
            state: 'pending_review',
            submittedDaysAgo: 2,
            issue: '2026-10-05',
            expiration: '2027-10-05',
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 117, effective: true, decidedDaysAgo: 116 }] },
      { key: 'safety', submissions: [{ state: 'accepted', submittedDaysAgo: 116, effective: true, decidedDaysAgo: 115 }] },
      { key: 'brochure', submissions: [{ state: 'accepted', submittedDaysAgo: 110, effective: true, decidedDaysAgo: 109 }] },
    ],
  },
  {
    slug: 'cedar-line-landscaping',
    company_name: 'Cedar Line Landscaping',
    category: 'Landscaping',
    contact_name: 'Rosa Delgado',
    contact_email: 'rosa.delgado@example.com',
    property_tags: ['Maple Business Park', 'Westfield Plaza'],
    invitedDaysAgo: 200,
    createdDaysAgo: 205,
    template: 'grounds',
    expected: 'ready',
    expectedExpiringSoon: true,
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 198,
            issue: '2025-09-30',
            expiration: '2026-09-30',
            effective: true,
            decidedDaysAgo: 197,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 197, effective: true, decidedDaysAgo: 196 }] },
    ],
  },
  {
    slug: 'bluewater-janitorial',
    company_name: 'Bluewater Janitorial',
    category: 'Cleaning',
    contact_name: 'Terrence Boyd',
    contact_email: 'terrence.boyd@example.com',
    property_tags: ['Riverfront Offices'],
    invitedDaysAgo: 300,
    createdDaysAgo: 305,
    template: 'standard',
    expected: 'ready',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 298,
            issue: '2026-03-01',
            expiration: '2027-03-01',
            effective: true,
            decidedDaysAgo: 297,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 297, effective: true, decidedDaysAgo: 296 }] },
      { key: 'safety', submissions: [{ state: 'accepted', submittedDaysAgo: 296, effective: true, decidedDaysAgo: 295 }] },
    ],
  },
  {
    slug: 'northgate-electric',
    company_name: 'Northgate Electric',
    category: 'Electrical',
    contact_name: 'Yolanda Pierce',
    contact_email: 'yolanda.pierce@example.com',
    property_tags: ['Westfield Plaza'],
    invitedDaysAgo: 250,
    createdDaysAgo: 255,
    template: 'standard',
    expected: 'ready',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'superseded',
            submittedDaysAgo: 248,
            issue: '2025-06-30',
            expiration: '2026-06-30',
            decidedDaysAgo: 247,
          },
          {
            state: 'accepted',
            submittedDaysAgo: 96,
            issue: '2026-06-30',
            expiration: '2027-06-30',
            effective: true,
            decidedDaysAgo: 95,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 247, effective: true, decidedDaysAgo: 246 }] },
      { key: 'safety', submissions: [{ state: 'accepted', submittedDaysAgo: 246, effective: true, decidedDaysAgo: 245 }] },
      { key: 'brochure', submissions: [{ state: 'accepted', submittedDaysAgo: 240, effective: true, decidedDaysAgo: 239 }] },
    ],
  },
  {
    slug: 'summit-fire-protection',
    company_name: 'Summit Fire Protection',
    category: 'Fire safety',
    contact_name: 'Gregory Nash',
    contact_email: 'gregory.nash@example.com',
    property_tags: ['Maple Business Park'],
    invitedDaysAgo: 160,
    createdDaysAgo: 165,
    template: 'standard',
    expected: 'not_ready',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 158,
            issue: '2025-09-10',
            expiration: '2026-09-10',
            effective: true,
            decidedDaysAgo: 157,
          },
          {
            state: 'pending_review',
            submittedDaysAgo: 3,
            issue: '2026-09-11',
            expiration: '2027-09-11',
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 157, effective: true, decidedDaysAgo: 156 }] },
      { key: 'safety', submissions: [{ state: 'accepted', submittedDaysAgo: 156, effective: true, decidedDaysAgo: 155 }] },
    ],
  },
  {
    slug: 'harborview-plumbing',
    company_name: 'Harborview Plumbing',
    category: 'Plumbing',
    contact_name: 'Ivy Chan',
    contact_email: 'ivy.chan@example.com',
    property_tags: ['Riverfront Offices', 'Maple Business Park'],
    invitedDaysAgo: 90,
    createdDaysAgo: 95,
    template: 'standard',
    expected: 'not_ready',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 88,
            issue: '2026-01-31',
            expiration: '2027-01-31',
            effective: true,
            decidedDaysAgo: 87,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 87, effective: true, decidedDaysAgo: 86 }] },
      {
        key: 'safety',
        submissions: [
          {
            state: 'changes_requested',
            submittedDaysAgo: 7,
            decidedDaysAgo: 6,
            reason:
              'The acknowledgment is missing the signature date on page 2. Please add the date and upload the signed page again.',
          },
        ],
      },
    ],
  },
  {
    slug: 'ironwood-pest-control',
    company_name: 'Ironwood Pest Control',
    category: 'Pest control',
    contact_name: 'Damon Frazier',
    contact_email: 'damon.frazier@example.com',
    property_tags: ['Westfield Plaza'],
    invitedDaysAgo: 45,
    createdDaysAgo: 48,
    template: 'standard',
    expected: 'not_ready',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 43,
            issue: '2026-04-15',
            expiration: '2027-04-15',
            effective: true,
            decidedDaysAgo: 42,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 42, effective: true, decidedDaysAgo: 41 }] },
      // Safety acknowledgment intentionally missing: this is the "missing required item" case.
      { key: 'safety', submissions: [] },
    ],
  },
  {
    slug: 'lakeside-window-care',
    company_name: 'Lakeside Window Care',
    category: 'Window care',
    contact_name: 'Nina Kovach',
    contact_email: 'nina.kovach@example.com',
    property_tags: ['Westfield Plaza'],
    invitedDaysAgo: 12,
    createdDaysAgo: 14,
    template: 'standard',
    expected: 'awaiting_review',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          { state: 'pending_review', submittedDaysAgo: 5, issue: '2026-08-01', expiration: '2027-08-01' },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'pending_review', submittedDaysAgo: 5 }] },
      { key: 'safety', submissions: [{ state: 'pending_review', submittedDaysAgo: 4 }] },
    ],
  },
  {
    slug: 'granite-peak-roofing',
    company_name: 'Granite Peak Roofing',
    category: 'Roofing',
    contact_name: 'Owen Sandoval',
    contact_email: 'owen.sandoval@example.com',
    property_tags: ['Maple Business Park'],
    invitedDaysAgo: 30,
    createdDaysAgo: 33,
    template: 'standard',
    expected: 'awaiting_review',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 28,
            issue: '2026-01-15',
            expiration: '2027-01-15',
            effective: true,
            decidedDaysAgo: 27,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'pending_review', submittedDaysAgo: 8 }] },
      { key: 'safety', submissions: [{ state: 'pending_review', submittedDaysAgo: 8, onBehalf: true }] },
    ],
  },
  {
    slug: 'willow-creek-signage',
    company_name: 'Willow Creek Signage',
    category: 'Signage',
    contact_name: 'Beatriz Ortiz',
    contact_email: 'beatriz.ortiz@example.com',
    property_tags: ['Riverfront Offices'],
    invitedDaysAgo: null,
    createdDaysAgo: 2,
    template: null,
    expected: 'unconfigured',
    requirements: [],
  },
  {
    slug: 'copperfield-locksmiths',
    company_name: 'Copperfield Locksmiths',
    category: 'Locksmith',
    contact_name: 'Hugh Bannister',
    contact_email: 'hugh.bannister@example.com',
    property_tags: ['Westfield Plaza'],
    invitedDaysAgo: 400,
    createdDaysAgo: 405,
    archivedDaysAgo: 40,
    archiveReason: 'Contract ended. Copperfield no longer services Cedar Grove properties.',
    template: 'standard',
    expected: 'archived',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          {
            state: 'accepted',
            submittedDaysAgo: 398,
            issue: '2025-12-01',
            expiration: '2026-12-01',
            effective: true,
            decidedDaysAgo: 397,
          },
        ],
      },
      { key: 'agreement', submissions: [{ state: 'accepted', submittedDaysAgo: 397, effective: true, decidedDaysAgo: 396 }] },
      { key: 'safety', submissions: [{ state: 'accepted', submittedDaysAgo: 396, effective: true, decidedDaysAgo: 395 }] },
    ],
  },
  {
    slug: 'meadowbrook-courier',
    company_name: 'Meadowbrook Courier',
    category: 'Other',
    contact_name: 'Sofia Mendel',
    contact_email: 'sofia.mendel@example.com',
    property_tags: ['Maple Business Park'],
    invitedDaysAgo: 60,
    createdDaysAgo: 62,
    archivedDaysAgo: 20,
    archiveReason: 'Duplicate record created during onboarding. Active record is Meadowbrook Logistics.',
    template: 'standard',
    expected: 'archived',
    requirements: [
      {
        key: 'insurance',
        submissions: [
          { state: 'pending_review', submittedDaysAgo: 25, issue: '2026-08-20', expiration: '2027-08-20' },
        ],
      },
      { key: 'agreement', submissions: [] },
      { key: 'safety', submissions: [] },
    ],
  },
]

/** Documented seed expectations, asserted by the domain tests. */
export const SEED_EXPECTATIONS = {
  total: VENDOR_SPECS.length,
  active: VENDOR_SPECS.filter((spec) => spec.expected !== 'archived').length,
  ready: VENDOR_SPECS.filter((spec) => spec.expected === 'ready').length,
  not_ready: VENDOR_SPECS.filter((spec) => spec.expected === 'not_ready').length,
  awaiting_review: VENDOR_SPECS.filter((spec) => spec.expected === 'awaiting_review').length,
  unconfigured: VENDOR_SPECS.filter((spec) => spec.expected === 'unconfigured').length,
  archived: VENDOR_SPECS.filter((spec) => spec.expected === 'archived').length,
  expiring_soon: VENDOR_SPECS.filter((spec) => spec.expectedExpiringSoon).length,
  byVendor: VENDOR_SPECS.map((spec) => ({
    slug: spec.slug,
    company_name: spec.company_name,
    expected: spec.expected,
    expectedExpiringSoon: spec.expectedExpiringSoon ?? false,
  })),
}

export function vendorIdFor(slug: string): UUID {
  return stableId(`vendor:${slug}`)
}

function requirementIdFor(slug: string, key: RequirementKey): UUID {
  return stableId(`requirement:${slug}:${key}`)
}

function fileContentFor(
  definition: RequirementDefinition,
  vendor: VendorSpec,
  spec: SubmissionSpec,
  version: number,
): { filename: string; lines: string[]; title: string; preferImage: boolean } {
  const base = {
    insurance: {
      title: 'Certificate of insurance',
      filename: `insurance-certificate-v${version}.pdf`,
      lines: [
        `Vendor: ${vendor.company_name}`,
        `Contact: ${vendor.contact_name}`,
        `Policy reference: SAMPLE-${vendor.slug.slice(0, 6).toUpperCase()}-${version}`,
        `Issue date: ${spec.issue ?? 'not provided'}`,
        `Expiration date: ${spec.expiration ?? 'not provided'}`,
        '',
        'Cedar Grove records the document as submitted.',
        'No coverage analysis or verification is performed.',
      ],
      preferImage: false,
    },
    agreement: {
      title: 'Cedar Grove service agreement',
      filename: `service-agreement-v${version}.pdf`,
      lines: [
        `Vendor: ${vendor.company_name}`,
        `Signed by: ${vendor.contact_name}`,
        `Service category: ${vendor.category}`,
        'Term: 12 months, renewable',
        '',
        'Synthetic document, sample dataset.',
      ],
      preferImage: false,
    },
    safety: {
      title: 'Site safety acknowledgment',
      filename: `safety-acknowledgment-v${version}.png`,
      lines: [
        `Vendor: ${vendor.company_name}`,
        `Crew lead: ${vendor.contact_name}`,
        'Acknowledges Cedar Grove site safety rules',
        'Scanned page, synthetic sample',
      ],
      preferImage: true,
    },
    brochure: {
      title: 'Company brochure',
      filename: `company-brochure-v${version}.pdf`,
      lines: [
        `${vendor.company_name}`,
        `Services: ${vendor.category}`,
        'Coverage area: Cedar Grove managed properties',
        '',
        'Synthetic marketing sample, no real company.',
      ],
      preferImage: false,
    },
  }
  return base[definition.key]
}

interface SeedRecords {
  organization: Organization
  users: User[]
  memberships: Membership[]
  vendors: Vendor[]
  properties: Property[]
  vendorProperties: VendorProperty[]
  vendorMemberships: VendorMembership[]
  templates: RequirementTemplate[]
  templateItems: TemplateItem[]
  requirements: AssignedRequirement[]
  submissions: Submission[]
  files: FileObject[]
  blobs: { key: string; blob: Blob }[]
  reviewEvents: ReviewEvent[]
  invitations: Invitation[]
  notifications: Notification[]
  activity: ActivityEvent[]
}

/** Build every seeded record. Async because sample documents are generated as real bytes. */
export async function buildSeedRecords(now: Date, options: SeedOptions): Promise<SeedRecords> {
  const at = (daysAgo: number): IsoDateTime =>
    new Date(now.getTime() - daysAgo * 86_400_000).toISOString()
  const shiftDays = daysBetween(SEED_ANCHOR_DATE, todayInTimeZone(now, DEFAULT_TIMEZONE))
  const onDate = (value: IsoDate | null | undefined): IsoDate | null =>
    value ? addDays(value, shiftDays) : null
  const staffHash = await options.hashPassword(options.staffPassword)
  const vendorHash = await options.hashPassword(options.vendorPassword)

  const organization: Organization = {
    id: ORGANIZATION_ID,
    name: 'Cedar Grove Property Operations',
    timezone: DEFAULT_TIMEZONE,
    support_email: 'vendor.operations@example.com',
    support_contact_name: 'Cedar Grove vendor operations',
    created_at: at(420),
    updated_at: at(420),
    record_version: 1,
  }

  const account = (id: UUID, display_name: string, email: string, passwordHash: string): User => ({
    id,
    display_name,
    email,
    auth_subject: null,
    password_hash: passwordHash,
    password_updated_at: at(420),
    status: 'active',
    last_login_at: null,
    created_at: at(420),
  })

  const users: User[] = [
    account(ADMIN_USER_ID, 'Dana Whitfield', 'dana.whitfield@example.com', staffHash),
    account(COORDINATOR_USER_ID, 'Marcus Reyes', 'marcus.reyes@example.com', staffHash),
    account(REVIEWER_USER_ID, 'Priya Raman', 'priya.raman@example.com', staffHash),
  ]
  const memberships: Membership[] = [
    { id: stableId('membership:dana'), organization_id: ORGANIZATION_ID, user_id: ADMIN_USER_ID, role: 'admin' },
    { id: stableId('membership:marcus'), organization_id: ORGANIZATION_ID, user_id: COORDINATOR_USER_ID, role: 'coordinator' },
    { id: stableId('membership:priya'), organization_id: ORGANIZATION_ID, user_id: REVIEWER_USER_ID, role: 'reviewer' },
  ]

  const templates: RequirementTemplate[] = [
    {
      id: STANDARD_TEMPLATE_ID,
      organization_id: ORGANIZATION_ID,
      name: 'Standard service vendor',
      description:
        'Sample business requirements for vendors working inside Cedar Grove buildings. These are Cedar Grove document requests, not legally mandated requirements.',
      version: 1,
      archived_at: null,
      created_at: at(410),
      updated_at: at(410),
      record_version: 1,
    },
    {
      id: GROUNDS_TEMPLATE_ID,
      organization_id: ORGANIZATION_ID,
      name: 'Grounds and exterior vendor',
      description:
        'Lighter checklist for vendors who work outside occupied space: insurance certificate, signed agreement and an optional brochure.',
      version: 1,
      archived_at: null,
      created_at: at(408),
      updated_at: at(408),
      record_version: 1,
    },
  ]

  const templateItems: TemplateItem[] = [
    ...STANDARD_ITEMS.map((item, index) => ({
      id: stableId(`template-item:standard:${item.key}`),
      template_id: STANDARD_TEMPLATE_ID,
      title: item.title,
      instructions: item.instructions,
      required: item.required,
      expiration_required: item.expiration_required,
      collect_issue_date: item.collect_issue_date,
      sort_order: index,
    })),
    ...GROUNDS_ITEMS.map((item, index) => ({
      id: stableId(`template-item:grounds:${item.key}`),
      template_id: GROUNDS_TEMPLATE_ID,
      title: item.title,
      instructions: item.instructions,
      required: item.required,
      expiration_required: item.expiration_required,
      collect_issue_date: item.collect_issue_date,
      sort_order: index,
    })),
  ]

  const propertyMeta: Record<string, { address: string; notes: string }> = {
    'Riverfront Offices': {
      address: '1200 Riverfront Ave, Cedar Grove, IL',
      notes: 'Class-A office tower with lobby vendor access.',
    },
    'Maple Business Park': {
      address: '88 Maple Park Dr, Cedar Grove, IL',
      notes: 'Multi-building campus; grounds vendors common.',
    },
    'Westfield Plaza': {
      address: '450 Westfield Blvd, Cedar Grove, IL',
      notes: 'Retail plaza with frequent after-hours service work.',
    },
  }

  const properties: Property[] = PROPERTIES.map((name) => ({
    id: stableId(`property:${name}`),
    organization_id: ORGANIZATION_ID,
    name,
    address: propertyMeta[name]?.address ?? '',
    notes: propertyMeta[name]?.notes ?? '',
    lifecycle: 'active',
    archived_at: null,
    archive_reason: null,
    created_at: at(415),
    updated_at: at(415),
    record_version: 1,
  }))
  const propertyIdByName = new Map(properties.map((property) => [property.name, property.id]))

  const records: SeedRecords = {
    organization,
    users,
    memberships,
    vendors: [],
    properties,
    vendorProperties: [],
    vendorMemberships: [],
    templates,
    templateItems,
    requirements: [],
    submissions: [],
    files: [],
    blobs: [],
    reviewEvents: [],
    invitations: [],
    notifications: [],
    activity: [],
  }

  const pushActivity = (event: Omit<ActivityEvent, 'id' | 'organization_id'> & { id?: UUID }) => {
    records.activity.push({
      id: event.id ?? stableId(`activity:${event.event_type}:${event.vendor_id}:${event.created_at}:${event.target_id ?? ''}`),
      organization_id: ORGANIZATION_ID,
      ...event,
    })
  }

  for (const property of properties) {
    pushActivity({
      vendor_id: null,
      actor_id: ADMIN_USER_ID,
      actor_label: 'Dana Whitfield',
      actor_role: 'admin',
      event_type: 'property_created',
      target_id: property.id,
      summary: `Added property "${property.name}"`,
      reason: null,
      metadata: { address: property.address },
      vendor_visible: false,
      created_at: property.created_at,
    })
  }

  for (const spec of VENDOR_SPECS) {
    const vendorId = vendorIdFor(spec.slug)
    const contactUserId = stableId(`user:${spec.slug}-contact`)
    const archivedAt = spec.archivedDaysAgo != null ? at(spec.archivedDaysAgo) : null

    records.users.push({
      ...account(contactUserId, spec.contact_name, spec.contact_email, vendorHash),
      created_at: at(spec.createdDaysAgo),
      password_updated_at: at(spec.invitedDaysAgo ?? spec.createdDaysAgo),
    })
    records.vendorMemberships.push({
      id: stableId(`vendor-membership:${spec.slug}`),
      organization_id: ORGANIZATION_ID,
      vendor_id: vendorId,
      user_id: contactUserId,
      verified_at: spec.invitedDaysAgo != null ? at(spec.invitedDaysAgo) : null,
    })

    const definitions =
      spec.template === 'standard' ? STANDARD_ITEMS : spec.template === 'grounds' ? GROUNDS_ITEMS : []
    const templateId =
      spec.template === 'standard' ? STANDARD_TEMPLATE_ID : spec.template === 'grounds' ? GROUNDS_TEMPLATE_ID : null

    const vendor: Vendor = {
      id: vendorId,
      organization_id: ORGANIZATION_ID,
      company_name: spec.company_name,
      category: spec.category,
      contact_name: spec.contact_name,
      contact_email: spec.contact_email,
      lifecycle: archivedAt ? 'archived' : 'active',
      invited_at: spec.invitedDaysAgo != null ? at(spec.invitedDaysAgo) : null,
      property_tags: spec.property_tags,
      archived_at: archivedAt,
      archive_reason: spec.archiveReason ?? null,
      created_at: at(spec.createdDaysAgo),
      updated_at: at(Math.min(...[spec.createdDaysAgo, ...(spec.archivedDaysAgo != null ? [spec.archivedDaysAgo] : [])])),
      record_version: 1,
    }
    records.vendors.push(vendor)
    for (const tag of spec.property_tags) {
      const propertyId = propertyIdByName.get(tag)
      if (!propertyId) continue
      records.vendorProperties.push({
        id: stableId(`vendor-property:${spec.slug}:${tag}`),
        organization_id: ORGANIZATION_ID,
        vendor_id: vendorId,
        property_id: propertyId,
        created_at: vendor.created_at,
      })
    }

    pushActivity({
      vendor_id: vendorId,
      actor_id: COORDINATOR_USER_ID,
      actor_label: 'Marcus Reyes',
      actor_role: 'coordinator',
      event_type: 'vendor_created',
      target_id: vendorId,
      summary: `Added vendor ${spec.company_name}`,
      reason: null,
      metadata: { category: spec.category },
      vendor_visible: false,
      created_at: vendor.created_at,
    })

    if (templateId) {
      pushActivity({
        vendor_id: vendorId,
        actor_id: COORDINATOR_USER_ID,
        actor_label: 'Marcus Reyes',
        actor_role: 'coordinator',
        event_type: 'checklist_assigned',
        target_id: templateId,
        summary: `Assigned checklist "${templates.find((t) => t.id === templateId)?.name}" (${definitions.length} items)`,
        reason: null,
        metadata: { template_version: 1, item_count: definitions.length },
        vendor_visible: true,
        created_at: vendor.created_at,
      })
    }

    if (spec.invitedDaysAgo != null) {
      const invitationId = stableId(`invitation:${spec.slug}`)
      const invitedAt = at(spec.invitedDaysAgo)
      records.invitations.push({
        id: invitationId,
        organization_id: ORGANIZATION_ID,
        vendor_id: vendorId,
        invited_email: spec.contact_email,
        token_hash: options.hashToken(`sample-invitation:${vendorId}:${invitedAt}`),
        expires_at: at(spec.invitedDaysAgo - 7),
        redeemed_at: at(spec.invitedDaysAgo - 1),
        redeemed_by_user_id: contactUserId,
        revoked_at: null,
        created_by: COORDINATOR_USER_ID,
        created_at: invitedAt,
      })
      records.notifications.push({
        id: stableId(`notification:invitation:${spec.slug}`),
        organization_id: ORGANIZATION_ID,
        vendor_id: vendorId,
        type: 'invitation',
        recipient: spec.contact_email,
        recipient_label: spec.contact_name,
        subject: `Cedar Grove Property Operations needs documents from ${spec.company_name}`,
        body: [
          `Hello ${spec.contact_name},`,
          '',
          `Cedar Grove Property Operations has requested vendor documents from ${spec.company_name}.`,
          'Sign in to your vendor portal to see the checklist and upload each document.',
        ].join('\n'),
        items: definitions
          .filter((definition) => definition.required)
          .map((definition) => ({
            requirement_id: requirementIdFor(spec.slug, definition.key),
            requirement_title: definition.title,
            milestone_key: 'invitation',
            detail: 'Requested with the invitation.',
            submission_version: null,
          })),
        status: 'sent',
        idempotency_key: invitationIdempotencyKey(ORGANIZATION_ID, invitationId),
        attempt_count: 1,
        next_attempt_at: null,
        sent_at: invitedAt,
        last_error: null,
        manual: true,
        created_at: invitedAt,
      })
      pushActivity({
        vendor_id: vendorId,
        actor_id: COORDINATOR_USER_ID,
        actor_label: 'Marcus Reyes',
        actor_role: 'coordinator',
        event_type: 'invitation_sent',
        target_id: invitationId,
        summary: `Invitation sent to ${spec.contact_email}`,
        reason: null,
        metadata: { recipient: spec.contact_email },
        vendor_visible: true,
        created_at: invitedAt,
      })
    }

    for (const definition of definitions) {
      const requirementSpec = spec.requirements.find((entry) => entry.key === definition.key)
      const requirementId = requirementIdFor(spec.slug, definition.key)
      const requirement: AssignedRequirement = {
        id: requirementId,
        organization_id: ORGANIZATION_ID,
        vendor_id: vendorId,
        source_template_id: templateId,
        source_template_version: 1,
        source_item_id: stableId(`template-item:${spec.template}:${definition.key}`),
        title: definition.title,
        instructions: definition.instructions,
        required: definition.required,
        expiration_required: definition.expiration_required,
        collect_issue_date: definition.collect_issue_date,
        sort_order: definitions.indexOf(definition),
        due_date:
          spec.invitedDaysAgo != null
            ? addDays(todayInTimeZone(new Date(now.getTime() - spec.invitedDaysAgo * 86_400_000), DEFAULT_TIMEZONE), 14)
            : null,
        retired_at: null,
        retired_reason: null,
        effective_submission_id: null,
        created_at: vendor.created_at,
        updated_at: vendor.created_at,
        record_version: 1,
      }

      const submissionSpecs = requirementSpec?.submissions ?? []
      submissionSpecs.forEach((submissionSpec, index) => {
        const version = index + 1
        const submissionId = stableId(`submission:${spec.slug}:${definition.key}:${version}`)
        const fileId = stableId(`file:${spec.slug}:${definition.key}:${version}`)
        const content = fileContentFor(definition, spec, submissionSpec, version)
        const storageKey = `blob/${fileId}`

        records.files.push({
          id: fileId,
          organization_id: ORGANIZATION_ID,
          storage_key: storageKey,
          original_filename: content.filename,
          detected_mime: content.preferImage ? 'image/png' : 'application/pdf',
          byte_size: 0,
          scan_status: 'not_scanned',
          created_by: submissionSpec.onBehalf ? COORDINATOR_USER_ID : contactUserId,
          created_at: at(submissionSpec.submittedDaysAgo),
        })
        const submission: Submission = {
          id: submissionId,
          organization_id: ORGANIZATION_ID,
          vendor_id: vendorId,
          requirement_id: requirementId,
          version_number: version,
          state: submissionSpec.state,
          file_object_id: fileId,
          issue_date: onDate(submissionSpec.issue),
          expiration_date: onDate(submissionSpec.expiration),
          submitted_by: submissionSpec.onBehalf ? COORDINATOR_USER_ID : contactUserId,
          submitted_by_label: submissionSpec.onBehalf ? 'Marcus Reyes' : spec.contact_name,
          submitted_on_behalf: submissionSpec.onBehalf ?? false,
          submitted_at: at(submissionSpec.submittedDaysAgo),
          decided_at: submissionSpec.decidedDaysAgo != null ? at(submissionSpec.decidedDaysAgo) : null,
          withdrawn_at: null,
          superseded_by_submission_id: null,
          record_version: 1,
        }
        records.submissions.push(submission)

        if (submissionSpec.effective) requirement.effective_submission_id = submissionId

        pushActivity({
          vendor_id: vendorId,
          actor_id: submission.submitted_by,
          actor_label: submission.submitted_by_label,
          actor_role: submissionSpec.onBehalf ? 'coordinator' : 'vendor_contact',
          event_type: submissionSpec.onBehalf ? 'document_submitted_on_behalf' : 'document_submitted',
          target_id: submissionId,
          summary: submissionSpec.onBehalf
            ? `${submission.submitted_by_label} submitted ${definition.title} v${version} on behalf of ${spec.company_name}`
            : `${spec.contact_name} submitted ${definition.title} v${version}`,
          reason: null,
          metadata: {
            requirement: definition.title,
            version,
            expiration_date: onDate(submissionSpec.expiration),
          },
          vendor_visible: true,
          created_at: submission.submitted_at,
        })

        if (submissionSpec.state === 'accepted' || submissionSpec.state === 'superseded') {
          const reviewId = stableId(`review:${spec.slug}:${definition.key}:${version}:accepted`)
          records.reviewEvents.push({
            id: reviewId,
            organization_id: ORGANIZATION_ID,
            submission_id: submissionId,
            actor_id: REVIEWER_USER_ID,
            actor_label: 'Priya Raman',
            decision: 'accepted',
            reason: null,
            created_at: submission.decided_at ?? submission.submitted_at,
          })
          pushActivity({
            vendor_id: vendorId,
            actor_id: REVIEWER_USER_ID,
            actor_label: 'Priya Raman',
            actor_role: 'reviewer',
            event_type: 'submission_accepted',
            target_id: submissionId,
            summary: `Accepted ${definition.title} v${version}`,
            reason: null,
            metadata: { requirement: definition.title, version },
            vendor_visible: true,
            created_at: submission.decided_at ?? submission.submitted_at,
          })
        }
        if (submissionSpec.state === 'changes_requested') {
          const reviewId = stableId(`review:${spec.slug}:${definition.key}:${version}:changes`)
          records.reviewEvents.push({
            id: reviewId,
            organization_id: ORGANIZATION_ID,
            submission_id: submissionId,
            actor_id: REVIEWER_USER_ID,
            actor_label: 'Priya Raman',
            decision: 'changes_requested',
            reason: submissionSpec.reason ?? 'Changes requested.',
            created_at: submission.decided_at ?? submission.submitted_at,
          })
          pushActivity({
            vendor_id: vendorId,
            actor_id: REVIEWER_USER_ID,
            actor_label: 'Priya Raman',
            actor_role: 'reviewer',
            event_type: 'submission_changes_requested',
            target_id: submissionId,
            summary: `Requested changes to ${definition.title} v${version}`,
            reason: submissionSpec.reason ?? null,
            metadata: { requirement: definition.title, version },
            vendor_visible: true,
            created_at: submission.decided_at ?? submission.submitted_at,
          })
          records.notifications.push({
            id: stableId(`notification:correction:${spec.slug}:${definition.key}:${version}`),
            organization_id: ORGANIZATION_ID,
            vendor_id: vendorId,
            type: 'correction_requested',
            recipient: spec.contact_email,
            recipient_label: spec.contact_name,
            subject: `Changes requested: ${definition.title}`,
            body: [
              `Hello ${spec.contact_name},`,
              '',
              `A reviewer asked for changes to ${definition.title}.`,
              '',
              `Reason: ${submissionSpec.reason ?? 'Changes requested.'}`,
              '',
              'Sign in to your vendor portal to upload a corrected version.',
            ].join('\n'),
            items: [
              {
                requirement_id: requirementId,
                requirement_title: definition.title,
                milestone_key: `correction:v${version}`,
                detail: submissionSpec.reason ?? 'Changes requested.',
                submission_version: version,
              },
            ],
            status: 'sent',
            idempotency_key: `correction:${ORGANIZATION_ID}:${submissionId}:v${version}:email`,
            attempt_count: 1,
            next_attempt_at: null,
            sent_at: submission.decided_at ?? submission.submitted_at,
            last_error: null,
            manual: false,
            created_at: submission.decided_at ?? submission.submitted_at,
          })
        }
      })

      // Link superseded versions to the accepted replacement for history display.
      const requirementSubmissions = records.submissions.filter((s) => s.requirement_id === requirementId)
      const acceptedLatest = requirementSubmissions.find((s) => s.id === requirement.effective_submission_id)
      for (const submission of requirementSubmissions) {
        if (submission.state === 'superseded' && acceptedLatest) {
          submission.superseded_by_submission_id = acceptedLatest.id
        }
      }

      records.requirements.push(requirement)
    }

    if (archivedAt) {
      pushActivity({
        vendor_id: vendorId,
        actor_id: ADMIN_USER_ID,
        actor_label: 'Dana Whitfield',
        actor_role: 'admin',
        event_type: 'vendor_archived',
        target_id: vendorId,
        summary: `Archived ${spec.company_name}`,
        reason: spec.archiveReason ?? null,
        metadata: {},
        vendor_visible: false,
        created_at: archivedAt,
      })
    }
  }

  // Two earlier digests so the notification log is not empty in the sample data.
  const digestSeeds: { slug: string; daysAgo: number; subject: string; lines: string[] }[] = [
    {
      slug: 'ironwood-pest-control',
      daysAgo: 4,
      subject: 'Reminder: 1 document still needed',
      lines: ['Safety acknowledgment - No document submitted yet.'],
    },
    {
      slug: 'cedar-line-landscaping',
      daysAgo: 18,
      subject: 'Reminder: 1 document expires soon',
      lines: [`Insurance certificate - Expires ${onDate('2026-09-30')}. Submit a replacement document.`],
    },
  ]
  for (const digest of digestSeeds) {
    const spec = VENDOR_SPECS.find((entry) => entry.slug === digest.slug)
    if (!spec) continue
    const vendorId = vendorIdFor(digest.slug)
    const sentAt = at(digest.daysAgo)
    const localDate = todayInTimeZone(new Date(sentAt), DEFAULT_TIMEZONE)
    records.notifications.push({
      id: stableId(`notification:digest:${digest.slug}:${localDate}`),
      organization_id: ORGANIZATION_ID,
      vendor_id: vendorId,
      type: 'vendor_digest',
      recipient: spec.contact_email,
      recipient_label: spec.contact_name,
      subject: digest.subject,
      body: [
        `Hello ${spec.contact_name},`,
        '',
        'Cedar Grove Property Operations is waiting on the following:',
        ...digest.lines.map((line) => `- ${line}`),
      ].join('\n'),
      items: digest.lines.map((line) => ({
        requirement_id: null,
        requirement_title: line.split(' - ')[0],
        milestone_key: 'seeded',
        detail: line,
        submission_version: null,
      })),
      status: 'sent',
      idempotency_key: digestIdempotencyKey(ORGANIZATION_ID, vendorId, localDate),
      attempt_count: 1,
      next_attempt_at: null,
      sent_at: sentAt,
      last_error: null,
      manual: false,
      created_at: sentAt,
    })
    records.activity.push({
      id: stableId(`activity:reminder:${digest.slug}:${localDate}`),
      organization_id: ORGANIZATION_ID,
      vendor_id: vendorId,
      actor_id: 'system',
      actor_label: 'Scheduled reminder job',
      actor_role: 'system',
      event_type: 'reminder_sent',
      target_id: null,
      summary: `Daily digest sent to ${spec.contact_email}`,
      reason: null,
      metadata: { items: digest.lines.length },
      vendor_visible: true,
      created_at: sentAt,
    })
  }

  // One genuinely failed delivery so the notification log shows an accurate failure state.
  const failedVendor = VENDOR_SPECS.find((spec) => spec.slug === 'lakeside-window-care')
  if (failedVendor) {
    const sentAt = at(9)
    records.notifications.push({
      id: stableId('notification:failed:lakeside'),
      organization_id: ORGANIZATION_ID,
      vendor_id: vendorIdFor(failedVendor.slug),
      type: 'vendor_digest',
      recipient: failedVendor.contact_email,
      recipient_label: failedVendor.contact_name,
      subject: 'Reminder: 3 documents still needed',
      body: [
        `Hello ${failedVendor.contact_name},`,
        '',
        'Cedar Grove Property Operations is waiting on your documents.',
      ].join('\n'),
      items: [],
      status: 'failed',
      idempotency_key: digestIdempotencyKey(
        ORGANIZATION_ID,
        vendorIdFor(failedVendor.slug),
        todayInTimeZone(new Date(sentAt), DEFAULT_TIMEZONE),
      ),
      attempt_count: 2,
      next_attempt_at: null,
      sent_at: null,
      last_error: 'SMTP 550 recipient mailbox unavailable.',
      manual: false,
      created_at: sentAt,
    })
  }

  pushActivity({
    vendor_id: null,
    actor_id: ADMIN_USER_ID,
    actor_label: 'Dana Whitfield',
    actor_role: 'admin',
    event_type: 'settings_updated',
    target_id: ORGANIZATION_ID,
    summary: `Set organization timezone to ${DEFAULT_TIMEZONE}`,
    reason: null,
    metadata: { timezone: DEFAULT_TIMEZONE },
    vendor_visible: false,
    created_at: at(419),
  })

  return records
}

/** Generate the real sample bytes for every seeded file object. */
async function attachSampleBlobs(records: SeedRecords): Promise<void> {
  const pngCache = new Map<string, Blob | null>()
  records.blobs = []
  for (const file of records.files) {
    const isImage = file.detected_mime === 'image/png'
    const title = file.original_filename.replace(/-v\d+\.(pdf|png)$/, '').replaceAll('-', ' ')
    const readableTitle = title.charAt(0).toUpperCase() + title.slice(1)
    let blob: Blob | null = null
    if (isImage) {
      const cacheKey = `${readableTitle}:${file.id}`
      blob =
        pngCache.get(cacheKey) ??
        (await createSamplePng({
          title: readableTitle,
          lines: [
            `File: ${file.original_filename}`,
            'Cedar Grove Property Operations',
            'Synthetic scan, sample dataset',
          ],
        }))
      pngCache.set(cacheKey, blob)
    }
    if (!blob) {
      blob = createSamplePdf({
        title: readableTitle,
        subtitle: 'Cedar Grove Property Operations - seeded sample document',
        lines: [
          `File: ${file.original_filename}`,
          `Created: ${file.created_at.slice(0, 10)}`,
          '',
          'Synthetic sample document. SAMPLE - NOT VALID FOR BUSINESS USE.',
        ],
      })
      file.detected_mime = 'application/pdf'
      file.original_filename = file.original_filename.replace(/\.png$/, '.pdf')
    }
    file.byte_size = blob.size
    records.blobs.push({ key: file.storage_key, blob })
  }
}

/** Replace the contents of the database with the sample dataset, in one transaction. */
export async function seedSampleData(db: Database, now: Date, options: SeedOptions): Promise<void> {
  const records = await buildSeedRecords(now, options)
  await attachSampleBlobs(records)

  await db.clear()
  await db.write(async (uow) => {
    await uow.organizations.put(records.organization)
    await uow.users.putMany(records.users)
    await uow.memberships.putMany(records.memberships)
    await uow.vendors.putMany(records.vendors)
    await uow.properties.putMany(records.properties)
    await uow.vendorProperties.putMany(records.vendorProperties)
    await uow.vendorMemberships.putMany(records.vendorMemberships)
    await uow.templates.putMany(records.templates)
    await uow.templateItems.putMany(records.templateItems)
    await uow.files.putMany(records.files)
    // The effective-submission pointer is written after its submission row exists.
    await uow.requirements.putMany(
      records.requirements.map((requirement) => ({ ...requirement, effective_submission_id: null })),
    )
    await uow.submissions.putMany(records.submissions)
    await uow.requirements.putMany(records.requirements)
    await uow.reviewEvents.putMany(records.reviewEvents)
    await uow.invitations.putMany(records.invitations)
    await uow.notifications.putMany(records.notifications)
    await uow.activity.putMany(records.activity)
    for (const blob of records.blobs) {
      await uow.blobs.put(blob.key, blob.blob)
    }
  })
}
