export interface CameraOpts { facing: 'user' | 'environment'; width?: number; height?: number }

export async function openCamera(video: HTMLVideoElement, o: CameraOpts): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs a secure (https) page and a supported browser.')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: o.facing }, width: { ideal: o.width ?? 1280 }, height: { ideal: o.height ?? 720 }, frameRate: { ideal: 30 } },
  })
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  return stream
}

export function stopStream(s: MediaStream | null): void { s?.getTracks().forEach(t => t.stop()) }

/** Calls cb once per new video frame, as fast as the camera delivers. Returns a stop function. */
export function onVideoFrames(video: HTMLVideoElement, cb: (nowMs: number) => void): () => void {
  let stopped = false
  const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number) => void) => number }
  const tick = (now: number) => {
    if (stopped) return
    cb(now)
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick)
  }
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick)
  return () => { stopped = true }
}
