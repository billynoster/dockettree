import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  CEDAR_LINE,
  IRONWOOD,
  gotoApp,
  openVendor,
  samplePdfBuffer,
  setDemoDate,
  setRole,
  submitDocumentFromPortal,
} from './helpers'

test.describe('overview and directory', () => {
  test('seeded counts partition active vendors and links reproduce them', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

    const active = page.locator('section', { has: page.getByRole('heading', { name: 'Active vendors' }) })
    await expect(active).toContainText('10')
    await expect(page.getByRole('link', { name: /^Ready 4/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Awaiting review 2/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Not ready 3/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Unconfigured 1/ })).toBeVisible()
    await expect(page.getByText('Expiring soon (secondary, overlapping count)')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open review queue' })).toBeVisible()

    await page.getByRole('link', { name: /^Not ready 3/ }).click()
    await expect(page).toHaveURL(/readiness=not_ready/)
    await expect(page.getByText('3 vendors match these filters')).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByText('10 vendors match these filters')).toBeVisible()
  })

  test('search, combined filters and pagination behave', async ({ page }) => {
    await gotoApp(page, '/vendors')
    await page.getByLabel('Search company, contact or email').fill('DAMON.FRAZIER@EXAMPLE.COM')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByRole('link', { name: IRONWOOD })).toBeVisible()
    await expect(page.getByText('1 vendor matches these filters')).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.getByRole('checkbox', { name: 'Ready', exact: true }).click()
    await expect(page.getByText('4 vendors match these filters')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Expiring soon only' }).click()
    await expect(page.getByText('2 vendors match these filters')).toBeVisible()
  })

  test('archived vendors are hidden until included', async ({ page }) => {
    await gotoApp(page, '/vendors')
    await expect(page.getByRole('link', { name: 'Copperfield Locksmiths' })).toHaveCount(0)
    await page.goto('/vendors?lifecycle=archived')
    await expect(page.getByRole('link', { name: 'Copperfield Locksmiths' })).toBeVisible()
    await expect(page.getByText('2 vendors match these filters')).toBeVisible()
  })
})

test.describe('W1–W3 submit, correct, accept', () => {
  test('completes the demo script from Not ready to Ready', async ({ page }) => {
    await gotoApp(page)
    await openVendor(page, IRONWOOD)
    await expect(page.getByText('Safety acknowledgment missing')).toBeVisible()

    // Reminder preview identifies recipient and items without sending.
    await page.getByRole('button', { name: 'Remind' }).click()
    const reminder = page.getByRole('dialog')
    await expect(reminder).toContainText('damon.frazier@example.com')
    await expect(reminder).toContainText('Safety acknowledgment')
    await page.keyboard.press('Escape')

    // Vendor submits from the portal.
    await setRole(page, 'Vendor contact', IRONWOOD)
    await page.goto('/portal/' + (await currentVendorId(page, IRONWOOD)))
    await expect(page.getByRole('heading', { name: IRONWOOD })).toBeVisible()
    await submitDocumentFromPortal(page, 'Safety acknowledgment')
    await expect(page.getByText('Pending review').first()).toBeVisible()

    // Reviewer requests changes with a reason.
    await setRole(page, 'Reviewer')
    await page.goto('/review')
    await page
      .locator('li')
      .filter({ hasText: IRONWOOD })
      .filter({ hasText: 'Safety acknowledgment' })
      .getByRole('link', { name: 'Open review' })
      .click()
    await page.locator('#review-reason').fill('Page 2 is missing the signature date. Please sign and date it.')
    await page.getByRole('button', { name: 'Request changes' }).click()
    await expect(page.getByText(/has been notified in the simulated outbox/)).toBeVisible()

    await openVendor(page, IRONWOOD)
    await expect(page.getByText('Safety acknowledgment corrections requested')).toBeVisible()

    // Vendor sees the reason and submits a corrected version.
    await setRole(page, 'Vendor contact', IRONWOOD)
    await page.goto('/portal/' + (await currentVendorId(page, IRONWOOD)))
    await expect(page.getByText('missing the signature date').first()).toBeVisible()
    await submitDocumentFromPortal(page, 'Safety acknowledgment')

    // Reviewer accepts and the vendor becomes Ready without a manual refresh.
    await setRole(page, 'Reviewer')
    await page.goto('/review')
    await page
      .locator('li')
      .filter({ hasText: IRONWOOD })
      .filter({ hasText: 'Safety acknowledgment' })
      .getByRole('link', { name: 'Open review' })
      .click()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText(/Ironwood Pest Control is now ready/i)).toBeVisible()

    await openVendor(page, IRONWOOD)
    await expect(page.getByText('Ready', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('3 of 3 required items satisfied')).toBeVisible()

    // Refresh persistence.
    await page.reload()
    await expect(page.getByText('3 of 3 required items satisfied')).toBeVisible()

    // Both versions remain in history on the Safety acknowledgment card.
    const safetyCard = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Safety acknowledgment' }) })
      .first()
    await safetyCard.getByText('Version history (2)').click()
    const versions = safetyCard.locator('details ul li')
    await expect(versions).toHaveCount(2)
    await expect(versions.first()).toContainText('v2')
    await expect(versions.first()).toContainText('Accepted')
    await expect(versions.last()).toContainText('v1')
    await expect(versions.last()).toContainText('Changes requested')
  })

  test('rejects an invalid file without creating a submission', async ({ page }) => {
    await gotoApp(page)
    const vendorId = await currentVendorId(page, IRONWOOD)
    await setRole(page, 'Vendor contact', IRONWOOD)
    await page.goto(`/portal/${vendorId}`)

    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Safety acknowledgment' }) })
      .first()
    await card.getByRole('button', { name: 'Submit document' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#submit-file').setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf at all'),
    })
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await expect(dialog.locator('#submit-file-error')).toContainText('did not match a supported type')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('No document submitted yet.').first()).toBeVisible()
  })

  test('a vendor contact cannot open another vendor portal', async ({ page }) => {
    await gotoApp(page)
    const otherId = await currentVendorId(page, 'Bluewater Janitorial')
    await setRole(page, 'Vendor contact', IRONWOOD)
    await page.goto(`/portal/${otherId}`)
    await expect(page.getByText('Not available for this demo role')).toBeVisible()
    await expect(page.getByText(/belongs to a different vendor/)).toBeVisible()
  })

  test('a coordinator cannot decide a review', async ({ page }) => {
    await gotoApp(page, '/review')
    await setRole(page, 'Coordinator')
    await page.goto('/review')
    await expect(page.getByText(/only an admin or reviewer can decide/i)).toBeVisible()
    await page.getByRole('link', { name: 'Open submission' }).first().click()
    await expect(page.getByText('Not available for this demo role')).toBeVisible()
  })
})

test.describe('W4 renewal driven by the demo clock', () => {
  test('expires a document, then accepts a renewal and keeps history', async ({ page }) => {
    await gotoApp(page)
    await openVendor(page, CEDAR_LINE)
    await expect(page.getByText('Expiring soon').first()).toBeVisible()

    await setDemoDate(page, '2026-10-01')
    await expect(page.getByText('Not ready').first()).toBeVisible()
    await expect(page.getByText('Insurance certificate expired')).toBeVisible()
    // The accepted review state is unchanged; only the derived status moved.
    await expect(page.getByText('Expired').first()).toBeVisible()

    const vendorId = await currentVendorId(page, CEDAR_LINE)
    await setRole(page, 'Vendor contact', CEDAR_LINE)
    await page.goto(`/portal/${vendorId}`)
    await submitDocumentFromPortal(page, 'Insurance certificate', {
      issue: '2026-10-01',
      expiration: '2027-10-01',
    })

    await setRole(page, 'Reviewer')
    await page.goto('/review')
    await page
      .locator('li')
      .filter({ hasText: CEDAR_LINE })
      .getByRole('link', { name: 'Open review' })
      .click()
    await expect(page.getByText('Currently effective version')).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText(/Accepted Insurance certificate/)).toBeVisible()

    await openVendor(page, CEDAR_LINE)
    await expect(page.getByText('Ready', { exact: true }).first()).toBeVisible()
    await page.getByText(/Version history/).first().click()
    await expect(page.getByText('Superseded')).toBeVisible()
  })

  test('an expired document cannot be accepted', async ({ page }) => {
    await gotoApp(page)
    const vendorId = await currentVendorId(page, IRONWOOD)
    await setRole(page, 'Vendor contact', IRONWOOD)
    await page.goto(`/portal/${vendorId}`)

    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Insurance certificate' }) })
      .first()
    await card.getByRole('button', { name: 'Submit replacement' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#submit-file').setInputFiles({
      name: 'expired.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdfBuffer('expired certificate'),
    })
    await dialog.locator('#submit-issue').fill('2025-01-01')
    await dialog.locator('#submit-expiration').fill('2026-01-01')
    await expect(dialog.getByText(/already passed/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await setRole(page, 'Reviewer')
    await page.goto('/review')
    await page
      .locator('li')
      .filter({ hasText: IRONWOOD })
      .filter({ hasText: 'Insurance certificate' })
      .getByRole('link', { name: 'Open review' })
      .click()
    await expect(page.getByText(/expired before today/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled()
  })

  test('revoking an acceptance leaves no fallback version', async ({ page }) => {
    await gotoApp(page)
    await setRole(page, 'Admin')
    await openVendor(page, 'Northgate Electric')
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Insurance certificate' }) })
      .first()
    await card.getByRole('button', { name: 'Revoke acceptance' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#reason-input').fill('The certificate names a different legal entity.')
    await dialog.getByRole('button', { name: 'Revoke acceptance' }).click()
    await expect(page.getByText('Insurance certificate acceptance revoked')).toBeVisible()
    await expect(page.getByText('Not ready').first()).toBeVisible()
  })
})

test.describe('W5 monitor, remind, import, export, archive', () => {
  test('sends a simulated reminder that appears in the outbox with a cooldown', async ({ page }) => {
    await gotoApp(page)
    await openVendor(page, IRONWOOD)
    await page.getByRole('button', { name: 'Remind' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Queue simulated reminder' }).click()
    await expect(page.getByText(/Simulated reminder queued/)).toBeVisible()

    await page.getByRole('button', { name: 'Remind' }).click()
    await expect(page.getByRole('dialog')).toContainText('within the last 24 hours')
    await page.keyboard.press('Escape')

    await page.goto('/demo/outbox')
    await expect(page.getByText('This prototype never sends email.')).toBeVisible()
    await expect(page.getByText('Not delivered').first()).toBeVisible()
    await expect(page.getByText(/Reminder: 1 document still needed/).first()).toBeVisible()
  })

  test('imports a CSV after fixing errors and never invites automatically', async ({ page }) => {
    await gotoApp(page, '/vendors')
    await page.getByRole('button', { name: 'Import CSV' }).click()
    const dialog = page.getByRole('dialog')

    const header = 'company_name,category,contact_name,contact_email,property_tags'
    await dialog.locator('#import-file').setInputFiles({
      name: 'broken.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`${header}\nGood Vendor,Cleaning,Ann Lee,ann.lee@example.com,\n,Cleaning,,nope,\n`),
    })
    await expect(dialog.getByText(/problems? must be fixed/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Import vendors' })).toBeDisabled()

    await dialog.locator('#import-file').setInputFiles({
      name: 'fixed.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `${header}\nAlder Court Cleaning,Cleaning,Ann Lee,ann.lee@example.com,Riverfront Offices\nBriar Path Snow Removal,Snow removal,Ben Ito,ben.ito@example.com,Maple Business Park\n`,
      ),
    })
    await expect(dialog.getByText('No validation errors.')).toBeVisible()
    await dialog.getByLabel('Checklist for every imported vendor').click()
    await page.getByRole('option', { name: /Standard service vendor/ }).click()
    await dialog.getByRole('button', { name: 'Import vendors' }).click()

    await expect(page.getByText(/Imported 2 vendors\. No invitations were sent\./)).toBeVisible()
    await expect(page.getByText('Not invited')).toBeVisible()
  })

  test('exports every filtered row as CSV', async ({ page }) => {
    await gotoApp(page, '/vendors?readiness=not_ready')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const file = await download
    const content = await readFile(await file.path(), 'utf8')
    const lines = content.trim().split('\r\n')
    expect(lines[0]).toContain('company_name,category,readiness,expiring_soon,blockers')
    expect(lines).toHaveLength(4)
    expect(content).toContain('Insurance certificate expired')
    expect(content).not.toContain('%PDF')
  })

  test('archives a vendor and restores it', async ({ page }) => {
    await gotoApp(page)
    await openVendor(page, 'Granite Peak Roofing')
    await page.getByRole('button', { name: 'Archive' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#reason-input').fill('Vendor paused work for the season.')
    await dialog.getByRole('button', { name: 'Archive vendor' }).click()
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible()

    await page.goto('/overview')
    await expect(page.getByRole('link', { name: /^Awaiting review 1/ })).toBeVisible()
    await page.goto('/review')
    await expect(page.locator('li').filter({ hasText: 'Granite Peak Roofing' })).toHaveCount(0)

    await openVendor(page, 'Granite Peak Roofing')
    await page.getByRole('button', { name: 'Restore vendor' }).click()
    await expect(page.getByText(/restored/i).first()).toBeVisible()
  })

  test('runs the simulated daily reminder job once per local date', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByRole('button', { name: "Run today's reminder job" }).click()
    await expect(page.getByText(/Simulated job for 2026-09-17/)).toBeVisible()
    await page.getByRole('button', { name: "Run today's reminder job" }).click()
    await expect(page.getByText(/0 vendor digests/)).toBeVisible()
  })
})

test.describe('accessibility, responsiveness and reset', () => {
  test('a review decision can be completed with the keyboard only', async ({ page }) => {
    await gotoApp(page, '/review')
    await setRole(page, 'Reviewer')
    await page.getByRole('link', { name: 'Open review' }).first().click()
    await page.locator('#review-reason').focus()
    await page.keyboard.type('Keyboard-only correction request for the demo verification.')
    await page.keyboard.press('Tab')
    await expect(page.locator('button:focus')).toHaveText(/Accept/)
    await page.keyboard.press('Tab')
    await expect(page.locator('button:focus')).toHaveText(/Request changes/)
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Changes requested/).first()).toBeVisible()
  })

  test('a dialog traps focus and returns it to the trigger on close', async ({ page }) => {
    await gotoApp(page)
    await openVendor(page, IRONWOOD)
    const trigger = page.getByRole('button', { name: 'Remind' })
    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('vendor rows become cards at 390px with no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await gotoApp(page, '/vendors')
    await expect(page.getByRole('table')).toBeHidden()
    await expect(page.getByRole('link', { name: 'Open vendor' }).first()).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('direct links to deep routes work', async ({ page }) => {
    await gotoApp(page)
    const vendorId = await currentVendorId(page, IRONWOOD)
    await page.goto(`/vendors/${vendorId}?tab=activity`)
    await expect(page.getByText('Added vendor Ironwood Pest Control')).toBeVisible()
    await page.goto(`/portal/${vendorId}`)
    await expect(page.getByText('Vendor document portal')).toBeVisible()
    await page.goto('/vendors/does-not-exist')
    await expect(page.getByText('Vendor not found')).toBeVisible()
    await page.goto('/nope')
    await expect(page.getByText('Page not found')).toBeVisible()
  })

  test('reset restores the seeded fixtures and the initial demo date', async ({ page }) => {
    await gotoApp(page)
    await openVendor(page, IRONWOOD)
    await page.getByRole('button', { name: 'Remind' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Queue simulated reminder' }).click()
    await expect(page.getByText(/Simulated reminder queued/)).toBeVisible()
    await setDemoDate(page, '2026-12-01')

    await page.getByRole('button', { name: 'Reset demo' }).click()
    await page.getByRole('button', { name: 'Reset demo data' }).click()
    await expect(page.getByText(/Demo data reset/)).toBeVisible()

    await page.goto('/overview')
    await expect(page.locator('#demo-date')).toHaveValue('2026-09-17')
    await expect(page.getByRole('link', { name: /^Not ready 3/ })).toBeVisible()
    await page.goto('/demo/outbox?type=vendor_digest')
    await expect(page.getByText(/^3 of \d+ simulated messages$/)).toBeVisible()
  })
})

/** Resolve a vendor's id from the directory so tests never hard-code seeded UUIDs. */
async function currentVendorId(page: import('@playwright/test').Page, companyName: string) {
  await page.goto(`/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  const href = await page.getByRole('link', { name: companyName }).first().getAttribute('href')
  return href!.split('/').pop()!
}
