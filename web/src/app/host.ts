import { h, brand, mount, qrDataUrl, safeStorage, drawHand, toast } from './ui'
import { Session } from './session'
import { connect } from '../net/connect'
import { newRoomCode } from '../net/protocol'
import { distanceText, lightText } from '../vision/metrics'
import { playground } from './playground'
import type { Transport } from '../net/transport'

const store = safeStorage()

export function runHost(opts: { sim: boolean; local: boolean }): void {
  const s = new Session()
  let transport: Transport | null = null
  let room = store.get('airwisp-room') ?? ''
  const steps = (now: number, twoCam: boolean) => {
    const names = twoCam ? ['Pair phone', 'Check view', 'Calibrate', 'Play'] : ['Check view', 'Calibrate', 'Play']
    return h('div', { class: 'steps' }, ...names.map((n, i) => h('span', { class: i < now ? 'done' : i === now ? 'now' : '' }, n)))
  }
  const top = (now: number, two: boolean) => h('div', { class: 'top' }, brand(), steps(now, two))

  function landing(): void {
    mount(h('div', { class: 'screen' }, h('div', { class: 'top' }, brand()),
      h('div', { class: 'hero' },
        h('h1', null, 'Control this page with your hand'),
        h('p', { class: 'muted' }, 'Use your laptop camera, and add your phone for sharper clicks. Nothing to install. Video never leaves your devices.'),
        h('div', { class: 'choices' },
          choice('Laptop and phone', 'Best accuracy. Your phone watches from the side to catch clicks.', 'Recommended', () => pair()),
          choice('Laptop camera only', 'Quickest start. Clicks are a little less precise.', '', () => check(false)),
          choice('Try it with your mouse', 'No camera. Move the mouse, hold Space to pinch.', '', () => demo())),
        h('p', { class: 'fine' }, 'Airwisp moves a cursor inside this page. A website cannot move your computer’s own cursor.'))))
  }
  const choice = (t: string, d: string, tag: string, fn: () => void) =>
    h('button', { class: 'choice', onclick: fn }, h('b', null, t), tag ? h('span', { class: 'tag' }, tag) : null, h('small', null, d))

  async function demo(): Promise<void> { await s.startDemo(); calibrateOrPlay(false, true) }

  async function pair(): Promise<void> {
    if (!room) { room = newRoomCode(); store.set('airwisp-room', room) }
    const url = new URL(location.href); url.search = ''; url.hash = ''
    url.searchParams.set('join', room); if (opts.local) url.searchParams.set('local', '1')
    const link = url.toString()
    const img = h('img', { alt: 'QR code to open Airwisp on your phone' }) as HTMLImageElement
    const status = h('div', { class: 'status-line' }, h('i'), h('span', null, 'Waiting for your phone'))
    const next = h('button', { class: 'btn', disabled: true, onclick: () => check(true) }, 'Continue') as HTMLButtonElement
    mount(h('div', { class: 'screen' }, top(0, true),
      h('div', { class: 'split' },
        h('div', { class: 'hero' }, h('h1', null, 'Scan with your phone'),
          h('ol', { class: 'how' },
            h('li', null, 'Open your phone camera and scan this code.'),
            h('li', null, 'Allow camera access when asked.'),
            h('li', null, 'Prop the phone to the side of your hand, about an arm’s length away, facing it.')),
          status, h('div', { class: 'row' }, next, h('button', { class: 'btn quiet', onclick: landing }, 'Back')),
          h('p', { class: 'fine' }, 'No camera on your phone? Type the code ', h('b', null, room), ' at this page’s address on your phone.')),
        h('div', null, h('div', { class: 'qr' }, img), h('div', { class: 'code' }, room)))))
    img.src = await qrDataUrl(link)
    transport?.close()
    transport = await connect(room, opts.local)
    s.attach(transport)
    transport.send({ k: 'hello', role: 'host', v: 1 })
    s.onPhone = p => {
      status.classList.toggle('ok', p.connected)
      status.lastChild!.textContent = p.connected ? 'Phone connected' : 'Waiting for your phone'
      next.disabled = !p.connected
    }
  }

  async function check(two: boolean): Promise<void> {
    const video = h('video', { playsinline: true, muted: true }) as HTMLVideoElement
    const overlay = h('canvas') as HTMLCanvasElement
    const empty = h('div', { class: 'empty' }, 'Starting camera…')
    const mk = () => { const li = h('li', null, h('span', { class: 'dot' }), h('div', null, h('b'), h('small'))); return li }
    const cDist = mk(), cLight = mk(), cPhone = mk()
    const set = (li: HTMLElement, ok: boolean, t: string, sub = '') => { li.className = ok ? 'ok' : 'warn'; li.querySelector('b')!.textContent = t; li.querySelector('small')!.textContent = sub }
    const go = h('button', { class: 'btn', disabled: true, onclick: () => calibrateOrPlay(two, false) }, 'Continue') as HTMLButtonElement
    mount(h('div', { class: 'screen' }, top(two ? 1 : 0, two),
      h('div', { class: 'split' },
        h('div', { class: 'stage' }, video, overlay, empty),
        h('div', { class: 'hero' }, h('h1', null, 'Sit so your hand fits'),
          h('p', { class: 'muted' }, 'Sit about an arm’s length from the screen and hold your hand up as if you were pointing at it.'),
          h('ul', { class: 'checks' }, cDist, cLight, two ? cPhone : null), go))))
    try { await s.startCamera(video) } catch (e) {
      empty.textContent = 'Camera is blocked. Allow camera access in your browser’s address bar, then reload.'; return
    }
    empty.hidden = true
    s.onFront = f => {
      drawHand(overlay, f.hand)
      const d = s.distance(), l = s.light()
      set(cDist, d === 'good', distanceText[d]); set(cLight, l === 'ok', lightText[l])
      const p = s.phone
      if (two) set(cPhone, p.connected && p.hand, p.connected ? (p.hand ? 'Phone sees your hand' : 'Show your hand to the phone') : 'Phone disconnected', p.connected ? 'Aim it at your hand from the side.' : 'Reopen the link on your phone.')
      go.disabled = !(d === 'good' && l !== 'dark')
    }
    s.onPhone = () => {}
  }

  const CORNERS: [string, number, number][] = [['top left', .08, .1], ['top right', .92, .1], ['bottom left', .08, .9], ['bottom right', .92, .9]]
  function calibrateOrPlay(two: boolean, isDemo: boolean): void {
    if (isDemo) return play(two)
    const msg = h('p', { class: 'muted' }, 'Point at the glowing dot with your index finger and hold still.')
    const target = h('div', { class: 'target' })
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ring.innerHTML = '<circle cx="36" cy="36" r="36"/>'; target.append(ring)
    const circle = ring.firstElementChild as SVGElement
    const skip = h('button', { class: 'btn quiet', onclick: () => { finish(false) } }, 'Skip')
    mount(h('div', { class: 'calib' }, h('div', null, h('h1', null, 'Quick calibration'), msg, skip), target))
    const got: [number, number][] = []; let i = 0, hold = 0, last = performance.now(); let acc: [number, number][] = []
    const place = () => { target.style.left = CORNERS[i][1] * 100 + '%'; target.style.top = CORNERS[i][2] * 100 + '%'; circle.style.strokeDashoffset = '226' }
    const finish = (apply: boolean) => {
      s.onFront = null
      if (apply && got.length === 4) s.pipeline.mapper.setCorners(got[0], got[1], got[2], got[3])
      play(two)
    }
    place()
    s.onFront = f => {
      const now = performance.now(); const dt = (now - last) / 1000; last = now
      if (!f.raw) { hold = 0; acc = []; circle.style.strokeDashoffset = '226'; return }
      hold += dt; acc.push(f.raw); if (acc.length > 20) acc.shift()
      circle.style.strokeDashoffset = String(226 * (1 - Math.min(1, hold / 1.3)))
      if (hold >= 1.3) {
        got.push([acc.reduce((a, p) => a + p[0], 0) / acc.length, acc.reduce((a, p) => a + p[1], 0) / acc.length])
        hold = 0; acc = []; i++
        if (i >= 4) return finish(true)
        place()
        msg.textContent = `Now the ${CORNERS[i][0]} dot.`
      }
    }
  }

  function play(two: boolean): void {
    s.live = true; s.cursor.show(true)
    mount(playground(s, () => { s.live = false; s.cursor.show(false); s.pipeline.mapper.clearCalibration(); calibrateOrPlay(two, s.mode === 'demo') }, two ? () => { s.live = false; s.cursor.show(false); pair() } : null))
    toast(s.mode === 'demo' ? 'Move the mouse to steer the wisp' : 'Point at the screen')
  }

  landing()
  ;(window as any).airwisp = { session: s }
}
