/**
 * Contrast gate for the design tokens.
 *
 * Reads the OKLCH token values straight out of `src/index.css`, converts them to sRGB, and checks
 * every pair the design system promises: body and muted text on all three paper levels, each status
 * tone's text on its own tinted surface, and every non-text signal (dots, meters, borders, focus
 * ring) against the surface it sits on. A failing pair exits non-zero, so a token cannot be nudged
 * for looks without the failure being visible.
 *
 * Usage: node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CSS = readFileSync(path.resolve(import.meta.dirname, '../src/index.css'), 'utf8')

/** Pull `--name: oklch(L C H)` declarations out of the stylesheet. */
function readTokens(source) {
  const tokens = new Map()
  const pattern = /--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const [, name, l, c, h] = match
    if (!tokens.has(name)) tokens.set(name, [Number(l), Number(c), Number(h)])
  }
  return tokens
}

function oklchToSrgb([l, c, hDeg]) {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3

  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
  return linear.map((value) => Math.min(1, Math.max(0, value)))
}

function relativeLuminance(linearRgb) {
  const [r, g, b] = linearRgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(tokens, foreground, background) {
  const a = relativeLuminance(oklchToSrgb(tokens.get(foreground)))
  const b = relativeLuminance(oklchToSrgb(tokens.get(background)))
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

const SURFACES = ['paper', 'card', 'muted']
const TONES = ['ok', 'info', 'waiting', 'warn', 'expiring', 'danger', 'neutral']

/** [foreground, background, minimum ratio, why] */
function buildChecks() {
  const checks = []
  for (const surface of SURFACES) {
    checks.push(['foreground', surface, 7, 'body text (AAA)'])
    checks.push(['foreground-soft', surface, 4.5, 'secondary text'])
    checks.push(['muted-foreground', surface, 4.5, 'metadata and captions'])
  }
  for (const tone of TONES) {
    checks.push([`tone-${tone}-foreground`, `tone-${tone}-surface`, 4.5, `${tone} chip text`])
    checks.push([`tone-${tone}-foreground`, 'card', 4.5, `${tone} text on a card`])
    checks.push([`tone-${tone}-solid`, 'card', 3, `${tone} dot, meter and bar`])
    checks.push([`tone-${tone}-solid`, 'paper', 3, `${tone} dot on the page`])
  }
  checks.push(['primary-foreground', 'primary', 4.5, 'primary button label'])
  checks.push(['primary', 'card', 4.5, 'primary as text and as a filled control'])
  checks.push(['clay-text', 'card', 4.5, 'link text'])
  checks.push(['clay-text', 'tone-brand-surface', 4.5, 'link text on a brand tint'])
  checks.push(['clay-text', 'paper', 4.5, 'link text on the page'])
  checks.push(['clay', 'card', 3, 'focus ring and active indicator'])
  checks.push(['clay', 'paper', 3, 'focus ring on the page'])
  checks.push(['ring', 'card', 3, 'focus ring'])
  checks.push(['input', 'card', 3, 'input boundary'])
  checks.push(['input', 'paper', 3, 'input boundary on the page'])
  return checks
}

const tokens = readTokens(CSS)
const checks = buildChecks()
let failures = 0
const rows = []

for (const [foreground, background, minimum, why] of checks) {
  if (!tokens.has(foreground) || !tokens.has(background)) {
    console.error(`missing token: ${tokens.has(foreground) ? background : foreground}`)
    failures += 1
    continue
  }
  const ratio = contrast(tokens, foreground, background)
  const pass = ratio >= minimum
  if (!pass) failures += 1
  rows.push(
    `${pass ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(5)}:1 (min ${String(minimum).padStart(3)}) ${foreground} on ${background} — ${why}`,
  )
}

console.log(rows.join('\n'))
console.log(`\n${checks.length - failures}/${checks.length} pairs pass`)
if (failures > 0) {
  console.error(`\n${failures} contrast pair(s) below the minimum.`)
  process.exit(1)
}
