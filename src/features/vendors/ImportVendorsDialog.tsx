import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, type ImportValidation } from '@/domain/csv'
import { newId } from '@/domain/ids'
import { downloadText } from '@/lib/download'
import { importVendors, previewImport } from '@/services/importService'
import { listTemplates } from '@/services/templateService'

const SAMPLE_CSV = `${IMPORT_COLUMNS.join(',')}
Alder Court Cleaning,Cleaning,Ann Lee,ann.lee@example.com,Riverfront Offices;Westfield Plaza
Briar Path Snow Removal,Snow removal,Ben Ito,ben.ito@example.com,Maple Business Park
`

export function ImportVendorsDialog({ trigger }: { trigger: React.ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [filename, setFilename] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [templateId, setTemplateId] = useState('none')
  const [confirmDuplicates, setConfirmDuplicates] = useState(false)
  const [requestKey, setRequestKey] = useState(() => newId())
  const preview = useAction()
  const importAction = useAction()
  const templates = useServiceQuery((ctx) => listTemplates(ctx), [])

  const reset = () => {
    setFilename(null)
    setText('')
    setValidation(null)
    setConfirmDuplicates(false)
    setRequestKey(newId())
    preview.reset()
    importAction.reset()
  }

  const handleFile = async (file: File) => {
    const content = await file.text()
    setFilename(file.name)
    setText(content)
    setConfirmDuplicates(false)
    setRequestKey(newId())
    await preview.run((ctx) => previewImport(ctx, content), {
      skipRefresh: true,
      onSuccess: (result) => setValidation(result),
    })
  }

  const blocked =
    validation === null ||
    validation.fileError !== null ||
    validation.issues.length > 0 ||
    (validation.duplicateWarnings.length > 0 && !confirmDuplicates)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import vendors from CSV</DialogTitle>
          <DialogDescription>
            Required columns: {IMPORT_COLUMNS.join(', ')}. Separate property tags with semicolons.
            Up to {MAX_IMPORT_ROWS} rows per import. Nothing is written until every row passes
            validation, and imported vendors are never invited automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="import-file">CSV file</Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full rounded-md border border-input bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
            {filename ? (
              <p className="text-xs text-muted-foreground">Selected file: {filename}</p>
            ) : null}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => downloadText('vendor-import-sample.csv', SAMPLE_CSV)}
            >
              Download a sample CSV
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="import-template">Checklist for every imported vendor</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="import-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No checklist (vendors stay Unconfigured)</SelectItem>
                {(templates.data ?? [])
                  .filter((entry) => !entry.template.archived_at)
                  .map((entry) => (
                    <SelectItem key={entry.template.id} value={entry.template.id}>
                      {entry.template.name} ({entry.requiredCount} required)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {validation?.fileError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {validation.fileError}
            </p>
          ) : null}

          {validation && !validation.fileError ? (
            <div className="space-y-3">
              <p className="text-sm">
                {validation.totalRows} row{validation.totalRows === 1 ? '' : 's'} found.{' '}
                {validation.issues.length === 0
                  ? 'No validation errors.'
                  : `${validation.issues.length} problem${validation.issues.length === 1 ? '' : 's'} must be fixed.`}
              </p>

              {validation.issues.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <ul className="space-y-1 text-sm text-destructive">
                    {validation.issues.map((issue, index) => (
                      <li key={`${issue.row}-${issue.column}-${index}`}>
                        Row {issue.row}, {issue.column}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <caption className="px-3 py-2 text-xs text-muted-foreground">
                    First {Math.min(10, validation.candidates.length)} rows
                  </caption>
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Contact</th>
                      <th className="px-3 py-2 font-medium">Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.candidates.slice(0, 10).map((candidate) => (
                      <tr key={candidate.row} className="border-t">
                        <td className="px-3 py-2 tabular-nums">{candidate.row}</td>
                        <td className="px-3 py-2">
                          {candidate.company_name || <span className="text-destructive">missing</span>}
                          {candidate.duplicateOf ? (
                            <span className="block text-xs text-amber-700">
                              Duplicates {candidate.duplicateOf}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{candidate.category}</td>
                        <td className="px-3 py-2">
                          {candidate.contact_name}
                          <span className="block text-xs text-muted-foreground">
                            {candidate.contact_email}
                          </span>
                        </td>
                        <td className="px-3 py-2">{candidate.property_tags.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {validation.duplicateWarnings.length > 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <Checkbox
                    id="confirm-duplicates"
                    checked={confirmDuplicates}
                    onCheckedChange={(checked) => setConfirmDuplicates(checked === true)}
                  />
                  <Label htmlFor="confirm-duplicates" className="font-normal text-amber-900">
                    {validation.duplicateWarnings.length} row
                    {validation.duplicateWarnings.length === 1 ? '' : 's'} duplicate an existing
                    company name. I confirm these are separate vendor records.
                  </Label>
                </div>
              ) : null}
            </div>
          ) : null}

          {importAction.error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {importAction.error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={blocked || importAction.pending}
            onClick={() =>
              void importAction.run(
                (ctx) =>
                  importVendors(ctx, {
                    text,
                    templateId: templateId === 'none' ? null : templateId,
                    requestKey,
                    confirmDuplicates,
                  }),
                {
                  success: (result) =>
                    result.replayed
                      ? 'That import was already applied. No duplicate vendors were created.'
                      : `Imported ${result.created} vendor${result.created === 1 ? '' : 's'}. No invitations were sent.`,
                  onSuccess: (result) => {
                    setOpen(false)
                    reset()
                    if (result.vendorIds.length > 0) navigate(`/vendors/${result.vendorIds[0]}`)
                  },
                },
              )
            }
          >
            Import vendors
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
