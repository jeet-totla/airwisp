/** One-Euro filter (Casiez et al. 2012). Mirrors prototype/airwisp/oneeuro.py. Time in seconds. */
function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuro {
  private xHat = 0
  private dxHat = 0
  private xPrev: number | null = null
  private tPrev: number | null = null
  constructor(public minCutoff = 1.2, public beta = 0.02, public dCutoff = 1.0) {}

  reset(): void { this.xPrev = null; this.tPrev = null; this.xHat = 0; this.dxHat = 0 }

  filter(x: number, t: number): number {
    if (this.tPrev === null || this.xPrev === null || t <= this.tPrev) {
      this.tPrev = t; this.xPrev = x; this.xHat = x; this.dxHat = 0
      return x
    }
    const dt = t - this.tPrev
    const dx = (x - this.xPrev) / dt
    const a = alpha(this.dCutoff, dt)
    this.dxHat = a * dx + (1 - a) * this.dxHat
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxHat)
    const ax = alpha(cutoff, dt)
    this.xHat = ax * x + (1 - ax) * this.xHat
    this.xPrev = x; this.tPrev = t
    return this.xHat
  }
}

export class OneEuro2D {
  private fx: OneEuro
  private fy: OneEuro
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    this.fx = new OneEuro(minCutoff, beta, dCutoff)
    this.fy = new OneEuro(minCutoff, beta, dCutoff)
  }
  reset(): void { this.fx.reset(); this.fy.reset() }
  filter(x: number, y: number, t: number): [number, number] { return [this.fx.filter(x, t), this.fy.filter(y, t)] }
}
