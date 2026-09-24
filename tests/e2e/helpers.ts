import { expect, type Page } from '@playwright/test'

/** Minimal valid PDF so uploads exercise real bytes and server-side content sniffing. */
export function samplePdfBuffer(label = 'End-to-end sample document'): Buffer {
  const content = `BT /F1 14 Tf 60 700 Td (${label}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

export const IRONWOOD = 'Ironwood Pest Control'
export const CEDAR_LINE = 'Cedar Line Landscaping'
export const STAFF_PASSWORD = 'cedar-grove-staff-2026'
export const VENDOR_PASSWORD = 'cedar-grove-vendor-2026'

export const ADMIN = 'dana.whitfield@example.com'
export const COORDINATOR = 'marcus.reyes@example.com'
export const REVIEWER = 'priya.raman@example.com'
export const IRONWOOD_CONTACT = 'damon.frazier@example.com'
export const CEDAR_LINE_CONTACT = 'rosa.delgado@example.com'

/** Date offset from today, so expectations never depend on a fixed calendar day. */
export function dateFromToday(days: number): string {
  const value = new Date(Date.now() + days * 86_400_000)
  return value.toISOString().slice(0, 10)
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(signOutControl(page)).toBeVisible()
}

/**
 * Staff sign out from the account menu in the header; the vendor portal keeps a direct button
 * because it has no other chrome. This resolves whichever of the two is on screen.
 */
export function signOutControl(page: Page) {
  return page
    .getByRole('button', { name: 'Account menu' })
    .or(page.getByRole('button', { name: 'Sign out' }))
    .first()
}

export async function signOut(page: Page) {
  const accountMenu = page.getByRole('button', { name: 'Account menu' })
  const direct = page.getByRole('button', { name: 'Sign out' })
  await expect(signOutControl(page)).toBeVisible()
  if ((await accountMenu.count()) > 0) {
    await accountMenu.click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
  } else {
    await direct.click()
  }
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
}

export async function signInAsStaff(page: Page, email = COORDINATOR, path = '/overview') {
  await signIn(page, email, STAFF_PASSWORD)
  await page.goto(path)
}

/** Open a vendor detail page by company name via the directory search. */
export async function openVendor(page: Page, companyName: string) {
  await page.goto(`/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  await page.getByRole('link', { name: companyName }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: companyName })).toBeVisible()
}

export async function vendorIdOf(page: Page, companyName: string) {
  await page.goto(`/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  const href = await page.getByRole('link', { name: companyName }).first().getAttribute('href')
  return href!.split('/').pop()!
}

export async function submitDocumentFromPortal(
  page: Page,
  requirementTitle: string,
  options: { expiration?: string; issue?: string; label?: string } = {},
) {
  const card = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: requirementTitle }) })
    .first()
  await card.getByRole('button', { name: /Submit (document|replacement)/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#submit-file').setInputFiles({
    name: 'sample-upload.pdf',
    mimeType: 'application/pdf',
    buffer: samplePdfBuffer(options.label ?? requirementTitle),
  })
  if (options.issue) await dialog.locator('#submit-issue').fill(options.issue)
  if (options.expiration) await dialog.locator('#submit-expiration').fill(options.expiration)
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

export async function openReview(page: Page, vendorName: string, requirementTitle?: string) {
  await page.goto('/review')
  let rows = page.locator('li').filter({ hasText: vendorName })
  if (requirementTitle) rows = rows.filter({ hasText: requirementTitle })
  await rows.locator('a[href^="/review/"]').first().click()
}

/** The first pending submission in the queue, whatever it is. */
export async function openFirstReview(page: Page) {
  await page.goto('/review')
  await page.locator('a[href^="/review/"]').first().click()
}
