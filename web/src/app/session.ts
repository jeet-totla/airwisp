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

export interface FrontInfo { hand: Hand | null; palm: number | null; light: number | null; raw: [number, number] | null; pinch: number | null }
export interface PhoneInfo { connected: boolean; hand: boolean; palm: number | null; light: number | null; fps: number; lastSeen: number }

/** Runs the laptop side: front camera (or demo hand) + optional phone feed -> gestures -> cursor. */
export class Session {
  pipeline = new Pipeline()
  cursor = new AirCursor()
  front: FrontInfo = { hand: null, palm: null, light: null, raw: null, pinch: null }
  phone: PhoneInfo = { connected: false, hand: false, palm: null, light: null, fps: 0, lastSeen: 0 }
  live = false                         // when true, frames drive the cursor
  onFront: ((i: FrontInfo) => void) | null = null
  onPhone: ((i: PhoneInfo) => void) | null = null
  onActions: ((a: Action[]) => void) | null = null
  private stopFrames: (() => void) | null = null
  private stream: MediaStream | null = null
  private sim: SimHandSource | null = null
  private tracker: HandTracker | null = null
  private lastLight = 0
  mode: 'camera' | 'demo' | null = null

  async startDemo(): Promise<void> {
    this.sim = new SimHandSource()
    this.sim.onFrame = e => this.handleFront(e.t, e.hand, e.aspect, 128)
    this.sim.start(); this.mode = 'demo'
  }

  async startCamera(video: HTMLVideoElement): Promise<void> {
    this.stream = await openCamera(video, { facing: 'user' })
    this.tracker = await HandTracker.create()
    this.mode = 'camera'
    let last = -1
    this.stopFrames = onVideoFrames(video, now => {
      if (now <= last) return; last = now
      const hand = this.tracker!.detect(video, now)
      let light = this.front.light
      if (now - this.lastLight > 700) { this.lastLight = now; light = meanLuminance(video) }
      this.handleFront(now / 1000, hand, (video.videoWidth || 16) / (video.videoHeight || 9), light)
    })
  }

  private handleFront(t: number, hand: Hand | null, aspect: number, light: number | null): void {
    const f = hand ? features(hand, aspect) : null
    this.front = { hand, palm: f?.palm ?? null, light, raw: f ? [f.tipX, f.tipY] : null, pinch: f?.pinch ?? null }
    this.onFront?.(this.front)
    if (this.live) this.emit(this.pipeline.front(t, hand, aspect))
  }

  attach(tr: Transport): void {
    tr.onPeers = n => { this.phone.connected = n > 0; this.onPhone?.(this.phone) }
    tr.onMessage = m => {
      const t = performance.now() / 1000
      if (m.k === 'lm') {
        this.phone.lastSeen = t
        if (this.live) this.emit(this.pipeline.side(t, unpackHand(m.p), m.a))
      } else if (m.k === 'status') {
        this.phone = { ...this.phone, connected: true, hand: m.hand, palm: m.palm, light: m.light, fps: m.fps, lastSeen: t }
        this.onPhone?.(this.phone)
      } else if (m.k === 'hello') { this.phone.connected = true; this.onPhone?.(this.phone) }
    }
  }

  private emit(a: Action[]): void {
    if (!a.length) return
    this.cursor.apply(a)
    this.onActions?.(a)
  }

  distance() { return distanceHint(this.front.palm) }
  light() { return lightHint(this.front.light) }

  stop(): void {
    this.stopFrames?.(); this.sim?.stop(); stopStream(this.stream); this.tracker?.close()
    this.stopFrames = null; this.sim = null; this.stream = null; this.tracker = null
  }
}
