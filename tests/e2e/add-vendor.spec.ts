import { expect, test } from './fixtures'
import {
  COORDINATOR,
  IRONWOOD_CONTACT,
  VENDOR_PASSWORD,
  samplePdfBuffer,
  signIn,
  signInAsStaff,
} from './helpers'

test.describe('W1 add vendor', () => {
  test('saves a vendor without inviting, then invites separately', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/vendors/new')
    await page.locator('#vendor-company_name').fill('Beacon Hill Glass')
    await page.getByLabel('Service category').click()
    await page.getByRole('option', { name: 'Window care' }).click()
    await page.locator('#vendor-contact_name').fill('Petra Ames')
    await page.locator('#vendor-contact_email').fill('petra.ames@example.com')

    await page.getByLabel('Checklist template').click()
    await page.getByRole('option', { name: /Standard service vendor/ }).click()
    await expect(page.getByText('Requirements copied to this vendor')).toBeVisible()

    await page.getByRole('button', { name: 'Save vendor', exact: true }).click()
    await expect(page.getByText('No invitation has been sent yet')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Beacon Hill Glass' })).toBeVisible()
    await expect(page.getByText('Not invited')).toBeVisible()
    await expect(page.getByText('Needs Action').first()).toBeVisible()

    await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('petra.ames@example.com')
    await dialog.getByRole('button', { name: 'Send invitation' }).click()
    await expect(dialog.getByText('Invitation created')).toBeVisible()
    await expect(dialog.locator('p.font-mono')).toContainText('/invitations/accept?token=')
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Invitation sent').first()).toBeVisible()

    await page.goto('/notifications?type=invitation')
    await expect(page.getByText('Beacon Hill Glass').first()).toBeVisible()
    await expect(page.getByText('Queued').first()).toBeVisible()
  })

  test('validates required fields inline and preserves entered values', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/vendors/new')
    await page.locator('#vendor-company_name').fill('Half Filled Vendor')
    await page.locator('#vendor-contact_email').fill('not-an-email')
    await page.getByRole('button', { name: 'Save vendor', exact: true }).click()

    await expect(page.locator('#vendor-contact_email-error')).toContainText('valid email address')
    await expect(page.locator('#vendor-company_name')).toHaveValue('Half Filled Vendor')
    await expect(page.locator('#vendor-contact_email')).toHaveValue('not-an-email')
    await expect(page).toHaveURL(/\/vendors\/new/)
  })

  test('warns about a duplicate company name until it is confirmed', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/vendors/new')
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
    await signInAsStaff(page, COORDINATOR, '/vendors/new')
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
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)

    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Company brochure' }) })
      .first()
    await card.getByRole('button', { name: /Submit (document|replacement)/ }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

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
