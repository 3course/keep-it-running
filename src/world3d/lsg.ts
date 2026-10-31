// The rare late one, shown. Hold on the two-shot a beat; a colour burst ripples out from the crates; over ~3 s the whole
// toon palette swings saturated and starts cycling hue, the fridge light goes rainbow, the sky through the roller door
// stops being a normal sky (and on the tiers that can afford it, the picture goes soft and over-saturated). Then a
// minute of tapping: every tap blooms colour where it lands and someone laughs (their own laugh); tap near someone and
// they giggle and wobble; tap in quick runs and the day's pieces float past, glowing. No score, no fail. Then it all
// drains back to the fridge-lit two-shot, and the night director takes it from there.
import * as THREE from 'three';
import { designById } from '../designs/index.js';
import { flatDesign } from '../designs/path.js';
import type { Design } from '../designs/types.js';
import { LAUGHS, LSG_LINES } from '../people/dialogue/lsg.js';
import type { FriendId } from '../people/dialogue/types.js';
import { friendById } from '../people/friends.js';
import { slur } from '../people/slur.js';
import type { Talk } from '../ui/talk.js';
import type { Figure } from './figures.js';
import type { Sfx } from './sfx.js';

/** Seconds. */
export const LSG_TIMES = { hold: 1.2, burst: 3, play: 60, drain: 3, pause: 2.5 } as const;

const CSS = `
#kir-hud .lsg-layer { position: absolute; inset: 0; z-index: 5; overflow: hidden; pointer-events: auto; touch-action: none; }
#kir-hud .lsg-ring { position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; pointer-events: none;
  border: 10px solid hsl(300 100% 65%); box-shadow: 0 0 30px hsl(180 100% 60%), inset 0 0 30px hsl(60 100% 60%); animation: lsg-ring 2.4s ease-out forwards; }
@keyframes lsg-ring { to { transform: scale(40); opacity: 0; border-width: 2px; } }
#kir-hud .lsg-bloom { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; pointer-events: none; mix-blend-mode: screen;
  animation: lsg-bloom 1.3s ease-out forwards; }
@keyframes lsg-bloom { from { transform: scale(.1); opacity: 1; } to { transform: scale(1.8); opacity: 0; } }
#kir-hud .lsg-shape { position: absolute; pointer-events: none; animation: lsg-drift 7s linear forwards; }
@keyframes lsg-drift { from { transform: translate(var(--x0), var(--y0)) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; }
  to { transform: translate(var(--x1), var(--y1)) rotate(var(--r)); opacity: 0; } }
`;

export interface LsgDeps {
  scene: THREE.Scene;
  canvas: HTMLCanvasElement;
  parent: HTMLElement;
  talk: Talk;
  sfx: Sfx;
  rich: boolean;                  // post-processing (soft, saturated) on the tiers that have it
  fridgeLight: THREE.PointLight | null;
  figures: Map<string, Figure>;
  project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean };
  /** Today's pieces (design ids), to float past. */
  designs: () => string[];
}

type Phase = 'hold' | 'burst' | 'play' | 'drain' | 'pause' | 'off';

export class LsgVignette {
  phase: Phase = 'off';
  /** Tests: run faster. */
  timeScale = 1;
  taps = 0;
  shapes = 0;
  private t = 0;
  private amount = 0;               // 0 normal … 1 full colour
  private mats = new Map<THREE.Material & { color: THREE.Color }, { h: number; s: number; l: number; c: THREE.Color }>();
  private sky: { c: THREE.Color; orig: THREE.Color } | null = null;
  private fridgeColour = new THREE.Color();
  private layer: HTMLDivElement | null = null;
  private combo = { n: 0, last: 0 };
  private nextLine = 3;
  private wobble = new Map<string, number>();
  private done: (() => void) | null = null;

  constructor(private d: LsgDeps) {
    if (!document.getElementById('kir-lsg-css')) { const s = document.createElement('style'); s.id = 'kir-lsg-css'; s.textContent = CSS; document.head.appendChild(s); }
  }

  get active() { return this.phase !== 'off'; }

  start(done: () => void) {
    this.done = done;
    this.t = 0; this.taps = 0; this.shapes = 0; this.amount = 0; this.nextLine = 3;
    this.phase = 'hold';
    // remember every colour so it can all come back exactly
    this.mats.clear();
    this.d.scene.traverse(o => {
      const m = (o as THREE.Mesh).material as (THREE.Material & { color?: THREE.Color }) | (THREE.Material & { color?: THREE.Color })[] | undefined;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) if (x.color && !this.mats.has(x as never)) {
        const hsl = { h: 0, s: 0, l: 0 }; x.color.getHSL(hsl);
        this.mats.set(x as never, { ...hsl, c: x.color.clone() });
      }
    });
    const bg = this.d.scene.background;
    this.sky = bg instanceof THREE.Color ? { c: bg, orig: bg.clone() } : null;
    if (this.d.fridgeLight) this.fridgeColour.copy(this.d.fridgeLight.color);
  }

  update(dt: number) {
    if (this.phase === 'off') return;
    dt *= this.timeScale;
    this.t += dt;
    const T = LSG_TIMES;
    switch (this.phase) {
      case 'hold': if (this.t >= T.hold) { this.phase = 'burst'; this.t = 0; this.ripple(); this.d.sfx.cheer(); } break;
      case 'burst': this.amount = Math.min(1, this.t / T.burst); if (this.t >= T.burst) { this.phase = 'play'; this.t = 0; this.openLayer(); } break;
      case 'play':
        this.nextLine -= dt;
        if (this.nextLine <= 0) { this.say(this.someone(), LSG_LINES[Math.floor(Math.random() * LSG_LINES.length)]); this.nextLine = 5 + Math.random() * 3; }
        if (this.t >= T.play) { this.phase = 'drain'; this.t = 0; this.closeLayer(); }
        break;
      case 'drain': this.amount = Math.max(0, 1 - this.t / T.drain); if (this.t >= T.drain) { this.phase = 'pause'; this.t = 0; this.restore(); } break;
      case 'pause': if (this.t >= T.pause) { this.phase = 'off'; const f = this.done; this.done = null; f?.(); } break;
    }
    if (this.amount > 0) this.paint(this.t + (this.phase === 'play' ? T.burst : 0));
    // wobbles from taps
    for (const [id, w] of this.wobble) {
      const f = this.d.figures.get(id); const left = w - dt;
      if (f) f.root.rotation.z = left > 0 ? Math.sin(left * 22) * 0.18 * left : 0;
      if (left <= 0) this.wobble.delete(id); else this.wobble.set(id, left);
    }
  }

  /** Swing every colour toward saturated, cycling hues; the sky and the fridge light go with it. */
  private paint(time: number) {
    const a = this.amount, tmp = new THREE.Color();
    let i = 0;
    for (const [m, o] of this.mats) {
      tmp.setHSL((o.h + time * 0.12 + (i++ % 7) * 0.09) % 1, 0.95, THREE.MathUtils.clamp(o.l, 0.45, 0.62));
      m.color.copy(o.c).lerp(tmp, a);
    }
    if (this.sky) this.sky.c.copy(this.sky.orig).lerp(tmp.setHSL((time * 0.2) % 1, 0.8, 0.45 + 0.1 * Math.sin(time * 1.7)), a);
    if (this.d.fridgeLight) this.d.fridgeLight.color.copy(this.fridgeColour).lerp(tmp.setHSL((time * 0.5) % 1, 1, 0.6), a);
    // the picture itself: soft and over-saturated (post), only where the tier can take it
    this.d.canvas.style.filter = this.d.rich && a > 0 ? `saturate(${1 + a * 0.9}) blur(${(a * 0.7).toFixed(2)}px) hue-rotate(${Math.round(Math.sin(time * 0.7) * 25 * a)}deg)` : '';
  }

  private restore() {
    for (const [m, o] of this.mats) m.color.copy(o.c);
    if (this.sky) this.sky.c.copy(this.sky.orig);
    if (this.d.fridgeLight) this.d.fridgeLight.color.copy(this.fridgeColour);
    this.d.canvas.style.filter = '';
    for (const f of this.d.figures.values()) f.root.rotation.z = 0;
    this.amount = 0;
  }

  // ---------- the tap game ----------

  private openLayer() {
    const l = this.layer = document.createElement('div');
    l.className = 'lsg-layer';
    l.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.tap(e.clientX, e.clientY); });
    this.d.parent.appendChild(l);
  }
  private closeLayer() { this.layer?.remove(); this.layer = null; }

  /** A tap at (x, y): a bloom, a laugh, a giggle if it's near someone, and a run of them sets pieces drifting. */
  tap(x: number, y: number) {
    if (this.phase !== 'play' || !this.layer) return;
    this.taps++;
    const b = document.createElement('div');
    b.className = 'lsg-bloom';
    const h = Math.floor(Math.random() * 360);
    b.style.cssText = `left:${x}px;top:${y}px;background:radial-gradient(circle, hsl(${h} 100% 70%) 0%, hsl(${(h + 60) % 360} 100% 60% / .6) 40%, transparent 70%)`;
    this.layer.appendChild(b);
    window.setTimeout(() => b.remove(), 1400);
    // who laughs: whoever's nearest the tap (they wobble too), else anyone
    let near: string | null = null, best = 90;
    for (const [id, f] of this.d.figures) {
      const p = this.d.project(f.headWorld(new THREE.Vector3()));
      const dist = Math.hypot(p.x - x, p.y - y + 40);
      if (dist < best) { best = dist; near = id; }
    }
    const who = near ?? this.someone();
    if (near) { this.wobble.set(near, 0.9); this.d.figures.get(near)?.setExpr('laughing'); }
    const laughs = LAUGHS[who as FriendId | 'you'] ?? LAUGHS.you;
    this.say(who, laughs[Math.floor(Math.random() * laughs.length)], false);
    this.d.sfx.laugh(who);
    // combos: quick runs of taps send the day's pieces floating past
    const now = performance.now();
    this.combo.n = now - this.combo.last < 600 ? this.combo.n + 1 : 1;
    this.combo.last = now;
    if (this.combo.n % 4 === 0) this.float();
  }

  private float() {
    const ids = this.d.designs();
    const pool = ids.length ? ids : ['mila-cloud', 'dachshund-hook', 'spoke-wheel', 'rocket-bookcase'];
    const d: Design | undefined = designById(pool[this.shapes % pool.length]);
    if (!d || !this.layer) return;
    this.shapes++;
    const f = flatDesign(d), s = 110 / Math.max(d.sheet.w, d.sheet.h);
    const path = f.outer.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * s).toFixed(1)} ${(p[1] * s).toFixed(1)}`).join('') + 'Z';
    const hue = Math.floor(Math.random() * 360);
    const el = document.createElement('div');
    el.className = 'lsg-shape';
    const W = this.layer.clientWidth, H = this.layer.clientHeight, fromLeft = Math.random() < 0.5;
    el.style.cssText = `left:0;top:0;--x0:${fromLeft ? -130 : W + 20}px;--y0:${Math.random() * H * 0.7}px;--x1:${fromLeft ? W + 20 : -130}px;--y1:${Math.random() * H * 0.7}px;--r:${Math.random() < 0.5 ? -200 : 200}deg;`
      + `filter:drop-shadow(0 0 8px hsl(${hue} 100% 65%)) drop-shadow(0 0 16px hsl(${(hue + 90) % 360} 100% 60%))`;
    el.innerHTML = `<svg width="${Math.ceil(d.sheet.w * s)}" height="${Math.ceil(d.sheet.h * s)}"><path d="${path}" fill="hsl(${hue} 100% 70% / .55)" stroke="hsl(${(hue + 40) % 360} 100% 85%)" stroke-width="3"/></svg>`;
    el.dataset.design = d.id;
    this.layer.appendChild(el);
    window.setTimeout(() => el.remove(), 7200);
  }

  private ripple() {
    const ids = [...this.d.figures.keys()];
    const at = ids.map(id => this.d.project(this.d.figures.get(id)!.headWorld(new THREE.Vector3())));
    const x = at.reduce((s, p) => s + p.x, 0) / (at.length || 1), y = at.reduce((s, p) => s + p.y, 0) / (at.length || 1) + 60;
    for (let i = 0; i < 3; i++) window.setTimeout(() => {
      const r = document.createElement('div'); r.className = 'lsg-ring';
      r.style.left = `${x}px`; r.style.top = `${y}px`; r.style.borderColor = `hsl(${i * 120 + 300} 100% 65%)`;
      this.d.parent.appendChild(r); window.setTimeout(() => r.remove(), 2500);
    }, i * 380);
  }

  private someone(): string { const ids = [...this.d.figures.keys()]; return ids[Math.floor(Math.random() * ids.length)]; }

  private say(who: string, text: string, slurIt = true) {
    const name = who === 'you' ? 'You' : friendById(who as FriendId).name;
    this.d.talk.say(who, name, slurIt ? slur(text, 99, `${this.t}|${text}`) : text, who === 'you' ? 'you' : '');
    const f = this.d.figures.get(who);
    if (f) { f.talking = 1; f.setExpr(Math.random() < 0.6 ? 'laughing' : 'animated'); }
  }

  /** Stop now (a lost context, the page going away). */
  abort() { this.closeLayer(); this.restore(); this.phase = 'off'; this.done = null; }
}
