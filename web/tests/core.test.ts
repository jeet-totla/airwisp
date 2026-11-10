import { describe, it, expect } from 'vitest'
import { OneEuro } from '../src/core/oneeuro'
import { Mapper } from '../src/core/mapper'
import { PinchVote } from '../src/core/pinch'
import { GestureEngine } from '../src/core/gestures'
import { Pipeline } from '../src/core/pipeline'
import { features } from '../src/core/features'
import { syntheticHand } from '../src/vision/synthetic'
import type { Action } from '../src/core/types'

const kinds = (a: Action[]) => a.map(x => x.type + (('button' in x) ? ':' + x.button : ''))

describe('OneEuro', () => {
  it('passes the first sample and smooths jitter', () => {
    const f = new OneEuro(1.0, 0.0)
    let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5
    const raw = Array.from({ length: 300 }, () => 0.5 + rnd() * 0.02)
    const out = raw.map((x, i) => f.filter(x, i / 30))
    expect(out[0]).toBe(raw[0])
    const sd = (a: number[]) => { const m = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length) }
    expect(sd(out.slice(30))).toBeLessThan(0.5 * sd(raw.slice(30)))
  })
  it('follows fast moves with high beta', () => {
    const f = new OneEuro(1.0, 5.0)
    for (let i = 0; i < 30; i++) f.filter(0, i / 60)
    let y = 0; for (let i = 30; i < 36; i++) y = f.filter(1, i / 60)
    expect(y).toBeGreaterThan(0.6)
  })
  it('survives non-monotonic time', () => { const f = new OneEuro(); f.filter(0.1, 1); expect(() => f.filter(0.3, 0.5)).not.toThrow() })
})

describe('Mapper', () => {
  it('maps zone, mirrors x, clamps', () => {
    const m = new Mapper()
    expect(m.toUnit(0.5, 0.5)).toEqual([0.5, 0.5])
    const [u, v] = m.toUnit(0.2, 0.25); expect(u).toBeCloseTo(1); expect(v).toBeCloseTo(0)
    expect(m.toUnit(5, 5)).toEqual([0, 1])
  })
  it('calibration maps the four corners onto the unit square', () => {
    const m = new Mapper()
    const tl: [number, number] = [0.7, 0.3], tr: [number, number] = [0.3, 0.32], bl: [number, number] = [0.72, 0.7], br: [number, number] = [0.28, 0.68]
    m.setCorners(tl, tr, bl, br)
    const cases: [[number, number], [number, number]][] = [[tl, [0, 0]], [tr, [1, 0]], [bl, [0, 1]], [br, [1, 1]]]
    for (const [p, e] of cases) { const r = m.toUnit(...p); expect(r[0]).toBeCloseTo(e[0], 3); expect(r[1]).toBeCloseTo(e[1], 3) }
  })
})

describe('PinchVote', () => {
  it('presses and releases with hysteresis from one source', () => {
    const v = new PinchVote(); let t = 0
    expect(v.report('front', t += 0.03, 1.0)).toBeNull()
    expect(v.report('front', t += 0.03, 0.1)).toBe('down')
    expect(v.report('front', t += 0.03, 0.35)).toBeNull() // between thresholds: still held
    expect(v.report('front', t += 0.03, 0.8)).toBe('up')
  })
  it('side view outvotes an unsure front view', () => {
    const v = new PinchVote()
    v.report('front', 0, 0.40)            // front: barely closed (score 0.25)
    expect(v.report('side', 0.01, 0.05)).toBe('down') // side: clearly touching
  })
  it('a stale source stops counting', () => {
    const v = new PinchVote()
    v.report('side', 0, 0.05); expect(v.pinched).toBe(true)
    expect(v.report('front', 1, 1.0)).toBe('up') // side is stale, front says open
  })
  it('releases if every source disappears', () => {
    const v = new PinchVote(); v.report('front', 0, 0.05)
    expect(v.report('front', 0.1, null)).toBe('up')
  })
})

describe('GestureEngine', () => {
  const mk = () => { const g = new GestureEngine(); g.position(0, 0.5, 0.5); return g }
  it('short pinch clicks at the position from before the pinch', () => {
    const g = mk()
    for (let i = 0; i < 10; i++) g.position(1 + i * 0.01, 0.5 + i * 0.002, 0.5) // finger drifts while closing
    const down = g.pinch(1.1, 'down'); expect(down).toEqual([])
    const a = g.pinch(1.15, 'up')
    expect(kinds(a)).toEqual(['move', 'click:left'])
    const m = a[0] as any; expect(m.x).toBeLessThan(0.5 + 0.0181) // anchored ~120ms earlier, not at final position
  })
  it('hold promotes to drag and release ends it', () => {
    const g = mk(); g.pinch(1, 'down')
    expect(kinds(g.tick(1.3))).toContain('down:left')
    expect(kinds(g.position(1.4, 0.6, 0.6))).toEqual(['move'])
    expect(kinds(g.pinch(1.5, 'up'))).toEqual(['up:left'])
  })
  it('moving while pinched starts a drag', () => {
    const g = mk(); g.pinch(1, 'down')
    expect(kinds(g.position(1.05, 0.6, 0.5))).toEqual(['move', 'down:left', 'move'])
  })
  it('fist hold toggles armed and blocks events; disarm releases a drag', () => {
    const g = mk()
    expect(g.fist(1, true)).toEqual([]); expect(g.fist(1.3, true)).toEqual([])
    expect(g.fist(1.7, true)).toEqual([{ type: 'armed', on: false }])
    expect(g.position(1.8, 0.7, 0.7)).toEqual([])
    expect(g.pinch(1.9, 'down')).toEqual([])
    const g2 = mk(); g2.pinch(1, 'down'); g2.tick(1.3)
    expect(g2.toggleArmed()[0]).toEqual({ type: 'up', button: 'left' })
  })
  it('peace sign scrolls and freezes the cursor', () => {
    const g = mk()
    expect(g.peace(1, true, 0.5)).toEqual([])
    expect(g.peace(1.2, true, 0.5)).toEqual([]) // enters scroll mode, no previous y
    const a = g.peace(1.25, true, 0.55); expect(a[0].type).toBe('scroll'); expect((a[0] as any).dy).toBeGreaterThan(0)
    expect(g.position(1.3, 0.9, 0.9)).toEqual([])
    g.peace(1.4, false, 0.5); expect(g.scrolling).toBe(false)
  })
  it('middle pinch right-clicks once per gesture', () => {
    const g = mk()
    expect(g.rightClick(1, 0.1, false)).toEqual([{ type: 'click', button: 'right' }])
    expect(g.rightClick(1.1, 0.1, false)).toEqual([])      // held: no repeat
    g.rightClick(2, 0.8, false)                            // reopen
    expect(g.rightClick(3, 0.1, false)).toEqual([{ type: 'click', button: 'right' }])
    expect(g.rightClick(5, 0.1, true)).toEqual([])         // ignored while index is pinched
  })
})

describe('features on synthetic hands', () => {
  it('open hand is not pinched, pinched hand is', () => {
    expect(features(syntheticHand({ x: 0.5, y: 0.5 }), 16 / 9).pinch).toBeGreaterThan(0.9)
    expect(features(syntheticHand({ x: 0.5, y: 0.5, pinch: 1 }), 16 / 9).pinch).toBeLessThan(0.05)
  })
  it('fist and peace are recognised and exclusive', () => {
    const fist = features(syntheticHand({ x: 0.5, y: 0.5, fist: true }), 16 / 9)
    const peace = features(syntheticHand({ x: 0.5, y: 0.5, peace: true }), 16 / 9)
    const open = features(syntheticHand({ x: 0.5, y: 0.5 }), 16 / 9)
    expect(fist.fist).toBe(true); expect(open.fist).toBe(false); expect(peace.fist).toBe(false)
    expect(peace.peace).toBe(true); expect(open.peace).toBe(false); expect(fist.peace).toBe(false)
  })
  it('palm size follows the requested scale and aspect ratio is respected', () => {
    for (const a of [4 / 3, 16 / 9]) expect(features(syntheticHand({ x: 0.5, y: 0.5, palm: 0.2, aspect: a }), a).palm).toBeCloseTo(0.2, 2)
  })
})

describe('Pipeline end to end (synthetic hand, front only)', () => {
  const run = (frames: { t: number; o: Parameters<typeof syntheticHand>[0] }[], p = new Pipeline()) => {
    const acts: Action[] = []
    for (const f of frames) acts.push(...p.front(f.t, syntheticHand(f.o)))
    return { acts, p }
  }
  it('moves the cursor to where the hand points', () => {
    const { acts } = run(Array.from({ length: 60 }, (_, i) => ({ t: i / 30, o: { x: 0.5, y: 0.5 } })))
    const last = [...acts].reverse().find(a => a.type === 'move') as any
    expect(last.x).toBeCloseTo(0.5, 1); expect(last.y).toBeCloseTo(0.5, 1)
  })
  it('a quick pinch produces exactly one left click', () => {
    const fr: any[] = []
    for (let i = 0; i < 20; i++) fr.push({ t: i / 30, o: { x: 0.5, y: 0.5 } })
    for (let i = 20; i < 26; i++) fr.push({ t: i / 30, o: { x: 0.5, y: 0.5, pinch: 1 } })
    for (let i = 26; i < 40; i++) fr.push({ t: i / 30, o: { x: 0.5, y: 0.5 } })
    const { acts } = run(fr)
    expect(acts.filter(a => a.type === 'click' && a.button === 'left')).toHaveLength(1)
  })
  it('pinch-hold-move drags, release drops', () => {
    const fr: any[] = []
    for (let i = 0; i < 20; i++) fr.push({ t: i / 30, o: { x: 0.5, y: 0.5 } })
    for (let i = 20; i < 50; i++) fr.push({ t: i / 30, o: { x: 0.5 - (i - 20) * 0.004, y: 0.5, pinch: 1 } })
    for (let i = 50; i < 60; i++) fr.push({ t: i / 30, o: { x: 0.4, y: 0.5 } })
    const k = kinds(run(fr).acts)
    expect(k).toContain('down:left'); expect(k).toContain('up:left'); expect(k.indexOf('down:left')).toBeLessThan(k.indexOf('up:left'))
  })
  it('fist held toggles off then on', () => {
    const fr: any[] = []
    for (let i = 0; i < 30; i++) fr.push({ t: i / 30, o: { x: 0.5, y: 0.5, fist: true } })
    const a = run(fr).acts.filter(x => x.type === 'armed')
    expect(a).toEqual([{ type: 'armed', on: false }])
  })
  it('side camera alone can confirm a pinch the front camera is unsure about', () => {
    const p = new Pipeline(); const acts: Action[] = []
    for (let i = 0; i < 20; i++) acts.push(...p.front(i / 30, syntheticHand({ x: 0.5, y: 0.5 })))
    for (let i = 20; i < 26; i++) {
      const t = i / 30
      acts.push(...p.front(t, syntheticHand({ x: 0.5, y: 0.5, pinch: 0.7 })))   // front: ambiguous (ratio ~0.36)
      acts.push(...p.side(t, syntheticHand({ x: 0.5, y: 0.5, pinch: 1 }), 16 / 9)) // side: touching
    }
    for (let i = 26; i < 40; i++) { const t = i / 30; acts.push(...p.front(t, syntheticHand({ x: 0.5, y: 0.5 })), ...p.side(t, syntheticHand({ x: 0.5, y: 0.5 }), 16 / 9)) }
    expect(acts.filter(a => a.type === 'click' && a.button === 'left')).toHaveLength(1)
  })
  it('losing the hand mid-pinch releases', () => {
    const p = new Pipeline(); const acts: Action[] = []
    for (let i = 0; i < 20; i++) acts.push(...p.front(i / 30, syntheticHand({ x: 0.5, y: 0.5 })))
    for (let i = 20; i < 40; i++) acts.push(...p.front(i / 30, syntheticHand({ x: 0.5, y: 0.5, pinch: 1 })))
    for (let i = 40; i < 50; i++) acts.push(...p.front(i / 30, null))
    const k = kinds(acts); expect(k).toContain('down:left'); expect(k).toContain('up:left')
  })
})

describe('Homography calibration', () => {
  const truth = (x: number, y: number): [number, number] => {
    const w = 0.2 * x + 0.1 * y + 1
    return [(0.9 * x - 0.1 * y + 0.05) / w, (0.15 * x + 1.1 * y - 0.2) / w]
  }
  const pts: [number, number][] = [[0.3, 0.3], [0.7, 0.32], [0.72, 0.7], [0.28, 0.68], [0.5, 0.5]]
  it('recovers a projective map from five points', () => {
    const m = new Mapper()
    const err = m.setCalibration(pts.map(p => ({ cam: p, screen: truth(...p) })))
    expect(err).toBeLessThan(1e-6)
    const probe: [number, number] = [0.4, 0.6]
    const e = truth(...probe), r = m.toUnit(...probe)
    expect(r[0]).toBeCloseTo(Math.min(1, Math.max(0, e[0])), 4); expect(r[1]).toBeCloseTo(Math.min(1, Math.max(0, e[1])), 4)
  })
  it('reports a large error when a point is wrong', () => {
    const m = new Mapper()
    const pairs = pts.map(p => ({ cam: p, screen: truth(...p) }))
    pairs[4] = { cam: pts[4], screen: [0.9, 0.1] }
    expect(m.setCalibration(pairs)).toBeGreaterThan(0.05)
  })
})

describe('PinchVote thresholds', () => {
  it('uses per-source thresholds', () => {
    const v = new PinchVote(); v.thresholds.front = { close: 0.5, open: 1.0 }
    let t = 0
    expect(v.report('front', t += 0.03, 0.45)).toBe('down')
  })
})
