/** Maps the typed operation errors from requirements section 9 onto HTTP responses. */
import type { AppErrorCode } from '@/domain/errors'
import { isAppError } from '@/domain/errors'

const STATUS: Record<AppErrorCode, number> = {
  validation: 422,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  storage_unavailable: 503,
  delivery_failed: 502,
}

export interface ErrorBody {
  error: {
    code: AppErrorCode | 'unauthenticated' | 'unknown'
    message: string
    fieldErrors?: Record<string, string>
  }
}

export function errorResponse(error: unknown): { status: number; body: ErrorBody } {
  if (isAppError(error)) {
    return {
      status: STATUS[error.code],
      body: {
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: Object.keys(error.fieldErrors).length > 0 ? error.fieldErrors : undefined,
        },
      },
    }
  }
  // Unexpected failures are logged server-side and reported without internal detail.
  console.error('[docksy] unhandled error', error)
  return {
    status: 500,
    body: { error: { code: 'unknown', message: 'Something went wrong on the server.' } },
  }
}

export function unauthenticated(): { status: number; body: ErrorBody } {
  return {
    status: 401,
    body: { error: { code: 'unauthenticated', message: 'Sign in to continue.' } },
  }
}
