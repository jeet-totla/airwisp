import type { Hand } from '../core/types'

export type Msg =
  | { k: 'hello'; role: 'host' | 'phone'; v: 1 }
  | { k: 'lm'; t: number; a: number; p: number[] | null }                       // phone -> host: 21 landmarks as x,y,z triples
  | { k: 'status'; hand: boolean; palm: number | null; light: number | null; fps: number } // phone -> host: placement feedback inputs
  | { k: 'cmd'; c: 'camera-on' | 'camera-off' | 'switch-camera' }                 // host -> phone

export function packHand(h: Hand | null): number[] | null {
  if (!h) return null
  const out: number[] = []
  for (const p of h) out.push(Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, Math.round((p.z ?? 0) * 1000) / 1000)
  return out
}

export function unpackHand(p: number[] | null): Hand | null {
  if (!p || p.length !== 63) return null
  const h: Hand = []
  for (let i = 0; i < 63; i += 3) h.push({ x: p[i], y: p[i + 1], z: p[i + 2] })
  return h
}

/** Room codes avoid look-alike characters (0/O, 1/I/L). 8 chars ~ 40 bits. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newRoomCode(rand: (n: number) => number = n => Math.floor(Math.random() * n)): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[rand(ALPHABET.length)]
  return s
}
export function normalizeRoomCode(s: string): string { return s.toUpperCase().replace(/[^A-Z0-9]/g, '') }
export function isValidRoomCode(s: string): boolean { return s.length === 8 && [...s].every(c => ALPHABET.includes(c)) }
