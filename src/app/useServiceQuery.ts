import { useCallback, useEffect, useState } from 'react'
import { UnauthenticatedError } from '@/api/client'
import { errorMessage, isAppError, type AppErrorCode } from '@/domain/errors'
import { useApp, useSession } from './AppProvider'

export interface QueryResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  errorCode: AppErrorCode | 'unauthenticated' | 'unknown' | null
  reload: () => void
}

/** Read-only API call that re-runs whenever the app data version changes. */
export function useServiceQuery<T>(run: () => Promise<T>, deps: unknown[]): QueryResult<T> {
  const app = useApp()
  const { reload: reloadSession } = useSession()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<AppErrorCode | 'unauthenticated' | 'unknown' | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    run()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
        setErrorCode(null)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        if (caught instanceof UnauthenticatedError) {
          void reloadSession()
          setErrorCode('unauthenticated')
          setError(caught.message)
          return
        }
        setError(errorMessage(caught))
        setErrorCode(isAppError(caught) ? caught.code : 'unknown')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.version, attempt, ...deps])

  const reload = useCallback(() => setAttempt((current) => current + 1), [])
  return { data, loading, error, errorCode, reload }
}
