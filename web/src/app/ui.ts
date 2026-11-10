import QRCode from 'qrcode'

type Child = Node | string | null | undefined | false
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'html') el.innerHTML = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids) if (c) el.append(c)
  return el
}

export const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9" fill="none" stroke="#6C4DFF" stroke-width="4"/><circle cx="16" cy="16" r="3" fill="#FFB830"/></svg>`

export function brand(): HTMLElement { return h('div', { class: 'brand', html: LOGO + '<span>Airwisp</span>' }) }

let toastTimer = 0
export function toast(msg: string): void {
  const t = document.getElementById('toast'); if (!t) return
  t.textContent = msg; t.classList.add('show')
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800)
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 0, width: 512, color: { dark: '#16222a', light: '#ffffff' } })
}

export function mount(root: HTMLElement): void { const app = document.getElementById('app')!; app.replaceChildren(root) }

export function safeStorage() {
  return {
    get(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } },
    set(k: string, v: string): void { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  }
}

export const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]

export function drawHand(canvas: HTMLCanvasElement, hand: { x: number; y: number }[] | null, color = '#6C4DFF', glow = '#FFB830'): void {
  const w = canvas.clientWidth || 640, hgt = canvas.clientHeight || 360
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== hgt) canvas.height = hgt
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.clearRect(0, 0, w, hgt)
  if (!hand) return
  ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [a, b] of CONNECTIONS) { ctx.moveTo(hand[a].x * w, hand[a].y * hgt); ctx.lineTo(hand[b].x * w, hand[b].y * hgt) }
  ctx.stroke()
  ctx.fillStyle = '#fff'
  for (const p of hand) { ctx.beginPath(); ctx.arc(p.x * w, p.y * hgt, 3.5, 0, 7); ctx.fill() }
  ctx.fillStyle = glow
  for (const i of [4, 8]) { ctx.beginPath(); ctx.arc(hand[i].x * w, hand[i].y * hgt, 7, 0, 7); ctx.fill() }
}
