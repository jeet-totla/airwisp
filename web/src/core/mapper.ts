/** Active-zone mapper with optional 4-corner bilinear calibration. Mirrors prototype/airwisp/mapper.py. */
export type Pt = [number, number]
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export class Mapper {
  zoneX = 0.2; zoneY = 0.25; zoneW = 0.6; zoneH = 0.5
  mirrorX = true
  corners: Pt[] | null = null // TL, TR, BL, BR in mirrored camera space
  private H: number[] | null = null // camera (raw) -> screen unit square, 3x3 row-major
  /** RMS error (screen units) of the last calibration fit. */
  fitError = 0

  /** Raw (un-mirrored) camera points captured while the user pointed at each screen corner. */
  setCorners(tl: Pt, tr: Pt, bl: Pt, br: Pt): void {
    const m = (p: Pt): Pt => (this.mirrorX ? [1 - p[0], p[1]] : p)
    this.corners = [m(tl), m(tr), m(bl), m(br)]
  }
  /** Fit a projective map from raw camera points to screen points (>= 4 pairs, least squares). Returns the RMS error in screen units. */
  setCalibration(pairs: { cam: Pt; screen: Pt }[]): number {
    const H = fitHomography(pairs.map(p => p.cam), pairs.map(p => p.screen))
    if (!H) return Infinity
    this.H = H; this.corners = null
    let se = 0
    for (const p of pairs) { const q = applyH(H, p.cam); se += (q[0] - p.screen[0]) ** 2 + (q[1] - p.screen[1]) ** 2 }
    this.fitError = Math.sqrt(se / pairs.length)
    return this.fitError
  }
  clearCalibration(): void { this.corners = null; this.H = null; this.fitError = 0 }
  get calibrated(): boolean { return !!this.H || !!this.corners }

  toUnit(cx: number, cy: number): Pt {
    if (this.H) { const q = applyH(this.H, [cx, cy]); return [clamp01(q[0]), clamp01(q[1])] }
    const x = this.mirrorX ? 1 - cx : cx
    if (!this.corners) return [clamp01((x - this.zoneX) / this.zoneW), clamp01((cy - this.zoneY) / this.zoneH)]
    return this.inverseBilinear(x, cy, this.corners)
  }

  private inverseBilinear(px: number, py: number, c: Pt[]): Pt {
    const [tl, tr, bl, br] = c
    let u = 0.5, v = 0.5
    for (let i = 0; i < 20; i++) {
      const fx = (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + (1 - u) * v * bl[0] + u * v * br[0] - px
      const fy = (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + (1 - u) * v * bl[1] + u * v * br[1] - py
      const dxu = (1 - v) * (tr[0] - tl[0]) + v * (br[0] - bl[0])
      const dxv = (1 - u) * (bl[0] - tl[0]) + u * (br[0] - tr[0])
      const dyu = (1 - v) * (tr[1] - tl[1]) + v * (br[1] - bl[1])
      const dyv = (1 - u) * (bl[1] - tl[1]) + u * (br[1] - tr[1])
      const det = dxu * dyv - dxv * dyu
      if (Math.abs(det) < 1e-12) break
      const du = (fx * dyv - fy * dxv) / det
      const dv = (dxu * fy - dyu * fx) / det
      u -= du; v -= dv
      if (Math.abs(du) < 1e-7 && Math.abs(dv) < 1e-7) break
    }
    return [clamp01(u), clamp01(v)]
  }
}

export function applyH(H: number[], p: Pt): Pt {
  const w = H[6] * p[0] + H[7] * p[1] + H[8]
  return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w]
}

/** Direct linear transform with h33 = 1, solved by normal equations. */
export function fitHomography(src: Pt[], dst: Pt[]): number[] | null {
  if (src.length < 4 || src.length !== dst.length) return null
  const A: number[][] = [], b: number[] = []
  for (let i = 0; i < src.length; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  const n = 8
  const M: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0))
  for (let r = 0; r < A.length; r++) for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] += A[r][i] * A[r][j]
    M[i][n] += A[r][i] * b[r]
  }
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k] }
  }
  const h = M.map((row, i) => row[n] / row[i])
  return [...h, 1]
}
