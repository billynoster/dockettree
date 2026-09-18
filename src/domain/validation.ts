/** Form, file and date validation shared by services and UI (requirements FR-01, FR-04, 5.3). */
import { z } from 'zod'
import { compareDates, isExpiredOn, isIsoDate } from './dates'
import type { FieldErrors } from './errors'
import type { IsoDate } from './types'

/** Deliberately permissive syntactic check: the pilot verifies the address by email. */
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/

export function isSyntacticallyValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

const trimmed = z.string().transform((value) => value.trim())

export const emailField = trimmed
  .refine((value) => value.length > 0, 'Enter a contact email.')
  .refine(isSyntacticallyValidEmail, 'Enter a valid email address, for example name@example.com.')

export const vendorInputSchema = z.object({
  company_name: trimmed
    .refine((value) => value.length > 0, 'Enter the company name.')
    .refine((value) => value.length <= 120, 'Keep the company name under 120 characters.'),
  category: trimmed.refine((value) => value.length > 0, 'Choose a service category.'),
  contact_name: trimmed.refine((value) => value.length > 0, 'Enter the primary contact name.'),
  contact_email: emailField,
  property_tags: z.array(z.string()),
})

export type VendorInput = z.infer<typeof vendorInputSchema>

export const organizationSettingsSchema = z.object({
  name: trimmed.refine((value) => value.length > 0, 'Enter the organization name.'),
  timezone: trimmed.refine((value) => value.length > 0, 'Choose a timezone.'),
  support_email: emailField,
  support_contact_name: trimmed.refine((value) => value.length > 0, 'Enter a support contact name.'),
})

export const templateSchema = z.object({
  name: trimmed.refine((value) => value.length > 0, 'Enter a template name.'),
  description: trimmed,
})

export const templateItemSchema = z.object({
  title: trimmed.refine((value) => value.length > 0, 'Enter a requirement title.'),
  instructions: trimmed.refine(
    (value) => value.length > 0,
    'Add plain-language instructions so the vendor knows what to send.',
  ),
  required: z.boolean(),
  expiration_required: z.boolean(),
  collect_issue_date: z.boolean(),
})

/** Turn a Zod error into `{ field: message }` for inline display. */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!result[key]) result[key] = issue.message
  }
  return result
}

export const ALLOWED_UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const
export const ALLOWED_UPLOAD_LABEL = 'PDF, PNG or JPEG'
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number]

/**
 * Content sniffing, so a file extension is never trusted. The server runs this check on the
 * uploaded bytes; the browser runs it too only to fail fast.
 */
export function detectMimeFromBytes(bytes: Uint8Array): AllowedUploadMime | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  return null
}

export interface FileValidationResult {
  ok: boolean
  error: string | null
  detectedMime: AllowedUploadMime | null
}

export function validateUpload(
  file: { name: string; size: number; type: string },
  detectedMime: AllowedUploadMime | null,
): FileValidationResult {
  if (file.size === 0) {
    return { ok: false, error: 'That file is empty. Choose a file with content.', detectedMime: null }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatBytes(file.size)}. The limit is 10 MiB per document.`,
      detectedMime: null,
    }
  }
  if (detectedMime === null) {
    return {
      ok: false,
      error: `Only ${ALLOWED_UPLOAD_LABEL} files can be submitted. The file contents did not match a supported type.`,
      detectedMime: null,
    }
  }
  return { ok: true, error: null, detectedMime }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export interface SubmissionDateInput {
  issue_date: string
  expiration_date: string
}

export interface SubmissionDateValidation {
  fieldErrors: FieldErrors
  /** Non-blocking: an expired document may be submitted but cannot be accepted. */
  warning: string | null
  issue_date: IsoDate | null
  expiration_date: IsoDate | null
}

export function validateSubmissionDates(
  input: SubmissionDateInput,
  policy: { expiration_required: boolean; collect_issue_date: boolean },
  today: IsoDate,
): SubmissionDateValidation {
  const fieldErrors: FieldErrors = {}
  const issueRaw = input.issue_date.trim()
  const expirationRaw = input.expiration_date.trim()

  let issue_date: IsoDate | null = null
  let expiration_date: IsoDate | null = null

  if (issueRaw.length > 0) {
    if (!isIsoDate(issueRaw)) fieldErrors.issue_date = 'Enter a valid date.'
    else issue_date = issueRaw
  }
  if (expirationRaw.length > 0) {
    if (!isIsoDate(expirationRaw)) fieldErrors.expiration_date = 'Enter a valid date.'
    else expiration_date = expirationRaw
  }

  if (policy.expiration_required && expiration_date === null && !fieldErrors.expiration_date) {
    fieldErrors.expiration_date = 'This requirement needs an expiration date.'
  }
  if (issue_date && expiration_date && compareDates(issue_date, expiration_date) > 0) {
    fieldErrors.issue_date = 'The issue date must be on or before the expiration date.'
  }

  let warning: string | null = null
  if (expiration_date && isExpiredOn(expiration_date, today)) {
    warning =
      'This expiration date has already passed. You can submit the file, but a reviewer cannot accept it until you provide a document that is still valid.'
  }

  return { fieldErrors, warning, issue_date, expiration_date }
}

export const SERVICE_CATEGORIES = [
  'Cleaning',
  'Electrical',
  'Elevator',
  'Fire safety',
  'HVAC / Mechanical',
  'Landscaping',
  'Locksmith',
  'Painting',
  'Pest control',
  'Plumbing',
  'Roofing',
  'Security',
  'Signage',
  'Snow removal',
  'Waste management',
  'Window care',
  'Other',
]

export const COMMON_TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'UTC',
]
