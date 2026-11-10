/** Active-zone mapper with optional 4-corner bilinear calibration. Mirrors prototype/airwisp/mapper.py. */
export type Pt = [number, number]
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export class Mapper {
  zoneX = 0.2; zoneY = 0.25; zoneW = 0.6; zoneH = 0.5
  mirrorX = true
  corners: Pt[] | null = null // TL, TR, BL, BR in mirrored camera space

  /** Raw (un-mirrored) camera points captured while the user pointed at each screen corner. */
  setCorners(tl: Pt, tr: Pt, bl: Pt, br: Pt): void {
    const m = (p: Pt): Pt => (this.mirrorX ? [1 - p[0], p[1]] : p)
    this.corners = [m(tl), m(tr), m(bl), m(br)]
  }
  clearCalibration(): void { this.corners = null }

  toUnit(cx: number, cy: number): Pt {
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
