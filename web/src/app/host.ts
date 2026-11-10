import { h, brand, mount, qrDataUrl, safeStorage, drawCam, toast } from './ui'
import { Session } from './session'
import { connect } from '../net/connect'
import { newRoomCode } from '../net/protocol'
import { distanceText, lightText } from '../vision/metrics'
import { playground } from './playground'

const store = safeStorage()

export function runHost(opts: { sim: boolean; local: boolean }): void {
  const s = new Session()
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

  async function demo(): Promise<void> { await s.startDemo(); play(false) }

  async function pair(): Promise<void> {
    if (!room) { room = newRoomCode(); store.set('airwisp-room', room) }
    const url = new URL(location.href); url.search = ''; url.hash = ''
    url.searchParams.set('join', room); if (opts.local) url.searchParams.set('local', '1')
    const link = url.toString()
    const img = h('img', { alt: 'QR code to open Airwisp on your phone' }) as HTMLImageElement
    const status = h('div', { class: 'status-line' }, h('i'), h('span', null, 'Waiting for your phone'))
    const tip = h('p', { class: 'fine', hidden: true }, 'Taking a while? Keep this page open, turn off any VPN or iCloud Private Relay on both devices, then press Reconnect.')
    const next = h('button', { class: 'btn', disabled: true, onclick: () => check(true) }, 'Continue') as HTMLButtonElement
    const link2 = async () => { s.detach(); s.attach(await connect(room, opts.local)); hookPhone() }
    const hookPhone = () => {
      s.onPhone = p => {
        status.classList.toggle('ok', p.connected)
        status.lastChild!.textContent = p.connected ? 'Phone connected' : 'Waiting for your phone'
        next.disabled = !p.connected
        if (p.connected) tip.hidden = true
      }
      s.onPhone(s.phone)
    }
    mount(h('div', { class: 'screen' }, top(0, true),
      h('div', { class: 'split' },
        h('div', { class: 'hero' }, h('h1', null, 'Scan with your phone'),
          h('ol', { class: 'how' },
            h('li', null, 'Open your phone camera and scan this code.'),
            h('li', null, 'Allow camera access when asked.'),
            h('li', null, 'Prop the phone to the side of your hand, about an arm’s length away, facing it.')),
          status, tip,
          h('div', { class: 'row' }, next, h('button', { class: 'btn quiet', onclick: () => { tip.hidden = true; void link2() } }, 'Reconnect'), h('button', { class: 'btn quiet', onclick: landing }, 'Back')),
          h('p', { class: 'fine' }, 'No camera on your phone? Type the code ', h('b', null, room), ' at this page’s address on your phone.')),
        h('div', null, h('div', { class: 'qr' }, img), h('div', { class: 'code' }, room)))))
    img.src = await qrDataUrl(link)
    await link2()
    window.setTimeout(() => { if (!s.phone.connected) tip.hidden = false }, 15000)
  }

  async function check(two: boolean): Promise<void> {
    const cam = h('canvas', { class: 'mirror' }) as HTMLCanvasElement
    const empty = h('div', { class: 'empty' }, 'Starting camera…')
    const mk = () => h('li', null, h('span', { class: 'dot' }), h('div', null, h('b'), h('small')))
    const cDist = mk(), cLight = mk(), cPhone = mk()
    const set = (li: HTMLElement, ok: boolean, t: string, sub = '') => { li.className = ok ? 'ok' : 'warn'; li.querySelector('b')!.textContent = t; li.querySelector('small')!.textContent = sub }
    const go = h('button', { class: 'btn', disabled: true, onclick: () => calibrate(two) }, 'Continue') as HTMLButtonElement
    const anyway = h('button', { class: 'btn quiet', onclick: () => calibrate(two) }, 'Continue anyway')
    mount(h('div', { class: 'screen' }, top(two ? 1 : 0, two),
      h('div', { class: 'split' },
        h('div', { class: 'stage' }, cam, empty),
        h('div', { class: 'hero' }, h('h1', null, 'Sit so your hand fits'),
          h('p', { class: 'muted' }, 'Sit about an arm’s length from the screen and hold your hand up as if you were pointing at it.'),
          h('ul', { class: 'checks' }, cDist, cLight, two ? cPhone : null), h('div', { class: 'row' }, go, anyway)))))
    try { await s.startCamera() } catch (e) {
      empty.textContent = 'Camera is blocked. Allow camera access in your browser’s address bar, then reload.'; return
    }
    empty.hidden = true
    const refreshPhone = () => {
      if (!two) return
      const p = s.phone
      set(cPhone, p.connected && p.hand, p.connected ? (p.hand ? 'Phone sees your hand' : 'Show your hand to the phone') : 'Phone disconnected', p.connected ? 'Aim it at your hand from the side.' : 'Reopen the link on your phone.')
    }
    s.onPhone = refreshPhone
    s.onFront = f => {
      drawCam(cam, s.video, f.hand)
      const d = s.distance(), l = s.light()
      set(cDist, d === 'good', distanceText[d]); set(cLight, l === 'ok', lightText[l])
      refreshPhone()
      go.disabled = !(d === 'good' && l !== 'dark')
    }
  }

  // Five dots: corners then centre. A projective fit to all five is far more accurate than the default zone.
  const DOTS: [number, number][] = [[.1, .14], [.9, .14], [.9, .86], [.1, .86], [.5, .5]]
  const DOT_NAMES = ['top left', 'top right', 'bottom right', 'bottom left', 'centre']
  const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }

  async function calibrate(two: boolean): Promise<void> {
    await s.startCamera().catch(() => {})
    s.live = false; s.cursor.show(false)
    const cam = h('canvas', { class: 'cam' }) as HTMLCanvasElement
    const title = h('h1', null, 'Point at each dot')
    const hint = h('p', { class: 'hint' }, 'Raise your hand and point your index finger at the glowing dot.')
    const bar = h('i'); const prog = h('div', { class: 'prog' }, bar)
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ring.innerHTML = '<circle cx="36" cy="36" r="36"/>'
    const circle = ring.firstElementChild as SVGElement
    const target = h('div', { class: 'target' }); target.append(ring)
    const marks = DOTS.map(([u, v]) => h('div', { class: 'mark', style: `left:${u * 100}%;top:${v * 100}%` }))
    const back = h('button', { class: 'btn quiet', onclick: () => { if (step === 'pinch') { step = 'dots'; i = 4; got.pop(); openR.length = 0 } else if (i > 0) { i--; got.pop() } resetHold(); render() } }, 'Back')
    const skip = h('button', { class: 'btn quiet', onclick: () => finish(false) }, 'Skip for now')
    mount(h('div', { class: 'calib' }, cam, ...marks, target, h('div', { class: 'calib-panel' }, title, hint, prog, h('div', { class: 'row' }, back, skip))))

    let step: 'dots' | 'pinch' = 'dots'
    let i = 0, progress = 0, last = performance.now()
    const got: { cam: [number, number]; screen: [number, number] }[] = []
    let win: { x: number; y: number; r: number | null; pr: number | null }[] = []
    const openR: number[] = [], openP: number[] = []
    let closedR: number | null = null, closedP: number | null = null
    const resetHold = () => { progress = 0; win = [] }
    const setHint = (t: string, cls = '') => { hint.textContent = t; hint.className = 'hint ' + cls }

    function render(): void {
      marks.forEach((m, k) => { m.classList.toggle('done', k < got.length) })
      if (step === 'dots') {
        target.hidden = false
        target.style.left = DOTS[i][0] * 100 + '%'; target.style.top = DOTS[i][1] * 100 + '%'
        title.textContent = `Point at the ${DOT_NAMES[i]} dot (${i + 1} of ${DOTS.length})`
      } else {
        target.hidden = true
        title.textContent = 'Last step: pinch'
        setHint('Touch your thumb and index finger together and hold.')
      }
      circle.style.strokeDashoffset = '226'; bar.style.width = '0'
    }

    function finish(apply: boolean): void {
      s.onFront = null
      if (apply) {
        const err = s.pipeline.mapper.setCalibration(got)
        if (!(err < 0.12)) { toast('That calibration was off. Let’s try again.'); s.pipeline.mapper.clearCalibration(); got.length = 0; step = 'dots'; i = 0; resetHold(); s.onFront = onFrame; render(); return }
        const t = s.pipeline.vote.thresholds
        const setT = (src: 'front' | 'side', open: number | null, closed: number | null) => {
          if (open === null || closed === null || open - closed < 0.3) return
          t[src] = { close: closed + 0.2 * (open - closed), open: closed + 0.45 * (open - closed) }
        }
        setT('front', openR.length ? med(openR) : null, closedR)
        setT('side', openP.length ? med(openP) : null, closedP)
      } else s.pipeline.mapper.clearCalibration()
      play(two)
    }

    function onFrame(f: typeof s.front): void {
      drawCam(cam, s.video, f.hand)
      const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now
      const pin = step === 'pinch'
      const seen = pin ? !!f.hand : !!f.raw
      if (!seen) { progress = Math.max(0, progress - dt * 2); win = []; setHint('I can’t see your hand. Raise it into view.', 'warn') }
      else {
        win.push({ x: f.raw![0], y: f.raw![1], r: f.pinch, pr: s.phone.pinch }); if (win.length > 14) win.shift()
        const mx = med(win.map(p => p.x)), my = med(win.map(p => p.y))
        const still = win.length >= 6 && win.every(p => Math.hypot(p.x - mx, p.y - my) < 0.018)
        const okPose = pin ? (f.pinch ?? 9) < 0.55 : true
        if (still && okPose) { progress += dt / 0.9; setHint('Hold still…', 'ok') }
        else { progress = Math.max(0, progress - dt * 1.2); setHint(pin && !okPose ? 'Touch your thumb and index finger together.' : 'Hold your fingertip steady on the dot.') }
      }
      progress = Math.min(1, progress)
      circle.style.strokeDashoffset = String(226 * (1 - progress)); bar.style.width = progress * 100 + '%'
      if (progress < 1) return
      const rs = win.map(p => p.r).filter((v): v is number => v !== null), ps = win.map(p => p.pr).filter((v): v is number => v !== null)
      if (!pin) {
        got.push({ cam: [med(win.map(p => p.x)), med(win.map(p => p.y))], screen: DOTS[i] })
        if (rs.length) openR.push(med(rs)); if (ps.length) openP.push(med(ps))
        i++; resetHold()
        if (i >= DOTS.length) { step = 'pinch' }
        render()
      } else {
        closedR = rs.length ? med(rs) : null; closedP = ps.length ? med(ps) : null
        finish(true)
      }
    }
    s.onFront = onFrame
    render()
  }

  function play(two: boolean): void {
    s.live = true; s.cursor.show(true)
    mount(playground(s, () => { s.live = false; s.cursor.show(false); s.pipeline.mapper.clearCalibration(); s.mode === 'demo' ? play(two) : calibrate(two) }, two ? () => { s.live = false; s.cursor.show(false); pair() } : null))
    toast(s.mode === 'demo' ? 'Move the mouse to steer the wisp' : 'Point at the screen')
  }

  landing()
  ;(window as any).airwisp = { session: s, calibrate }
}
