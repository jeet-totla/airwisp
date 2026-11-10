import { Hand, IDX } from './types'

/** Hand features computed in aspect-corrected space (x scaled by width/height) so distances are isotropic. */
export interface Features {
  tipX: number; tipY: number       // index fingertip, normalized frame coords (un-mirrored)
  palm: number                     // wrist->middle MCP length, in frame-height units
  pinch: number                    // thumb-index distance / palm
  pinchMiddle: number              // thumb-middle distance / palm
  fist: boolean
  peace: boolean                   // index + middle extended, ring + pinky folded
}

const d = (a: { x: number; y: number }, b: { x: number; y: number }, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y)

export function features(h: Hand, aspect: number): Features {
  const w = h[IDX.wrist]
  const palm = Math.max(d(w, h[IDX.middleMcp], aspect), 1e-4)
  const tips = [IDX.indexTip, IDX.middleTip, IDX.ringTip, IDX.pinkyTip]
  const pips = [IDX.indexPip, IDX.middlePip, IDX.ringPip, IDX.pinkyPip]
  const extended = tips.map((t, i) => d(h[t], w, aspect) > d(h[pips[i]], w, aspect) * 1.05)
  const fist = tips.every(t => d(h[t], w, aspect) < palm * 1.1)
  return {
    tipX: h[IDX.indexTip].x, tipY: h[IDX.indexTip].y,
    palm,
    pinch: d(h[IDX.thumbTip], h[IDX.indexTip], aspect) / palm,
    pinchMiddle: d(h[IDX.thumbTip], h[IDX.middleTip], aspect) / palm,
    fist,
    peace: extended[0] && extended[1] && !extended[2] && !extended[3],
  }
}
