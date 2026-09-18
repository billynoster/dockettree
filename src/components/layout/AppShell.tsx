import { NavLink, Outlet } from 'react-router'
import { Activity, ClipboardList, FileCheck2, LayoutDashboard, Settings, Users } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ROLE_LABEL } from '@/domain/permissions'
import { listReviewQueue } from '@/services/reviewService'
import { cn } from '@/lib/utils'
import { DemoToolbar } from './DemoToolbar'

const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/vendors', label: 'Vendors', icon: Users },
  { to: '/review', label: 'Review queue', icon: FileCheck2, badge: 'review' as const },
  { to: '/requirements', label: 'Requirements', icon: ClipboardList },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const app = useApp()
  const queue = useServiceQuery((ctx) => listReviewQueue(ctx), [])
  const pendingCount = queue.data?.total ?? null

  return (
    <div className="min-h-dvh bg-muted">
      <DemoToolbar />
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold tracking-tight">Vendor Readiness</p>
            <p className="text-xs text-muted-foreground">{app.organization.name}</p>
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            Signed in as{' '}
            <span className="font-medium text-foreground">{app.session.userLabel}</span> ·{' '}
            {ROLE_LABEL[app.role]} <span className="text-amber-700">(simulated)</span>
            <br />
            Demo date {app.demoDate}
          </p>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 lg:flex-row">
        <nav aria-label="Main" className="lg:w-56 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground',
                    )
                  }
                >
                  <item.icon aria-hidden="true" className="size-4" />
                  {item.label}
                  {item.badge === 'review' && pendingCount ? (
                    <span className="ml-auto rounded-full bg-sky-100 px-1.5 text-xs font-semibold text-sky-800">
                      {pendingCount}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
