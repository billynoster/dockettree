import { api } from '@/api/client'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { AccessDeniedState } from '@/components/States'
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
import { newId } from '@/domain/ids'
import { VendorFormFields, type VendorFormValues } from './VendorFormFields'

const EMPTY: VendorFormValues = {
  company_name: '',
  category: '',
  contact_name: '',
  contact_email: '',
  property_tags: [],
}

export function VendorNewPage() {
  const app = useApp()
  const navigate = useNavigate()
  const [values, setValues] = useState<VendorFormValues>(EMPTY)
  const [templateId, setTemplateId] = useState('none')
  const [requestKey, setRequestKey] = useState(() => newId())
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const action = useAction()
  const templates = useServiceQuery(() => api.listTemplates(), [])
  // Property tags are free text; suggest the ones already used in this organization.
  const directory = useServiceQuery(() => api.listVendors({ lifecycle: 'all', pageSize: 1 }), [])
  const knownProperties = directory.data?.properties ?? []

  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY) || templateId !== 'none'

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (!app.can('vendor.manage')) {
    return (
      <AccessDeniedState
        message="Only an admin or coordinator can add vendors."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/vendors">Back to vendors</Link>
          </Button>
        }
      />
    )
  }

  const selectedTemplate = (templates.data ?? []).find((entry) => entry.template.id === templateId)

  const save = async (invite: boolean, confirmDuplicateOverride?: boolean) => {
    const created = await action.run(
      () => api.createVendor({
          ...values,
          template_id: templateId === 'none' ? null : templateId,
          requestKey,
          confirmDuplicate: confirmDuplicateOverride ?? confirmDuplicate,
        }),
      {
        success: invite
          ? 'Vendor saved. Creating the invitation…'
          : 'Vendor saved. No invitation has been sent yet.',
      },
    )
    if (!created) return
    if (invite) {
      await action.run(
        () =>
          api.inviteVendor(
            created.vendor_id,
            values.contact_email.trim(),
            `${requestKey}:invite`,
          ),
        {
          success:
            'Invitation created. Open the vendor to copy the link or check the notification log.',
        },
      )
    }
    navigate(`/vendors/${created.vendor_id}`)
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Add vendor"
        description="Saving and inviting are separate actions. You can save a vendor now and invite later."
      />

      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void save(false)
        }}
      >
        <section className="space-y-4 rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">Vendor details</h2>
          <VendorFormFields
            values={values}
            onChange={setValues}
            fieldErrors={action.fieldErrors}
            properties={knownProperties}
          />
        </section>

        <section className="space-y-3 rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">Document checklist</h2>
          <div className="space-y-1">
            <Label htmlFor="new-vendor-template">Checklist template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="new-vendor-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  No checklist yet (the vendor will be Unconfigured)
                </SelectItem>
                {(templates.data ?? [])
                  .filter((entry) => !entry.template.archived_at)
                  .map((entry) => (
                    <SelectItem key={entry.template.id} value={entry.template.id}>
                      {entry.template.name} · {entry.requiredCount} required,{' '}
                      {entry.optionalCount} optional
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium">
                Requirements copied to this vendor (snapshot of version{' '}
                {selectedTemplate.template.version})
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {selectedTemplate.items.map((item) => (
                  <li key={item.id}>
                    <span className="font-medium">{item.title}</span>{' '}
                    <span className="text-muted-foreground">
                      · {item.required ? 'Required' : 'Optional'}
                      {item.expiration_required ? ' · expiration date required' : ''}
                      {item.collect_issue_date ? ' · issue date collected' : ''}
                    </span>
                    <p className="text-xs text-muted-foreground">{item.instructions}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              A vendor with no required items is reported as Unconfigured until a checklist is
              assigned.
            </p>
          )}
        </section>

        {action.conflict ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">{action.conflict}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirmDuplicate(true)
                void save(false, true)
              }}
            >
              Save as a separate vendor record
            </Button>
          </div>
        ) : null}

        {action.error && !action.conflict ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {action.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={action.pending}>
            Save vendor
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={action.pending}
            onClick={() => void save(true)}
          >
            Save and send invitation
          </Button>
          {dirty ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard this vendor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The details you entered have not been saved and will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep editing</AlertDialogCancel>
                  <AlertDialogAction onClick={() => navigate('/vendors')}>
                    Discard changes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button type="button" variant="ghost" onClick={() => navigate('/vendors')}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setValues(EMPTY)
              setTemplateId('none')
              setRequestKey(newId())
              action.reset()
            }}
          >
            Clear form
          </Button>
        </div>
      </form>
    </div>
  )
}
