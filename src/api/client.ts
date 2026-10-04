/**
 * Browser API client.
 *
 * The browser never touches storage or evaluates business rules: it calls the server, which
 * authenticates the session, enforces the permission matrix and runs the use cases. Result
 * types are imported from the service modules with `import type`, so no server code is ever
 * bundled into the client (a unit test enforces that boundary).
 */
import { AppError, type AppErrorCode, type FieldErrors } from '@/domain/errors'
import type { PublicConfig } from '@/lib/firebaseAuth'
import {
  firebaseIdTokenForLogin,
  provisionFirebasePasswordUser,
  signOutFirebaseClient,
} from '@/lib/firebaseAuth'
import type {
  ActivityEventType,
  DocumentRequestState,
  InternalRole,
  Notification,
  Organization,
  Role,
  UUID,
} from '@/domain/types'
import type {
  DocumentRequestDetail,
  DocumentRequestListResult,
} from '@/services/documentRequestService'
import type { Capability } from '@/domain/permissions'
import { vendorQueryToParams, type VendorListQuery } from '@/domain/vendorQuery'
import type { ActivityQuery } from '@/services/activityService'
import type { ExportResult } from '@/services/exportService'
import type { ImportValidation } from '@/domain/csv'
import type { ImportVendorsResult } from '@/services/importService'
import type { InvitationCheck, InvitationPreview, InviteVendorResult } from '@/services/invitationService'
import type { MemberRow } from '@/services/memberService'
import type { OverviewData } from '@/services/overviewService'
import type { PortalData } from '@/services/portalService'
import type {
  DailyJobResult,
  OutboxEntry,
  ReminderPreview,
  SendReminderResult,
} from '@/services/reminderService'
import type {
  ReviewDetail,
  ReviewQueueResult,
  ReviewSubmissionInput,
  ReviewSubmissionResult,
} from '@/services/reviewService'
import type { SubmitDocumentResult } from '@/services/submissionService'
import type { SaveTemplateInput, TemplateSummary } from '@/services/templateService'
import type {
  ChecklistImpactPreview,
  CreateVendorInput,
  TemplateWithItems,
  UpdateVendorInput,
  VendorDetail,
  VendorListResult,
} from '@/services/vendorService'
import type { ActivityEvent, Vendor } from '@/domain/types'

interface ErrorPayload {
  error?: { code?: AppErrorCode | 'unauthenticated' | 'unknown'; message?: string; fieldErrors?: FieldErrors }
}

export class UnauthenticatedError extends Error {
  constructor(message = 'Your session has ended. Sign in again to continue.') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new AppError('storage_unavailable', 'The server could not be reached. Check your connection and try again.')
  }

  if (response.status === 401) throw new UnauthenticatedError()
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    const code = payload.error?.code
    const message = payload.error?.message ?? 'That request failed.'
    if (code && code !== 'unauthenticated' && code !== 'unknown') {
      throw new AppError(code, message, { fieldErrors: payload.error?.fieldErrors })
    }
    throw new Error(message)
  }
  if (init.raw) return response as unknown as T
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? '{}' : JSON.stringify(body) })
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const remove = <T>(path: string) => request<T>(path, { method: 'DELETE' })

function queryString(query: VendorListQuery): string {
  const params = vendorQueryToParams(query)
  const search = params.toString()
  return search.length > 0 ? `?${search}` : ''
}

export interface SessionInfo {
  authenticated: boolean
  setupRequired: boolean
  provider: string
  signInHint: string
  organizationName: string | null
  delivery: { configured: boolean; reason: string | null }
  user?: { id: UUID; display_name: string; email: string; last_login_at: string | null }
  role?: Role
  capabilities?: Capability[]
  organization?: Organization
  vendorContexts?: { id: UUID; company_name: string }[]
  activeVendorId?: UUID | null
  managesPasswords?: boolean
}

export const api = {
  publicConfig: () => get<PublicConfig>('/public-config'),
  session: () => get<SessionInfo>('/session'),
  login: async (email: string, password: string) => {
    const idToken = await firebaseIdTokenForLogin(email, password)
    if (idToken) return post<{ user_id: UUID }>('/auth/login', { idToken })
    return post<{ user_id: UUID }>('/auth/login', { email, password })
  },
  logout: async () => {
    const result = await post<{ signed_out: boolean }>('/auth/logout')
    await signOutFirebaseClient()
    return result
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ updated: boolean }>('/auth/password', { currentPassword, newPassword }),
  setVendorContext: (vendorId: UUID) => post<{ active_vendor_id: UUID }>('/session/vendor-context', { vendorId }),
  setup: async (input: {
    organizationName: string
    timezone: string
    supportEmail: string
    supportContactName: string
    adminName: string
    adminEmail: string
    adminPassword: string
  }) => {
    const idToken = await provisionFirebasePasswordUser(input.adminEmail, input.adminPassword, {
      signInIfExists: true,
    })
    return post<{ organization_id: UUID; user_id: UUID }>('/setup', { ...input, idToken: idToken ?? undefined })
  },

  overview: () => get<OverviewData>('/overview'),

  listVendors: (query: VendorListQuery) => get<VendorListResult>(`/vendors${queryString(query)}`),
  vendorDetail: (vendorId: UUID) => get<VendorDetail>(`/vendors/${vendorId}`),
  templatesWithItems: () => get<TemplateWithItems[]>('/vendors/templates'),
  createVendor: (input: CreateVendorInput) =>
    post<{ vendor_id: UUID; replayed: boolean }>('/vendors', input),
  updateVendor: (vendorId: UUID, input: UpdateVendorInput) => patch<Vendor>(`/vendors/${vendorId}`, input),
  archiveVendor: (vendorId: UUID, reason: string) => post<Vendor>(`/vendors/${vendorId}/archive`, { reason }),
  restoreVendor: (vendorId: UUID) => post<Vendor>(`/vendors/${vendorId}/restore`),
  previewChecklist: (vendorId: UUID, templateId: UUID) =>
    get<ChecklistImpactPreview>(`/vendors/${vendorId}/checklist-preview?templateId=${templateId}`),
  assignChecklist: (vendorId: UUID, templateId: UUID, reason: string) =>
    post<{ assigned: boolean }>(`/vendors/${vendorId}/checklist`, { templateId, reason }),
  retireRequirement: (requirementId: UUID, reason: string) =>
    post<{ retired: boolean }>(`/requirements/${requirementId}/retire`, { reason }),
  restoreRequirement: (requirementId: UUID, reason: string) =>
    post<{ restored: boolean }>(`/requirements/${requirementId}/restore`, { reason }),
  setRequirementDueDate: (requirementId: UUID, dueDate: string | null) =>
    post<{ updated: boolean }>(`/requirements/${requirementId}/due-date`, { dueDate }),

  previewInvitation: (vendorId: UUID) => get<InvitationPreview>(`/vendors/${vendorId}/invitation-preview`),
  inviteVendor: (vendorId: UUID, expectedContactEmail: string, requestKey: string) =>
    post<InviteVendorResult>(`/vendors/${vendorId}/invitation`, { expectedContactEmail, requestKey }),
  revokeInvitation: (invitationId: UUID) => remove<{ revoked: boolean }>(`/invitations/${invitationId}`),
  checkInvitation: (token: string) =>
    get<InvitationCheck>(`/invitations/check?token=${encodeURIComponent(token)}`),
  acceptInvitation: async (input: { token: string; display_name: string; password: string; email?: string }) => {
    const idToken = input.email
      ? await provisionFirebasePasswordUser(input.email, input.password, { signInIfExists: true })
      : null
    return post<{ user_id: UUID; vendor_id: UUID; email: string }>('/invitations/accept', {
      token: input.token,
      display_name: input.display_name,
      password: input.password,
      idToken: idToken ?? undefined,
    })
  },

  previewReminder: (vendorId: UUID) => get<ReminderPreview>(`/vendors/${vendorId}/reminder-preview`),
  sendReminder: (vendorId: UUID, requestKey: string) =>
    post<SendReminderResult>(`/vendors/${vendorId}/reminder`, { requestKey }),

  previewImport: (text: string) => post<ImportValidation>('/vendors/import-preview', { text }),
  importVendors: (input: {
    text: string
    templateId: UUID | null
    requestKey: string
    confirmDuplicates?: boolean
  }) => post<ImportVendorsResult>('/vendors/import', input),
  exportVendors: (query: VendorListQuery) => get<ExportResult>(`/vendors-export${queryString(query)}`),

  reviewQueue: (filters: { vendorId?: string | null; requirementTitle?: string | null } = {}) => {
    const params = new URLSearchParams()
    if (filters.vendorId) params.set('vendor', filters.vendorId)
    if (filters.requirementTitle) params.set('requirement', filters.requirementTitle)
    const search = params.toString()
    return get<ReviewQueueResult>(`/review${search ? `?${search}` : ''}`)
  },
  reviewDetail: (submissionId: UUID) => get<ReviewDetail>(`/review/${submissionId}`),
  reviewSubmission: (input: ReviewSubmissionInput) =>
    post<ReviewSubmissionResult>(`/review/${input.submissionId}`, {
      expectedVersion: input.expectedVersion,
      decision: input.decision,
      reason: input.reason,
      requestKey: input.requestKey,
    }),
  revokeAcceptance: (submissionId: UUID, reason: string) =>
    post<{ revoked: boolean }>(`/submissions/${submissionId}/revoke`, { reason }),
  withdrawSubmission: (submissionId: UUID, expectedVersion: number) =>
    post<{ withdrawn: boolean }>(`/submissions/${submissionId}/withdraw`, { expectedVersion }),

  submitDocument: (input: {
    requirementId: UUID
    file: File
    issue_date: string
    expiration_date: string
    requestKey?: string
    onProgress?: (fraction: number) => void
  }) => {
    const form = new FormData()
    form.set('file', input.file)
    form.set('issue_date', input.issue_date)
    form.set('expiration_date', input.expiration_date)
    if (input.requestKey) form.set('requestKey', input.requestKey)
    return uploadWithProgress<SubmitDocumentResult>(
      `/api/requirements/${input.requirementId}/submissions`,
      form,
      input.onProgress,
    )
  },
  documentUrl: (submissionId: UUID) => `/api/submissions/${submissionId}/file`,

  portal: () => get<PortalData>('/portal'),

  listTemplates: () => get<TemplateSummary[]>('/templates'),
  createTemplate: (input: SaveTemplateInput) => post<{ template_id: UUID }>('/templates', input),
  updateTemplate: (templateId: UUID, input: SaveTemplateInput) =>
    patch<{ updated: boolean }>(`/templates/${templateId}`, input),
  setTemplateArchived: (templateId: UUID, archived: boolean) =>
    post<{ updated: boolean }>(`/templates/${templateId}/archived`, { archived }),

  listActivity: (query: ActivityQuery = {}) => {
    const params = new URLSearchParams()
    if (query.vendorId && query.vendorId !== 'all') params.set('vendor', query.vendorId)
    if (query.eventType && query.eventType !== 'all') params.set('type', query.eventType as ActivityEventType)
    if (query.limit) params.set('limit', String(query.limit))
    const search = params.toString()
    return get<{ events: ActivityEvent[]; total: number }>(`/activity${search ? `?${search}` : ''}`)
  },

  settings: () =>
    get<{
      organization: Organization
      members: MemberRow[]
      identity: { provider: string; managesPasswords: boolean }
      delivery: { configured: boolean; reason: string | null }
    }>('/settings'),
  updateSettings: (input: {
    name: string
    timezone: string
    support_email: string
    support_contact_name: string
    expectedVersion: number
  }) => patch<Organization>('/settings', input),
  addMember: async (input: { display_name: string; email: string; role: InternalRole; password: string }) => {
    await provisionFirebasePasswordUser(input.email, input.password)
    return post<MemberRow>('/members', input)
  },
  changeMemberRole: (userId: UUID, role: InternalRole) =>
    post<{ updated: boolean }>(`/members/${userId}/role`, { role }),
  setMemberStatus: (userId: UUID, status: 'active' | 'disabled') =>
    post<{ updated: boolean }>(`/members/${userId}/status`, { status }),
  resetMemberPassword: (userId: UUID, password: string) =>
    post<{ updated: boolean }>(`/members/${userId}/password`, { password }),

  listRequests: (filters: {
    vendorId?: string | null
    state?: DocumentRequestState | 'open' | 'all' | null
  } = {}) => {
    const params = new URLSearchParams()
    if (filters.vendorId) params.set('vendor', filters.vendorId)
    if (filters.state && filters.state !== 'all') params.set('state', filters.state)
    const search = params.toString()
    return get<DocumentRequestListResult>(`/requests${search ? `?${search}` : ''}`)
  },
  requestDetail: (requestId: UUID) => get<DocumentRequestDetail>(`/requests/${requestId}`),
  vendorRequests: (vendorId: UUID) => get<DocumentRequestListResult>(`/vendors/${vendorId}/requests`),

  notifications: (filters: { vendorId?: string | null; type?: Notification['type'] | null } = {}) => {
    const params = new URLSearchParams()
    if (filters.vendorId) params.set('vendor', filters.vendorId)
    if (filters.type) params.set('type', filters.type)
    const search = params.toString()
    return get<{
      entries: OutboxEntry[]
      total: number
      vendors: { id: UUID; company_name: string }[]
      delivery: { configured: boolean; reason: string | null }
    }>(`/notifications${search ? `?${search}` : ''}`)
  },
  retryNotification: (notificationId: UUID) =>
    post<{ queued: boolean }>(`/notifications/${notificationId}/retry`),
  runReminderJob: () => post<DailyJobResult>('/notifications/run-job'),
}

/** XHR upload so the dialog can show real progress and allow retry (FR-04). */
function uploadWithProgress<T>(
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new UnauthenticatedError())
        return
      }
      let payload: unknown = {}
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        payload = {}
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T)
        return
      }
      const error = (payload as ErrorPayload).error
      if (error?.code && error.code !== 'unauthenticated' && error.code !== 'unknown') {
        reject(new AppError(error.code, error.message ?? 'That upload failed.', {
          fieldErrors: error.fieldErrors,
        }))
        return
      }
      reject(new Error(error?.message ?? 'That upload failed.'))
    }
    xhr.onerror = () =>
      reject(
        new AppError('storage_unavailable', 'The upload could not reach the server. Try again.'),
      )
    xhr.send(form)
  })
}
