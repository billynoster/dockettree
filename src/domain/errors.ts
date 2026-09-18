/** Typed operation errors (requirements section 9). */
export type AppErrorCode =
  | 'validation'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'storage_unavailable'
  | 'delivery_failed'

export type FieldErrors = Record<string, string>

export class AppError extends Error {
  code: AppErrorCode
  fieldErrors: FieldErrors
  detail: string | null

  constructor(
    code: AppErrorCode,
    message: string,
    options: { fieldErrors?: FieldErrors; detail?: string } = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.fieldErrors = options.fieldErrors ?? {}
    this.detail = options.detail ?? null
  }
}

export function validationError(message: string, fieldErrors: FieldErrors = {}): AppError {
  return new AppError('validation', message, { fieldErrors })
}

export function notFound(message = 'That record no longer exists.'): AppError {
  return new AppError('not_found', message)
}

export function forbidden(message = 'Your demo role cannot perform this action.'): AppError {
  return new AppError('forbidden', message)
}

export function conflict(message: string): AppError {
  return new AppError('conflict', message)
}

export function rateLimited(message: string): AppError {
  return new AppError('rate_limited', message)
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function errorMessage(error: unknown): string {
  if (isAppError(error)) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

export function errorCode(error: unknown): AppErrorCode | 'unknown' {
  return isAppError(error) ? error.code : 'unknown'
}
