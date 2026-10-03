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
  PanelLeftClose,
  PanelLeftOpen,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
const SIDEBAR_COLLAPSED_KEY = 'dt.sidebarCollapsed'

function readSidebarCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode / quota — preference is best-effort */
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** DT mark — evergreen tile with a simple tree canopy + trunk. No shields or certificates. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="5.5" r="3.25" />
        <rect x="7.15" y="8.5" width="1.7" height="4.25" rx="0.6" />
      </svg>
    </span>
  )
}

function NavTooltip({
  label,
  enabled,
  children,
}: {
  label: string
  enabled: boolean
  children: React.ReactElement
}) {
  if (!enabled) return children
  // Wrap in a block span so Radix Slot does not merge onto NavLink.
  // NavLink's function `className` breaks when Slot replaces it with a string merge.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function NavLinkRow({
  item,
  pendingCount,
  onNavigate,
  collapsed = false,
}: {
  item: NavItem
  pendingCount: number | null
  onNavigate?: () => void
  collapsed?: boolean
}) {
  return (
    <NavTooltip label={item.label} enabled={collapsed}>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            'relative flex h-11 items-center rounded-xl text-sm font-medium transition-colors duration-(--duration-quick) ease-(--ease-soft)',
            collapsed ? 'w-full justify-center px-0' : 'gap-3 px-4',
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
            {collapsed && item.badge === 'review' && pendingCount ? (
              <span
                className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[0.5625rem] leading-none font-semibold text-primary-foreground tabular-nums"
                aria-label={`${pendingCount} pending`}
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            ) : null}
            {collapsed ? (
              <span className="sr-only">{item.label}</span>
            ) : (
              <>
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
          </>
        )}
      </NavLink>
    </NavTooltip>
  )
}

function SoonRow({ item, collapsed = false }: { item: SoonItem; collapsed?: boolean }) {
  return (
    <NavTooltip label={`${item.label} (Soon)`} enabled={collapsed}>
      <span
        className={cn(
          'flex h-11 cursor-not-allowed items-center rounded-xl text-sm font-medium text-muted-foreground/55',
          collapsed ? 'w-full justify-center px-0' : 'gap-3 px-4',
        )}
        title={collapsed ? `${item.label} — Coming soon` : 'Coming soon'}
        aria-disabled="true"
      >
        <item.icon aria-hidden="true" strokeWidth={1.75} className="size-[18px] shrink-0 opacity-70" />
        {collapsed ? (
          <span className="sr-only">{item.label} (Soon)</span>
        ) : (
          <>
            <span className="truncate">{item.label}</span>
            <span className="ml-auto text-[0.6875rem] font-semibold tracking-wide uppercase">Soon</span>
          </>
        )}
      </span>
    </NavTooltip>
  )
}

function NavSection({
  label,
  collapsed,
  showDivider,
  children,
}: {
  label?: string
  collapsed: boolean
  showDivider?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        collapsed && showDivider && 'border-t border-border/70 pt-2',
      )}
    >
      {collapsed || !label ? null : <p className="type-eyebrow px-4 pb-1.5">{label}</p>}
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  )
}

function NavItems({
  pendingCount,
  onNavigate,
  collapsed = false,
}: {
  pendingCount: number | null
  onNavigate?: () => void
  collapsed?: boolean
}) {
  return (
    <div className={cn('flex flex-col', collapsed ? 'gap-2' : 'gap-5')}>
      <NavSection label="Workspace" collapsed={collapsed}>
        {PRIMARY_NAV.map((item) => (
          <li key={item.to}>
            <NavLinkRow
              item={item}
              pendingCount={pendingCount}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          </li>
        ))}
      </NavSection>
      <NavSection label="Records" collapsed={collapsed} showDivider={collapsed}>
        {RECORDS_NAV.map((item) => (
          <li key={item.to}>
            <NavLinkRow
              item={item}
              pendingCount={pendingCount}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          </li>
        ))}
      </NavSection>
      <NavSection label="Coming later" collapsed={collapsed} showDivider={collapsed}>
        {SOON_NAV.map((item) => (
          <li key={item.label}>
            <SoonRow item={item} collapsed={collapsed} />
          </li>
        ))}
      </NavSection>
      <NavSection collapsed={collapsed} showDivider={collapsed}>
        {SETTINGS_NAV.map((item) => (
          <li key={item.to}>
            <NavLinkRow
              item={item}
              pendingCount={pendingCount}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          </li>
        ))}
      </NavSection>
    </div>
  )
}

function SidebarBrand({
  orgName,
  collapsed = false,
}: {
  orgName: string
  collapsed?: boolean
}) {
  const link = (
    <Link
      to="/overview"
      className={cn(
        'flex min-w-0 items-center rounded-xl py-1 transition-opacity hover:opacity-80',
        collapsed ? 'justify-center px-0' : 'gap-3 px-1',
      )}
      aria-label={collapsed ? 'Docket Tree home' : undefined}
    >
      <BrandMark />
      {collapsed ? null : (
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-semibold">Docket Tree</span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">{orgName}</span>
        </span>
      )}
    </Link>
  )

  return (
    <NavTooltip label="Docket Tree" enabled={collapsed}>
      {link}
    </NavTooltip>
  )
}

function SidebarCollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const shortLabel = collapsed ? 'Expand' : 'Collapse'
  const accessibleName = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  // Open icon when rail is closed (action = expand); close icon when expanded.
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <NavTooltip label={shortLabel} enabled>
      <button
        type="button"
        className={cn(
          'flex h-11 items-center rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-(--duration-quick) ease-(--ease-soft)',
          'hover:bg-[var(--tone-brand-surface)] hover:text-[var(--tone-brand-foreground)]',
          'focus-visible:bg-[var(--tone-brand-surface)] focus-visible:text-[var(--tone-brand-foreground)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
          'active:bg-[var(--tone-brand-surface)] active:text-[var(--tone-brand-foreground)]',
          collapsed ? 'w-full justify-center px-0' : 'w-full gap-3 px-4',
        )}
        aria-label={accessibleName}
        aria-expanded={!collapsed}
        aria-controls="desktop-sidebar"
        onClick={onToggle}
      >
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-[18px] shrink-0" />
        {collapsed ? null : <span>{shortLabel}</span>}
      </button>
    </NavTooltip>
  )
}

export function AppShell() {
  const app = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const queue = useServiceQuery(() => api.reviewQueue(), [])
  const [signingOut, setSigningOut] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
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
    PAGE_TITLES.find((entry) => location.pathname.startsWith(entry.prefix))?.title ?? 'Docket Tree'

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
    document.title = `${pageTitle} · Docket Tree`
  }, [pageTitle])

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      writeSidebarCollapsed(next)
      return next
    })
  }

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
      {/* Desktop sidebar — expanded ~248px, collapsed icon rail ~68px */}
      <TooltipProvider delayDuration={200}>
        <aside
          id="desktop-sidebar"
          data-collapsed={sidebarCollapsed ? 'true' : 'false'}
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 flex-col overflow-x-hidden border-r bg-card transition-[width] duration-(--duration-settle) ease-(--ease-soft) lg:flex',
            sidebarCollapsed
              ? 'w-(--sidebar-width-collapsed) min-w-(--sidebar-width-collapsed)'
              : 'w-(--sidebar-width) min-w-(--sidebar-width)',
          )}
          aria-label="Workspace"
        >
          <div
            className={cn(
              'flex h-(--header-height) items-center border-b',
              sidebarCollapsed ? 'justify-center px-2' : 'px-5',
            )}
          >
            <SidebarBrand orgName={app.organization.name} collapsed={sidebarCollapsed} />
          </div>
          <nav
            aria-label="Main"
            className={cn(
              'flex-1 overflow-y-auto py-4',
              sidebarCollapsed ? 'px-2' : 'px-3',
            )}
          >
            <NavItems pendingCount={pendingCount} collapsed={sidebarCollapsed} />
          </nav>
          <div
            className={cn(
              'border-t',
              sidebarCollapsed
                ? 'flex flex-col items-stretch gap-1 px-2 py-2.5'
                : 'flex flex-col gap-1.5 px-3 py-3',
            )}
          >
            <SidebarCollapseToggle collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
            {sidebarCollapsed ? (
              <NavTooltip label={`${app.user.display_name} · ${ROLE_LABEL[app.role]}`} enabled>
                <div
                  className="mx-auto flex size-9 items-center justify-center rounded-full bg-[var(--tone-brand-surface)] text-[0.6875rem] font-semibold text-[var(--tone-brand-foreground)]"
                  aria-label={`${app.user.display_name}, ${ROLE_LABEL[app.role]}`}
                >
                  {initials(app.user.display_name)}
                </div>
              </NavTooltip>
            ) : (
              <div className="px-2 py-1">
                <p className="truncate text-sm font-medium">{app.user.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[app.role]} · {app.user.email}
                </p>
              </div>
            )}
          </div>
        </aside>
      </TooltipProvider>

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
