import { Hand, LM } from '../core/types'

/**
 * Builds a plausible 21-point hand from a few controls. Used by the "no camera" demo mode, by tests,
 * and to drive the pipeline end to end without real hand detection.
 * Local frame: wrist at (0,0), fingers point toward -y, palm length (wrist -> middle MCP) = 1.
 */
export interface SynthOpts {
  x: number; y: number          // where the INDEX FINGERTIP is, normalized frame coords
  pinch?: number                // 0 = open, 1 = thumb touching index
  fist?: boolean
  peace?: boolean
  palm?: number                 // palm length as a fraction of frame height (default 0.2)
  aspect?: number               // frame width / height (default 16/9)
  pinchMiddle?: number          // 0..1 thumb toward middle finger
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function syntheticHand(o: SynthOpts): Hand {
  const palm = o.palm ?? 0.2, aspect = o.aspect ?? 16 / 9
  const pinch = o.pinch ?? 0, pm = o.pinchMiddle ?? 0
  const curl = (tip: [number, number], mcp: [number, number], c: number): [number, number] => [lerp(tip[0], mcp[0], c), lerp(tip[1], mcp[1], c * 1.0 + 0)]
  const P: Record<string, [number, number]> = {
    wrist: [0, 0],
    tCmc: [-0.35, -0.25], tMcp: [-0.6, -0.5], tIp: [-0.8, -0.75], tTip: [-0.95, -1.0],
    iMcp: [-0.3, -1.0], iPip: [-0.33, -1.5], iDip: [-0.34, -1.8], iTip: [-0.35, -2.05],
    mMcp: [0, -1.0], mPip: [0, -1.55], mDip: [0, -1.9], mTip: [0, -2.15],
    rMcp: [0.28, -0.97], rPip: [0.31, -1.5], rDip: [0.32, -1.8], rTip: [0.33, -2.0],
    pMcp: [0.52, -0.9], pPip: [0.57, -1.3], pDip: [0.6, -1.55], pTip: [0.62, -1.75],
  }
  const fold = (name: 'i' | 'm' | 'r' | 'p') => {
    const mcp = P[name + 'Mcp'], pip = P[name + 'Pip'], dip = P[name + 'Dip'], tip = P[name + 'Tip']
    // curled finger: PIP stays near MCP, DIP/TIP fold back toward the palm
    P[name + 'Pip'] = [lerp(pip[0], mcp[0], 0.0), -0.75]
    P[name + 'Dip'] = [mcp[0], -0.45]
    P[name + 'Tip'] = [mcp[0], -0.35]
    void dip; void tip
  }
  if (o.fist) { fold('i'); fold('m'); fold('r'); fold('p') }
  else if (o.peace) { fold('r'); fold('p') }
  // pinch: thumb tip travels to the index tip; IP follows partway
  const it = P.iTip, mt = P.mTip
  P.tTip = [lerp(P.tTip[0], it[0], pinch), lerp(P.tTip[1], it[1], pinch)]
  P.tIp = [lerp(P.tIp[0], (it[0] + P.tIp[0]) / 2, pinch), lerp(P.tIp[1], (it[1] + P.tIp[1]) / 2, pinch)]
  if (pm > 0) {
    P.tTip = [lerp(P.tTip[0], mt[0], pm), lerp(P.tTip[1], mt[1], pm)]
  }
  const order = ['wrist', 'tCmc', 'tMcp', 'tIp', 'tTip', 'iMcp', 'iPip', 'iDip', 'iTip', 'mMcp', 'mPip', 'mDip', 'mTip', 'rMcp', 'rPip', 'rDip', 'rTip', 'pMcp', 'pPip', 'pDip', 'pTip']
  // place: index tip (original open position) lands at (o.x, o.y). Use the un-pinched index tip as reference.
  const ref = [-0.35, -2.05]
  const lms: LM[] = order.map(k => {
    const [lx, ly] = P[k]
    return { x: o.x + (lx - ref[0]) * palm / aspect, y: o.y + (ly - ref[1]) * palm, z: 0 }
  })
  return lms
}
