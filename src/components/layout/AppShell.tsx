import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  Activity,
  Bell,
  Building2,
  ClipboardList,
  FileBarChart,
  FileCheck2,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  MailWarning,
  Menu,
  Search,
  Settings,
  Users,
  X,
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
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ROLE_LABEL } from '@/domain/permissions'
import { vendorsLink } from '@/domain/vendorQuery'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badge?: 'review'
}

interface SoonItem {
  label: string
  icon: typeof LayoutDashboard
}

/**
 * Spec IA mapped onto existing routes. Properties / Reports stay “Soon”
 * until those backends exist. Requests is a real inbox backed by document_requests.
 */
const PRIMARY_NAV: NavItem[] = [
  { to: '/overview', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vendors', label: 'Vendors', icon: Users },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/review', label: 'Reviews', icon: FileCheck2, badge: 'review' },
  { to: '/requirements', label: 'Documents', icon: ClipboardList },
]

const RECORDS_NAV: NavItem[] = [
  { to: '/notifications', label: 'Notifications', icon: Mail },
  { to: '/activity', label: 'Activity', icon: Activity },
]

const SOON_NAV: SoonItem[] = [
  { label: 'Properties', icon: Building2 },
  { label: 'Reports', icon: FileBarChart },
]

const SETTINGS_NAV: NavItem[] = [{ to: '/settings', label: 'Settings', icon: Settings }]

const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/overview', title: 'Dashboard' },
  { prefix: '/vendors/new', title: 'Add vendor' },
  { prefix: '/vendors', title: 'Vendors' },
  { prefix: '/requests', title: 'Requests' },
  { prefix: '/review', title: 'Reviews' },
  { prefix: '/requirements', title: 'Documents' },
  { prefix: '/notifications', title: 'Notifications' },
  { prefix: '/activity', title: 'Activity' },
  { prefix: '/settings', title: 'Settings' },
]

const NOTICE_KEY = 'vr.deliveryNoticeDismissed'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Ready Dot mark — teal tile with a warm-white center. No shields or certificates. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground',
        className,
      )}
    >
      <span className="size-2.5 rounded-full bg-primary-foreground" />
    </span>
  )
}

function NavLinkRow({
  item,
  pendingCount,
  onNavigate,
}: {
  item: NavItem
  pendingCount: number | null
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors duration-(--duration-quick) ease-(--ease-soft)',
          isActive
            ? 'bg-[var(--tone-brand-surface)] text-[var(--tone-brand-foreground)]'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn('size-[18px] shrink-0', isActive ? undefined : 'opacity-80')}
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
  )
}

function SoonRow({ item }: { item: SoonItem }) {
  return (
    <span
      className="flex h-11 cursor-not-allowed items-center gap-3 rounded-xl px-4 text-sm font-medium text-muted-foreground/55"
      title="Coming soon"
      aria-disabled="true"
    >
      <item.icon aria-hidden="true" strokeWidth={1.75} className="size-[18px] shrink-0 opacity-70" />
      <span className="truncate">{item.label}</span>
      <span className="ml-auto text-[0.6875rem] font-semibold tracking-wide uppercase">Soon</span>
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
      <div>
        <p className="type-eyebrow px-4 pb-1.5">Workspace</p>
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <li key={item.to}>
              <NavLinkRow item={item} pendingCount={pendingCount} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="type-eyebrow px-4 pb-1.5">Records</p>
        <ul className="space-y-0.5">
          {RECORDS_NAV.map((item) => (
            <li key={item.to}>
              <NavLinkRow item={item} pendingCount={pendingCount} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="type-eyebrow px-4 pb-1.5">Coming later</p>
        <ul className="space-y-0.5">
          {SOON_NAV.map((item) => (
            <li key={item.label}>
              <SoonRow item={item} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <ul className="space-y-0.5">
          {SETTINGS_NAV.map((item) => (
            <li key={item.to}>
              <NavLinkRow item={item} pendingCount={pendingCount} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SidebarBrand({ orgName }: { orgName: string }) {
  return (
    <Link
      to="/overview"
      className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 transition-opacity hover:opacity-80"
    >
      <BrandMark />
      <span className="min-w-0">
        <span className="block truncate text-sm leading-tight font-semibold">Ready Vendors</span>
        <span className="block truncate text-xs leading-tight text-muted-foreground">{orgName}</span>
      </span>
    </Link>
  )
}

export function AppShell() {
  const app = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const queue = useServiceQuery(() => api.reviewQueue(), [])
  const [signingOut, setSigningOut] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  // Dismissing the delivery notice only hides the banner: the "Email paused" chip in the header
  // stays, so the condition is never silently forgotten, and a new session shows the banner again.
  const [noticeDismissed, setNoticeDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(NOTICE_KEY) === '1',
  )
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const pendingCount = queue.data?.total ?? null
  const pageTitle =
    PAGE_TITLES.find((entry) => location.pathname.startsWith(entry.prefix))?.title ?? 'Ready Vendors'

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
    document.title = `${pageTitle} · Ready Vendors`
  }, [pageTitle])

  const signOut = () => {
    setSigningOut(true)
    void app.signOut().finally(() => setSigningOut(false))
  }

  const dismissNotice = () => {
    setNoticeDismissed(true)
    sessionStorage.setItem(NOTICE_KEY, '1')
  }

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const q = searchDraft.trim()
    navigate(vendorsLink({ search: q || undefined }))
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar — 248px, light, persistent */}
      <aside
        className="sticky top-0 hidden h-dvh w-(--sidebar-width) shrink-0 flex-col border-r bg-card lg:flex"
        aria-label="Workspace"
      >
        <div className="flex h-(--header-height) items-center border-b px-5">
          <SidebarBrand orgName={app.organization.name} />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <NavItems pendingCount={pendingCount} />
        </nav>
        <div className="border-t px-5 py-4">
          <p className="truncate text-sm font-medium">{app.user.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABEL[app.role]} · {app.user.email}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — 68px, page title + search + actions */}
        <header className="sticky top-0 z-40 border-b bg-card">
          <div className="flex h-(--header-height) items-center gap-3 px-4 sm:gap-4 sm:px-6 xl:px-8">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100%,20rem)] gap-5">
                <SheetTitle className="pr-8">
                  <SidebarBrand orgName={app.organization.name} />
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    <LogOut aria-hidden="true" />
                    Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{pageTitle}</h1>
            </div>

            <form
              onSubmit={submitSearch}
              className="relative ml-auto hidden min-w-0 max-w-md flex-1 md:block"
              role="search"
            >
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search vendors…"
                aria-label="Search vendors"
                className="h-10 rounded-[10px] border-border bg-background pl-9 pr-3 shadow-none"
              />
            </form>

            <div className="flex items-center gap-1.5 sm:gap-2 md:ml-0">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Search vendors"
              >
                <Link to="/vendors">
                  <Search aria-hidden="true" />
                </Link>
              </Button>

              {app.delivery.configured ? null : (
                <Link
                  to="/notifications"
                  className="hidden sm:block"
                  title="Email delivery is not configured"
                >
                  <Chip tone="warn" icon={MailWarning} size="sm">
                    Email paused
                  </Chip>
                </Link>
              )}

              <Button asChild variant="ghost" size="icon" aria-label="Notifications">
                <Link to="/notifications">
                  <Bell aria-hidden="true" strokeWidth={1.75} />
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 gap-2 px-1.5" aria-label="Account menu">
                    <span
                      aria-hidden="true"
                      className="flex size-8 items-center justify-center rounded-full bg-[var(--tone-brand-surface)] text-[0.6875rem] font-semibold text-[var(--tone-brand-foreground)]"
                    >
                      {initials(app.user.display_name)}
                    </span>
                    <span className="hidden text-left leading-tight lg:block">
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

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none"
        >
          <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 xl:px-8 xl:py-10">
            {app.delivery.configured || noticeDismissed ? null : (
              <InlineNotice
                tone="warn"
                className="py-2"
                action={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Dismiss for this session"
                    onClick={dismissNotice}
                  >
                    <X aria-hidden="true" />
                  </Button>
                }
              >
                <span className="font-medium">Email delivery is not configured.</span> Invitations and
                reminders are saved as queued and nothing is sent.{' '}
                <Link to="/notifications">Open the notification log</Link>.
              </InlineNotice>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
