import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import {
  Activity,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Mail,
  MailWarning,
  Menu,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Chip } from '@/components/StatusChips'
import { InlineNotice } from '@/components/States'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ROLE_LABEL } from '@/domain/permissions'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badge?: 'review'
}

/**
 * Navigation is grouped by what the item is for: the daily queue, the append-only records, and
 * the things you configure once. Seven flat links read as an undifferentiated list; three short
 * groups let someone find "Requirements" without reading every label.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutDashboard },
      { to: '/vendors', label: 'Vendors', icon: Users },
      { to: '/review', label: 'Review queue', icon: FileCheck2, badge: 'review' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Mail },
      { to: '/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/requirements', label: 'Requirements', icon: ClipboardList },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/overview', title: 'Overview' },
  { prefix: '/vendors/new', title: 'Add vendor' },
  { prefix: '/vendors', title: 'Vendors' },
  { prefix: '/review', title: 'Review queue' },
  { prefix: '/requirements', title: 'Requirement templates' },
  { prefix: '/notifications', title: 'Notifications' },
  { prefix: '/activity', title: 'Activity' },
  { prefix: '/settings', title: 'Settings' },
]

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-surface',
        className,
      )}
    >
      <ShieldCheck className="size-[1.125rem]" />
    </span>
  )
}

function NavItems({
  pendingCount,
  onNavigate,
}: {
  pendingCount: number | null
  onNavigate?: () => void
}) {
  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'tone-brand before:absolute before:top-1.5 before:bottom-1.5 before:-left-px before:w-0.5 before:rounded-full before:bg-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        aria-hidden="true"
                        className={cn('size-4 shrink-0', isActive ? undefined : 'opacity-80')}
                      />
                      <span className="truncate">{item.label}</span>
                      {item.badge === 'review' && pendingCount ? (
                        <span
                          className="ml-auto rounded-full bg-primary px-1.5 py-px text-[0.6875rem] font-semibold text-primary-foreground tabular-nums"
                          aria-label={`${pendingCount} pending`}
                        >
                          {pendingCount}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function AppShell() {
  const app = useApp()
  const location = useLocation()
  const queue = useServiceQuery(() => api.reviewQueue(), [])
  const [signingOut, setSigningOut] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const pendingCount = queue.data?.total ?? null
  const pageTitle =
    PAGE_TITLES.find((entry) => location.pathname.startsWith(entry.prefix))?.title ?? 'Vendor Readiness'

  // Moving focus to the content region on navigation means keyboard and screen-reader users start
  // at the new page instead of back at the top of the navigation they just used.
  useEffect(() => {
    setNavOpen(false)
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    document.title = `${pageTitle} · Vendor Readiness`
  }, [pageTitle])

  const signOut = () => {
    setSigningOut(true)
    void app.signOut().finally(() => setSigningOut(false))
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-backdrop-filter:bg-card/75">
        <div className="mx-auto flex h-(--header-height) max-w-[1600px] items-center gap-3 px-4">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="gap-5">
              <SheetTitle className="flex items-center gap-2.5 pr-8">
                <BrandMark />
                <span className="min-w-0">
                  <span className="block truncate text-sm leading-tight font-semibold">
                    Vendor Readiness
                  </span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {app.organization.name}
                  </span>
                </span>
              </SheetTitle>
              <nav aria-label="Main" className="-mx-1 flex-1 overflow-y-auto px-1">
                <NavItems pendingCount={pendingCount} onNavigate={() => setNavOpen(false)} />
              </nav>
              <div className="space-y-3 border-t pt-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{app.user.display_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ROLE_LABEL[app.role]} · {app.user.email}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="w-full" disabled={signingOut} onClick={signOut}>
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to="/overview"
            className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 transition-opacity hover:opacity-80"
          >
            <BrandMark />
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-semibold">
                Vendor Readiness
              </span>
              <span className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">
                {app.organization.name}
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {app.delivery.configured ? null : (
              <Link to="/notifications" className="hidden sm:block" title="Email delivery is not configured">
                <Chip tone="warn" icon={MailWarning} size="sm">
                  Email paused
                </Chip>
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu">
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-semibold text-accent-foreground"
                  >
                    {initials(app.user.display_name)}
                  </span>
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-[10rem] truncate text-[0.8125rem] font-medium">
                      {app.user.display_name}
                    </span>
                    <span className="block text-[0.6875rem] font-normal text-muted-foreground">
                      {ROLE_LABEL[app.role]}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{app.user.display_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{app.user.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ROLE_LABEL[app.role]} at {app.organization.name}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings aria-hidden="true" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={signingOut} onSelect={signOut}>
                  <LogOut aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-8 px-4 py-6 lg:py-8">
        <nav
          aria-label="Main"
          className="sticky top-[calc(var(--header-height)+1.5rem)] hidden h-fit w-52 shrink-0 lg:block"
        >
          <NavItems pendingCount={pendingCount} />
        </nav>

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 space-y-5 outline-none lg:space-y-6"
        >
          {app.delivery.configured ? null : (
            <InlineNotice tone="warn" title="Email delivery is not configured on this server">
              Invitations and reminders are saved and shown as queued, and no message is sent.{' '}
              <Link to="/notifications">Open the notification log</Link> to read the exact content.
            </InlineNotice>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
