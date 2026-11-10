export type DistanceHint = 'none' | 'closer' | 'back' | 'good'
export type LightHint = 'dark' | 'bright' | 'ok'

/** Palm length (wrist -> middle MCP) as a fraction of frame height. Targets are starting points to be tuned with real cameras. */
export const PALM_TARGET = { min: 0.12, max: 0.30 }

export function distanceHint(palm: number | null): DistanceHint {
  if (palm === null) return 'none'
  if (palm < PALM_TARGET.min) return 'closer'
  if (palm > PALM_TARGET.max) return 'back'
  return 'good'
}

export function lightHint(mean: number | null): LightHint {
  if (mean === null) return 'ok'
  if (mean < 55) return 'dark'
  if (mean > 215) return 'bright'
  return 'ok'
}

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
/** Mean brightness (0..255) of the current video frame, sampled on a tiny canvas. */
export function meanLuminance(video: HTMLVideoElement): number | null {
  if (!canvas || video.videoWidth === 0) return null
  canvas.width = 32; canvas.height = 18
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, 32, 18)
  const d = ctx.getImageData(0, 0, 32, 18).data
  let s = 0
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  return s / (d.length / 4)
}

export const distanceText: Record<DistanceHint, string> = {
  none: 'Hold your hand up so the camera can see it',
  closer: 'Move a little closer',
  back: 'Move back a little',
  good: 'Distance looks good',
}
export const lightText: Record<LightHint, string> = {
  dark: 'Too dark: turn on a light in front of you',
  bright: 'Too bright or backlit: face the light, not a window behind you',
  ok: 'Lighting looks good',
}
