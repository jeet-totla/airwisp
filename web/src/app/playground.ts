import { h } from './ui'
import type { Action } from '../core/types'
import type { Session } from './session'

const COLORS = ['#6c4dff', '#ffb830', '#157f5f', '#16222a']

/** Things to point at, pinch, drag and scroll. */
export function playground(s: Session, onRecalibrate: () => void, onPhoneHelp: (() => void) | null): HTMLElement {
  const canvas = h('canvas', { width: '960', height: '540', 'aria-label': 'Drawing board' }) as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  let color = COLORS[0], drawing = false
  const pos = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height] }
  canvas.addEventListener('pointerdown', e => { drawing = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.fillStyle = color; ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y) })
  canvas.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineTo(x, y); ctx.stroke() })
  const stop = () => { drawing = false }
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointerleave', stop)

  const sws = COLORS.map(c => h('button', { class: 'sw' + (c === color ? ' sel' : ''), style: `background:${c}`, 'aria-label': 'Pen colour ' + c, onclick: () => { color = c; sws.forEach(b => b.classList.toggle('sel', b === sw(c))) } }))
  const sw = (c: string) => sws[COLORS.indexOf(c)]
  const clear = h('button', { class: 'btn quiet', onclick: () => ctx.clearRect(0, 0, canvas.width, canvas.height) }, 'Clear')

  const pads = ['Kick', 'Snare', 'Hat', 'Clap', 'Tom', 'Bell'].map(n => h('button', { class: 'pad', onclick: (e: Event) => (e.currentTarget as HTMLElement).classList.toggle('lit') }, n))
  const scroller = h('div', { class: 'scroller', tabindex: '0', 'aria-label': 'Scrollable list' }, ...Array.from({ length: 24 }, (_, i) => h('div', null, `Item ${i + 1}`)))
  const SL = ['Point to move', 'Pinch to click', 'Pinch and move to drag', 'Peace sign to scroll']
  let si = 0
  const slide = h('div', { class: 'slide' }, SL[0])
  const go = (d: number) => { si = (si + d + SL.length) % SL.length; slide.textContent = SL[si] }
  const slides = h('div', { class: 'slides' }, h('button', { class: 'btn quiet', onclick: () => go(-1), 'aria-label': 'Previous slide' }, 'Back'), slide, h('button', { class: 'btn quiet', onclick: () => go(1), 'aria-label': 'Next slide' }, 'Next'))

  const pill = (t: string) => { const i = h('i'); const el = h('span', { class: 'pill' }, i, t); return el }
  const pTrack = pill('Hand'), pPhone = pill('Phone'), pArm = pill('Airwisp on'); pArm.classList.add('on')
  const pPinch = pill('Pinch')
  s.onFront = f => { pTrack.classList.toggle('on', !!f.hand); pTrack.classList.toggle('off', !f.hand) }
  s.onPhone = p => { pPhone.classList.toggle('on', p.connected); pPhone.lastChild!.textContent = p.connected ? 'Phone' : 'No phone' }
  s.onActions = (a: Action[]) => {
    for (const x of a) {
      if (x.type === 'armed') { pArm.classList.toggle('on', x.on); pArm.classList.toggle('off', !x.on); pArm.lastChild!.textContent = x.on ? 'Airwisp on' : 'Paused' }
      if (x.type === 'down') { pPinch.classList.add('hot'); s.cursor.setMode('drag') }
      if (x.type === 'up') { pPinch.classList.remove('hot'); s.cursor.setMode(null) }
      if (x.type === 'scroll') s.cursor.setMode('scroll')
    }
  }
  const demo = s.mode === 'demo'
  const gest = demo
    ? ['Move the mouse: point', 'Hold Space: pinch', 'Hold F: fist (hold for a moment to pause or resume)', 'Hold P: peace sign, move up and down to scroll', 'Hold M: right click']
    : ['Point with your index finger', 'Touch thumb and index finger to click', 'Pinch and move to drag', 'Peace sign, then move up or down to scroll', 'Hold a fist for a moment to pause or resume']

  return h('div', { class: 'screen' },
    h('div', { class: 'top' }, h('div', { class: 'bar' }, pTrack, pPhone, pArm, pPinch), h('div', { class: 'row' }, onPhoneHelp ? h('button', { class: 'btn quiet', onclick: onPhoneHelp }, 'Phone help') : null, h('button', { class: 'btn quiet', onclick: onRecalibrate }, 'Recalibrate'))),
    h('div', { class: 'play' },
      h('div', { class: 'board' }, canvas, h('div', { class: 'row' }, h('div', { class: 'swatches' }, ...sws), clear)),
      h('div', { class: 'side' },
        h('section', null, h('h2', null, 'Gestures'), h('ul', { class: 'gestures' }, ...gest.map(g => h('li', null, g)))),
        h('section', null, h('h2', null, 'Pads'), h('div', { class: 'pads' }, ...pads)),
        h('section', null, h('h2', null, 'Scroll'), scroller),
        h('section', null, h('h2', null, 'Slides'), slides))))
}
