/**
 * Capture walkthrough screenshots from a clean seeded demo.
 * Usage: node scripts/capture-screenshots.mjs <output-dir> [baseUrl]
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const outputDir = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:43218'
if (!outputDir) {
  console.error('Pass an output directory.')
  process.exit(1)
}
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()

const shot = async (name, options = {}) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${outputDir}/${name}.png`, ...options })
  console.log('wrote', name)
}

const vendorId = async (companyName) => {
  await page.goto(`${baseUrl}/vendors?q=${encodeURIComponent(companyName)}&lifecycle=all`)
  await page.getByRole('link', { name: companyName }).first().waitFor()
  const href = await page.getByRole('link', { name: companyName }).first().getAttribute('href')
  return href.split('/').pop()
}

await page.goto(`${baseUrl}/overview`)
await page.getByRole('heading', { name: 'Overview' }).waitFor()
await shot('screenshot_overview_counts')

await page.goto(`${baseUrl}/vendors?readiness=not_ready`)
await page.getByText('3 vendors match these filters').waitFor()
await shot('screenshot_vendors_not_ready_filter', { fullPage: true })

const ironwood = await vendorId('Ironwood Pest Control')
await page.goto(`${baseUrl}/vendors/${ironwood}`)
await page.getByText('Safety acknowledgment missing').waitFor()
await shot('screenshot_vendor_detail_blockers', { fullPage: true })

// Reviewer role so the decision controls are visible.
await page.getByLabel('Demo role').click()
await page.getByRole('option', { name: 'Reviewer', exact: true }).click()
await page.waitForTimeout(500)
await page.goto(`${baseUrl}/review`)
await page.getByRole('link', { name: 'Open review' }).first().click()
await page.getByText('Checklist instructions').waitFor()
await shot('screenshot_review_reviewer_decision')

// Vendor-contact role so the portal shows the submit actions a vendor sees.
await page.getByLabel('Demo role').click()
await page.getByRole('option', { name: 'Vendor contact', exact: true }).click()
await page.getByLabel('Vendor context').click()
await page.getByRole('option', { name: 'Ironwood Pest Control', exact: true }).click()
await page.waitForTimeout(500)
await page.goto(`${baseUrl}/portal/${ironwood}`)
await page.getByText('Vendor document portal').waitFor()
await shot('screenshot_vendor_portal', { fullPage: true })

await page.getByLabel('Demo role').click()
await page.getByRole('option', { name: 'Coordinator', exact: true }).click()
await page.waitForTimeout(500)

await page.goto(`${baseUrl}/demo/outbox`)
await page.getByText('This prototype never sends email.').waitFor()
await shot('screenshot_simulated_outbox', { fullPage: true })

const mobile = await browser.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 2,
})
const mobilePage = await mobile.newPage()
await mobilePage.goto(`${baseUrl}/vendors`)
await mobilePage.getByRole('link', { name: 'Open vendor' }).first().waitFor()
await mobilePage.waitForTimeout(700)
await mobilePage.screenshot({ path: `${outputDir}/screenshot_vendors_mobile_390px.png`, fullPage: true })
console.log('wrote screenshot_vendors_mobile_390px')

await browser.close()
