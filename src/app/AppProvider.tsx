/**
 * Application state: storage handle, organization record, injected clock and the simulated
 * session. Components never touch storage directly; they call services through `ctx`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { INITIAL_DEMO_INSTANT, type Clock } from '@/demo/clock'
import { ADMIN_USER_ID, COORDINATOR_USER_ID, ORGANIZATION_ID, REVIEWER_USER_ID } from '@/demo/fixtures'
import { instantForDemoDate, todayInTimeZone } from '@/domain/dates'
import { errorMessage } from '@/domain/errors'
import type { DemoState, IsoDate, Organization, Role, UUID } from '@/domain/types'
import { IndexedDbDatabase } from '@/repositories/indexeddb/database'
import type { Database } from '@/repositories/types'
import { ensureSeeded, resetDemoData } from '@/services/resetService'
import { getDemoState, getOrganization, saveDemoState } from '@/services/settingsService'
import type { ServiceContext, Session } from '@/services/context'

interface AppState {
  db: Database
  organization: Organization
  demoState: DemoState
  ctx: ServiceContext
  session: Session
  role: Role
  demoDate: IsoDate
  activeVendorId: UUID | null
  /** Bumped after every mutation so queries re-read from storage. */
  version: number
  refresh: () => void
  setRole: (role: Role, vendorId?: UUID | null) => Promise<void>
  setActiveVendor: (vendorId: UUID | null) => Promise<void>
  setDemoDate: (date: IsoDate) => Promise<void>
  resetDemo: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}

const INTERNAL_USERS: Record<Exclude<Role, 'vendor_contact'>, { id: UUID; label: string }> = {
  admin: { id: ADMIN_USER_ID, label: 'Dana Whitfield' },
  coordinator: { id: COORDINATOR_USER_ID, label: 'Marcus Reyes' },
  reviewer: { id: REVIEWER_USER_ID, label: 'Priya Raman' },
}

async function buildSession(db: Database, role: Role, vendorId: UUID | null): Promise<Session> {
  if (role !== 'vendor_contact') {
    return { role, userId: INTERNAL_USERS[role].id, userLabel: INTERNAL_USERS[role].label, vendorId: null }
  }
  const resolved = await db.read(async (uow) => {
    if (!vendorId) return null
    const vendor = await uow.vendors.get(vendorId)
    if (!vendor) return null
    const memberships = await uow.vendorMemberships.where('by_vendor', vendorId)
    return { vendor, userId: memberships[0]?.user_id ?? `contact-${vendorId}` }
  })
  return {
    role,
    userId: resolved?.userId ?? 'unknown-vendor-contact',
    userLabel: resolved?.vendor.contact_name ?? 'Vendor contact',
    vendorId,
  }
}

interface BootState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  db: Database | null
  organization: Organization | null
  demoState: DemoState | null
  session: Session | null
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<BootState>({
    status: 'loading',
    error: null,
    db: null,
    organization: null,
    demoState: null,
    session: null,
  })
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    setBoot((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const db = await IndexedDbDatabase.open()
      await ensureSeeded(db)
      const [organization, demoState] = await Promise.all([
        getOrganization(db, ORGANIZATION_ID),
        getDemoState(db),
      ])
      if (!organization || !demoState) throw new Error('Demo data could not be loaded.')
      const session = await buildSession(db, demoState.role, demoState.active_vendor_id)
      setBoot({ status: 'ready', error: null, db, organization, demoState, session })
    } catch (error) {
      setBoot({
        status: 'error',
        error: errorMessage(error),
        db: null,
        organization: null,
        demoState: null,
        session: null,
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => setVersion((current) => current + 1), [])

  const reloadRecords = useCallback(
    async (db: Database) => {
      const [organization, demoState] = await Promise.all([
        getOrganization(db, ORGANIZATION_ID),
        getDemoState(db),
      ])
      if (!organization || !demoState) return
      const session = await buildSession(db, demoState.role, demoState.active_vendor_id)
      setBoot((current) => ({ ...current, organization, demoState, session }))
      refresh()
    },
    [refresh],
  )

  const value = useMemo<AppState | null>(() => {
    if (boot.status !== 'ready' || !boot.db || !boot.organization || !boot.demoState || !boot.session) {
      return null
    }
    const db = boot.db
    const organization = boot.organization
    const demoState = boot.demoState
    const session = boot.session
    const instant = demoState.clock_instant
    const clock: Clock = {
      now: () => new Date(instant),
      nowIso: () => new Date(instant).toISOString(),
    }
    const ctx: ServiceContext = {
      db,
      clock,
      session,
      organizationId: ORGANIZATION_ID,
      timezone: organization.timezone,
    }

    const persist = async (next: DemoState) => {
      await saveDemoState(db, next)
      await reloadRecords(db)
    }

    return {
      db,
      organization,
      demoState,
      ctx,
      session,
      role: demoState.role,
      demoDate: todayInTimeZone(new Date(instant), organization.timezone),
      activeVendorId: demoState.active_vendor_id,
      version,
      refresh: () => {
        void reloadRecords(db)
      },
      setRole: async (role, vendorId) => {
        await persist({
          ...demoState,
          role,
          active_user_id: role === 'vendor_contact' ? demoState.active_user_id : INTERNAL_USERS[role].id,
          active_vendor_id: vendorId !== undefined ? vendorId : demoState.active_vendor_id,
        })
      },
      setActiveVendor: async (vendorId) => {
        await persist({ ...demoState, active_vendor_id: vendorId })
      },
      setDemoDate: async (date) => {
        await persist({ ...demoState, clock_instant: instantForDemoDate(date) })
      },
      resetDemo: async () => {
        await resetDemoData(db)
        await reloadRecords(db)
      },
    }
  }, [boot, reloadRecords, version])

  if (boot.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground" role="status">
          Loading the Vendor Readiness demo…
        </p>
      </div>
    )
  }

  if (boot.status === 'error' || !value) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border border-destructive/30 bg-background p-6">
          <h1 className="text-lg font-semibold">Local demo storage is unavailable</h1>
          <p className="text-sm text-muted-foreground">{boot.error}</p>
          <p className="text-sm text-muted-foreground">
            This prototype stores records and documents in your browser with IndexedDB. Private
            browsing modes and blocked site data can prevent it from opening.
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export { INITIAL_DEMO_INSTANT }
