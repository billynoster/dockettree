import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { AppProvider, useApp, useSession } from '@/app/AppProvider'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'
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
      description="That route does not exist."
      action={
        <Button asChild size="sm">
          <Link to="/overview">Go to the overview</Link>
        </Button>
      }
    />
  )
}

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <p className="text-sm text-muted-foreground" role="status">
        Loading Vendor Readiness…
      </p>
    </div>
  )
}

function ServerUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-lg border border-destructive/30 bg-background p-6">
        <h1 className="text-lg font-semibold">The server is not reachable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          Vendor Readiness keeps every record on its own server. Check that the API process is
          running, then try again.
        </p>
        <Button size="sm" onClick={onRetry}>
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

  if (location.pathname === '/invitations/accept') {
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
        <Route path="/login" element={<Navigate to="/overview" replace />} />
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
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to main content
        </a>
        <AppRoutes />
        <Toaster position="bottom-right" richColors closeButton />
      </AppProvider>
    </BrowserRouter>
  )
}
