import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = '/cursor/stores/bc-b19521ff-3494-4116-8e49-fb6ce8dbeb36/media/properties-reports'
const ART = '/opt/cursor/artifacts/screenshots'
mkdirSync(OUT, { recursive: true })
mkdirSync(ART, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()

async function save(name) {
  const path = `${OUT}/${name}`
  await page.screenshot({ path, fullPage: false })
  await page.screenshot({ path: `${ART}/${name}`, fullPage: false })
  console.log('wrote', path)
}

await page.goto('http://127.0.0.1:43217/login', { waitUntil: 'networkidle' })
await page.locator('#login-email, input[type="email"]').first().fill('dana.whitfield@example.com')
await page.locator('#login-password').fill('cedar-grove-staff-2026')
await page.getByRole('button', { name: /sign in/i }).click()
await page.waitForURL(/\/overview/)

await page.goto('http://127.0.0.1:43217/properties', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Properties' }).waitFor()
await page.getByRole('option').first().click()
await save('properties-list-desktop.png')

await page.getByRole('button', { name: /add property/i }).click()
await page.getByRole('heading', { name: /add property/i }).waitFor()
await save('properties-empty-create-desktop.png')
await page.keyboard.press('Escape')

await page.goto('http://127.0.0.1:43217/reports', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Reports' }).waitFor()
await page.getByText('By property', { exact: true }).waitFor()
await save('reports-desktop.png')

await page.setViewportSize({ width: 390, height: 844 })
await page.goto('http://127.0.0.1:43217/properties', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Properties' }).waitFor()
await save('properties-mobile-390.png')

await page.goto('http://127.0.0.1:43217/reports', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Reports' }).waitFor()
await save('reports-mobile-390.png')

await browser.close()
console.log('done')
