// The pad (and keyboard) on the game's DOM: every card, menu and prompt is a pointer UI, so rather than give each its
// own key handling, this moves a focus ring between whatever can be pressed on the top layer and presses it the way a
// finger would: A down is a pointerdown on it, A up is the pointerup and the click. So a button that acts on pointerdown,
// one that acts on click, a hold (the spray, the gesture ring) and a drag all behave exactly as they do under a thumb,
// with the thumb's rules (real seconds for holds) intact.
//
// One mapping per kind of gesture, used everywhere:
//   tap / button      A
//   hold              hold A (real seconds, as with a thumb)
//   drag, stroke, aim hold A and steer with the left stick (the drag handle, signing the docket, aiming the spray, the
//                     after-hours trace, shoving a block in the layout editor)
//   pick / menus      d-pad or left stick to choose, A to take it, B to go back
// In the shed: the left stick walks, the nearest thing's first action is ringed (LB/RB for the others), A does it,
// X picks up or puts down, Y the notepad, Menu pauses, View the log.
import type { Input } from './input.js';
import { padGlyph, type PadButton } from './pad.js';

/** The pointer id the pad's presses use (never a real finger's). */
export const PAD_POINTER = 4242;

/** What the view tells the navigator about the game (no imports of the view: this module knows only the DOM). */
export interface NavHost {
  /** The shed is live: walking, labels, the notepad (not paused, not a scene, not a screen over it). */
  inWorld(): boolean;
  /** A scene where a tap anywhere hurries the line along (the cafe, a night, the reveal). */
  tapToAdvance(): boolean;
  /** That tap. */
  advance(): void;
  /** A scene where the finger works on the canvas itself (the layout editor, the after-hours trace). */
  canvasScene(): boolean;
  canvas: HTMLCanvasElement;
  /** Where the player is on screen (CSS px), for picking the nearest prompt. */
  playerScreen(): { x: number; y: number } | null;
  pause(): void;
  showLog(): void;
  /** Y: the notepad. `open` false: close it again (portrait slides it away). */
  notepad(open: boolean): void;
  /** X: pick up what's at hand, or put down what's carried. Returns false if there's nothing to do. */
  carry(): boolean;
  /** Something to do on B when nothing on screen takes it (null: nothing). */
  back(): boolean;
}

interface Layer {
  name: string;
  /** The layer's root(s): the first visible match makes it the top layer (when it has something to press). */
  root: string;
  /** What B presses on this layer, if anything. */
  back?: string;
  /** B with no back button: a tap anywhere (letters close on any tap). */
  backTap?: boolean;
}

/** Top first. A layer counts while its root is visible and it has something to press. */
const LAYERS: Layer[] = [
  { name: 'failure', root: '.kirfail, #kir-fail', back: '.reload' },
  { name: 'settings', root: '.kirset', back: '.cancel:not([hidden] *), .done' },
  { name: 'title', root: '.kirtitle', back: '.cancel' },
  { name: 'summary', root: '#kir-hud .summary' },
  { name: 'pause', root: '#kir-hud .modal.paused', back: '.resume' },
  { name: 'log', root: '#kir-hud .modal.log', back: 'button' },
  { name: 'ply', root: '#kir-hud .modal.ply', back: '.close' },
  { name: 'kerr', root: '#kir-hud .kerr', back: '.off' },
  { name: 'ledger', root: '#kir-hud .ledgercard', back: 'button' },
  { name: 'letter', root: '#kir-hud .lettercard', backTap: true },
  { name: 'call', root: '#kir-hud .callcard', back: '.no' },
  { name: 'gesture', root: '#kir-hud .gesture', back: '.x' },
  { name: 'cafe', root: '#kir-hud .cafenext, #kir-hud .cafechip.skip' },
  { name: 'replies', root: '#kir-hud .replies', back: 'button.home' },
  { name: 'notepad', root: '#kir-hud .pad' },
  { name: 'world', root: '#kir-hud .labels' },
];

const FOCUSABLE = 'button, a, input[type=range], li[data-targets], li[data-more], .gt:not(.done), .ring, .handle, .docket, .opt';

function visible(el: Element): boolean {
  if (!el.isConnected) return false;
  const h = el as HTMLElement;
  if (h.hidden || h.closest('[hidden]')) return false;
  if (typeof (h as { checkVisibility?: (o: object) => boolean }).checkVisibility === 'function') {
    if (!(h as unknown as { checkVisibility: (o: object) => boolean }).checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  }
  const r = h.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

const centre = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function firePointer(el: EventTarget, type: string, x: number, y: number, buttons = 1) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: PAD_POINTER, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons }));
}

export class PadNav {
  /** What's ringed now. */
  focus: HTMLElement | null = null;
  /** The layer it's on. */
  layer: string | null = null;
  /** Y put the focus on the notepad (until B/Y, or a line is taken). */
  notepadOn = false;
  /** A press in progress: what got the pointerdown, and where the virtual pointer is. */
  private press: { el: EventTarget; x: number; y: number; moved: boolean; focus: HTMLElement | null } | null = null;
  /** The canvas scenes' cursor (CSS px), and whether the stick or the d-pad moved last there. */
  cursor = { x: innerWidth / 2, y: innerHeight / 2, on: false };
  private cursorEl: HTMLDivElement;
  private legendEl: HTMLDivElement;
  private lastSig = '';

  constructor(private input: Input, private host: NavHost, parent: HTMLElement) {
    if (!document.getElementById('kir-padnav-css')) {
      const s = document.createElement('style'); s.id = 'kir-padnav-css';
      s.textContent = `
.padfocus { outline: 4px solid #3fa7ff !important; outline-offset: 3px !important; position: relative; }
.padfocus[data-glyph]::before { content: attr(data-glyph); position: absolute; left: -12px; top: -12px; z-index: 2; min-width: 1.6em; height: 1.6em; padding: 0 .3em;
  box-sizing: border-box; border-radius: .8em; background: #14110f; color: #fff8ec; font: 700 max(14px, calc(14px * var(--s, 1))) sans-serif; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.padcursor { position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; border: 3px solid #fff8ec; box-shadow: 0 0 0 2px #14110f; pointer-events: none; z-index: 60; display: none; }
.padcursor.down { background: rgba(63,167,255,.6); }
.padlegend { position: absolute; right: calc(10px + var(--tvx, 0px) + env(safe-area-inset-right, 0px)); bottom: calc(8px + var(--tvy, 0px) + env(safe-area-inset-bottom, 0px));
  display: none; gap: 10px; font: max(16px, calc(14px * var(--s, 1))) 'Courier New', monospace; color: #efe6d8; background: rgba(20,17,15,.7); padding: 6px 10px; border-radius: 8px; pointer-events: none; z-index: 9; }
.padlegend b { display: inline-block; min-width: 1.4em; padding: 0 .3em; margin-right: .3em; border-radius: .7em; background: #efe6d8; color: #14110f; text-align: center; }
`;
      document.head.appendChild(s);
    }
    this.cursorEl = document.createElement('div'); this.cursorEl.className = 'padcursor';
    document.body.appendChild(this.cursorEl);
    this.legendEl = document.createElement('div'); this.legendEl.className = 'padlegend';
    parent.appendChild(this.legendEl);
  }

  /** The glyph for a button in the input in use (keyboard keys, or the pad's letters). Empty for touch. */
  glyph(b: PadButton): string {
    const k = this.input.kind;
    if (k === 'touch') return '';
    if (k === 'keyboard') return ({ confirm: 'E', back: 'Esc', carry: 'Q', notepad: 'Tab', prev: '[', next: ']', log: 'L', pause: 'Esc', up: '↑', down: '↓', left: '←', right: '→' } as Record<PadButton, string>)[b];
    return padGlyph(b, this.input.family);
  }

  /** The top layer with something to press, and what's on it. */
  private top(): { layer: Layer; root: Element; items: HTMLElement[] } | null {
    for (const L of LAYERS) {
      if (L.name === 'notepad' && !this.notepadOn) continue;
      if (L.name === 'world' && !this.host.inWorld()) continue;
      for (const root of Array.from(document.querySelectorAll(L.root))) {
        if (!visible(root)) continue;
        const items = (root.matches(FOCUSABLE) ? [root as HTMLElement] : []).concat(Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)))
          .filter(e => visible(e) && !(e as HTMLButtonElement).disabled);
        if (items.length || L.backTap) return { layer: L, root, items };
      }
    }
    return null;
  }

  /** Every frame, after Input.poll: move the ring, press, steer, go back. `dt` frame seconds. */
  update(dt: number) {
    const inp = this.input, padish = inp.kind !== 'touch';
    const t = this.top();
    this.layer = t?.layer.name ?? null;
    // the notepad focus ends when the notepad's gone (portrait: it slid away)
    if (this.notepadOn && this.layer !== 'notepad' && !t) this.notepadOn = false;

    // the canvas scenes: a cursor the stick moves (the d-pad still walks the replies)
    const canvasMode = this.host.canvasScene();
    const s = inp.stick();
    if (canvasMode && padish && (s.x || s.y) && !this.press) this.cursor.on = true;
    if (canvasMode && inp.nav()) this.cursor.on = false;
    if (!canvasMode) this.cursor.on = false;

    // a press in progress: the stick steers it (drags, strokes, the spray's aim); A up lets go
    if (this.press) {
      if (s.x || s.y) {
        const v = 380 * (parseFloat(getComputedStyle(document.querySelector('#kir-hud .stage') ?? document.body).getPropertyValue('--s')) || 1);
        this.press.x = Math.max(0, Math.min(innerWidth, this.press.x + s.x * v * dt));
        this.press.y = Math.max(0, Math.min(innerHeight, this.press.y + s.y * v * dt));
        this.press.moved = true;
        firePointer(this.press.el, 'pointermove', this.press.x, this.press.y);
        if (this.cursor.on) { this.cursor.x = this.press.x; this.cursor.y = this.press.y; }
      }
      if (!inp.down('confirm')) this.release();
      this.draw();
      return;
    }

    if (this.cursor.on && (s.x || s.y)) {
      const v = 420 * dt;
      this.cursor.x = Math.max(0, Math.min(innerWidth, this.cursor.x + s.x * v));
      this.cursor.y = Math.max(0, Math.min(innerHeight, this.cursor.y + s.y * v));
    }

    // the ring: keep it on the top layer, on something still there
    const items = t?.items ?? [];
    if (!this.focus || !items.includes(this.focus)) this.setFocus(this.defaultFocus(t?.layer.name ?? '', items));
    // in the shed the stick walks; LB/RB pick between the prompts. Everywhere else the d-pad / stick moves the ring.
    if (this.layer === 'world') {
      if (inp.pressed('next') || inp.pressed('prev')) this.cycle(items, inp.pressed('next') ? 1 : -1);
    } else {
      const d = inp.nav();
      if (d) this.step(items, d);
      if (inp.pressed('next') || inp.pressed('prev')) this.cycle(items, inp.pressed('next') ? 1 : -1);
    }
    // a slider: left/right change it
    if (this.focus instanceof HTMLInputElement && this.focus.type === 'range') { /* handled in step() */ }

    // right stick scrolls a long card
    const a = inp.aim();
    if (a.y && t) {
      const sc = this.scroller(this.focus ?? (t.root as HTMLElement));
      if (sc) sc.scrollTop += a.y * 900 * dt;
    }

    if (inp.pressed('confirm')) this.confirm(t);
    else if (inp.pressed('back')) this.goBack(t);
    else if (inp.pressed('notepad')) this.toggleNotepad();
    else if (inp.pressed('pause')) this.host.pause();
    else if (inp.pressed('log') && this.host.inWorld()) this.host.showLog();
    else if (inp.pressed('carry') && this.host.inWorld()) this.host.carry();
    this.draw();
  }

  private toggleNotepad() {
    if (this.notepadOn) { this.notepadOn = false; this.host.notepad(false); this.setFocus(null); return; }
    if (!this.host.inWorld()) return;
    this.notepadOn = true;
    this.host.notepad(true);
    this.setFocus(null);
  }

  /** What to ring first on a layer: the hot prompt, the main button, else the first. In the shed: the nearest prompt. */
  private defaultFocus(layer: string, items: HTMLElement[]): HTMLElement | null {
    if (!items.length) return null;
    if (layer === 'world') {
      const me = this.host.playerScreen();
      const firsts = items.filter(b => b.parentElement?.querySelector('button') === b);
      const pool = firsts.length ? firsts : items;
      const hot = pool.filter(b => b.classList.contains('hot'));
      const from = hot.length ? hot : pool;
      if (!me) return from[0];
      return from.map(b => ({ b, d: Math.hypot(centre(b).x - me.x, centre(b).y - me.y) })).sort((p, q) => p.d - q.d)[0].b;
    }
    const pref = ['.next', '.yes', '.resume', '.cont', '.new', '.door', '.done', '.cafenext', '[data-g="hold"]', '.handle', '.docket', '.gt', '.opt'];
    for (const p of pref) { const hit = items.find(e => e.matches(p)); if (hit) return hit; }
    return items[0];
  }

  private setFocus(el: HTMLElement | null) {
    if (this.focus === el) return;
    if (this.focus) { this.focus.classList.remove('padfocus'); delete this.focus.dataset.glyph; }
    this.focus = el;
    if (el) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private cycle(items: HTMLElement[], dir: 1 | -1) {
    if (!items.length) return;
    const i = this.focus ? items.indexOf(this.focus) : -1;
    this.setFocus(items[(i + dir + items.length) % items.length]);
  }

  /** The d-pad: the nearest thing that way (a slider takes left/right itself). */
  private step(items: HTMLElement[], d: 'up' | 'down' | 'left' | 'right') {
    const f = this.focus;
    if (f instanceof HTMLInputElement && f.type === 'range' && (d === 'left' || d === 'right')) {
      const st = Number(f.step) || 1;
      f.value = String(Math.max(Number(f.min), Math.min(Number(f.max), Number(f.value) + (d === 'right' ? st : -st))));
      f.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (!f) { this.setFocus(items[0] ?? null); return; }
    const c = centre(f), v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
    let best: HTMLElement | null = null, bs = Infinity;
    for (const e of items) {
      if (e === f) continue;
      const p = centre(e), dx = p.x - c.x, dy = p.y - c.y;
      const along = dx * v[0] + dy * v[1];
      if (along <= 2) continue;
      const across = Math.abs(dx * v[1] - dy * v[0]);
      const score = along + across * 2.5;
      if (score < bs) { bs = score; best = e; }
    }
    // nothing that way: up/down wrap through the list in order
    if (!best && (d === 'up' || d === 'down')) { this.cycle(items, d === 'down' ? 1 : -1); return; }
    if (best) this.setFocus(best);
  }

  private confirm(t: ReturnType<PadNav['top']>) {
    // a canvas scene's cursor presses whatever's under it (a block, the sheet, a reply)
    if (this.cursor.on) {
      const under = document.elementFromPoint(this.cursor.x, this.cursor.y) ?? this.host.canvas;
      this.begin(under, this.cursor.x, this.cursor.y, null);
      return;
    }
    const f = this.focus;
    if (f) { const c = centre(f); this.begin(f, c.x, c.y, f); return; }
    // nothing to ring: a tap hurries a line along (the knock-off, the cafe, letters)
    if (t?.layer.backTap) this.tapAt(document.body, innerWidth / 2, innerHeight / 2);
    else if (this.host.tapToAdvance()) this.host.advance();
  }

  /** A down on `el` at (x, y): held till A comes up. */
  private begin(el: Element, x: number, y: number, focus: HTMLElement | null) {
    this.press = { el, x, y, moved: false, focus };
    if (el === this.host.canvas) this.cursorEl.classList.add('down');
    firePointer(el, 'pointerdown', x, y);
  }

  private release() {
    const p = this.press;
    if (!p) return;
    this.press = null;
    this.cursorEl.classList.remove('down');
    firePointer(p.el, 'pointerup', p.x, p.y, 0);
    // the click a finger's lift makes (only if it's still there: a label rebuilt under the finger takes none)
    if (p.el instanceof Element && p.el.isConnected && !p.moved) {
      p.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
      // a notepad line taken: back to walking (it walks you there)
      if (this.layer === 'notepad' && p.el instanceof HTMLLIElement && p.el.dataset.targets) { this.notepadOn = false; this.host.notepad(false); }
    }
    // the focused input range never needs a click; a form control focused by the browser would steal the keys
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private goBack(t: ReturnType<PadNav['top']>) {
    if (this.notepadOn && this.layer === 'notepad') { this.toggleNotepad(); return; }
    const L = t?.layer;
    if (L?.back && t) {
      const b = Array.from(t.root.querySelectorAll<HTMLElement>(L.back)).find(e => visible(e));
      if (b) { const c = centre(b); this.tapAt(b, c.x, c.y); return; }
    }
    if (L?.backTap) { this.tapAt(document.body, innerWidth / 2, innerHeight / 2); return; }
    if (this.host.back()) return;
    // in the shed, B with nothing up: the pause menu (Esc on a keyboard does the same)
    if (this.host.inWorld() && this.input.kind === 'keyboard') this.host.pause();
  }

  private scroller(el: HTMLElement | null): HTMLElement | null {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2) return e;
    }
    return null;
  }

  /** The ring, its glyph, the cursor and the legend, for the input in use (touch: none of them). */
  private draw() {
    const padish = this.input.kind !== 'touch';
    const f = this.focus;
    if (f) {
      f.classList.toggle('padfocus', padish);
      const g = padish ? this.glyph('confirm') : '';
      if (g) f.dataset.glyph = g; else delete f.dataset.glyph;
    }
    const cur = this.cursor.on && padish;
    this.cursorEl.style.display = cur ? 'block' : 'none';
    if (cur) { this.cursorEl.style.left = `${this.press ? this.press.x : this.cursor.x}px`; this.cursorEl.style.top = `${this.press ? this.press.y : this.cursor.y}px`; }
    // the legend: what the other buttons do right now
    let sig = '';
    if (padish) {
      const parts: [PadButton, string][] = [];
      if (this.layer === 'world') parts.push(['carry', 'Pick up / put down'], ['notepad', 'Notepad'], ['pause', 'Pause']);
      else if (this.layer === 'notepad') parts.push(['confirm', 'Go'], ['notepad', 'Back']);
      else if (this.layer) { parts.push(['confirm', 'Choose']); if (LAYERS.find(l => l.name === this.layer)?.back) parts.push(['back', 'Back']); }
      if (this.focus?.matches('.hold, [data-g="hold"]')) parts.splice(0, parts.length, ['confirm', 'Hold']);
      if (this.focus?.matches('.handle, .docket')) parts.splice(0, parts.length, ['confirm', 'Hold + left stick']);
      if (this.cursor.on) parts.splice(0, parts.length, ['confirm', 'Press / hold + stick to drag'], ['back', 'Back']);
      sig = parts.map(([b, w]) => `<span><b>${this.glyph(b)}</b>${w}</span>`).join('');
    }
    if (sig !== this.lastSig) { this.lastSig = sig; this.legendEl.innerHTML = sig; this.legendEl.style.display = sig ? 'flex' : 'none'; }
  }

  /** A pad press is going on (A held on something: a hold, a drag, the spray). */
  get pressing() { return this.press !== null; }

  /** A whole tap on `el` at (x, y): down, up, click. */
  tapAt(el: Element, x: number, y: number) {
    firePointer(el, 'pointerdown', x, y);
    firePointer(el, 'pointerup', x, y, 0);
    if (el.isConnected) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }

  /** Tests: what's ringed, as text. */
  get focusText(): string { return this.focus?.textContent?.trim() ?? ''; }
}
