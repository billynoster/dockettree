import { useEffect, useState } from 'react'
import { errorMessage } from '@/domain/errors'

/** Query hook for screens that render before a session exists, such as invitation acceptance. */
export function useServiceQueryPublic<T>(
  run: () => Promise<T>,
  deps: unknown[],
  enabled = true,
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    run()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return { data, loading, error }
}
