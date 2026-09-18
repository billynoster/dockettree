/**
 * Application state: the authenticated session as reported by the server.
 *
 * Capabilities come from the server and are used only to decide which controls to show. The
 * server re-checks every read and mutation, so a hidden control is a convenience, never a
 * security boundary.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, UnauthenticatedError, type SessionInfo } from '@/api/client'
import { errorMessage } from '@/domain/errors'
import type { Capability } from '@/domain/permissions'
import type { Organization, Role, UUID } from '@/domain/types'

export interface AuthenticatedApp {
  status: 'authenticated'
  session: SessionInfo
  user: NonNullable<SessionInfo['user']>
  organization: Organization
  role: Role
  capabilities: Capability[]
  vendorContexts: { id: UUID; company_name: string }[]
  activeVendorId: UUID | null
  delivery: { configured: boolean; reason: string | null }
  /** Bumped after every mutation so queries re-read from the server. */
  version: number
  refresh: () => void
  reloadSession: () => Promise<void>
  signOut: () => Promise<void>
  can: (capability: Capability) => boolean
}

interface AppState extends AuthenticatedApp {}

const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}

interface SessionState {
  status: 'loading' | 'ready' | 'error'
  info: SessionInfo | null
  error: string | null
}

const SessionContext = createContext<{
  state: SessionState
  reload: () => Promise<void>
} | null>(null)

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside AppProvider')
  return value
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading', info: null, error: null })
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    try {
      const info = await api.session()
      setState({ status: 'ready', info, error: null })
    } catch (error) {
      setState({ status: 'error', info: null, error: errorMessage(error) })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const refresh = useCallback(() => setVersion((current) => current + 1), [])

  const value = useMemo<AppState | null>(() => {
    const info = state.info
    if (state.status !== 'ready' || !info?.authenticated || !info.user || !info.organization) {
      return null
    }
    const capabilities = info.capabilities ?? []
    return {
      status: 'authenticated',
      session: info,
      user: info.user,
      organization: info.organization,
      role: info.role ?? 'coordinator',
      capabilities,
      vendorContexts: info.vendorContexts ?? [],
      activeVendorId: info.activeVendorId ?? null,
      delivery: info.delivery,
      version,
      refresh,
      reloadSession: reload,
      signOut: async () => {
        await api.logout()
        await reload()
      },
      can: (capability) => capabilities.includes(capability),
    }
  }, [state, version, refresh, reload])

  return (
    <SessionContext.Provider value={{ state, reload }}>
      {value ? <AppContext.Provider value={value}>{children}</AppContext.Provider> : children}
    </SessionContext.Provider>
  )
}

/** Signs the browser out when the server reports the session has ended. */
export function useSessionExpiry(): (error: unknown) => boolean {
  const { reload } = useSession()
  return useCallback(
    (error: unknown) => {
      if (error instanceof UnauthenticatedError) {
        void reload()
        return true
      }
      return false
    },
    [reload],
  )
}
