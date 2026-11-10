/** A MediaPipe-style landmark, normalized to the camera frame (x: 0..1 of width, y: 0..1 of height). */
export interface LM { x: number; y: number; z?: number }
export type Hand = LM[] // 21 landmarks
export type Source = 'front' | 'side'

export type Action =
  | { type: 'move'; x: number; y: number }          // screen unit square 0..1
  | { type: 'down'; button: 'left' | 'right' }
  | { type: 'up'; button: 'left' | 'right' }
  | { type: 'click'; button: 'left' | 'right' }
  | { type: 'scroll'; dy: number }                  // pixels
  | { type: 'armed'; on: boolean }

export const IDX = {
  wrist: 0, thumbCmc: 1, thumbMcp: 2, thumbIp: 3, thumbTip: 4,
  indexMcp: 5, indexPip: 6, indexDip: 7, indexTip: 8,
  middleMcp: 9, middlePip: 10, middleDip: 11, middleTip: 12,
  ringMcp: 13, ringPip: 14, ringDip: 15, ringTip: 16,
  pinkyMcp: 17, pinkyPip: 18, pinkyDip: 19, pinkyTip: 20,
} as const
