// Captures above-the-fold viewport screenshots (not full page) for layout review.
// Usage: node scripts/layout-shots.mjs <out-dir> [prefix]
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:43217'
const outDir = process.argv[2] ?? '/tmp/layout-shots'
const prefix = process.argv[3] ?? 'v1-layout-'

const STAFF = ['marcus.reyes@example.com', 'cedar-grove-staff-2026']
const VENDOR = ['damon.frazier@example.com', 'cedar-grove-vendor-2026']

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

async function login(page, [email, password]) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page
    .getByRole('button', { name: 'Account menu' })
    .or(page.getByRole('button', { name: 'Sign out' }))
    .first()
    .waitFor()
  await page.waitForLoadState('networkidle')
}

async function shoot(page, name, viewport) {
  const file = path.join(outDir, `${prefix}${name}-${viewport}.png`)
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: file, fullPage: false })
  console.log(file)
}

async function run() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    await login(page, STAFF)

    for (const [route, name] of [
      ['/overview', 'overview'],
      ['/vendors', 'vendors'],
      ['/review', 'review'],
      ['/notifications', 'notifications'],
      ['/activity', 'activity'],
      ['/requirements', 'requirements'],
      ['/settings', 'settings'],
    ]) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
      // Dismiss the delivery notice when present so primary content is the first screen.
      const dismiss = page.getByRole('button', { name: 'Dismiss for this session' })
      if (await dismiss.count()) await dismiss.click().catch(() => {})
      await shoot(page, name, vp.name)
    }

    await context.close()

    const vendorCtx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    })
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
