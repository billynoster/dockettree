import { useState } from 'react'
import { Upload } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { Button } from '@/components/ui/button'
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
import { Progress } from '@/components/ui/progress'
import { todayInTimeZone } from '@/domain/dates'
import { newId } from '@/domain/ids'
import type { AssignedRequirement } from '@/domain/types'
import {
  ALLOWED_UPLOAD_LABEL,
  formatBytes,
  MAX_UPLOAD_BYTES,
  validateSubmissionDates,
} from '@/domain/validation'

/**
 * Upload form for one requirement. Validation runs before anything is stored, progress is
 * visible, and a failure keeps the selected file so the vendor can retry.
 */
export function SubmitDocumentDialog({
  requirement,
  trigger,
  onSubmitted,
}: {
  requirement: AssignedRequirement
  trigger: React.ReactNode
  onSubmitted?: () => void
}) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [progress, setProgress] = useState(0)
  const [requestKey, setRequestKey] = useState(() => newId())
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const action = useAction()

  const today = todayInTimeZone(new Date(), app.organization.timezone)
  const dateCheck = validateSubmissionDates(
    { issue_date: issueDate, expiration_date: expirationDate },
    requirement,
    today,
  )

  const reset = () => {
    setFile(null)
    setIssueDate('')
    setExpirationDate('')
    setProgress(0)
    setLocalErrors({})
    setRequestKey(newId())
    action.reset()
  }

  const fieldErrors = { ...localErrors, ...action.fieldErrors }

  const submit = async () => {
    if (!file) {
      setLocalErrors({ file: 'Choose a file to submit.' })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setLocalErrors({
        file: `That file is ${formatBytes(file.size)}. The limit is 10 MiB per document.`,
      })
      return
    }
    if (Object.keys(dateCheck.fieldErrors).length > 0) {
      setLocalErrors(dateCheck.fieldErrors)
      return
    }
    setLocalErrors({})
    setProgress(5)
    const result = await action.run(
      () =>
        api.submitDocument({
          requirementId: requirement.id,
          file,
          issue_date: issueDate,
          expiration_date: expirationDate,
          requestKey,
          // Real upload progress, so a large scan on a slow connection is visible.
          onProgress: (fraction) => setProgress(Math.max(5, Math.round(fraction * 95))),
        }),
      {
        success: (value) =>
          `${requirement.title} v${value.version_number} submitted and is now pending review.`,
      },
    )
    if (result) {
      setProgress(100)
      setOpen(false)
      reset()
      onSubmitted?.()
    } else {
      setProgress(0)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit {requirement.title}</DialogTitle>
          <DialogDescription>{requirement.instructions}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="submit-file">Document file</Label>
            <input
              id="submit-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              aria-invalid={Boolean(fieldErrors.file)}
              aria-describedby={fieldErrors.file ? 'submit-file-error' : 'submit-file-hint'}
              className="block w-full rounded-md border border-input bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setLocalErrors({})
                action.reset()
              }}
            />
            {fieldErrors.file ? (
              <p id="submit-file-error" className="text-sm text-destructive">
                {fieldErrors.file}
              </p>
            ) : (
              <p id="submit-file-hint" className="text-xs text-muted-foreground">
                {ALLOWED_UPLOAD_LABEL} only, up to 10 MiB. Multi-page documents should be one PDF.
              </p>
            )}
            {file ? (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium">{file.name}</span> ({formatBytes(file.size)})
              </p>
            ) : null}
          </div>

          {requirement.collect_issue_date ? (
            <div className="space-y-1">
              <Label htmlFor="submit-issue">Issue date shown on the document</Label>
              <input
                id="submit-issue"
                type="date"
                value={issueDate}
                aria-invalid={Boolean(fieldErrors.issue_date)}
                aria-describedby={fieldErrors.issue_date ? 'submit-issue-error' : undefined}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                onChange={(event) => setIssueDate(event.target.value)}
              />
              {fieldErrors.issue_date ? (
                <p id="submit-issue-error" className="text-sm text-destructive">
                  {fieldErrors.issue_date}
                </p>
              ) : null}
            </div>
          ) : null}

          {requirement.expiration_required ? (
            <div className="space-y-1">
              <Label htmlFor="submit-expiration">Expiration date shown on the document</Label>
              <input
                id="submit-expiration"
                type="date"
                value={expirationDate}
                required
                aria-invalid={Boolean(fieldErrors.expiration_date)}
                aria-describedby={
                  fieldErrors.expiration_date ? 'submit-expiration-error' : 'submit-expiration-hint'
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                onChange={(event) => setExpirationDate(event.target.value)}
              />
              {fieldErrors.expiration_date ? (
                <p id="submit-expiration-error" className="text-sm text-destructive">
                  {fieldErrors.expiration_date}
                </p>
              ) : (
                <p id="submit-expiration-hint" className="text-xs text-muted-foreground">
                  The document is valid through this date. Today is {today} in{' '}
                  {app.organization.timezone}.
                </p>
              )}
            </div>
          ) : null}

          {dateCheck.warning ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {dateCheck.warning}
            </p>
          ) : null}

          {progress > 0 ? (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground" role="status">
                {progress < 95 ? `Uploading… ${progress}%` : 'Validating and storing the document…'}
              </p>
            </div>
          ) : null}

          {action.error && Object.keys(action.fieldErrors).length === 0 ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{action.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void submit()}>
                Retry submission
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={action.pending} onClick={() => void submit()}>
            <Upload aria-hidden="true" />
            Submit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
