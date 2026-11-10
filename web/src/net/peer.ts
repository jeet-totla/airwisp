import Peer, { type DataConnection } from 'peerjs'
import type { Msg } from './protocol'
import type { Transport } from './transport'

/**
 * Browser-to-browser link over WebRTC using PeerJS. PeerJS's free public server only introduces the two
 * browsers; after that, landmark data goes directly between them. The room code is the host's peer name.
 */
export class PeerTransport implements Transport {
  readonly kind = 'peer' as const
  onMessage: ((m: Msg) => void) | null = null
  onPeers: ((count: number) => void) | null = null
  onState: ((s: string) => void) | null = null
  state = 'Contacting the introduction server…'
  private peer: Peer
  private conns = new Set<DataConnection>()
  private closed = false
  private retry = 0

  constructor(private room: string, private role: 'host' | 'phone') {
    const id = 'airwisp-' + room.toLowerCase()
    const q = new URLSearchParams(location.search)   // ?peerhost=localhost&peerport=9000 points at a self-hosted PeerJS server (used by tests)
    const server = q.get('peerhost') ? { host: q.get('peerhost')!, port: Number(q.get('peerport') ?? 9000), path: '/', secure: false } : {}
    const cfg = { ...server, config: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] } }
    this.peer = role === 'host' ? new Peer(id, cfg) : new Peer(cfg)
    this.peer.on('open', () => {
      this.set(role === 'host' ? 'Ready. Waiting for your phone.' : 'Looking for your laptop…')
      if (role === 'phone') this.dial()
    })
    this.peer.on('connection', c => this.adopt(c))
    this.peer.on('error', e => {
      const t = (e as { type?: string }).type ?? 'error'
      if (t === 'peer-unavailable' && role === 'phone') { this.set('Laptop not found yet, retrying…'); this.again() }
      else if (t === 'unavailable-id') this.set('This code is already in use. Press Reconnect for a new one.')
      else this.set(`Connection problem (${t}). Check your internet and try again.`)
    })
    this.peer.on('disconnected', () => { if (!this.closed) { this.set('Reconnecting to the introduction server…'); try { this.peer.reconnect() } catch { /* ignore */ } } })
  }

  private set(s: string): void { this.state = s; this.onState?.(s) }
  private again(): void { if (this.closed) return; window.setTimeout(() => this.dial(), Math.min(4000, 1000 + 500 * this.retry++)) }
  private dial(): void {
    if (this.closed || this.conns.size > 0 || this.peer.destroyed) return
    this.adopt(this.peer.connect('airwisp-' + this.room.toLowerCase(), { reliable: false, serialization: 'json' }))
  }
  private adopt(c: DataConnection): void {
    c.on('open', () => { this.conns.add(c); this.set('Linked'); this.onPeers?.(this.conns.size) })
    c.on('data', d => this.onMessage?.(d as Msg))
    const gone = () => { if (this.conns.delete(c)) { this.onPeers?.(this.conns.size); if (this.role === 'phone') { this.set('Link lost, retrying…'); this.again() } } }
    c.on('close', gone); c.on('error', gone)
  }
  send(m: Msg): void { for (const c of this.conns) if (c.open) c.send(m) }
  close(): void { this.closed = true; this.conns.forEach(c => c.close()); this.peer.destroy() }
}
