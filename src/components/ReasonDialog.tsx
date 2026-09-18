import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'

/** Confirmation dialog for actions that require a recorded reason. */
export function ReasonDialog({
  trigger,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  destructive = false,
  pending = false,
  error = null,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: React.ReactNode
  label: string
  placeholder?: string
  confirmLabel: string
  destructive?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: (reason: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setReason('')
          setLocalError(null)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="reason-input">{label}</Label>
          <Textarea
            id="reason-input"
            value={reason}
            rows={4}
            required
            placeholder={placeholder}
            aria-invalid={Boolean(localError ?? error)}
            aria-describedby={localError ?? error ? 'reason-error' : undefined}
            onChange={(event) => {
              setReason(event.target.value)
              setLocalError(null)
            }}
          />
          {localError ?? error ? (
            <p id="reason-error" className="text-sm text-destructive">
              {localError ?? error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={async () => {
              if (reason.trim().length < 5) {
                setLocalError('Enter at least 5 characters so the history explains this decision.')
                return
              }
              const ok = await onConfirm(reason.trim())
              if (ok) {
                setOpen(false)
                setReason('')
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
