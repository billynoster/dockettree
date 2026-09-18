import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { UnauthenticatedError } from '@/api/client'
import { errorMessage, isAppError, type FieldErrors } from '@/domain/errors'
import { useApp, useSession } from './AppProvider'

export interface ActionState {
  pending: boolean
  error: string | null
  fieldErrors: FieldErrors
  /** Set when the failure needs an explicit confirmation, e.g. a duplicate company name. */
  conflict: string | null
}

export interface ActionApi extends ActionState {
  run: <T>(
    call: () => Promise<T>,
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
  const { reload: reloadSession } = useSession()
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
        const result = await call()
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
        if (caught instanceof UnauthenticatedError) void reloadSession()
        return undefined
      }
    },
    [app, reloadSession],
  )

  return { ...state, run, reset }
}
