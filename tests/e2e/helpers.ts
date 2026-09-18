import { expect, type Page } from '@playwright/test'

/** Minimal valid PDF so uploads exercise real bytes and content sniffing. */
export function samplePdfBuffer(label = 'E2E sample document'): Buffer {
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

export async function gotoApp(page: Page, path = '/overview') {
  await page.goto(path)
  await expect(page.getByRole('region', { name: 'Demo tools', exact: true })).toBeVisible()
}

export async function setRole(
  page: Page,
  role: 'Admin' | 'Coordinator' | 'Reviewer' | 'Vendor contact',
  vendorName?: string,
) {
  await page.getByLabel('Demo role').click()
  await page.getByRole('option', { name: role, exact: true }).click()
  if (role === 'Vendor contact' && vendorName) {
    await page.getByLabel('Vendor context').click()
    await page.getByRole('option', { name: vendorName, exact: true }).click()
  }
  await expect(page.getByLabel('Demo role')).toContainText(role)
}

export async function setDemoDate(page: Page, date: string) {
  await page.locator('#demo-date').fill(date)
  await expect(page.locator('#demo-date')).toHaveValue(date)
}

/** Open a vendor detail page by company name via the directory search. */
export async function openVendor(page: Page, companyName: string) {
  await page.goto(`/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  await page.getByRole('link', { name: companyName }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: companyName })).toBeVisible()
}

export async function submitDocumentFromPortal(
  page: Page,
  requirementTitle: string,
  options: { expiration?: string; issue?: string; label?: string } = {},
) {
  const card = page.locator('li').filter({ has: page.getByRole('heading', { name: requirementTitle }) }).first()
  await card.getByRole('button', { name: /Submit (document|replacement)/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog
    .locator('#submit-file')
    .setInputFiles({
      name: 'sample-upload.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdfBuffer(options.label ?? requirementTitle),
    })
  if (options.issue) await dialog.locator('#submit-issue').fill(options.issue)
  if (options.expiration) await dialog.locator('#submit-expiration').fill(options.expiration)
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}
