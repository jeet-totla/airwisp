import type { Msg } from './protocol'

export interface Transport {
  readonly kind: 'webrtc' | 'peer' | 'local'
  onState?: ((s: string) => void) | null
  state?: string
  onMessage: ((m: Msg) => void) | null
  onPeers: ((count: number) => void) | null
  send(m: Msg): void
  close(): void
}

/** Same-browser transport (two tabs/windows) via BroadcastChannel. Used for tests and offline development. */
export class LocalTransport implements Transport {
  readonly kind = 'local' as const
  onMessage: ((m: Msg) => void) | null = null
  onPeers: ((count: number) => void) | null = null
  private ch: BroadcastChannel
  private id = Math.random().toString(36).slice(2)
  private peers = new Map<string, number>()
  private beat: number

  constructor(room: string) {
    this.ch = new BroadcastChannel('airwisp-' + room)
    this.ch.onmessage = e => {
      const d = e.data as { id: string; hb?: true; m?: Msg }
      if (d.id === this.id) return
      if (d.hb) { const isNew = !this.peers.has(d.id); this.peers.set(d.id, Date.now()); if (isNew) this.onPeers?.(this.peers.size); return }
      if (d.m) this.onMessage?.(d.m)
    }
    const hb = () => { this.ch.postMessage({ id: this.id, hb: true }); this.prune() }
    hb(); this.beat = window.setInterval(hb, 500)
  }
  private prune(): void {
    const before = this.peers.size
    for (const [k, t] of this.peers) if (Date.now() - t > 2000) this.peers.delete(k)
    if (this.peers.size !== before) this.onPeers?.(this.peers.size)
  }
  send(m: Msg): void { this.ch.postMessage({ id: this.id, m }) }
  close(): void { clearInterval(this.beat); this.ch.close() }
}
