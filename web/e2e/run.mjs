// Browser smoke test in demo mode (no camera needed). Run: npm run build && npm run e2e
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const port = 4173
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const browser = await chromium.launch()
let failed = null
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/`)
  await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/landing.png` : '/dev/null' }).catch(() => {})
  await page.getByText('Try it with your mouse').click()
  await page.waitForSelector('.board canvas')
  assert.equal(await page.locator('#aircursor').isVisible(), true)

  // steer the wisp over a pad with the mouse; pinch (Space) should click it
  const pad = page.locator('.pad').first()
  const box = await pad.boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  for (let i = 0; i < 40; i++) { await page.mouse.move(cx + (i % 2), cy); await page.waitForTimeout(40) }
  const hovered = await pad.evaluate(e => e.classList.contains('air-hover'))
  assert.equal(hovered, true, 'cursor should hover the pad')
  await page.keyboard.down(' '); await page.waitForTimeout(450); await page.keyboard.up(' '); await page.waitForTimeout(300)
  assert.equal(await pad.evaluate(e => e.classList.contains('lit')), true, 'pinch should click the pad')
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/play.png` })
  assert.deepEqual(errors, [])
} catch (e) { failed = e }
await browser.close(); srv.kill()
if (failed) { console.error(failed); process.exit(1) }
console.log('e2e ok')
