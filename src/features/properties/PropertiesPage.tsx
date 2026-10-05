import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Archive, ArchiveRestore, Building2, Pencil, Plus, Users } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ScrollRegion } from '@/components/ScrollRegion'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Chip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usageMeterCopy } from '@/config/pricing'
import type { PropertyInput } from '@/domain/validation'
import { cn } from '@/lib/utils'
import type { PropertyListItem } from '@/services/propertyService'

const BLANK: PropertyInput = { name: '', address: '', notes: '' }

export function PropertiesPage() {
  const app = useApp()
  const list = useServiceQuery(() => api.listProperties(), [])
  const vendors = useServiceQuery(() => api.listVendors({ page: 1, pageSize: 200, lifecycle: 'all' }), [])
  const action = useAction()
  const canManage = app.can('vendor.manage')
  const canArchive = app.can('vendor.archive')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{
    id: string | null
    input: PropertyInput
    expectedVersion?: number
  } | null>(null)
  const [linking, setLinking] = useState<PropertyListItem | null>(null)
  const [linkDraft, setLinkDraft] = useState<string[]>([])
  const [showArchived, setShowArchived] = useState(false)

  const entries = useMemo(() => {
    const all = list.data?.properties ?? []
    return showArchived ? all : all.filter((entry) => entry.property.lifecycle === 'active')
  }, [list.data?.properties, showArchived])

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !entries.some((entry) => entry.property.id === selectedId)) {
      setSelectedId(entries[0]!.property.id)
    }
  }, [entries, selectedId])

  const selected = entries.find((entry) => entry.property.id === selectedId) ?? null
  const usage = list.data?.usage

  return (
    <Page density="workspace">
      <PageHeader
        compact
        title="Properties"
        description="Sites your vendors serve — used for filtering, readiness context, and plan scale"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setEditing({ id: null, input: { ...BLANK } })}>
              <Plus aria-hidden="true" />
              Add property
            </Button>
          ) : undefined
        }
      />

      {list.loading && !list.data ? <LoadingState label="Loading properties" /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}

      {usage?.nearLimit && !usage.atLimit ? (
        <InlineNotice tone="warn" title="Approaching property limit">
          {usageMeterCopy.properties.nearLimit}{' '}
          {usage.planLimit != null
            ? `Using ${usage.activeCount} of ${usage.planLimit} on your plan.`
            : null}{' '}
          <Link to="/settings?tab=billing">Review billing</Link>.
        </InlineNotice>
      ) : null}
      {usage?.atLimit ? (
        <InlineNotice tone="warn" title="At property limit">
          {usageMeterCopy.properties.atLimit}{' '}
          {usage.planLimit != null
            ? `Using ${usage.activeCount} of ${usage.planLimit}.`
            : null}{' '}
          Workflows stay open — <Link to="/settings?tab=billing">upgrade when you need more sites</Link>.
        </InlineNotice>
      ) : null}

      {list.data && list.data.properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Add the buildings or sites your vendors work at. You can link vendors now or later from a vendor’s details."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setEditing({ id: null, input: { ...BLANK } })}>
                <Plus aria-hidden="true" />
                Add property
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {list.data && list.data.properties.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {usage
                ? `${usage.activeCount} active${
                    usage.planLimit != null ? ` · plan allows ${usage.planLimit}` : ''
                  }`
                : null}
            </span>
            <label className="ml-auto flex items-center gap-2">
              <Checkbox
                checked={showArchived}
                onCheckedChange={(checked) => setShowArchived(checked === true)}
                id="show-archived-properties"
              />
              <Label htmlFor="show-archived-properties" className="font-normal">
                Show archived
              </Label>
            </label>
          </div>

          {entries.length === 0 ? (
            <EmptyState
              title="No active properties"
              description="Every property is archived. Restore one or turn on Show archived."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:items-start">
              <Section>
                <p className="type-eyebrow border-b px-3 py-2">Directory</p>
                <ScrollRegion size="panel" label="Property list">
                  <ul className="divide-y" role="listbox" aria-label="Properties">
                    {entries.map((entry) => {
                      const active = entry.property.id === selectedId
                      return (
                        <li key={entry.property.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={cn(
                              'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors',
                              active ? 'bg-accent' : 'hover:bg-muted/60',
                            )}
                            onClick={() => setSelectedId(entry.property.id)}
                          >
                            <span className="truncate text-sm font-medium">{entry.property.name}</span>
                            <span className="type-meta truncate">
                              {entry.vendorCount} vendor{entry.vendorCount === 1 ? '' : 's'}
                              {entry.property.lifecycle === 'archived' ? ' · archived' : ''}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </ScrollRegion>
              </Section>

              {selected ? (
                <Section className="min-w-0">
                  <div className="flex flex-col gap-4 p-3 sm:p-3.5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold tracking-tight break-words">
                            {selected.property.name}
                          </h2>
                          {selected.property.lifecycle === 'archived' ? (
                            <Chip tone="neutral">Archived</Chip>
                          ) : (
                            <Chip tone="ok">Active</Chip>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {selected.property.address || 'No street address on file'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {canManage && selected.property.lifecycle === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditing({
                                id: selected.property.id,
                                input: {
                                  name: selected.property.name,
                                  address: selected.property.address,
                                  notes: selected.property.notes,
                                },
                                expectedVersion: selected.property.record_version,
                              })
                            }
                          >
                            <Pencil aria-hidden="true" />
                            Edit
                          </Button>
                        ) : null}
                        {canManage && selected.property.lifecycle === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setLinking(selected)
                              setLinkDraft(selected.vendors.map((vendor) => vendor.id))
                            }}
                          >
                            <Users aria-hidden="true" />
                            Link vendors
                          </Button>
                        ) : null}
                        {canArchive && selected.property.lifecycle === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={action.pending}
                            onClick={() =>
                              void action.run(
                                () => api.setPropertyArchived(selected.property.id, true),
                                {
                                  success: `"${selected.property.name}" archived.`,
                                  onSuccess: () => void list.reload(),
                                },
                              )
                            }
                          >
                            <Archive aria-hidden="true" />
                            Archive
                          </Button>
                        ) : null}
                        {canManage && selected.property.lifecycle === 'archived' ? (
                          <Button
                            size="sm"
                            disabled={action.pending}
                            onClick={() =>
                              void action.run(
                                () => api.setPropertyArchived(selected.property.id, false),
                                {
                                  success: `"${selected.property.name}" restored.`,
                                  onSuccess: () => void list.reload(),
                                },
                              )
                            }
                          >
                            <ArchiveRestore aria-hidden="true" />
                            Restore
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {selected.property.notes ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {selected.property.notes}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No notes yet.</p>
                    )}

                    <div className="space-y-2">
                      <p className="type-eyebrow">Linked vendors</p>
                      {selected.vendors.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No vendors linked yet. Link vendors to filter readiness by site.
                        </p>
                      ) : (
                        <ul className="divide-y rounded-xl border">
                          {selected.vendors.map((vendor) => (
                            <li key={vendor.id}>
                              <Link
                                to={`/vendors/${vendor.id}`}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                              >
                                <span className="truncate font-medium">{vendor.company_name}</span>
                                {vendor.lifecycle === 'archived' ? (
                                  <Chip tone="neutral" size="sm">
                                    Archived
                                  </Chip>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </Section>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (!open ? setEditing(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit property' : 'Add property'}</DialogTitle>
            <DialogDescription>
              Properties are organization-wide sites. Requirements stay the same across every
              building.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void action.run(
                  async () => {
                    if (editing.id) {
                      await api.updateProperty(editing.id, {
                        ...editing.input,
                        expectedVersion: editing.expectedVersion ?? 1,
                      })
                    } else {
                      await api.createProperty(editing.input)
                    }
                  },
                  {
                    success: editing.id ? 'Property updated.' : 'Property added.',
                    onSuccess: () => {
                      setEditing(null)
                      void list.reload()
                      void vendors.reload()
                    },
                  },
                )
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="property-name">Name</Label>
                <Input
                  id="property-name"
                  value={editing.input.name}
                  onChange={(event) =>
                    setEditing({ ...editing, input: { ...editing.input, name: event.target.value } })
                  }
                  placeholder="Riverfront Offices"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="property-address">Address (optional)</Label>
                <Input
                  id="property-address"
                  value={editing.input.address}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      input: { ...editing.input, address: event.target.value },
                    })
                  }
                  placeholder="1200 Riverfront Ave"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="property-notes">Notes (optional)</Label>
                <Textarea
                  id="property-notes"
                  value={editing.input.notes}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      input: { ...editing.input, notes: event.target.value },
                    })
                  }
                  rows={3}
                  placeholder="Access notes, campus details, or who manages the site"
                />
              </div>
              {usage?.atLimit && !editing.id ? (
                <InlineNotice tone="warn">
                  You are at your plan’s property limit. You can still add sites in this build;
                  upgrade when enforcement lands.
                </InlineNotice>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={action.pending}>
                  <Building2 aria-hidden="true" />
                  {editing.id ? 'Save changes' : 'Add property'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linking)} onOpenChange={(open) => (!open ? setLinking(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link vendors to {linking?.property.name}</DialogTitle>
            <DialogDescription>
              Linked vendors keep this property as a tag for directory filters and reports.
            </DialogDescription>
          </DialogHeader>
          {vendors.loading && !vendors.data ? <LoadingState label="Loading vendors" rows={4} /> : null}
          {vendors.error ? <ErrorState message={vendors.error} onRetry={vendors.reload} /> : null}
          {vendors.data ? (
            <ScrollRegion size="panel" label="Vendors to link">
              <ul className="divide-y">
                {vendors.data.rows.map((row) => {
                  const checked = linkDraft.includes(row.vendor.id)
                  return (
                    <li key={row.vendor.id} className="flex items-center gap-3 px-1 py-2">
                      <Checkbox
                        id={`link-${row.vendor.id}`}
                        checked={checked}
                        onCheckedChange={(value) =>
                          setLinkDraft((prev) =>
                            value === true
                              ? [...prev, row.vendor.id]
                              : prev.filter((id) => id !== row.vendor.id),
                          )
                        }
                      />
                      <Label htmlFor={`link-${row.vendor.id}`} className="min-w-0 flex-1 font-normal">
                        <span className="block truncate font-medium">{row.vendor.company_name}</span>
                        <span className="type-meta">
                          {row.vendor.category}
                          {row.vendor.lifecycle === 'archived' ? ' · archived' : ''}
                        </span>
                      </Label>
                    </li>
                  )
                })}
              </ul>
            </ScrollRegion>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinking(null)}>
              Cancel
            </Button>
            <Button
              disabled={!linking || action.pending}
              onClick={() => {
                if (!linking) return
                void action.run(() => api.setPropertyVendors(linking.property.id, linkDraft), {
                  success: 'Vendor links updated.',
                  onSuccess: () => {
                    setLinking(null)
                    void list.reload()
                  },
                })
              }}
            >
              Save links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
