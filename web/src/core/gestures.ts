import { Action } from './types'

type State = 'idle' | 'pending' | 'dragging'

/**
 * Gesture state machine. Port of prototype/airwisp/gestures.py plus three web-era additions:
 *  - the cursor anchor for a click is the position ~120 ms BEFORE the pinch was detected, because the
 *    fingertip drifts while the fingers close (a known problem in other projects);
 *  - peace-sign scrolling (index + middle up, move vertically);
 *  - middle-finger pinch = right click.
 */
export class GestureEngine {
  dragHold = 0.25
  dragMove = 0.02
  fistHold = 0.6
  anchorLookback = 0.12
  scrollGain = 1400        // px per unit of vertical hand travel
  scrollEnter = 0.15       // peace must hold this long before scrolling starts
  rightCooldown = 0.8
  rightClose = 0.25
  rightOpen = 0.45

  armed = true
  state: State = 'idle'
  scrolling = false
  pos: [number, number] = [0.5, 0.5]
  private anchor: [number, number] = [0.5, 0.5]
  private pinchT = 0
  private history: { t: number; x: number; y: number }[] = []
  private fistSince: number | null = null
  private fistFired = false
  private peaceSince: number | null = null
  private scrollLastY: number | null = null
  private rightArmed = true
  private rightLast = -1e9

  private setArmed(on: boolean): Action[] {
    if (on === this.armed) return []
    this.armed = on
    const out: Action[] = [{ type: 'armed', on }]
    if (!on && this.state === 'dragging') out.unshift({ type: 'up', button: 'left' })
    if (!on) { this.state = 'idle'; this.scrolling = false }
    return out
  }

  toggleArmed(): Action[] { return this.setArmed(!this.armed) }

  position(t: number, x: number, y: number): Action[] {
    this.pos = [x, y]
    this.history.push({ t, x, y })
    while (this.history.length > 2 && t - this.history[0].t > 0.5) this.history.shift()
    if (!this.armed || this.scrolling) return []
    switch (this.state) {
      case 'idle': return [{ type: 'move', x, y }]
      case 'pending':
        if (Math.abs(x - this.anchor[0]) > this.dragMove || Math.abs(y - this.anchor[1]) > this.dragMove) {
          this.state = 'dragging'
          return [{ type: 'move', x: this.anchor[0], y: this.anchor[1] }, { type: 'down', button: 'left' }, { type: 'move', x, y }]
        }
        return []
      default: return [{ type: 'move', x, y }]
    }
  }

  tick(t: number): Action[] {
    if (this.armed && this.state === 'pending' && t - this.pinchT >= this.dragHold) {
      this.state = 'dragging'
      return [{ type: 'move', x: this.anchor[0], y: this.anchor[1] }, { type: 'down', button: 'left' }]
    }
    return []
  }

  pinch(t: number, ev: 'down' | 'up'): Action[] {
    if (!this.armed) return []
    if (ev === 'down') {
      if (this.state !== 'idle' || this.scrolling) return []
      this.state = 'pending'
      this.pinchT = t
      const past = this.history.find(h => h.t >= t - this.anchorLookback) ?? this.history[0]
      this.anchor = past ? [past.x, past.y] : this.pos
      return []
    }
    if (this.state === 'pending') {
      this.state = 'idle'
      return [{ type: 'move', x: this.anchor[0], y: this.anchor[1] }, { type: 'click', button: 'left' }]
    }
    if (this.state === 'dragging') {
      this.state = 'idle'
      return [{ type: 'up', button: 'left' }]
    }
    return []
  }

  fist(t: number, isFist: boolean): Action[] {
    if (!isFist) { this.fistSince = null; this.fistFired = false; return [] }
    if (this.fistSince === null) this.fistSince = t
    if (!this.fistFired && t - this.fistSince >= this.fistHold) { this.fistFired = true; return this.setArmed(!this.armed) }
    return []
  }

  /** Peace sign held => scroll mode; vertical hand travel scrolls. y is the screen-unit hand height. */
  peace(t: number, isPeace: boolean, y: number): Action[] {
    if (!this.armed || this.state !== 'idle') { this.peaceSince = null; this.scrolling = false; this.scrollLastY = null; return [] }
    if (!isPeace) { this.peaceSince = null; this.scrolling = false; this.scrollLastY = null; return [] }
    if (this.peaceSince === null) this.peaceSince = t
    if (t - this.peaceSince < this.scrollEnter) return []
    this.scrolling = true
    const out: Action[] = []
    if (this.scrollLastY !== null) {
      const dy = (y - this.scrollLastY) * this.scrollGain
      if (Math.abs(dy) >= 1) out.push({ type: 'scroll', dy })
    }
    this.scrollLastY = y
    return out
  }

  /** Middle-finger + thumb pinch = right click (edge triggered, with hysteresis and cooldown). */
  rightClick(t: number, middleRatio: number, indexPinched: boolean): Action[] {
    if (!this.armed) return []
    if (middleRatio > this.rightOpen) this.rightArmed = true
    if (this.rightArmed && middleRatio < this.rightClose && !indexPinched && this.state === 'idle' && t - this.rightLast > this.rightCooldown) {
      this.rightArmed = false
      this.rightLast = t
      return [{ type: 'click', button: 'right' }]
    }
    return []
  }
}
