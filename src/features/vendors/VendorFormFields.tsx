import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FieldErrors } from '@/domain/errors'
import { SERVICE_CATEGORIES } from '@/domain/validation'

export interface VendorFormValues {
  company_name: string
  category: string
  contact_name: string
  contact_email: string
  property_tags: string[]
}

export function VendorFormFields({
  values,
  onChange,
  fieldErrors,
  properties,
  idPrefix = 'vendor',
}: {
  values: VendorFormValues
  onChange: (values: VendorFormValues) => void
  fieldErrors: FieldErrors
  properties: string[]
  idPrefix?: string
}) {
  const field = (name: keyof VendorFormValues) => `${idPrefix}-${name}`
  const errorId = (name: keyof VendorFormValues) => `${field(name)}-error`

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={field('company_name')}>Company name</Label>
        <Input
          id={field('company_name')}
          value={values.company_name}
          required
          aria-invalid={Boolean(fieldErrors.company_name)}
          aria-describedby={fieldErrors.company_name ? errorId('company_name') : undefined}
          onChange={(event) => onChange({ ...values, company_name: event.target.value })}
        />
        {fieldErrors.company_name ? (
          <p id={errorId('company_name')} className="text-sm text-destructive">
            {fieldErrors.company_name}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={field('category')}>Service category</Label>
        <Select
          value={values.category}
          onValueChange={(value) => onChange({ ...values, category: value })}
        >
          <SelectTrigger
            id={field('category')}
            className="w-full"
            aria-invalid={Boolean(fieldErrors.category)}
            aria-describedby={fieldErrors.category ? errorId('category') : undefined}
          >
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.category ? (
          <p id={errorId('category')} className="text-sm text-destructive">
            {fieldErrors.category}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={field('contact_name')}>Primary contact name</Label>
        <Input
          id={field('contact_name')}
          value={values.contact_name}
          required
          aria-invalid={Boolean(fieldErrors.contact_name)}
          aria-describedby={fieldErrors.contact_name ? errorId('contact_name') : undefined}
          onChange={(event) => onChange({ ...values, contact_name: event.target.value })}
        />
        {fieldErrors.contact_name ? (
          <p id={errorId('contact_name')} className="text-sm text-destructive">
            {fieldErrors.contact_name}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={field('contact_email')}>Primary contact email</Label>
        <Input
          id={field('contact_email')}
          type="email"
          value={values.contact_email}
          required
          aria-invalid={Boolean(fieldErrors.contact_email)}
          aria-describedby={
            fieldErrors.contact_email ? errorId('contact_email') : `${field('contact_email')}-hint`
          }
          onChange={(event) => onChange({ ...values, contact_email: event.target.value })}
        />
        {fieldErrors.contact_email ? (
          <p id={errorId('contact_email')} className="text-sm text-destructive">
            {fieldErrors.contact_email}
          </p>
        ) : (
          <p id={`${field('contact_email')}-hint`} className="text-xs text-muted-foreground">
            Several vendor records may share one contact email.
          </p>
        )}
      </div>

      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Property tags (optional)</legend>
        <p className="text-xs text-muted-foreground">
          Tags are for filtering only. Document requirements are organization-wide.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5 pt-1">
          {properties.map((property) => (
            <div key={property} className="flex items-center gap-2">
              <Checkbox
                id={`${idPrefix}-property-${property}`}
                checked={values.property_tags.includes(property)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...values,
                    property_tags:
                      checked === true
                        ? [...values.property_tags, property]
                        : values.property_tags.filter((tag) => tag !== property),
                  })
                }
              />
              <Label htmlFor={`${idPrefix}-property-${property}`} className="font-normal">
                {property}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
