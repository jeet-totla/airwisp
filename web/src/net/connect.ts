import type { Transport } from './transport'
import { LocalTransport } from './transport'

/** `local=1` in the URL uses the same-browser transport (for tests); otherwise real WebRTC. */
export async function connect(room: string, local: boolean): Promise<Transport> {
  if (local) return new LocalTransport(room)
  const { WebRtcTransport } = await import('./webrtc')
  return new WebRtcTransport(room)
}
