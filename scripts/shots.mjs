// Development helper: captures screenshots of the running dev server for design review.
// Usage: node scripts/shots.mjs <out-dir> [prefix]
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:43217'
const outDir = process.argv[2] ?? '/tmp/shots'
const prefix = process.argv[3] ?? ''

const STAFF = ['marcus.reyes@example.com', 'cedar-grove-staff-2026']
const VENDOR = ['damon.frazier@example.com', 'cedar-grove-vendor-2026']

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

async function login(page, [email, password]) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForLoadState('networkidle')
}

async function shoot(page, name, viewport) {
  const file = path.join(outDir, `${prefix}${name}-${viewport}.png`)
  await page.waitForTimeout(450)
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}

async function run() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 })
    const page = await context.newPage()

    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await shoot(page, 'login', vp.name)

    await login(page, STAFF)
    await shoot(page, 'overview', vp.name)

    for (const [route, name] of [
      ['/vendors', 'vendors'],
      ['/review', 'review'],
      ['/requirements', 'requirements'],
      ['/notifications', 'notifications'],
      ['/activity', 'activity'],
      ['/settings', 'settings'],
    ]) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
      await shoot(page, name, vp.name)
    }

    // First vendor detail.
    await page.goto(`${BASE}/vendors`, { waitUntil: 'networkidle' })
    const firstVendor = page.getByRole('link', { name: /open vendor|^[A-Z]/ })
    await page.locator('a[href^="/vendors/"]').first().click()
    await page.waitForLoadState('networkidle')
    await shoot(page, 'vendor-detail', vp.name)
    void firstVendor

    // First review item, if any.
    await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' })
    const reviewLink = page.locator('a[href^="/review/"]').first()
    if (await reviewLink.count()) {
      await reviewLink.click()
      await page.waitForLoadState('networkidle')
      await shoot(page, 'review-detail', vp.name)
    }

    await context.close()

    const vendorCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 })
    const vendorPage = await vendorCtx.newPage()
    await login(vendorPage, VENDOR)
    await shoot(vendorPage, 'portal', vp.name)
    await vendorCtx.close()
  }

  await browser.close()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
