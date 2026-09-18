import { expect, test } from './fixtures'
import {
  ADMIN,
  COORDINATOR,
  IRONWOOD,
  IRONWOOD_CONTACT,
  STAFF_PASSWORD,
  VENDOR_PASSWORD,
  openVendor,
  signIn,
  signInAsStaff,
  signOut,
  submitDocumentFromPortal,
  vendorIdOf,
} from './helpers'

test.describe('authentication', () => {
  test('an unauthenticated visitor is sent to sign in and cannot reach any data', async ({ page }) => {
    await page.goto('/overview')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('Cedar Grove Property Operations')).toBeVisible()

    const api = await page.request.get('/api/overview')
    expect(api.status()).toBe(401)
  })

  test('a wrong password shows an inline error and no session', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(ADMIN)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Check the email and password and try again.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  })

  test('signing out ends the session for protected pages', async ({ page }) => {
    await signInAsStaff(page)
    await signOut(page)
    await page.goto('/vendors')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('a vendor contact only ever sees their own portal', async ({ page }) => {
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    await expect(page.getByText('Vendor document portal')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: IRONWOOD })).toBeVisible()

    for (const route of ['/vendors', '/overview', '/review', '/notifications', '/settings']) {
      await page.goto(route)
      await expect(page.getByText('Vendor document portal')).toBeVisible()
    }
    const denied = await page.request.get('/api/vendors')
    expect(denied.status()).toBe(403)
  })
})

test.describe('invitation to portal', () => {
  test('an invitation creates an account that opens the vendor’s own portal', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    await openVendor(page, 'Willow Creek Signage')

    await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('beatriz.ortiz@example.com')
    await expect(dialog).toContainText('Email delivery is not configured')
    await dialog.getByRole('button', { name: 'Send invitation' }).click()
    await expect(dialog.getByText('Invitation created')).toBeVisible()
    const link = await dialog.locator('p.font-mono').innerText()
    await dialog.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByText('Invitation sent').first()).toBeVisible()
    await signOut(page)

    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByText('Willow Creek Signage')).toBeVisible()
    await page.getByLabel('Your name').fill('Beatriz Ortiz')
    await page.getByLabel('Choose a password').fill('willow-creek-password')
    await page.getByRole('button', { name: /Create account/ }).click()

    await expect(page.getByText('Vendor document portal')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Willow Creek Signage' })).toBeVisible()

    // The link is single use.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByText(/already used/)).toBeVisible()
  })

  test('an invalid invitation link explains itself without exposing records', async ({ page }) => {
    await page.goto('/invitations/accept?token=definitely-not-a-real-token')
    await expect(page.getByText('This invitation cannot be used')).toBeVisible()
    await expect(page.getByText(/not valid/)).toBeVisible()
    await expect(page.getByText('Cedar Grove')).toHaveCount(0)
  })
})

test.describe('member administration', () => {
  test('an admin adds a member who can then sign in', async ({ page }) => {
    await signInAsStaff(page, ADMIN, '/settings')
    await page.locator('#member-name').fill('Ravi Okonkwo')
    await page.locator('#member-email').fill('ravi.okonkwo@example.com')
    await page.locator('#member-password').fill('a-long-enough-password')
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByText(/can now sign in as coordinator/)).toBeVisible()
    await signOut(page)

    await signIn(page, 'ravi.okonkwo@example.com', 'a-long-enough-password')
    await expect(page.getByText('Ravi Okonkwo', { exact: true })).toBeVisible()
  })

  test('a coordinator cannot change organization settings', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR, '/settings')
    await expect(page.getByText('Only an admin can change organization settings.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0)
  })
})

test.describe('upload authorization', () => {
  test('a document is only served to a caller authorized for that vendor', async ({ page }) => {
    await signInAsStaff(page, COORDINATOR)
    const otherVendorId = await vendorIdOf(page, 'Riverstone Mechanical Services')
    const detail = await page.request.get(`/api/vendors/${otherVendorId}`)
    const otherSubmissionId = (await detail.json()).snapshot.submissions[0].id
    await signOut(page)

    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    expect((await page.request.get(`/api/vendors/${otherVendorId}`)).status()).toBe(403)
    expect((await page.request.get(`/api/submissions/${otherSubmissionId}/file`)).status()).toBe(403)
  })

  test('a vendor uploads a document, sees it pending review, and can withdraw it', async ({ page }) => {
    await signIn(page, IRONWOOD_CONTACT, VENDOR_PASSWORD)
    await submitDocumentFromPortal(page, 'Safety acknowledgment')
    await expect(page.getByText('Pending review').first()).toBeVisible()
    await page.reload()
    await expect(page.getByText('Pending review').first()).toBeVisible()

    // Withdrawing while pending restores the earlier state and keeps the history.
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Safety acknowledgment' }) })
      .first()
    await card.getByRole('button', { name: 'Withdraw pending' }).click()
    await expect(page.getByText(/Withdrew Safety acknowledgment/).first()).toBeVisible()
    await expect(page.getByText('No document submitted yet.').first()).toBeVisible()
  })
})
