// Real PeerJS pairing against a local PeerJS server (npx peerjs --port 9000). Skipped unless PEER_SERVER=1.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
if (!process.env.PEER_SERVER) { console.log('peer e2e skipped (set PEER_SERVER=1 with a local PeerJS server on :9000)'); process.exit(0) }
const port = 4177
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
let failed = null
try {
  const host = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
  await host.goto(`http://localhost:${port}/?peerhost=localhost&peerport=9000`)
  await host.getByText('Laptop and phone').click()
  await host.waitForFunction(() => document.querySelector('.code')?.textContent?.length === 8)
  const code = (await host.locator('.code').innerText()).trim()
  const phone = await (await b.newContext({ permissions: ['camera'] })).newPage()
  await phone.goto(`http://localhost:${port}/?join=${code}&peerhost=localhost&peerport=9000`)
  await host.waitForSelector('.status-line.ok', { timeout: 15000 })
} catch (e) { failed = e }
await b.close(); srv.kill()
if (failed) { console.error(failed); process.exit(1) }
console.log('peer ok')
