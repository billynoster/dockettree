import { api } from '@/api/client'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionBody, SectionHeader } from '@/components/Section'
import { AccessDeniedState, InlineNotice } from '@/components/States'
import { Chip } from '@/components/StatusChips'
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
    <Page width="reading">
      <PageHeader
        back={{ label: 'All vendors', to: '/vendors' }}
        title="Add vendor"
        description="Saving and inviting are separate actions, so you can create the record now and invite the contact once you have confirmed their email."
      />

      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void save(false)
        }}
      >
        <Section>
          <SectionHeader title="Vendor details" border />
          <SectionBody className="pt-4">
            <VendorFormFields
              values={values}
              onChange={setValues}
              fieldErrors={action.fieldErrors}
              properties={knownProperties}
            />
          </SectionBody>
        </Section>

        <Section>
          <SectionHeader
            title="Document checklist"
            description="Optional now. The checklist decides which documents the vendor is asked for."
            border
          />
          <SectionBody className="space-y-3 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-vendor-template">Checklist template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="new-vendor-template" className="w-full">
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
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-medium">
                Requirements copied to this vendor (snapshot of version{' '}
                {selectedTemplate.template.version})
              </p>
              <ul className="space-y-2 text-sm">
                {selectedTemplate.items.map((item) => (
                  <li key={item.id}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      <Chip tone={item.required ? 'brand' : 'neutral'} size="sm">
                        {item.required ? 'Required' : 'Optional'}
                      </Chip>
                      <span className="text-xs text-muted-foreground">
                        {item.expiration_required ? 'Expiration date required' : 'No expiration'}
                        {item.collect_issue_date ? ' · issue date collected' : ''}
                      </span>
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.instructions}
                    </p>
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
          </SectionBody>
        </Section>

        {action.conflict ? (
          <InlineNotice tone="warn" title="A vendor with this name already exists">
            <p>{action.conflict}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setConfirmDuplicate(true)
                void save(false, true)
              }}
            >
              Save as a separate vendor record
            </Button>
          </InlineNotice>
        ) : null}

        {action.error && !action.conflict ? (
          <InlineNotice tone="danger" role="alert">
            {action.error}
          </InlineNotice>
        ) : null}

        <div className="surface flex flex-wrap items-center gap-2 p-3">
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
    </Page>
  )
}
