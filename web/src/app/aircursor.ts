import type { Action } from '../core/types'
import { Trail } from './trail'
import { toast } from './ui'

/**
 * The on-screen cursor. Turns Actions into real DOM events at the cursor position, so ordinary web
 * pages react as if a mouse were being used. (A website cannot move the operating system's own cursor.)
 */
export class AirCursor {
  x = innerWidth / 2
  y = innerHeight / 2
  armed = true
  dragging = false
  private el = document.getElementById('aircursor') as HTMLElement
  private trail = new Trail(document.getElementById('trail') as HTMLCanvasElement)
  private hovered: Element | null = null
  private downTarget: Element | null = null

  show(on = true): void { this.el.hidden = !on }

  apply(actions: Action[]): void {
    for (const a of actions) {
      switch (a.type) {
        case 'move': this.move(a.x * innerWidth, a.y * innerHeight); break
        case 'down': this.down(a.button); break
        case 'up': this.up(a.button); break
        case 'click': this.down(a.button); this.up(a.button, true); break
        case 'scroll': this.scroll(a.dy); break
        case 'armed':
          this.armed = a.on; this.el.classList.toggle('off', !a.on)
          toast(a.on ? 'Airwisp on' : 'Airwisp paused: hold a fist to resume')
          break
      }
    }
  }

  setMode(m: 'pinch' | 'drag' | 'scroll' | null): void {
    for (const c of ['pinch', 'drag', 'scroll']) this.el.classList.toggle(c, m === c)
  }

  private target(): Element | null { return document.elementFromPoint(this.x, this.y) }

  private fire(el: Element | null, type: string, button = 0, buttons = 0): void {
    if (!el) return
    const init: PointerEventInit = { bubbles: true, cancelable: true, clientX: this.x, clientY: this.y, button, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window }
    if (type.startsWith('pointer')) el.dispatchEvent(new PointerEvent(type, init))
    else el.dispatchEvent(new MouseEvent(type, init))
  }

  private move(x: number, y: number): void {
    this.x = x; this.y = y
    this.el.style.transform = `translate(${x}px, ${y}px)`
    this.trail.push(x, y)
    const t = this.target()
    if (t !== this.hovered) {
      this.hovered?.closest('button, a, [role=button], .pad, .sw')?.classList.remove('air-hover')
      this.hovered = t
      t?.closest('button, a, [role=button], .pad, .sw')?.classList.add('air-hover')
    }
    const buttons = this.dragging ? 1 : 0
    this.fire(this.dragging ? this.downTarget ?? t : t, 'pointermove', 0, buttons)
    this.fire(this.dragging ? this.downTarget ?? t : t, 'mousemove', 0, buttons)
  }

  private down(button: 'left' | 'right'): void {
    const t = this.target(); this.downTarget = t
    const b = button === 'left' ? 0 : 2
    this.fire(t, 'pointerdown', b, b === 0 ? 1 : 2); this.fire(t, 'mousedown', b, b === 0 ? 1 : 2)
    if (button === 'left') { this.dragging = true; this.setMode('pinch') }
  }

  private up(button: 'left' | 'right', asClick = false): void {
    const t = this.target(); const b = button === 'left' ? 0 : 2
    this.fire(this.downTarget ?? t, 'pointerup', b, 0); this.fire(this.downTarget ?? t, 'mouseup', b, 0)
    if (asClick || (this.downTarget && this.downTarget === t && !this.moved)) {
      if (b === 0) { const e = t as HTMLElement | null; if (e?.click) e.click(); else this.fire(t, 'click', 0, 0) }
      else this.fire(t, 'contextmenu', 2, 0)
    }
    if (button === 'left') { this.dragging = false; this.setMode(null) }
    this.downTarget = null
  }
  private get moved(): boolean { return false }

  private scroll(dy: number): void {
    let el: Element | null = this.target()
    while (el && el !== document.documentElement) {
      const s = getComputedStyle(el)
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollBy(0, dy); return }
      el = el.parentElement
    }
    window.scrollBy(0, dy)
  }
}
