import type { Transport } from './transport'
import { LocalTransport } from './transport'

/** `local=1` in the URL uses the same-browser transport (for tests); otherwise a PeerJS WebRTC link. */
export async function connect(room: string, local: boolean, role: 'host' | 'phone'): Promise<Transport> {
  if (local) return new LocalTransport(room)
  const { PeerTransport } = await import('./peer')
  return new PeerTransport(room, role)
}
