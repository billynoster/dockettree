/** Route wrapper: JSON responses plus the typed-error mapping from section 9. */
import type { Context } from 'hono'
import { errorResponse, unauthenticated } from './errors'
import { UnauthenticatedError, type AppEnv } from './context'

type Handler = (c: Context<AppEnv>) => Promise<unknown>

export function handle(fn: Handler) {
  return async (c: Context<AppEnv>) => {
    try {
      const data = await fn(c)
      if (data instanceof Response) return data
      return c.json(data ?? {})
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        const { status, body } = unauthenticated()
        return c.json(body, status as 401)
      }
      const { status, body } = errorResponse(error)
      return c.json(body, status as 400)
    }
  }
}

/** Path parameter that must be present, so route handlers can stay concise. */
export function param(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name)
  if (!value) throw new Error(`Missing path parameter ${name}`)
  return value
}
