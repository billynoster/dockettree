import { api } from '@/api/client'
import type { SaveTemplateInput, TemplateItemInput } from '@/services/templateService'
import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ScrollRegion } from '@/components/ScrollRegion'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Chip, RequiredChip } from '@/components/StatusChips'
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
import { cn } from '@/lib/utils'

const BLANK_ITEM: TemplateItemInput = {
  title: '',
  instructions: '',
  required: true,
  expiration_required: false,
  collect_issue_date: false,
}

export function RequirementsPage() {
  const app = useApp()
  const templates = useServiceQuery(() => api.listTemplates(), [])
  const action = useAction()
  const [editing, setEditing] = useState<{ id: string | null; input: SaveTemplateInput } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [itemsOpen, setItemsOpen] = useState(true)

  const canManage = app.can('template.manage')
  const entries = templates.data ?? []

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !entries.some((entry) => entry.template.id === selectedId)) {
      setSelectedId(entries[0]!.template.id)
    }
  }, [entries, selectedId])

  const selected = entries.find((entry) => entry.template.id === selectedId) ?? null

  return (
    <Page density="workspace">
      <PageHeader
        compact
        title="Requirement templates"
        description="Assign a snapshot checklist · editing a template never changes vendors already assigned"
        actions={
          canManage ? (
            <Button
              size="sm"
              onClick={() =>
                setEditing({
                  id: null,
                  input: { name: '', description: '', items: [{ ...BLANK_ITEM }] },
                })
              }
            >
              <Plus aria-hidden="true" />
              New template
            </Button>
          ) : undefined
        }
      />

      {!canManage ? (
        <InlineNotice tone="neutral">
          Only an admin can create or edit templates. You can read every template below.
        </InlineNotice>
      ) : null}

      {templates.loading && !templates.data ? <LoadingState label="Loading templates" /> : null}
      {templates.error ? <ErrorState message={templates.error} onRetry={templates.reload} /> : null}

      {templates.data?.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a template so coordinators assign the same checklist every time instead of assembling it by hand."
          action={
            canManage ? (
              <Button
                size="sm"
                onClick={() =>
                  setEditing({
                    id: null,
                    input: { name: '', description: '', items: [{ ...BLANK_ITEM }] },
                  })
                }
              >
                <Plus aria-hidden="true" />
                New template
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {entries.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:items-start">
          <Section>
            <p className="type-eyebrow border-b px-3 py-2">Templates</p>
            <ScrollRegion size="panel" label="Template list">
              <ul className="divide-y" role="listbox" aria-label="Requirement templates">
                {entries.map((entry) => {
                  const active = entry.template.id === selectedId
                  return (
                    <li key={entry.template.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={cn(
                          'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-accent' : 'hover:bg-muted/60',
                        )}
                        onClick={() => {
                          setSelectedId(entry.template.id)
                          setItemsOpen(true)
                        }}
                      >
                        <span className="truncate text-sm font-medium">{entry.template.name}</span>
                        <span className="type-meta truncate">
                          v{entry.template.version} · {entry.items.length} items ·{' '}
                          {entry.assignedVendorCount} vendors
                          {entry.template.archived_at ? ' · archived' : ''}
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
              <div className="flex flex-col gap-3 p-3 sm:p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="type-title">{selected.template.name}</h2>
                      <Chip tone="neutral" size="sm">
                        Version {selected.template.version}
                      </Chip>
                      {selected.template.archived_at ? (
                        <Chip tone="warn" size="sm">
                          Archived
                        </Chip>
                      ) : null}
                    </div>
                    <p className="type-meta line-clamp-2">{selected.template.description}</p>
                    <p className="type-meta">
                      {selected.items.length} item{selected.items.length === 1 ? '' : 's'} ·{' '}
                      {selected.requiredCount} required · {selected.optionalCount} optional ·{' '}
                      {selected.assignedVendorCount} vendor
                      {selected.assignedVendorCount === 1 ? '' : 's'} hold a snapshot
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            id: selected.template.id,
                            input: {
                              name: selected.template.name,
                              description: selected.template.description,
                              items: selected.items.map((item) => ({
                                id: item.id,
                                title: item.title,
                                instructions: item.instructions,
                                required: item.required,
                                expiration_required: item.expiration_required,
                                collect_issue_date: item.collect_issue_date,
                              })),
                            },
                          })
                        }
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(
                            () =>
                              api.setTemplateArchived(
                                selected.template.id,
                                !selected.template.archived_at,
                              ),
                            {
                              success: selected.template.archived_at
                                ? `Restored ${selected.template.name}.`
                                : `Archived ${selected.template.name}. Existing vendor assignments are unchanged.`,
                            },
                          )
                        }
                      >
                        {selected.template.archived_at ? (
                          <>
                            <ArchiveRestore aria-hidden="true" />
                            Restore
                          </>
                        ) : (
                          <>
                            <Archive aria-hidden="true" />
                            Archive
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    aria-expanded={itemsOpen}
                    onClick={() => setItemsOpen((open) => !open)}
                  >
                    <span className="type-subtitle">Checklist items</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        itemsOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  {itemsOpen ? (
                    <ScrollRegion size="panel" label="Checklist items" className="border-t">
                      <ul className="divide-y">
                        {selected.items.map((item) => (
                          <li key={item.id} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{item.title}</p>
                              <RequiredChip required={item.required} />
                              <span className="text-xs text-muted-foreground">
                                {item.expiration_required ? 'Expiration required' : 'No expiration'}
                                {item.collect_issue_date ? ' · issue date collected' : ''}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {item.instructions}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </ScrollRegion>
                  ) : null}
                </div>
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <TemplateEditorDialog
          state={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const result = await action.run(
              () =>
                editing.id
                  ? api.updateTemplate(editing.id, input)
                  : api.createTemplate(input).then(() => undefined),
              {
                success: editing.id
                  ? 'Template updated. Existing vendor assignments keep their snapshot.'
                  : 'Template created.',
              },
            )
            return result !== undefined
          }}
          pending={action.pending}
          fieldErrors={action.fieldErrors}
        />
      ) : null}
    </Page>
  )
}

function TemplateEditorDialog({
  state,
  onClose,
  onSave,
  pending,
  fieldErrors,
}: {
  state: { id: string | null; input: SaveTemplateInput }
  onClose: () => void
  onSave: (input: SaveTemplateInput) => Promise<boolean>
  pending: boolean
  fieldErrors: Record<string, string>
}) {
  const [input, setInput] = useState<SaveTemplateInput>(state.input)

  const updateItem = (index: number, patch: Partial<TemplateItemInput>) => {
    setInput({
      ...input,
      items: input.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{state.id ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            Saving an edit creates a new template version. Vendors who already hold a snapshot keep
            their current requirements.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={input.name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setInput({ ...input, name: event.target.value })}
            />
            {fieldErrors.name ? (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              rows={2}
              value={input.description}
              onChange={(event) => setInput({ ...input, description: event.target.value })}
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Requirements</legend>
            {fieldErrors.items ? (
              <p className="text-sm text-destructive">{fieldErrors.items}</p>
            ) : null}
            {input.items.map((item, index) => (
              <div key={index} className="space-y-3 rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`item-title-${index}`}>Title</Label>
                    <Input
                      id={`item-title-${index}`}
                      value={item.title}
                      aria-invalid={Boolean(fieldErrors[`items.${index}.title`])}
                      onChange={(event) => updateItem(index, { title: event.target.value })}
                    />
                    {fieldErrors[`items.${index}.title`] ? (
                      <p className="text-sm text-destructive">
                        {fieldErrors[`items.${index}.title`]}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove requirement ${index + 1}`}
                    onClick={() =>
                      setInput({
                        ...input,
                        items: input.items.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`item-instructions-${index}`}>
                    Plain-language instructions for the vendor
                  </Label>
                  <Textarea
                    id={`item-instructions-${index}`}
                    rows={3}
                    value={item.instructions}
                    aria-invalid={Boolean(fieldErrors[`items.${index}.instructions`])}
                    onChange={(event) => updateItem(index, { instructions: event.target.value })}
                  />
                  {fieldErrors[`items.${index}.instructions`] ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors[`items.${index}.instructions`]}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`item-required-${index}`}
                      checked={item.required}
                      onCheckedChange={(checked) => updateItem(index, { required: checked === true })}
                    />
                    <Label htmlFor={`item-required-${index}`} className="font-normal">
                      Required for readiness
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`item-expiration-${index}`}
                      checked={item.expiration_required}
                      onCheckedChange={(checked) =>
                        updateItem(index, { expiration_required: checked === true })
                      }
                    />
                    <Label htmlFor={`item-expiration-${index}`} className="font-normal">
                      Expiration date required
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`item-issue-${index}`}
                      checked={item.collect_issue_date}
                      onCheckedChange={(checked) =>
                        updateItem(index, { collect_issue_date: checked === true })
                      }
                    />
                    <Label htmlFor={`item-issue-${index}`} className="font-normal">
                      Collect issue date
                    </Label>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInput({ ...input, items: [...input.items, { ...BLANK_ITEM }] })}
            >
              <Plus aria-hidden="true" />
              Add requirement
            </Button>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={async () => {
              const saved = await onSave(input)
              if (saved) onClose()
            }}
          >
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
