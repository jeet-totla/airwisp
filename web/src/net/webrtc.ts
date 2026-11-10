import { joinRoom } from 'trystero'
import type { Msg } from './protocol'
import type { Transport } from './transport'

/**
 * Direct browser-to-browser link (WebRTC data channel). Trystero uses public Nostr relays only to
 * introduce the two browsers; after that, landmark data flows peer to peer and is end-to-end encrypted.
 * The room code is the only secret, so keep it private.
 */
export class WebRtcTransport implements Transport {
  readonly kind = 'webrtc' as const
  onMessage: ((m: Msg) => void) | null = null
  onPeers: ((count: number) => void) | null = null
  private room: ReturnType<typeof joinRoom>
  private action: { send(d: unknown): Promise<void>; onMessage: ((d: any) => void) | null }
  private peers = new Set<string>()

  constructor(roomCode: string) {
    this.room = joinRoom({
      appId: 'airwisp-web-v1',
      relayConfig: { redundancy: 4 },
      rtcConfig: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] },
    }, roomCode)
    this.action = this.room.makeAction('msg') as unknown as WebRtcTransport['action']
    this.action.onMessage = (data: Msg) => { this.onMessage?.(data) }
    this.room.onPeerJoin = (id: string) => { this.peers.add(id); this.onPeers?.(this.peers.size) }
    this.room.onPeerLeave = (id: string) => { this.peers.delete(id); this.onPeers?.(this.peers.size) }
  }
  send(m: Msg): void { void this.action.send(m) }
  close(): void { void this.room.leave() }
}
