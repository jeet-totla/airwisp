import { Pipeline } from '../core/pipeline'
import { features } from '../core/features'
import type { Action, Hand } from '../core/types'
import { HandTracker } from '../vision/handTracker'
import { openCamera, onVideoFrames, stopStream } from '../vision/camera'
import { SimHandSource } from '../vision/sources'
import { lightHint, meanLuminance, distanceHint } from '../vision/metrics'
import type { Transport } from '../net/transport'
import { unpackHand } from '../net/protocol'
import { AirCursor } from './aircursor'

export interface FrontInfo { hand: Hand | null; palm: number | null; light: number | null; raw: [number, number] | null; pinch: number | null; t: number }
export interface PhoneInfo { connected: boolean; hand: boolean; palm: number | null; light: number | null; fps: number; lastSeen: number; pinch: number | null }

/** Runs the laptop side: front camera (or demo hand) + optional phone feed -> gestures -> cursor. */
export class Session {
  pipeline = new Pipeline()
  cursor = new AirCursor()
  front: FrontInfo = { hand: null, palm: null, light: null, raw: null, pinch: null, t: 0 }
  phone: PhoneInfo = { connected: false, hand: false, palm: null, light: null, fps: 0, lastSeen: 0, pinch: null }
  live = false                         // when true, frames drive the cursor
  onFront: ((i: FrontInfo) => void) | null = null
  onPhone: ((i: PhoneInfo) => void) | null = null
  onActions: ((a: Action[]) => void) | null = null
  mode: 'camera' | 'demo' | null = null
  /** The camera element lives for the whole session so screens can draw from it. */
  readonly video: HTMLVideoElement
  private stopFrames: (() => void) | null = null
  private stream: MediaStream | null = null
  private sim: SimHandSource | null = null
  private tracker: HandTracker | null = null
  private transport: Transport | null = null
  private beat = 0
  private lastLight = 0

  constructor() {
    this.video = document.createElement('video')
    this.video.setAttribute('playsinline', ''); this.video.muted = true
    this.video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.append(this.video)
  }

  async startDemo(): Promise<void> {
    this.sim = new SimHandSource()
    this.sim.onFrame = e => this.handleFront(e.t, e.hand, e.aspect, 128)
    this.sim.start(); this.mode = 'demo'
  }

  async startCamera(): Promise<void> {
    if (this.mode === 'camera') return
    this.stream = await openCamera(this.video, { facing: 'user' })
    this.tracker = await HandTracker.create()
    this.mode = 'camera'
    let last = -1
    this.stopFrames = onVideoFrames(this.video, now => {
      if (now <= last) return; last = now
      const hand = this.tracker!.detect(this.video, now)
      let light = this.front.light
      if (now - this.lastLight > 700) { this.lastLight = now; light = meanLuminance(this.video) }
      this.handleFront(now / 1000, hand, (this.video.videoWidth || 16) / (this.video.videoHeight || 9), light)
    })
  }

  private handleFront(t: number, hand: Hand | null, aspect: number, light: number | null): void {
    const f = hand ? features(hand, aspect) : null
    this.front = { hand, palm: f?.palm ?? null, light, raw: f ? [f.tipX, f.tipY] : null, pinch: f?.pinch ?? null, t }
    this.onFront?.(this.front)
    if (this.live) this.emit(this.pipeline.front(t, hand, aspect))
  }

  /** Connects the phone link. The phone and laptop both send a heartbeat, so "connected" means we heard from the other side recently. */
  attach(tr: Transport): void {
    this.detach()
    this.transport = tr
    const mark = (): void => {
      const was = this.phone.connected
      this.phone.lastSeen = performance.now() / 1000
      this.phone.connected = true
      if (!was) this.onPhone?.(this.phone)
    }
    tr.onPeers = n => { if (n > 0) tr.send({ k: 'hello', role: 'host', v: 1 }) }
    tr.onMessage = m => {
      const t = performance.now() / 1000
      mark()
      if (m.k === 'lm') {
        const hand = unpackHand(m.p)
        this.phone.pinch = hand ? features(hand, m.a).pinch : null
        if (this.live) this.emit(this.pipeline.side(t, hand, m.a))
      } else if (m.k === 'status') {
        this.phone = { ...this.phone, hand: m.hand, palm: m.palm, light: m.light, fps: m.fps }
        this.onPhone?.(this.phone)
      }
    }
    tr.send({ k: 'hello', role: 'host', v: 1 })
    this.beat = window.setInterval(() => {
      tr.send({ k: 'hello', role: 'host', v: 1 })
      const t = performance.now() / 1000
      if (this.phone.connected && t - this.phone.lastSeen > 4) { this.phone = { ...this.phone, connected: false, hand: false }; this.onPhone?.(this.phone) }
    }, 1000)
  }

  detach(): void {
    clearInterval(this.beat); this.transport?.close(); this.transport = null
    this.phone = { connected: false, hand: false, palm: null, light: null, fps: 0, lastSeen: 0, pinch: null }
  }

  private emit(a: Action[]): void {
    if (!a.length) return
    this.cursor.apply(a)
    this.onActions?.(a)
  }

  distance() { return distanceHint(this.front.palm) }
  light() { return lightHint(this.front.light) }

  stop(): void {
    this.stopFrames?.(); this.sim?.stop(); stopStream(this.stream); this.tracker?.close(); this.detach()
    this.stopFrames = null; this.sim = null; this.stream = null; this.tracker = null; this.mode = null
  }
}
