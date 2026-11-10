import { Action, Hand, Source } from './types'
import { features } from './features'
import { GestureEngine } from './gestures'
import { Mapper } from './mapper'
import { OneEuro2D } from './oneeuro'
import { PinchVote } from './pinch'

/** Hand frames in, cursor actions out. Time is in seconds. */
export class Pipeline {
  mapper = new Mapper()
  vote = new PinchVote()
  gestures = new GestureEngine()
  filter = new OneEuro2D(1.2, 0.02)
  lastFrontT = -1e9

  /** Front camera: provides position, fist, peace, right-click and a pinch vote. */
  front(t: number, hand: Hand | null, aspect = 16 / 9): Action[] {
    const out: Action[] = []
    if (!hand) {
      this.lastFrontT = -1e9
      this.filter.reset()
      out.push(...this.pinchEvent(this.vote.report('front', t, null), t))
      out.push(...this.gestures.fist(t, false), ...this.gestures.peace(t, false, 0))
      out.push(...this.gestures.tick(t))
      return out
    }
    const f = features(hand, aspect)
    const [ux, uy] = this.mapper.toUnit(f.tipX, f.tipY)
    const [sx, sy] = this.filter.filter(ux, uy, t)
    this.lastFrontT = t
    out.push(...this.gestures.position(t, sx, sy))
    out.push(...this.pinchEvent(this.vote.report('front', t, f.pinch), t))
    out.push(...this.gestures.fist(t, f.fist))
    out.push(...this.gestures.peace(t, f.peace, sy))
    out.push(...this.gestures.rightClick(t, f.pinchMiddle, this.vote.pinched))
    out.push(...this.gestures.tick(t))
    return out
  }

  /** Side camera: contributes to the pinch vote only (it sees the fingers touch). */
  side(t: number, hand: Hand | null, aspect = 16 / 9): Action[] {
    const ratio = hand ? features(hand, aspect).pinch : null
    return [...this.pinchEvent(this.vote.report('side', t, ratio), t), ...this.gestures.tick(t)]
  }

  toggleArmed(): Action[] { return this.gestures.toggleArmed() }

  private pinchEvent(ev: 'down' | 'up' | null, t: number): Action[] {
    return ev ? this.gestures.pinch(t, ev) : []
  }
}

export type { Source }
