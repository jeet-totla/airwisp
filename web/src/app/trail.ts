/** Soft fading trail behind the wisp cursor. Purely visual; skipped for reduced-motion users. */
export class Trail {
  private pts: { x: number; y: number; t: number }[] = []
  private ctx: CanvasRenderingContext2D | null
  private running = false
  private reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')
    const size = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; this.ctx?.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0) }
    size(); addEventListener('resize', size)
  }
  push(x: number, y: number): void {
    if (this.reduced) return
    this.pts.push({ x, y, t: performance.now() })
    if (!this.running) { this.running = true; requestAnimationFrame(this.frame) }
  }
  private frame = () => {
    const ctx = this.ctx; if (!ctx) return
    const now = performance.now()
    this.pts = this.pts.filter(p => now - p.t < 650)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i]
      const life = 1 - (now - b.t) / 650
      ctx.strokeStyle = `rgba(108,77,255,${0.35 * life})`
      ctx.lineWidth = 2 + 12 * life; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
    if (this.pts.length) requestAnimationFrame(this.frame); else this.running = false
  }
}
