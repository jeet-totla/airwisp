import type { Hand } from '../core/types'
import { syntheticHand } from './synthetic'
import { Mapper } from '../core/mapper'

export interface FrameEvent { t: number; hand: Hand | null; aspect: number }
export interface HandSource { start(): void; stop(): void; onFrame: ((e: FrameEvent) => void) | null; label: string }

/** A fake hand driven by the mouse and keyboard, so anyone can try Airwisp without a camera.
 *  Move the mouse = move the index finger. Hold Space = pinch. Hold F = fist. Hold P = peace sign. Hold M = middle-finger pinch.
 *  (The mouse button is not used, so real clicks never double up with the simulated ones.) */
export class SimHandSource implements HandSource {
  label = 'Demo hand (mouse + keys)'
  onFrame: ((e: FrameEvent) => void) | null = null
  private timer: number | null = null
  private u = 0.5; private v = 0.5
  private keys = new Set<string>()
  private readonly zone = new Mapper()
  constructor(private target: Window = window) {}

  private onMove = (e: MouseEvent) => { this.u = e.clientX / this.target.innerWidth; this.v = e.clientY / this.target.innerHeight }
  private onKey = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k === ' ') e.preventDefault(); if (e.type === 'keydown') this.keys.add(k); else this.keys.delete(k) }

  start(): void {
    this.target.addEventListener('mousemove', this.onMove)
    this.target.addEventListener('keydown', this.onKey)
    this.target.addEventListener('keyup', this.onKey)
    this.timer = window.setInterval(() => this.emit(), 33)
  }
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.target.removeEventListener('mousemove', this.onMove)
    this.target.removeEventListener('keydown', this.onKey)
    this.target.removeEventListener('keyup', this.onKey)
  }
  private emit(): void {
    const z = this.zone
    const cx = 1 - (z.zoneX + this.u * z.zoneW)   // invert the default active zone (mirrored)
    const cy = z.zoneY + this.v * z.zoneH
    const hand = syntheticHand({
      x: cx, y: cy,
      pinch: this.keys.has(' ') ? 1 : 0,
      pinchMiddle: this.keys.has('m') ? 1 : 0,
      fist: this.keys.has('f'), peace: this.keys.has('p'),
    })
    this.onFrame?.({ t: performance.now() / 1000, hand, aspect: 16 / 9 })
  }
}
