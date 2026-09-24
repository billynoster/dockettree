import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import {
  ADMIN,
  CEDAR_LINE,
  COORDINATOR,
  CEDAR_LINE_CONTACT,
  IRONWOOD,
  IRONWOOD_CONTACT,
  REVIEWER,
  VENDOR_PASSWORD,
  dateFromToday,
  openFirstReview,
  openReview,
  openVendor,
  samplePdfBuffer,
  signIn,
  signInAsStaff,
  signOut,
  submitDocumentFromPortal,
  vendorIdOf,
} from './helpers'

test.describe('overview and directory', () => {
  test('seeded counts partition active vendors and links reproduce them', async ({ page }) => {
    await signInAsStaff(page)
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

    const active = page.locator('section', { has: page.getByRole('heading', { name: 'Active vendors' }) })
    await expect(active).toContainText('10')
    await expect(page.getByRole('link', { name: /^Ready 4/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Awaiting review 2/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Not ready 3/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Unconfigured 1/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Expiring soon' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open review queue' })).toBeVisible()

    await page.getByRole('link', { name: /^Not ready 3/ }).click()
    await expect(page).toHaveURL(/readiness=not_ready/)
    await expect(page.getByText('Showing 1–3 of 3 vendors')).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByText('Showing 1–10 of 10 vendors')).toBeVisible()
  })

  test('search, combined filters and archived visibility behave', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/vendors')
    // Search applies as you type; the URL still carries it so the link is reproducible.
    await page.getByLabel('Search company, contact or email').fill('DAMON.FRAZIER@EXAMPLE.COM')
    await expect(page).toHaveURL(/q=DAMON/)
    await expect(page.getByRole('link', { name: IRONWOOD, exact: true }).first()).toBeVisible()
    await expect(page.getByText('Showing 1–1 of 1 vendor')).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.getByRole('button', { name: 'Ready', exact: true }).click()
    await expect(page.getByText('Showing 1–4 of 4 vendors')).toBeVisible()
    await page.getByRole('button', { name: 'Expiring soon', exact: true }).click()
    await expect(page.getByText('Showing 1–2 of 2 vendors')).toBeVisible()

    await page.goto('/vendors')
    await expect(page.getByRole('link', { name: 'Copperfield Locksmiths' })).toHaveCount(0)
    await page.goto('/vendors?lifecycle=archived')
    await expect(page.getByRole('link', { name: 'Copperfield Locksmiths' }).first()).toBeVisible()
    await expect(page.getByText('Showing 1–2 of 2 vendors')).toBeVisible()
  })
})

test.describe('W2/W3 submit, correct, accept', () => {
  test('takes a vendor from Not ready to Ready across three sign-ins', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    await openVendor(page, IRONWOOD)
    await expect(page.getByText('Safety acknowledgment missing')).toBeVisible()

    // Reminder preview identifies recipient and items before anything is sent.
    await page.getByRole('button', { name: 'Remind' }).click()
    const reminder = page.getByRole('dialog')
    await expect(reminder).toContainText('damon.frazier@example.com')
    await expect(reminder).toContainText('Safety acknowledgment')
    await page.keyboard.press('Escape')
    await signOut(page)

    // The vendor submits from their own portal.
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    await submitDocumentFromPortal(page, 'Safety acknowledgment')
    await expect(page.getByText('Pending review').first()).toBeVisible()
    await signOut(page)

    // The reviewer requests changes with a reason.
    await signInAsStaff(page, REVIEWER, '/review')
    await openReview(page, IRONWOOD, 'Safety acknowledgment')
    await page
      .locator('#review-reason')
      .fill('Page 2 is missing the signature date. Please sign and date it.')
    await page.getByRole('button', { name: 'Request changes' }).click()
    await expect(page.getByText(/correction notice for Ironwood/i)).toBeVisible()

    await openVendor(page, IRONWOOD)
    await expect(page.getByText('Safety acknowledgment corrections requested')).toBeVisible()
    await signOut(page)

    // The vendor reads the reason and submits a corrected version.
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    await expect(page.getByText('missing the signature date').first()).toBeVisible()
    await submitDocumentFromPortal(page, 'Safety acknowledgment')
    await signOut(page)

    // The reviewer accepts and readiness updates without a manual refresh.
    await signInAsStaff(page, REVIEWER, '/review')
    await openReview(page, IRONWOOD, 'Safety acknowledgment')
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText(/Ironwood Pest Control is now ready/i)).toBeVisible()

    await openVendor(page, IRONWOOD)
    await expect(page.getByText('Ready', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('required items satisfied')).toBeVisible()
    await expect(page.getByText('3 / 3').first()).toBeVisible()

    await page.reload()
    await expect(page.getByText('required items satisfied')).toBeVisible()
    await expect(page.getByText('3 / 3').first()).toBeVisible()

    // Both versions remain in history.
    const safetyCard = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Safety acknowledgment' }) })
      .first()
    await safetyCard.getByRole('button', { name: 'Version history (2)' }).click()
    const versions = safetyCard.locator('ul li')
    await expect(versions).toHaveCount(2)
    await expect(versions.first()).toContainText('v2')
    await expect(versions.first()).toContainText('Accepted')
    await expect(versions.last()).toContainText('Changes requested')
  })

  test('rejects an invalid file without creating a submission', async ({ page }) => {
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Company brochure' }) })
      .first()
    await card.getByRole('button', { name: /Submit (document|replacement)/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#submit-file').setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf at all'),
    })
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await expect(dialog.locator('#submit-file-error')).toContainText('did not match a supported type')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a coordinator cannot decide a review', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/review')
    await expect(page.getByText(/read this queue but not decide/i)).toBeVisible()
    await page.locator('a[href^="/review/"]').first().click()
    await expect(page.getByText('Not available for your role')).toBeVisible()
  })

  test('an expired document cannot be accepted', async ({ page }) => {
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Insurance certificate' }) })
      .first()
    await card.getByRole('button', { name: /Submit (document|replacement)/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#submit-file').setInputFiles({
      name: 'expired.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdfBuffer('expired certificate'),
    })
    await dialog.locator('#submit-issue').fill(dateFromToday(-400))
    await dialog.locator('#submit-expiration').fill(dateFromToday(-30))
    await expect(dialog.getByText(/already passed/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await signOut(page)

    await signInAsStaff(page, REVIEWER, '/review')
    await openReview(page, IRONWOOD, 'Insurance certificate')
    await expect(page.getByText(/expired before today/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled()
  })

  test('revoking an acceptance leaves no fallback version', async ({ page }) => {
    await signInAsStaff(page, ADMIN)
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

test.describe('W4 renewal', () => {
  test('accepting a renewal supersedes the previous version and keeps history', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    await openVendor(page, CEDAR_LINE)
    await expect(page.getByText('Expiring soon').first()).toBeVisible()
    await signOut(page)

    await signIn(page, CEDAR_LINE_CONTACT, VENDOR_PASSWORD)
    await submitDocumentFromPortal(page, 'Insurance certificate', {
      issue: dateFromToday(0),
      expiration: dateFromToday(365),
    })
    await signOut(page)

    await signInAsStaff(page, REVIEWER, '/review')
    await openReview(page, CEDAR_LINE, 'Insurance certificate')
    await expect(page.getByText('Currently effective version')).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText(/Accepted Insurance certificate/)).toBeVisible()

    await openVendor(page, CEDAR_LINE)
    await expect(page.getByText('Ready', { exact: true }).first()).toBeVisible()
    await page.getByText(/Version history/).first().click()
    await expect(page.getByText('Superseded')).toBeVisible()
  })
})

test.describe('W5 monitor, remind, import, export, archive', () => {
  test('a reminder is queued once per day and appears in the notification log', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    await openVendor(page, IRONWOOD)
    await page.getByRole('button', { name: 'Remind' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Send reminder', exact: true })
      .click()
    await expect(page.getByText(/Reminder queued for/)).toBeVisible()

    await page.getByRole('button', { name: 'Remind' }).click()
    await expect(page.getByRole('dialog')).toContainText('within the last 24 hours')
    await page.keyboard.press('Escape')

    await page.goto('/notifications')
    await expect(page.getByText(/Email delivery is not configured/).first()).toBeVisible()
    await expect(page.getByText('Queued').first()).toBeVisible()
    await expect(page.getByText(/Reminder: /).first()).toBeVisible()
  })

  test('imports a CSV after fixing errors and never invites automatically', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/vendors')
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

  test('exports every filtered row as CSV without document bytes', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/vendors?readiness=not_ready')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const file = await download
    const content = await readFile(await file.path(), 'utf8')
    const lines = content.trim().split('\r\n')
    expect(lines[0]).toContain('company_name,category,readiness,expiring_soon,blockers')
    expect(lines.length).toBeGreaterThan(1)
    expect(content).not.toContain('%PDF')
  })

  test('archives a vendor and restores it', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    await openVendor(page, 'Granite Peak Roofing')
    await page.getByRole('button', { name: 'Archive' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#reason-input').fill('Vendor paused work for the season.')
    await dialog.getByRole('button', { name: 'Archive vendor' }).click()
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible()

    await page.goto('/review')
    await expect(page.locator('li').filter({ hasText: 'Granite Peak Roofing' })).toHaveCount(0)

    await openVendor(page, 'Granite Peak Roofing')
    await page.getByRole('button', { name: 'Restore vendor' }).click()
    await expect(page.getByText(/restored/i).first()).toBeVisible()
  })

  test('runs the reminder job once per organization-local date', async ({ page }) => {
    await signInAsStaff(page, ADMIN, '/settings')
    await page.getByRole('button', { name: 'Run the reminder job now' }).click()
    await expect(page.getByText(/Reminder job finished/)).toBeVisible()
    await page.getByRole('button', { name: 'Run the reminder job now' }).click()
    await expect(page.getByText(/0 digests queued|skipped as duplicates/).first()).toBeVisible()
  })
})

test.describe('accessibility and responsiveness', () => {
  test('a review decision can be completed with the keyboard only', async ({ page }) => {
    await signInAsStaff(page, REVIEWER)
    await openFirstReview(page)
    await page.locator('#review-reason').focus()
    await page.keyboard.type('Keyboard-only correction request for the verification pass.')
    await page.keyboard.press('Tab')
    await expect(page.locator('button:focus')).toHaveText(/Accept/)
    await page.keyboard.press('Tab')
    await expect(page.locator('button:focus')).toHaveText(/Request changes/)
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Changes requested/).first()).toBeVisible()
  })

  test('a dialog traps focus and returns it to the trigger on close', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
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
    await signInAsStaff(page, COORDINATOR, '/vendors')
    await expect(page.getByRole('table')).toBeHidden()
    await expect(page.getByRole('link', { name: IRONWOOD }).first()).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('the vendor portal is usable at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    await expect(page.getByRole('heading', { level: 1, name: IRONWOOD })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('direct links to deep routes work', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    const vendorId = await vendorIdOf(page, IRONWOOD)
    await page.goto(`/vendors/${vendorId}?tab=activity`)
    await expect(page.getByText('Added vendor Ironwood Pest Control')).toBeVisible()
    await page.goto('/vendors/does-not-exist')
    await expect(page.getByText('Vendor not found')).toBeVisible()
    await page.goto('/nope')
    await expect(page.getByText('Page not found')).toBeVisible()
  })
})
