import { expect, test } from '@playwright/test'
import { gotoApp, samplePdfBuffer, setRole } from './helpers'

test.describe('W1 add vendor', () => {
  test('saves a vendor without inviting, then invites separately', async ({ page }) => {
    await gotoApp(page, '/vendors/new')
    await page.locator('#vendor-company_name').fill('Beacon Hill Glass')
    await page.getByLabel('Service category').click()
    await page.getByRole('option', { name: 'Window care' }).click()
    await page.locator('#vendor-contact_name').fill('Petra Ames')
    await page.locator('#vendor-contact_email').fill('petra.ames@example.com')
    await page.getByRole('checkbox', { name: 'Riverfront Offices' }).click()

    await page.getByLabel('Checklist template').click()
    await page.getByRole('option', { name: /Standard service vendor/ }).click()
    await expect(page.getByText('Requirements copied to this vendor')).toBeVisible()

    await page.getByRole('button', { name: 'Save vendor', exact: true }).click()
    await expect(page.getByText('No invitation has been sent yet')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Beacon Hill Glass' })).toBeVisible()
    await expect(page.getByText('Not invited')).toBeVisible()
    await expect(page.getByText('Not ready').first()).toBeVisible()

    await page.getByRole('button', { name: 'Send invitation' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('petra.ames@example.com')
    await expect(dialog).toContainText('Simulated message')
    await dialog.getByRole('button', { name: 'Send simulated invitation' }).click()
    await expect(page.getByText(/Simulated invitation queued/)).toBeVisible()
    await expect(page.getByText('Invitation sent')).toBeVisible()

    await page.goto('/demo/outbox?type=invitation')
    await expect(page.getByText('Beacon Hill Glass').first()).toBeVisible()
  })

  test('validates required fields inline and preserves entered values', async ({ page }) => {
    await gotoApp(page, '/vendors/new')
    await page.locator('#vendor-company_name').fill('Half Filled Vendor')
    await page.locator('#vendor-contact_email').fill('not-an-email')
    await page.getByRole('button', { name: 'Save vendor', exact: true }).click()

    await expect(page.locator('#vendor-contact_email-error')).toContainText('valid email address')
    await expect(page.locator('#vendor-company_name')).toHaveValue('Half Filled Vendor')
    await expect(page.locator('#vendor-contact_email')).toHaveValue('not-an-email')
    await expect(page).toHaveURL(/\/vendors\/new/)
  })

  test('warns about a duplicate company name until it is confirmed', async ({ page }) => {
    await gotoApp(page, '/vendors/new')
    await page.locator('#vendor-company_name').fill('ironwood pest control')
    await page.getByLabel('Service category').click()
    await page.getByRole('option', { name: 'Pest control' }).click()
    await page.locator('#vendor-contact_name').fill('Other Contact')
    await page.locator('#vendor-contact_email').fill('other.contact@example.com')
    await page.getByRole('button', { name: 'Save vendor', exact: true }).click()

    await expect(page.getByText(/already exists in this organization/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Save as a separate vendor record' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'ironwood pest control' })).toBeVisible()
  })

  test('confirms before discarding unsaved changes', async ({ page }) => {
    await gotoApp(page, '/vendors/new')
    await page.locator('#vendor-company_name').fill('Unsaved Vendor')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('Discard this vendor?')
    await page.getByRole('button', { name: 'Keep editing' }).click()
    await expect(page.locator('#vendor-company_name')).toHaveValue('Unsaved Vendor')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page).toHaveURL(/\/vendors$/)
  })

  test('completes a portal upload using the keyboard only', async ({ page }) => {
    await gotoApp(page, '/vendors?q=Ironwood&lifecycle=all')
    const href = await page
      .getByRole('link', { name: 'Ironwood Pest Control' })
      .first()
      .getAttribute('href')
    const vendorId = href!.split('/').pop()!
    await setRole(page, 'Vendor contact', 'Ironwood Pest Control')
    await page.goto(`/portal/${vendorId}`)

    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Safety acknowledgment' }) })
      .first()
    // Open the upload dialog with the keyboard.
    await card.getByRole('button', { name: 'Submit document' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The file input is reachable by keyboard; set the file, then submit with Enter.
    await dialog.locator('#submit-file').focus()
    await expect(dialog.locator('#submit-file')).toBeFocused()
    await dialog.locator('#submit-file').setInputFiles({
      name: 'keyboard-upload.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdfBuffer('keyboard upload'),
    })
    await dialog.getByRole('button', { name: 'Submit for review' }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText(/submitted and is now pending review/)).toBeVisible()
  })
})
