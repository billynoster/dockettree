import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Link } from 'react-router'
import { AppProvider } from '@/app/AppProvider'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { ActivityPage } from '@/features/activity/ActivityPage'
import { OutboxPage } from '@/features/outbox/OutboxPage'
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
      description="That route does not exist in this prototype."
      action={
        <Button asChild size="sm">
          <Link to="/overview">Go to the overview</Link>
        </Button>
      }
    />
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
        <Routes>
          <Route path="/portal/:vendorId" element={<PortalPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/vendors/new" element={<VendorNewPage />} />
            <Route path="/vendors/:vendorId" element={<VendorDetailPage />} />
            <Route path="/review" element={<ReviewQueuePage />} />
            <Route path="/review/:submissionId" element={<ReviewDetailPage />} />
            <Route path="/requirements" element={<RequirementsPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/demo/outbox" element={<OutboxPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <Toaster position="bottom-right" richColors closeButton />
      </AppProvider>
    </BrowserRouter>
  )
}
