// Copies MediaPipe's WASM runtime from node_modules into public/ so the site is self-hosted (no CDN).
import { cpSync, mkdirSync, existsSync } from 'node:fs'
const src = 'node_modules/@mediapipe/tasks-vision/wasm'
const dst = 'public/mediapipe/wasm'
if (!existsSync(src)) { console.error('Run npm install first'); process.exit(1) }
mkdirSync(dst, { recursive: true })
cpSync(src, dst, { recursive: true })
console.log('copied MediaPipe wasm ->', dst)
