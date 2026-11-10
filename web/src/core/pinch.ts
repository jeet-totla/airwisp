import { Source } from './types'

/**
 * Multi-camera pinch vote. Each source reports thumb-index distance / palm length. Each is turned into a
 * soft 0..1 "pinched" score, fresh scores are averaged with per-source weights (the side view sees the
 * fingers touch, so it counts more), and a hysteresis threshold turns the consensus into down/up events.
 * Any single source can drop out and the vote still works.
 */
export class PinchVote {
  closeAt = 0.25   // ratio at or below this = fully pinched
  openAt = 0.45    // ratio at or above this = fully open
  pressAt = 0.6    // consensus above this => pinched
  releaseAt = 0.35 // consensus below this => released
  freshness = 0.15 // seconds a source report stays valid
  weights: Record<Source, number> = { front: 0.4, side: 0.6 }

  private last: Partial<Record<Source, { t: number; score: number }>> = {}
  pinched = false

  static score(ratio: number, closeAt: number, openAt: number): number {
    return Math.min(1, Math.max(0, (openAt - ratio) / (openAt - closeAt)))
  }

  /** Report a measurement. Returns 'down' | 'up' on a state change. */
  report(src: Source, t: number, ratio: number | null): 'down' | 'up' | null {
    if (ratio === null) delete this.last[src]
    else this.last[src] = { t, score: PinchVote.score(ratio, this.closeAt, this.openAt) }
    return this.evaluate(t)
  }

  consensus(t: number): number | null {
    let sum = 0, wsum = 0
    for (const s of ['front', 'side'] as Source[]) {
      const r = this.last[s]
      if (r && t - r.t <= this.freshness) { sum += r.score * this.weights[s]; wsum += this.weights[s] }
    }
    return wsum > 0 ? sum / wsum : null
  }

  evaluate(t: number): 'down' | 'up' | null {
    const c = this.consensus(t)
    if (c === null) {
      if (this.pinched) { this.pinched = false; return 'up' }
      return null
    }
    if (!this.pinched && c > this.pressAt) { this.pinched = true; return 'down' }
    if (this.pinched && c < this.releaseAt) { this.pinched = false; return 'up' }
    return null
  }

  reset(): void { this.last = {}; this.pinched = false }
}
