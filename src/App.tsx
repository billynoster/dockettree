import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { RotateCcw, ServerCrash } from 'lucide-react'
import { AppProvider, useApp, useSession } from '@/app/AppProvider'
import { AppShell, BrandMark } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { ActivityPage } from '@/features/activity/ActivityPage'
import { AcceptInvitationPage } from '@/features/auth/AcceptInvitationPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SetupPage } from '@/features/auth/SetupPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { PortalPage } from '@/features/portal/PortalPage'
import { RequirementsPage } from '@/features/requirements/RequirementsPage'
import { ReviewDetailPage } from '@/features/review/ReviewDetailPage'
import { ReviewQueuePage } from '@/features/review/ReviewQueuePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { VendorDetailPage } from '@/features/vendors/VendorDetailPage'
import { VendorNewPage } from '@/features/vendors/VendorNewPage'
import { VendorsPage } from '@/features/vendors/VendorsPage'

function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="That address does not match any screen in Ready Vendors. It may have been renamed, or the record may have been archived."
      action={
        <Button asChild size="sm">
          <Link to="/overview">Go to the overview</Link>
        </Button>
      }
    />
  )
}

/**
 * First paint, before the server has answered who is signed in. It draws the chrome it is about
 * to fill rather than a spinner, so the page does not visibly rearrange once the session lands.
 */
function Loading() {
  return (
    <div className="flex min-h-dvh">
      <p className="sr-only" role="status">
        Loading Ready Vendors…
      </p>
      <aside className="hidden h-dvh w-(--sidebar-width) shrink-0 border-r bg-card lg:block" aria-hidden="true">
        <div className="flex h-(--header-height) items-center gap-2.5 border-b px-5">
          <BrandMark />
          <span className="text-sm font-semibold">Ready Vendors</span>
        </div>
        <div className="space-y-2 px-5 py-4">
          {[64, 48, 72, 56, 44].map((width, index) => (
            <Skeleton key={index} className="h-10" style={{ width: `${width}%` }} />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-(--header-height) items-center border-b bg-card px-6">
          <Skeleton className="h-6 w-40" />
        </header>
        <div className="mx-auto max-w-[1600px] space-y-4 px-8 py-8" aria-hidden="true">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
          <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

function ServerUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="surface w-full max-w-md space-y-4 p-6" role="alert">
        <span className="tone-danger flex size-10 items-center justify-center rounded-full border">
          <ServerCrash aria-hidden="true" className="size-5" />
        </span>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">The server is not reachable</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">
            Ready Vendors keeps every record on its own server, so nothing is shown until that
            server answers. Check that the API process is running, then try again.
          </p>
        </div>
        <Button size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  )
}

/**
 * Routing gate. The server is the authority on the session; this only decides which shell to
 * render so an unauthenticated visitor never sees an empty operations screen.
 */
function AppRoutes() {
  const { state, reload } = useSession()
  const location = useLocation()

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error' || !state.info) {
    return <ServerUnavailable message={state.error ?? 'Unknown error.'} onRetry={() => void reload()} />
  }

  const info = state.info

  // Invitation acceptance is reachable without a session; once it succeeds the normal routes
  // take over and send the new contact to their portal.
  if (location.pathname === '/invitations/accept' && !info.authenticated) {
    return (
      <Routes>
        <Route path="/invitations/accept" element={<AcceptInvitationPage />} />
      </Routes>
    )
  }

  if (info.setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  if (!info.authenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    )
  }

  if (info.role === 'vendor_contact') {
    return (
      <Routes>
        <Route path="/portal" element={<PortalPage />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    )
  }

  return <InternalRoutes />
}

function InternalRoutes() {
  const app = useApp()
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        {/* Signing in from one of the unauthenticated screens lands on the overview. */}
        <Route path="/login" element={<Navigate to="/overview" replace />} />
        <Route path="/setup" element={<Navigate to="/overview" replace />} />
        <Route path="/invitations/accept" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        {app.can('vendor.manage') ? <Route path="/vendors/new" element={<VendorNewPage />} /> : null}
        <Route path="/vendors/:vendorId" element={<VendorDetailPage />} />
        <Route path="/review" element={<ReviewQueuePage />} />
        <Route path="/review/:submissionId" element={<ReviewDetailPage />} />
        <Route path="/requirements" element={<RequirementsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:surface focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <AppRoutes />
        <Toaster position="bottom-right" richColors closeButton expand={false} gap={10} />
      </AppProvider>
    </BrowserRouter>
  )
}
