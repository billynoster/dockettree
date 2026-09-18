/**
 * Demo authorization matrix (requirements section 3).
 *
 * This is a demonstration of role-dependent UI and command behaviour only. Real
 * authorization must be enforced by a server in milestone B; the role selector is
 * never a production authorization mechanism.
 */
import type { Role } from './types'

export type Capability =
  | 'org.view_all_vendors'
  | 'vendor.manage'
  | 'vendor.archive'
  | 'document.upload_on_behalf'
  | 'document.upload_own'
  | 'submission.review'
  | 'submission.revoke_acceptance'
  | 'template.manage'
  | 'export.run'
  | 'settings.manage'
  | 'reminder.send'
  | 'invitation.send'

const MATRIX: Record<Role, Capability[]> = {
  admin: [
    'org.view_all_vendors',
    'vendor.manage',
    'vendor.archive',
    'document.upload_on_behalf',
    'submission.review',
    'submission.revoke_acceptance',
    'template.manage',
    'export.run',
    'settings.manage',
    'reminder.send',
    'invitation.send',
  ],
  coordinator: [
    'org.view_all_vendors',
    'vendor.manage',
    'vendor.archive',
    'document.upload_on_behalf',
    'export.run',
    'reminder.send',
    'invitation.send',
  ],
  reviewer: [
    'org.view_all_vendors',
    'submission.review',
    'submission.revoke_acceptance',
    'export.run',
  ],
  vendor_contact: ['document.upload_own'],
}

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability)
}

export function capabilitiesFor(role: Role): Capability[] {
  return [...MATRIX[role]]
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  reviewer: 'Reviewer',
  vendor_contact: 'Vendor contact',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  admin: 'Full access: vendors, reviews, templates, settings and members.',
  coordinator: 'Manages vendors, checklists, invitations, reminders and exports. Cannot decide reviews.',
  reviewer: 'Reads all vendors, decides submissions and exports. Cannot edit vendors.',
  vendor_contact: 'Sees and submits documents for one vendor only, through the portal.',
}

/** Internal roles may read every vendor; a vendor contact is limited to its own record. */
export function canViewVendor(role: Role, sessionVendorId: string | null, vendorId: string): boolean {
  if (can(role, 'org.view_all_vendors')) return true
  return sessionVendorId === vendorId
}
