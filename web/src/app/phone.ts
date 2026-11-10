import { h, brand, mount, drawHand } from './ui'
import { connect } from '../net/connect'
import { HandTracker } from '../vision/handTracker'
import { openCamera, onVideoFrames } from '../vision/camera'
import { distanceHint, distanceText, lightHint, lightText, meanLuminance } from '../vision/metrics'
import { features } from '../core/features'
import { isValidRoomCode, normalizeRoomCode, packHand } from '../net/protocol'
import type { Transport } from '../net/transport'

/** Phone page: joins a room, films the hand from the side, sends landmarks (never video) to the laptop. */
export async function runPhone(code: string | null, local: boolean): Promise<void> {
  document.body.classList.add('phone')
  if (!code || !isValidRoomCode(normalizeRoomCode(code))) return askCode(local)
  const room = normalizeRoomCode(code)

  const video = h('video', { playsinline: true, muted: true }) as HTMLVideoElement
  const overlay = h('canvas') as HTMLCanvasElement
  const title = h('h2', null, 'Starting camera…')
  const detail = h('p', { class: 'muted' }, 'Allow camera access when your browser asks.')
  const sheet = h('div', { class: 'sheet' }, title, detail)
  mount(h('div', { class: 'screen' }, h('div', { class: 'top' }, brand(), h('span', { class: 'muted' }, room)), h('div', { class: 'phone-view' }, video, overlay), sheet))

  let tr: Transport
  try { tr = await connect(room, local) } catch (e) { return fail(title, detail, 'Could not reach the laptop', 'Check your internet connection and scan the code again.') }
  let hostSeen = 0
  tr.onMessage = () => { hostSeen = performance.now() }
  const beat = window.setInterval(() => tr.send({ k: 'hello', role: 'phone', v: 1 }), 1000)
  tr.send({ k: 'hello', role: 'phone', v: 1 })
  const startedAt = performance.now()
  void beat

  let wake: WakeLockSentinel | null = null
  try { wake = await (navigator as any).wakeLock?.request('screen') } catch { /* optional */ }
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible') { try { wake = await (navigator as any).wakeLock?.request('screen') } catch { /* ignore */ } } })

  try { await openCamera(video, { facing: 'environment' }) }
  catch (e) { return fail(title, detail, 'Camera is blocked', 'Allow camera access for this page in your browser settings, then reload.') }
  title.textContent = 'Loading hand tracking…'; detail.textContent = 'This takes a few seconds the first time.'
  let tracker: HandTracker
  try { tracker = await HandTracker.create() } catch { return fail(title, detail, 'Hand tracking could not load', 'Check your connection and reload this page.') }

  let frames = 0, fpsT = performance.now(), fps = 0, light: number | null = null, lastStatus = 0, lastLight = 0
  let palm: number | null = null, seen = false
  onVideoFrames(video, now => {
    const hand = tracker.detect(video, now)
    const aspect = (video.videoWidth || 16) / (video.videoHeight || 9)
    if (now - lastLight > 700) { lastLight = now; light = meanLuminance(video) }
    palm = hand ? features(hand, aspect).palm : null; seen = !!hand
    tr.send({ k: 'lm', t: Math.round(now), a: aspect, p: packHand(hand) })
    drawHand(overlay, hand, '#FFB830', '#6C4DFF')
    frames++
    if (now - fpsT > 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now }
    if (now - lastStatus > 400) {
      lastStatus = now
      tr.send({ k: 'status', hand: seen, palm, light, fps })
      const linked = now - hostSeen < 3500
      const d = distanceHint(palm), l = lightHint(light)
      const good = d === 'good' && l === 'ok'
      sheet.classList.toggle('ok', good && linked)
      if (!linked) {
        title.textContent = 'Looking for your laptop…'
        detail.textContent = now - startedAt > 20000
          ? 'Still no link. Keep your laptop on the QR screen, turn off any VPN or Private Relay, then reload this page.'
          : 'Keep this page open. Your laptop should show “Phone connected” in a moment.'
        return
      }
      title.textContent = good ? 'Connected. This view is perfect.' : d === 'none' ? 'Connected. Show your hand to this camera' : 'Connected. ' + distanceText[d]
      detail.textContent = good ? 'Go back to your laptop for the next step.' : l !== 'ok' ? lightText[l] : 'Aim the phone at your hand from the side, about an arm’s length away.'
    }
  })
}

function fail(title: HTMLElement, detail: HTMLElement, a: string, b: string): void { title.textContent = a; detail.textContent = b }

function askCode(local: boolean): void {
  const input = h('input', { class: 'code-input', placeholder: 'CODE', maxlength: '9', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'Pairing code' }) as HTMLInputElement
  const go = h('button', { class: 'btn', onclick: () => {
    const c = normalizeRoomCode(input.value)
    if (!isValidRoomCode(c)) { err.textContent = 'That code should be 8 letters and numbers.'; return }
    const u = new URL(location.href); u.searchParams.set('join', c); if (local) u.searchParams.set('local', '1'); location.href = u.toString()
  } }, 'Join')
  const err = h('p', { class: 'muted', role: 'alert' })
  mount(h('div', { class: 'screen' }, h('div', { class: 'top' }, brand()), h('h1', null, 'Enter the code from your laptop'), input, go, err))
}
