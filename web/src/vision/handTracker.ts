import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Hand } from '../core/types'

const GOOGLE_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/** Browser hand tracking with MediaPipe. WASM is self-hosted; the model is taken from ./models/ if present, else Google's host. */
export class HandTracker {
  private constructor(private lm: HandLandmarker, readonly delegate: 'GPU' | 'CPU') {}

  static async create(base = import.meta.env.BASE_URL ?? './'): Promise<HandTracker> {
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)
    const modelAssetPath = await HandTracker.pickModel(base)
    const make = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try { return new HandTracker(await make('GPU'), 'GPU') }
    catch { return new HandTracker(await make('CPU'), 'CPU') }
  }

  private static async pickModel(base: string): Promise<string> {
    const local = `${base}models/hand_landmarker.task`
    try { const r = await fetch(local, { method: 'HEAD' }); if (r.ok && !(r.headers.get('content-type') ?? '').includes('html')) return local } catch { /* fall through */ }
    return GOOGLE_MODEL
  }

  /** Returns the first hand's 21 landmarks, or null. `nowMs` must increase between calls. */
  detect(video: HTMLVideoElement, nowMs: number): Hand | null {
    const r = this.lm.detectForVideo(video, nowMs)
    const h = r.landmarks?.[0]
    return h && h.length === 21 ? h.map(p => ({ x: p.x, y: p.y, z: p.z })) : null
  }

  close(): void { this.lm.close() }
}
