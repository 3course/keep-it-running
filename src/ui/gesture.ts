// One-thumb gestures for the hands-on jobs: a small card low on the screen, in the thumb's reach, that shows what to do
// with pictures rather than words. A ghost thumb demonstrates the move; the card goes green when it's done.
//
//   hold   press and keep the thumb down until the ring fills (lifting early starts it again)
//   taps   tap each target (clips, clamps, the collet), in any order
//   drag   drag the handle along the track, all the way (letting go short snaps it back)
//   sign   scribble a signature across the docket
//   pick   tap the right one of a few (the bit for the sheet on the bed)
//
// A fumble (beer) spoils a finished gesture: the card shakes and it has to be done again.

export type GestureSpec =
  | { kind: 'hold'; icon: string; seconds: number }
  | { kind: 'taps'; icon: string; n: number }
  | { kind: 'drag'; icon: string; dir: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'sign'; icon: string }
  | { kind: 'pick'; icon: string; options: { colour: string; mark: string }[]; match?: string }; // match: a swatch of what to match

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .gesture { position: absolute; left: 50%; bottom: ${F(96)}; transform: translateX(-50%); width: ${F(320)}; pointer-events: auto;
  background: #efe6d8; border: 3px solid #14110f; border-radius: 14px; box-shadow: 0 6px 0 rgba(20,17,15,.35); padding: ${F(10)};
  touch-action: none; user-select: none; -webkit-user-select: none; z-index: 6; }
#kir-hud .gesture .top { display: flex; align-items: center; justify-content: space-between; height: ${F(34)}; }
#kir-hud .gesture .icon { font-size: ${F(30)}; line-height: 1; display: flex; align-items: center; gap: ${F(6)}; }
#kir-hud .gesture .match { display: inline-block; width: ${F(44)}; height: ${F(30)}; border: 3px solid #14110f; border-radius: 4px; }
#kir-hud .gesture .x { pointer-events: auto; font: 700 ${F(22)} sans-serif; width: ${F(36)}; height: ${F(36)}; border-radius: 50%;
  border: 2px solid #14110f; background: #d9cdb8; color: #14110f; }
#kir-hud .gesture .area { position: relative; height: ${F(150)}; margin-top: ${F(6)}; }
#kir-hud .gesture.ok { background: #bfe6a8; }
#kir-hud .gesture.fumble { animation: kir-g-shake .45s; background: #f3b6a6; }
@keyframes kir-g-shake { 0%,100% { transform: translateX(-50%); } 20% { transform: translateX(calc(-50% - 10px)); } 40% { transform: translateX(calc(-50% + 10px)); }
  60% { transform: translateX(calc(-50% - 6px)); } 80% { transform: translateX(calc(-50% + 6px)); } }
#kir-hud .gesture .ring { position: absolute; left: 50%; top: 50%; width: ${F(118)}; height: ${F(118)}; transform: translate(-50%,-50%);
  border-radius: 50%; background: conic-gradient(#3f9a4a calc(var(--p, 0) * 1turn), #d9cdb8 0); display: grid; place-items: center; }
#kir-hud .gesture .ring::after { content: ''; width: ${F(84)}; height: ${F(84)}; border-radius: 50%; background: #f2c76b; border: 3px solid #14110f; }
#kir-hud .gesture .gt { position: absolute; width: ${F(56)}; height: ${F(56)}; transform: translate(-50%,-50%); border-radius: 50%;
  background: #f2c76b; border: 3px solid #14110f; animation: kir-g-pulse 1s ease-in-out infinite; }
#kir-hud .gesture .gt.done { background: #3f9a4a; animation: none; }
@keyframes kir-g-pulse { 50% { box-shadow: 0 0 0 8px rgba(242,199,107,.45); } }
#kir-hud .gesture .track { position: absolute; background: #d9cdb8; border: 2px dashed #8a7a62; border-radius: 30px; }
#kir-hud .gesture .handle { position: absolute; width: ${F(60)}; height: ${F(60)}; transform: translate(-50%,-50%); border-radius: 50%;
  background: #f2c76b; border: 3px solid #14110f; display: grid; place-items: center; font-size: ${F(26)}; }
#kir-hud .gesture .goal { position: absolute; width: ${F(60)}; height: ${F(60)}; transform: translate(-50%,-50%); border-radius: 50%;
  border: 3px dashed #3f9a4a; }
#kir-hud .gesture .docket { position: absolute; inset: ${F(4)} ${F(8)}; background: #fffdf6; border: 2px solid #14110f; border-radius: 6px; }
#kir-hud .gesture .docket::after { content: '✕'; position: absolute; left: 8%; bottom: 22%; font: ${F(20)} serif; color: #8a7a62; }
#kir-hud .gesture .docket .line { position: absolute; left: 6%; right: 6%; bottom: 22%; border-bottom: 2px solid #8a7a62; }
#kir-hud .gesture canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#kir-hud .gesture .opts { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-around; }
#kir-hud .gesture .opt { width: ${F(76)}; height: ${F(112)}; border: 3px solid #14110f; border-radius: 10px; display: grid; place-items: center;
  font-size: ${F(30)}; box-shadow: 0 4px 0 rgba(20,17,15,.3); }
#kir-hud .gesture .ghost { position: absolute; width: ${F(34)}; height: ${F(34)}; border-radius: 50%; background: rgba(20,17,15,.28);
  border: 2px solid rgba(255,255,255,.7); transform: translate(-50%,-50%); pointer-events: none; }
`;

type Done = (choice?: number) => void;

export class GesturePad {
  private el: HTMLDivElement | null = null;
  private spec: GestureSpec | null = null;
  private onDone: Done | null = null;
  private fumble: () => boolean = () => false;
  private raf = 0;
  /** Set while the thumb's down on a hold (the view keeps time for it). */
  private holdStart: number | null = null;
  private reset: () => void = () => {};

  constructor(private parent: HTMLElement) {
    if (!document.getElementById('kir-gesture-css')) {
      const s = document.createElement('style'); s.id = 'kir-gesture-css'; s.textContent = CSS; document.head.appendChild(s);
    }
  }

  /** What's open now (null: nothing). */
  get active(): GestureSpec | null { return this.spec; }

  /** Open a gesture. `done` runs once it's finished cleanly; `fumble` is asked each time it's finished. */
  open(spec: GestureSpec, done: Done, fumble: () => boolean, cancel?: () => void) {
    this.close();
    this.spec = spec; this.onDone = done; this.fumble = fumble;
    const el = this.el = document.createElement('div');
    el.className = 'gesture';
    el.dataset.kind = spec.kind;
    const top = document.createElement('div'); top.className = 'top';
    const icon = document.createElement('div'); icon.className = 'icon'; icon.textContent = spec.icon;
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
    x.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.close(); cancel?.(); });
    if (spec.kind === 'pick' && spec.match) {
      const sw = document.createElement('span'); sw.className = 'match'; sw.style.background = spec.match;
      icon.append(' = ', sw);
    }
    top.append(icon, x);
    const area = document.createElement('div'); area.className = 'area';
    el.append(top, area);
    // keep the thumb's touches off the world underneath (no walking while you work)
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'click'] as const) el.addEventListener(t, e => e.stopPropagation());
    this.parent.appendChild(el);
    this.build(spec, area);
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.el?.remove();
    this.el = null; this.spec = null; this.onDone = null; this.holdStart = null;
  }

  /** For tests and desktop keys: finish it as if done by hand (a fumble still spoils it). */
  finish(choice?: number) { if (this.spec) this.complete(choice); }

  private complete(choice?: number) {
    const el = this.el;
    if (!el) return;
    if (this.fumble()) {
      // spoiled: shake, then start again
      el.classList.remove('fumble'); void el.offsetWidth; el.classList.add('fumble');
      this.reset();
      return;
    }
    el.classList.add('ok');
    const done = this.onDone;
    this.close();
    done?.(choice);
  }

  // ---------- each kind ----------

  private build(spec: GestureSpec, area: HTMLDivElement) {
    const ghost = document.createElement('div'); ghost.className = 'ghost';
    switch (spec.kind) {
      case 'hold': {
        const ring = document.createElement('div'); ring.className = 'ring'; ring.dataset.g = 'hold';
        area.append(ring, ghost);
        ghost.style.left = '50%'; ghost.style.top = '50%';
        const t0 = performance.now();
        const tick = (now: number) => {
          const held = this.holdStart !== null ? (now - this.holdStart) / 1000 : 0;
          const p = Math.min(1, held / spec.seconds);
          ring.style.setProperty('--p', String(p));
          ghost.style.opacity = this.holdStart === null ? String(0.4 + 0.4 * Math.abs(Math.sin((now - t0) / 400))) : '0';
          if (p >= 1) { this.holdStart = null; this.complete(); if (!this.el) return; }
          this.raf = requestAnimationFrame(tick);
        };
        this.reset = () => { this.holdStart = null; ring.style.setProperty('--p', '0'); };
        ring.addEventListener('pointerdown', e => { e.preventDefault(); ring.setPointerCapture?.(e.pointerId); this.holdStart = performance.now(); });
        const lift = () => { this.holdStart = null; }; // early: the ring empties
        ring.addEventListener('pointerup', lift); ring.addEventListener('pointercancel', lift);
        this.raf = requestAnimationFrame(tick);
        break;
      }
      case 'taps': {
        const spots = Array.from({ length: spec.n }, (_, i) => {
          const b = document.createElement('div'); b.className = 'gt'; b.dataset.g = 'tap';
          b.style.left = `${(100 * (i + 1)) / (spec.n + 1)}%`; b.style.top = `${spec.n > 2 && i % 2 ? 65 : 40}%`;
          b.addEventListener('pointerdown', e => {
            e.preventDefault();
            b.classList.add('done');
            if (spots.every(s => s.classList.contains('done'))) this.complete();
          });
          area.appendChild(b);
          return b;
        });
        this.reset = () => spots.forEach(s => s.classList.remove('done'));
        area.appendChild(ghost);
        const first = spots[0];
        ghost.style.left = first.style.left; ghost.style.top = first.style.top;
        const tick = (now: number) => { // the ghost hops to the next untapped one
          const next = spots.find(s => !s.classList.contains('done'));
          if (next) { ghost.style.left = next.style.left; ghost.style.top = next.style.top; ghost.style.opacity = String(0.3 + 0.5 * Math.abs(Math.sin(now / 300))); }
          this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
        break;
      }
      case 'drag': {
        const horiz = spec.dir === 'left' || spec.dir === 'right';
        const sign = spec.dir === 'right' || spec.dir === 'down' ? 1 : -1;
        const track = document.createElement('div'); track.className = 'track';
        const handle = document.createElement('div'); handle.className = 'handle'; handle.dataset.g = 'drag';
        handle.textContent = { up: '⬆', down: '⬇', left: '⬅', right: '➡' }[spec.dir];
        const goal = document.createElement('div'); goal.className = 'goal';
        // the track runs 15%..85% along its axis
        const at = (k: number) => `${15 + 70 * (sign > 0 ? k : 1 - k)}%`;
        if (horiz) Object.assign(track.style, { left: '8%', right: '8%', top: '30%', bottom: '30%' });
        else Object.assign(track.style, { left: '38%', right: '38%', top: '2%', bottom: '2%' });
        const place = (e: HTMLElement, k: number) => { if (horiz) { e.style.left = at(k); e.style.top = '50%'; } else { e.style.top = at(k); e.style.left = '50%'; } };
        place(goal, 1); place(handle, 0); place(ghost, 0);
        area.append(track, goal, ghost, handle);
        let k = 0, down: { x: number; y: number; k: number } | null = null;
        this.reset = () => { k = 0; place(handle, 0); };
        const span = () => (horiz ? area.clientWidth : area.clientHeight) * 0.7;
        handle.addEventListener('pointerdown', e => { e.preventDefault(); handle.setPointerCapture?.(e.pointerId); down = { x: e.clientX, y: e.clientY, k }; });
        handle.addEventListener('pointermove', e => {
          if (!down) return;
          const d = (horiz ? e.clientX - down.x : e.clientY - down.y) * sign;
          k = Math.max(0, Math.min(1, down.k + d / span()));
          place(handle, k);
          if (k >= 0.92) { down = null; this.complete(); }
        });
        const lift = () => { if (down) { down = null; k = 0; place(handle, 0); } }; // short: back it goes
        handle.addEventListener('pointerup', lift); handle.addEventListener('pointercancel', lift);
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = ((now - t0) / 1200) % 1;
          place(ghost, p); ghost.style.opacity = down ? '0' : String(0.6 * (1 - p));
          this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
        break;
      }
      case 'sign': {
        const docket = document.createElement('div'); docket.className = 'docket'; docket.dataset.g = 'sign';
        const line = document.createElement('div'); line.className = 'line'; docket.appendChild(line);
        const cv = document.createElement('canvas'); docket.appendChild(cv);
        area.append(docket, ghost);
        const ctx = cv.getContext('2d')!;
        let last: { x: number; y: number } | null = null, ink = 0, minX = Infinity, maxX = -Infinity, turns = 0, dir = 0;
        this.reset = () => { ctx.clearRect(0, 0, cv.width, cv.height); ink = 0; minX = Infinity; maxX = -Infinity; turns = 0; dir = 0; };
        const pt = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; };
        docket.addEventListener('pointerdown', e => {
          e.preventDefault(); docket.setPointerCapture?.(e.pointerId);
          const r = cv.getBoundingClientRect(); cv.width = r.width; cv.height = r.height;
          ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#1d3a8a';
          last = pt(e);
        });
        docket.addEventListener('pointermove', e => {
          if (!last) return;
          const p = pt(e);
          ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          const dx = p.x - last.x;
          ink += Math.hypot(dx, p.y - last.y); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          if (Math.abs(dx) > 2) { const d = Math.sign(dx); if (dir && d !== dir) turns++; dir = d; }
          last = p;
          // a squiggle: across most of the line and back a couple of times
          if (ink > p.w * 1.3 && maxX - minX > p.w * 0.45 && turns >= 2) { last = null; this.complete(); }
        });
        const lift = () => { last = null; };
        docket.addEventListener('pointerup', lift); docket.addEventListener('pointercancel', lift);
        const t0 = performance.now();
        const tick = (now: number) => { // the ghost scribbles along the line
          const p = ((now - t0) / 1600) % 1;
          ghost.style.left = `${20 + 60 * p}%`; ghost.style.top = `${55 + 12 * Math.sin(p * Math.PI * 6)}%`;
          ghost.style.opacity = last || ink > 0 ? '0' : '0.6';
          this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
        break;
      }
      case 'pick': {
        const row = document.createElement('div'); row.className = 'opts';
        spec.options.forEach((o, i) => {
          const b = document.createElement('div'); b.className = 'opt'; b.dataset.g = 'pick'; b.dataset.i = String(i);
          b.style.background = o.colour; b.textContent = o.mark;
          b.addEventListener('pointerdown', e => { e.preventDefault(); this.complete(i); });
          row.appendChild(b);
        });
        area.appendChild(row);
        this.reset = () => {};
        break;
      }
    }
  }
}
