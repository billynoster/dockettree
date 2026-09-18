/**
 * Demo tools. Everything here is simulation: the role selector is not an authorization
 * mechanism, the date control replaces server time, and no email is ever sent.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, FlaskConical, RotateCcw, UserCog } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { addDays } from '@/domain/dates'
import { ROLE_LABEL } from '@/domain/permissions'
import type { Role } from '@/domain/types'
import { listVendors } from '@/services/vendorService'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

const ROLES: Role[] = ['admin', 'coordinator', 'reviewer', 'vendor_contact']

export function DemoToolbar() {
  const app = useApp()
  const [resetting, setResetting] = useState(false)
  const vendors = useServiceQuery(
    (ctx) => listVendors(ctx, { lifecycle: 'all', pageSize: 200, sort: 'name' }),
    [],
  )

  const vendorOptions = vendors.data?.rows ?? []
  const activeVendorId = app.activeVendorId ?? vendorOptions[0]?.vendor.id ?? ''

  return (
    <div
      className="border-b border-amber-300 bg-amber-50 text-amber-950"
      role="region"
      aria-label="Demo tools"
    >
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-start gap-2 text-xs leading-5 sm:text-sm">
          <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Demo prototype.</strong> Roles, portal links, dates and
            email are simulated. Records live only in this browser. This is not a secure production
            service.
          </span>
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="demo-role" className="text-xs font-medium">
                <UserCog aria-hidden="true" className="size-3.5" />
                Demo role
              </Label>
              <Select
                value={app.role}
                onValueChange={(value) => {
                  const role = value as Role
                  void app.setRole(role, role === 'vendor_contact' ? activeVendorId : undefined)
                }}
              >
                <SelectTrigger id="demo-role" className="h-8 w-[190px] bg-background text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {app.role === 'vendor_contact' ? (
              <div className="space-y-1">
                <Label htmlFor="demo-vendor" className="text-xs font-medium">
                  Vendor context
                </Label>
                <Select
                  value={activeVendorId}
                  onValueChange={(value) => void app.setActiveVendor(value)}
                >
                  <SelectTrigger id="demo-vendor" className="h-8 w-[230px] bg-background text-sm">
                    <SelectValue placeholder="Choose a vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorOptions.map((row) => (
                      <SelectItem key={row.vendor.id} value={row.vendor.id}>
                        {row.vendor.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="demo-date" className="text-xs font-medium">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Demo date ({app.organization.timezone})
            </Label>
            <div className="flex items-center gap-1.5">
              <input
                id="demo-date"
                type="date"
                value={app.demoDate}
                onChange={(event) => {
                  if (event.target.value) void app.setDemoDate(event.target.value)
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="bg-background"
                onClick={() => void app.setDemoDate(addDays(app.demoDate, 7))}
              >
                +7d
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-background"
                onClick={() => void app.setDemoDate(addDays(app.demoDate, 30))}
              >
                +30d
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="bg-background">
              <Link to="/demo/outbox">Simulated outbox</Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-background">
                  <RotateCcw aria-hidden="true" />
                  Reset demo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset the demonstration?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes every demo record, uploaded document and outbox entry in this
                    browser, then restores the seeded vendors and the demo date 2026-09-17. Work you
                    did during the demo cannot be recovered.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my demo data</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={resetting}
                    onClick={async () => {
                      setResetting(true)
                      try {
                        await app.resetDemo()
                        toast.success('Demo data reset. Seeded vendors and 2026-09-17 restored.')
                      } catch {
                        toast.error('The reset failed. Local storage may be unavailable.')
                      } finally {
                        setResetting(false)
                      }
                    }}
                  >
                    Reset demo data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  )
}
