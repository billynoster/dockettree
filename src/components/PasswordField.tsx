import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Password input with a reveal toggle. Passwords here are typed from a note an administrator
 * handed over, so being able to check what was entered removes most failed sign-in attempts.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'current-password',
  error,
  hint,
  autoFocus,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  error?: string | null
  hint?: string
  autoFocus?: boolean
}) {
  const generated = useId()
  const fieldId = id ?? generated
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          className="h-9 pr-9"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1 right-1"
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
