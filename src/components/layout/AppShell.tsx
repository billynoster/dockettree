import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import {
  Activity,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  Users,
} from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL } from '@/domain/permissions'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/vendors', label: 'Vendors', icon: Users },
  { to: '/review', label: 'Review queue', icon: FileCheck2, badge: 'review' as const },
  { to: '/requirements', label: 'Requirements', icon: ClipboardList },
  { to: '/notifications', label: 'Notifications', icon: Mail },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const app = useApp()
  const queue = useServiceQuery(() => api.reviewQueue(), [])
  const [signingOut, setSigningOut] = useState(false)
  const pendingCount = queue.data?.total ?? null

  return (
    <div className="min-h-dvh bg-muted">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold tracking-tight">
              <Link to="/overview">Vendor Readiness</Link>
            </p>
            <p className="text-xs text-muted-foreground">{app.organization.name}</p>
          </div>
          <div className="flex items-center gap-3 sm:justify-end">
            <p className="text-xs text-muted-foreground sm:text-right">
              <span className="font-medium text-foreground">{app.user.display_name}</span>
              <br />
              {ROLE_LABEL[app.role]} · {app.user.email}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true)
                void app.signOut().finally(() => setSigningOut(false))
              }}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {app.delivery.configured ? null : (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          Email delivery is not configured on this server. Invitations and reminders are saved
          and shown as queued, and no message is sent.{' '}
          <Link to="/notifications" className="underline">
            Open the notification log
          </Link>
          .
        </p>
      )}

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
