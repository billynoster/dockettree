import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, isAppError, type FieldErrors } from '@/domain/errors'
import type { ServiceContext } from '@/services/context'
import { useApp } from './AppProvider'

export interface ActionState {
  pending: boolean
  error: string | null
  fieldErrors: FieldErrors
  /** Set when the failure needs an explicit confirmation, e.g. a duplicate company name. */
  conflict: string | null
}

export interface ActionApi extends ActionState {
  run: <T>(
    call: (ctx: ServiceContext) => Promise<T>,
    options?: {
      /** Announced in a toast when the call succeeds. */
      success?: string | ((result: T) => string)
      onSuccess?: (result: T) => void | Promise<void>
      /** Keep the previous data on screen instead of refreshing app state. */
      skipRefresh?: boolean
    },
  ) => Promise<T | undefined>
  reset: () => void
}

/** Wraps a mutation: pending state, inline field errors, toast announcement and refresh. */
export function useAction(): ActionApi {
  const app = useApp()
  const [state, setState] = useState<ActionState>({
    pending: false,
    error: null,
    fieldErrors: {},
    conflict: null,
  })

  const reset = useCallback(
    () => setState({ pending: false, error: null, fieldErrors: {}, conflict: null }),
    [],
  )

  const run = useCallback<ActionApi['run']>(
    async (call, options) => {
      setState({ pending: true, error: null, fieldErrors: {}, conflict: null })
      try {
        const result = await call(app.ctx)
        if (!options?.skipRefresh) app.refresh()
        setState({ pending: false, error: null, fieldErrors: {}, conflict: null })
        if (options?.success) {
          const message =
            typeof options.success === 'function' ? options.success(result) : options.success
          toast.success(message)
        }
        await options?.onSuccess?.(result)
        return result
      } catch (caught) {
        const message = errorMessage(caught)
        setState({
          pending: false,
          error: message,
          fieldErrors: isAppError(caught) ? caught.fieldErrors : {},
          conflict: isAppError(caught) && caught.code === 'conflict' ? message : null,
        })
        toast.error(message)
        return undefined
      }
    },
    [app],
  )

  return { ...state, run, reset }
}
