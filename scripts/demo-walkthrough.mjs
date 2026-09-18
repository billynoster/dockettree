/**
 * Drives the five-minute demo script in an already-open Chrome window (CDP), so the flow
 * can be screen recorded. Requires the app running and Chrome started with
 * --remote-debugging-port=9222.
 *
 * Usage: node scripts/demo-walkthrough.mjs [baseUrl] [samplePdfPath]
 */
import { chromium } from '@playwright/test'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:43217'
const samplePdf = process.argv[3] ?? '/home/ubuntu/Downloads/sample-document.pdf'
const IRONWOOD = 'Ironwood Pest Control'

// Prefer an already-open Chrome (CDP) so the demo runs in the visible window; otherwise
// launch a headed browser on the current display.
let browser
let context
let page
try {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  context = browser.contexts()[0]
  page = context.pages()[0]
} catch {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--no-sandbox', '--window-position=0,0', '--window-size=1820,1040', '--start-maximized'],
  })
  context = await browser.newContext({ viewport: null })
  page = await context.newPage()
}
await page.bringToFront()

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

async function submitFromPortal(requirementTitle) {
  const card = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: requirementTitle }) })
    .first()
  await card.scrollIntoViewIfNeeded()
  await pause(800)
  await card.getByRole('button', { name: /Submit (document|replacement)/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#submit-file').setInputFiles(samplePdf)
  await pause(900)
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await page.getByText(/submitted and is now pending review/).waitFor()
  await pause(1500)
}

async function openReview(requirementTitle) {
  await page.goto(`${baseUrl}/review`)
  await pause(900)
  await page
    .locator('li')
    .filter({ hasText: IRONWOOD })
    .filter({ hasText: requirementTitle })
    .getByRole('link', { name: 'Open review' })
    .click()
  await page.getByText('Checklist instructions').waitFor()
  await pause(1600)
}

// 1. Overview, then the Not ready filter.
await page.goto(`${baseUrl}/overview`)
await page.getByRole('heading', { name: 'Overview' }).waitFor()
await pause(2500)
await page.getByRole('link', { name: /^Not ready 3/ }).click()
await page.getByText('3 vendors match these filters').waitFor()
await pause(2000)

// 2. The vendor that is missing a required acknowledgment.
await page.getByRole('link', { name: IRONWOOD }).first().click()
await page.getByText('Safety acknowledgment missing').waitFor()
await pause(2500)

// 3. Vendor submits from the demo portal.
await setRole('Vendor contact', IRONWOOD)
await page.getByRole('link', { name: 'Open demo portal' }).click()
await page.getByText('Vendor document portal').waitFor()
await pause(1500)
await submitFromPortal('Safety acknowledgment')

// 4. Reviewer requests changes with a reason.
await setRole('Reviewer')
await openReview('Safety acknowledgment')
await page.locator('#review-reason').click()
await page.locator('#review-reason').pressSequentially(
  'Page 2 is missing the signature date. Please sign and date it.',
  { delay: 18 },
)
await pause(900)
await page.getByRole('button', { name: 'Request changes' }).click()
await page.getByText(/has been notified in the simulated outbox/).waitFor()
await pause(1800)

// 5. Vendor reads the reason and submits a corrected version.
await setRole('Vendor contact', IRONWOOD)
await page.goto(`${baseUrl}/portal/${await vendorIdFor(IRONWOOD)}`)
await page.getByText('missing the signature date').first().waitFor()
await pause(2500)
await submitFromPortal('Safety acknowledgment')

// 6. Reviewer accepts; the vendor becomes Ready.
await setRole('Reviewer')
await openReview('Safety acknowledgment')
await page.getByRole('button', { name: 'Accept', exact: true }).click()
await page.getByText(/is now ready/i).waitFor()
await pause(2500)

// 7. Confirm readiness and that both versions survive in history.
await page.goto(`${baseUrl}/vendors/${await vendorIdFor(IRONWOOD)}`)
await page.getByText('3 of 3 required items satisfied').waitFor()
await pause(2000)
const safetyCard = page
  .locator('li')
  .filter({ has: page.getByRole('heading', { name: 'Safety acknowledgment' }) })
  .first()
await safetyCard.scrollIntoViewIfNeeded()
await safetyCard.getByText('Version history (2)').click()
await pause(3000)

async function vendorIdFor(companyName) {
  const current = page.url()
  await page.goto(`${baseUrl}/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  const href = await page.getByRole('link', { name: companyName }).first().getAttribute('href')
  if (current.includes('/portal/')) await page.goto(current)
  return href.split('/').pop()
}

console.log('demo walkthrough complete')
if (process.env.KEEP_BROWSER !== '1') await browser.close()
