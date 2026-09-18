import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/States'
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
import { can } from '@/domain/permissions'
import {
  createTemplate,
  listTemplates,
  setTemplateArchived,
  updateTemplate,
  type SaveTemplateInput,
  type TemplateItemInput,
} from '@/services/templateService'

const BLANK_ITEM: TemplateItemInput = {
  title: '',
  instructions: '',
  required: true,
  expiration_required: false,
  collect_issue_date: false,
}

export function RequirementsPage() {
  const app = useApp()
  const templates = useServiceQuery((ctx) => listTemplates(ctx), [])
  const action = useAction()
  const [editing, setEditing] = useState<{ id: string | null; input: SaveTemplateInput } | null>(null)

  const canManage = can(app.role, 'template.manage')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Requirement templates"
        description="Templates define the checklist you assign to vendors. Assignments are snapshots, so editing a template never changes a vendor's existing requirements."
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
        <AccessDeniedState message="Only an admin can create or edit templates. You can still read them below." />
      ) : null}

      {templates.loading && !templates.data ? <LoadingState label="Loading templates" /> : null}
      {templates.error ? <ErrorState message={templates.error} onRetry={templates.reload} /> : null}

      {templates.data?.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a template so coordinators can assign a consistent checklist."
        />
      ) : null}

      <ul className="space-y-3">
        {(templates.data ?? []).map((entry) => (
          <li key={entry.template.id} className="rounded-lg border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{entry.template.name}</h2>
                  <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                    Version {entry.template.version}
                  </span>
                  {entry.template.archived_at ? (
                    <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                      Archived
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{entry.template.description}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.items.length} item{entry.items.length === 1 ? '' : 's'} ·{' '}
                  {entry.requiredCount} required · {entry.optionalCount} optional ·{' '}
                  {entry.assignedVendorCount} vendor
                  {entry.assignedVendorCount === 1 ? '' : 's'} hold a snapshot
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({
                        id: entry.template.id,
                        input: {
                          name: entry.template.name,
                          description: entry.template.description,
                          items: entry.items.map((item) => ({
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
                        (ctx) =>
                          setTemplateArchived(ctx, entry.template.id, !entry.template.archived_at),
                        {
                          success: entry.template.archived_at
                            ? `Restored ${entry.template.name}.`
                            : `Archived ${entry.template.name}. Existing vendor assignments are unchanged.`,
                        },
                      )
                    }
                  >
                    {entry.template.archived_at ? (
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

            <ul className="mt-3 divide-y rounded-md border">
              {entry.items.map((item) => (
                <li key={item.id} className="px-3 py-2">
                  <p className="text-sm font-medium">
                    {item.title}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {item.required ? 'Required' : 'Optional'}
                      {item.expiration_required ? ' · expiration required' : ' · no expiration'}
                      {item.collect_issue_date ? ' · issue date collected' : ''}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{item.instructions}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {editing ? (
        <TemplateEditorDialog
          state={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const result = await action.run(
              (ctx) =>
                editing.id
                  ? updateTemplate(ctx, editing.id, input)
                  : createTemplate(ctx, input).then(() => undefined),
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
    </div>
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
