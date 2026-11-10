// Pairing smoke test: host and phone in one browser (BroadcastChannel transport). Phone camera/model are not needed for the link.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const port = 4175
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
let failed = null
try {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, permissions: ['camera'] })
  const host = await ctx.newPage()
  await host.goto(`http://localhost:${port}/?local=1`)
  await host.getByText('Laptop and phone').click()
  await host.waitForSelector('.code')
  const code = (await host.locator('.code').innerText()).trim()
  const phone = await ctx.newPage()
  await phone.goto(`http://localhost:${port}/?join=${code}&local=1`)
  await host.waitForSelector('.status-line.ok', { timeout: 8000 })
  assert.equal(await host.getByRole('button', { name: 'Continue' }).isEnabled(), true)
} catch (e) { failed = e }
await b.close(); srv.kill()
if (failed) { console.error(failed); process.exit(1) }
console.log('pair ok')
