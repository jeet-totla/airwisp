// Calibration smoke test using the demo hand (mouse-driven) over a fake camera feed.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const port = 4176
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
let failed = null
try {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, permissions: ['camera'] })
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', e => errs.push(String(e)))
  await p.goto(`http://localhost:${port}/`)
  await p.getByText('Try it with your mouse').click()
  await p.waitForSelector('.board canvas')
  await p.evaluate(() => window.airwisp.calibrate(false))
  await p.waitForSelector('.calib-panel')
  const pts = [[.1, .14], [.9, .14], [.9, .86], [.1, .86], [.5, .5]]
  for (const [u, v] of pts) { await p.mouse.move(u * 1200, v * 800, { steps: 8 }); await p.waitForTimeout(1500) }
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/calib.png` })
  await p.keyboard.down(' '); await p.waitForTimeout(1500); await p.keyboard.up(' ')
  await p.waitForSelector('.board canvas', { timeout: 3000 })
  const err = await p.evaluate(() => window.airwisp.session.pipeline.mapper.fitError)
  assert.ok(err < 0.05, 'fit error ' + err)
  assert.deepEqual(errs, [])
} catch (e) { failed = e }
await b.close(); srv.kill()
if (failed) { console.error(failed); process.exit(1) }
console.log('calibrate ok')
