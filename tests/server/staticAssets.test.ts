/**
 * Production serves Vite `dist/` (including `public/` copies). Brand PNGs and favicons
 * must return real image bytes — not the SPA HTML shell.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer, type TestServer } from './testServer'

const DIST = path.resolve(process.cwd(), 'dist')
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let server: TestServer
let wroteDist = false

beforeEach(async () => {
  mkdirSync(path.join(DIST, 'brand'), { recursive: true })
  writeFileSync(path.join(DIST, 'index.html'), '<!doctype html><html><body>shell</body></html>')
  writeFileSync(path.join(DIST, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  writeFileSync(path.join(DIST, 'favicon-32.png'), PNG_MAGIC)
  writeFileSync(path.join(DIST, 'brand', 'logo-mark.png'), PNG_MAGIC)
  wroteDist = true
  server = await createTestServer({ seed: false })
})

afterEach(() => {
  server.close()
  if (wroteDist) {
    rmSync(DIST, { recursive: true, force: true })
    wroteDist = false
  }
})

describe('production static brand assets', () => {
  it('serves favicon and brand PNGs from dist with image bodies', async () => {
    const mark = await server.app.request('http://localhost/brand/logo-mark.png')
    expect(mark.status).toBe(200)
    expect(mark.headers.get('content-type') ?? '').not.toMatch(/text\/html/)
    expect(Buffer.from(await mark.arrayBuffer()).subarray(0, 8).equals(PNG_MAGIC)).toBe(true)

    const faviconPng = await server.app.request('http://localhost/favicon-32.png')
    expect(faviconPng.status).toBe(200)
    expect(Buffer.from(await faviconPng.arrayBuffer()).subarray(0, 8).equals(PNG_MAGIC)).toBe(true)

    const faviconSvg = await server.app.request('http://localhost/favicon.svg')
    expect(faviconSvg.status).toBe(200)
    expect(await faviconSvg.text()).toContain('<svg')
  })

  it('still returns the SPA shell for unknown client routes', async () => {
    const response = await server.app.request('http://localhost/vendors')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type') ?? '').toMatch(/text\/html/)
    expect(await response.text()).toContain('shell')
  })
})
