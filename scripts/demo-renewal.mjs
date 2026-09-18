/**
 * Drives the renewal half of the demo script (requirements W4) for screen recording:
 * a Ready vendor with a near expiration becomes Not ready when the demo clock passes the
 * expiration date, then a renewal is submitted and accepted and history is preserved.
 *
 * Usage: node scripts/demo-renewal.mjs [baseUrl] [samplePdfPath]
 */
import { chromium } from '@playwright/test'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:43217'
const samplePdf = process.argv[3] ?? '/home/ubuntu/Downloads/sample-document.pdf'
const CEDAR_LINE = 'Cedar Line Landscaping'

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--no-sandbox', '--window-position=0,0', '--window-size=1820,1040'],
})
const context = await browser.newContext({ viewport: null })
const page = await context.newPage()
const pause = (ms = 1200) => page.waitForTimeout(ms)

async function setRole(role, vendorName) {
  await page.getByLabel('Demo role').click()
  await page.getByRole('option', { name: role, exact: true }).click()
  await pause(600)
  if (vendorName) {
    await page.getByLabel('Vendor context').click()
    await page.getByRole('option', { name: vendorName, exact: true }).click()
    await pause(600)
  }
}

async function vendorIdFor(companyName) {
  await page.goto(`${baseUrl}/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  const href = await page.getByRole('link', { name: companyName }).first().getAttribute('href')
  return href.split('/').pop()
}

const vendorId = await vendorIdFor(CEDAR_LINE)

// Ready, but the insurance certificate expires on 2026-09-30.
await page.goto(`${baseUrl}/vendors/${vendorId}`)
await page.getByText('2 of 2 required items satisfied').waitFor()
await pause(3000)

// Advance the injected clock past the expiration date.
await page.locator('#demo-date').fill('2026-10-01')
await page.getByText('Insurance certificate expired').waitFor()
await pause(3500)

// The vendor submits a replacement certificate.
await setRole('Vendor contact', CEDAR_LINE)
await page.goto(`${baseUrl}/portal/${vendorId}`)
const card = page
  .locator('li')
  .filter({ has: page.getByRole('heading', { name: 'Insurance certificate' }) })
  .first()
await card.scrollIntoViewIfNeeded()
await pause(700)
await card.getByRole('button', { name: 'Submit replacement' }).click()
const dialog = page.getByRole('dialog')
await dialog.locator('#submit-file').setInputFiles(samplePdf)
await dialog.locator('#submit-issue').fill('2026-10-01')
await dialog.locator('#submit-expiration').fill('2027-10-01')
await pause(1200)
await dialog.getByRole('button', { name: 'Submit for review' }).click()
await page.getByText(/submitted and is now pending review/).waitFor()
await pause(1500)

// The reviewer accepts the renewal.
await setRole('Reviewer')
await page.goto(`${baseUrl}/review`)
await pause(700)
await page
  .locator('li')
  .filter({ hasText: CEDAR_LINE })
  .getByRole('link', { name: 'Open review' })
  .click()
await page.getByText('Currently effective version').waitFor()
await pause(2200)
await page.getByRole('button', { name: 'Accept', exact: true }).click()
await page.getByText(/Accepted Insurance certificate/).waitFor()
await pause(1800)

// Ready again, with the previous version superseded and still in history.
await page.goto(`${baseUrl}/vendors/${vendorId}`)
await page.getByText('2 of 2 required items satisfied').waitFor()
await pause(1500)
const insuranceCard = page
  .locator('li')
  .filter({ has: page.getByRole('heading', { name: 'Insurance certificate' }) })
  .first()
await insuranceCard.getByText('Version history (2)').click()
await pause(3500)

console.log('renewal walkthrough complete')
if (process.env.KEEP_BROWSER !== '1') await browser.close()
