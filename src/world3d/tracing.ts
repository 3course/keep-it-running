// After-hours cutting, inside knock-off beers. A mate's idea ("a sign for the dunny door") and everyone wanders over to
// the router. Grab an offcut (free) or a full sheet (off the pallet: it goes in the summary under "After hours"). A
// faint guide of the idea appears on the sheet and you trace it with a finger — lift off whenever, put it back down and
// the line carries on from the nearest point. The beers put a wobble in your hand (the same curve as the slur), the
// mates comment as you go, and what you drew — not the guide — is what the router cuts. Then the reveal, and the piece
// goes up somewhere in the shed for good.
import * as THREE from 'three';
import type { Game } from '../sim/Game.js';
import { CONFIG, type JobTypeId } from '../config.js';
import { designById } from '../designs/index.js';
import { flatDesign, bounds, type Pt } from '../designs/path.js';
import type { Design, DesignKind } from '../designs/types.js';
import { SCRIPTS } from '../people/dialogue/index.js';
import type { FriendId } from '../people/dialogue/types.js';
import { friendById } from '../people/friends.js';
import { slurStrength } from '../people/slur.js';
import { people, type Keepsake } from '../people/state.js';
import type { WorldState } from '../world/state.js';
import type { Talk } from '../ui/talk.js';
import type { CutPathView } from './cutPath.js';
import type { Reveal } from './reveal.js';
import { toLocal } from './piece.js';

const JOB_FOR: Record<DesignKind, JobTypeId> = { formwork: 'formwork', mdf: 'joinery', acrylic: 'signage' };
/** What a freehand drawing is on: MDF, the cheap one. */
const FREEHAND: Design = {
  id: 'freehand', name: 'Whatever you wanted', kind: 'mdf', customer: 'You', material: '18mm MDF', thickness: 18, colour: '#d9c39a',
  sheet: { w: 600, h: 600 }, outer: 'M100 100 L500 100 L500 500 L100 500 Z', inner: [], note: '', afterHours: true,
};

export interface TracingDeps {
  g: Game;
  w: WorldState;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  /** The sheet on the machine's bed (its parent is the machine group) and its size (m). */
  sheet: THREE.Mesh;
  bed: { w: number; d: number; top: number };
  cutView: CutPathView;
  reveal: Reveal;
  talk: Talk;
  /** Stand everyone round the router (or back on the crates). */
  gather: (atRouter: boolean) => void;
  sayAs: (who: FriendId, text: string) => void;
  save: () => void;
  /** Hands the piece's gallery thumbnail (or null). */
  thumb: (d: Design) => string | null;
}

type Mode = 'off' | 'choose' | 'trace' | 'cut' | 'reveal';

export class Tracing {
  mode: Mode = 'off';
  design: Design | null = null;   // the guide (or the freehand blank)
  by: FriendId = 'eggby';
  beers = 1;
  sheetKind: 'offcut' | 'sheet' = 'offcut';
  /** Your strokes, in the design's mm. */
  strokes: Pt[][] = [];
  accuracy = 0;
  private done: ((accuracy: number) => void) | null = null;
  private scale = 0.001;
  private guide: THREE.Mesh | null = null;
  private ink: THREE.Mesh | null = null;
  private inkDirty = false;
  private down: number | null = null;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private t = 0;
  private cutT = 0;
  private cut: Design | null = null;
  private lastComment = 0;
  private sinceCheck = 0;
  private wob = 0;
  private offcut: THREE.Mesh | null = null;
  private camPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private weight = 0;

  constructor(private d: TracingDeps) {}

  get active() { return this.mode !== 'off'; }
  /** The board on the bed: the whole sheet shows only for a full sheet (an offcut is its own little piece). */
  get showSheet() { return this.mode !== 'off' && this.mode !== 'choose' && this.sheetKind === 'sheet'; }
  get sheetType(): JobTypeId { return JOB_FOR[this.design?.kind ?? 'mdf']; }
  get cutting() { return this.mode === 'cut'; }

  /** Start: `design` is an after-hours design id or 'freehand'. */
  start(design: string, by: FriendId, beers: number, done: (accuracy: number) => void) {
    this.design = design === 'freehand' ? FREEHAND : designById(design) ?? FREEHAND;
    this.by = by; this.beers = beers; this.done = done;
    this.strokes = []; this.accuracy = 0; this.cut = null; this.t = 0;
    this.d.gather(true);
    this.mode = 'choose';
    const type = JOB_FOR[this.design.kind];
    const g = this.d.g, t = CONFIG.jobs.types.find(x => x.id === type)!;
    const opts = [{ text: 'Grab an offcut (free)' }];
    const unit = g.stock[type] > 0 ? Math.round(g.stockValue[type] / g.stock[type]) : 0;
    if (g.stock[type] > 0) opts.push({ text: `A full sheet of ${t.material} ($${unit})` });
    this.d.talk.ask(opts, i => this.begin(i === 1 ? 'sheet' : 'offcut'));
  }

  private begin(kind: 'offcut' | 'sheet') {
    const d = this.design!, g = this.d.g;
    this.sheetKind = kind;
    if (kind === 'sheet' && !g.afterHoursSheet(JOB_FOR[d.kind])) this.sheetKind = 'offcut';
    // framed so the design fits the screen; an offcut is a rough piece just big enough, on the bed
    this.scale = Math.min(1.0 / d.sheet.w, 1.25 / d.sheet.h);
    if (this.sheetKind === 'offcut') {
      const w = d.sheet.w * this.scale + 0.12, h = d.sheet.h * this.scale + 0.1;
      this.offcut = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, h), (this.d.sheet.material as THREE.Material));
      this.offcut.position.set(0.04, this.d.sheet.position.y + 0.001, -0.03); this.offcut.rotation.y = 0.04;
      this.d.sheet.parent!.add(this.offcut);
    }
    this.plane.constant = -this.worldTop();
    const cv = this.d.cutView.group;
    this.d.sheet.parent!.add(cv); cv.position.y = this.surface() + 0.003;
    this.buildGuide();
    this.frame();
    this.mode = 'trace';
    this.d.sayAs(this.by, this.pick(SCRIPTS[this.by].trace.start));
    this.askDone();
  }

  private askDone() {
    this.d.talk.ask([{ text: 'Cut it' }, { text: 'Start again' }], i => {
      if (i === 1) { this.strokes = []; this.inkDirty = true; this.askDone(); return; }
      this.finishTrace();
    });
  }

  // ---------- input (the view routes canvas pointer events here while active) ----------

  pointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
    if (this.mode !== 'trace') return;
    if (kind === 'down') {
      const p = this.toDesign(e.clientX, e.clientY);
      if (!p) return;
      this.down = e.pointerId;
      // put it back down and the line carries on from the nearest point already drawn
      const near = this.nearestOnTrace(p);
      this.strokes.push(near ? [near, this.wobble(p)] : [this.wobble(p)]);
      this.inkDirty = true;
    } else if (kind === 'move' && this.down === e.pointerId) {
      const p = this.toDesign(e.clientX, e.clientY);
      const s = this.strokes[this.strokes.length - 1];
      if (!p || !s) return;
      const last = s[s.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < this.design!.sheet.w / 120) return;
      s.push(this.wobble(p));
      this.inkDirty = true;
    } else if (kind === 'up' && this.down === e.pointerId) this.down = null;
  }

  /** Beers put a wobble in it: a slow drift and a little shake, scaled like the slur. */
  private wobble(p: Pt): Pt {
    const k = slurStrength(this.beers) / 0.32, size = Math.max(this.design!.sheet.w, this.design!.sheet.h);
    if (k <= 0) return p;
    this.wob += 0.35;
    const a = size * 0.03 * k;
    return [p[0] + Math.sin(this.wob * 1.3) * a + (Math.random() - 0.5) * a * 0.5, p[1] + Math.cos(this.wob * 0.9) * a + (Math.random() - 0.5) * a * 0.5];
  }

  private nearestOnTrace(p: Pt): Pt | null {
    let best: Pt | null = null, bd = Infinity;
    for (const s of this.strokes) for (const q of s) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = q; } }
    return best;
  }

  /** Screen → the design's mm on the sheet (null: not on the bed). */
  private toDesign(cx: number, cy: number): Pt | null {
    const r = this.d.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1)), this.d.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    const local = this.d.sheet.parent!.worldToLocal(hit.clone());
    const d = this.design!;
    return [local.x / this.scale + d.sheet.w / 2, local.z / this.scale + d.sheet.h / 2];
  }

  /** The sheet's top face, in the machine group's frame. */
  private surface() { return this.d.sheet.position.y + this.d.bed.top; }

  private worldTop() {
    const v = new THREE.Vector3(0, this.d.bed.top, 0);
    return this.d.sheet.localToWorld(v).y + 0.004;
  }

  // ---------- drawing ----------

  /** The guide: the idea's outline (and inner lines), faint on the sheet. Freehand: none. */
  private buildGuide() {
    this.clearMeshes();
    const d = this.design!;
    if (d.id === 'freehand') return;
    const f = flatDesign(d), tl = toLocal(d, this.scale);
    const polys = [{ pts: f.outer, closed: true }, ...f.cuts, ...f.engraves];
    this.guide = ribbons(polys.map(p => ({ pts: (p.closed ? [...p.pts, p.pts[0]] : p.pts).map(tl), w: 0.012 })), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false }));
    this.guide.position.y = this.surface() + 0.002;
    this.d.sheet.parent!.add(this.guide);
  }

  private rebuildInk() {
    if (this.ink) { this.ink.parent?.remove(this.ink); this.ink.geometry.dispose(); }
    this.ink = null;
    const d = this.design!, tl = toLocal(d, this.scale);
    const live = this.strokes.filter(s => s.length > 1);
    if (!live.length) return;
    this.ink = ribbons(live.map(s => ({ pts: s.map(tl), w: 0.016 })), new THREE.MeshBasicMaterial({ color: 0xe8541e }));
    this.ink.position.y = this.surface() + 0.004;
    this.d.sheet.parent!.add(this.ink);
  }

  private clearMeshes() {
    for (const m of [this.guide, this.ink]) if (m) { m.parent?.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.guide = null; this.ink = null;
  }

  // ---------- scoring and cutting ----------

  /** How close the trace is to the guide: coverage of the guide and how far off the line wanders, 0..1. */
  score(): number {
    const d = this.design!;
    const pts = this.strokes.flat();
    if (d.id === 'freehand') return pts.length > 2 ? 1 : 0;
    if (pts.length < 2) return 0;
    const f = flatDesign(d), size = Math.max(d.sheet.w, d.sheet.h), tol = size * 0.05;
    const guide = sample([f.outer, ...f.cuts.map(c => c.pts)], size / 80);
    const dist = (p: Pt, set: Pt[]) => set.reduce((m, q) => Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity);
    const covered = guide.filter(q => dist(q, pts) < tol).length / guide.length;
    const off = pts.reduce((s, p) => s + Math.min(1, dist(p, guide) / (tol * 3)), 0) / pts.length;
    return Math.max(0, Math.min(1, covered * 0.65 + (1 - off) * 0.35));
  }

  /** The recent stretch of line, against the guide: a comment if it's well off or spot on. */
  private comment() {
    const d = this.design!, s = this.strokes[this.strokes.length - 1];
    if (!s || s.length < 6 || d.id === 'freehand' || this.t - this.lastComment < 3.2) return;
    const f = flatDesign(d), size = Math.max(d.sheet.w, d.sheet.h);
    const guide = sample([f.outer, ...f.cuts.map(c => c.pts)], size / 80);
    const recent = s.slice(-8);
    const off = recent.reduce((m, p) => m + guide.reduce((a, q) => Math.min(a, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity), 0) / recent.length / size;
    const tr = SCRIPTS[this.by].trace;
    if (off > 0.06) { this.d.sayAs(this.by, this.pick(tr.wobbly)); this.lastComment = this.t; }
    else if (off < 0.02) { this.d.sayAs(this.by, this.pick(tr.good)); this.lastComment = this.t; }
  }

  private finishTrace() {
    this.accuracy = this.score();
    this.cut = this.traced();
    this.d.talk.hideReplies();
    this.d.cutView.set(this.cut, this.scale);
    this.cutT = 0;
    this.mode = 'cut';
  }

  /** Your trace as a design: the longest stroke is the outline (closed up), the rest engrave. Nothing drawn: the guide. */
  traced(): Design {
    const d = this.design!;
    const live = this.strokes.filter(s => s.length > 2).sort((a, b) => len(b) - len(a));
    if (!live.length) return { ...d, id: `kept-${d.id}-${Date.now().toString(36)}`, afterHours: true };
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const path = (s: Pt[], close: boolean) => s.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ') + (close ? ' Z' : '');
    const all = bounds(live.map(pts => ({ pts, closed: false })));
    // keep the drawing on its sheet (a wobble can run off the edge)
    const pad = 20, sw = Math.max(d.sheet.w, all.maxX + pad), sh = Math.max(d.sheet.h, all.maxY + pad);
    const shift = (s: Pt[]): Pt[] => s.map(p => [p[0] - Math.min(0, all.minX - pad), p[1] - Math.min(0, all.minY - pad)]);
    const [outer, ...rest] = live.map(shift);
    return {
      ...d, id: `kept-${d.id}-${Date.now().toString(36)}`, afterHours: true,
      sheet: { w: sw - Math.min(0, all.minX - pad), h: sh - Math.min(0, all.minY - pad) },
      outer: path(outer, true), inner: rest.map(s => ({ op: 'engrave' as const, d: path(s, false) })),
    };
  }

  // ---------- each frame ----------

  update(dt: number) {
    if (this.mode === 'off') return;
    this.t += dt;
    if (this.inkDirty) { this.rebuildInk(); this.inkDirty = false; }
    if (this.mode === 'trace') { this.sinceCheck += dt; if (this.sinceCheck > 0.6) { this.sinceCheck = 0; this.comment(); } }
    if (this.mode === 'cut') {
      // the router runs what you drew, quick
      this.cutT += dt / 4;
      this.d.cutView.update(Math.min(1, this.cutT));
      if (this.cutT >= 1) {
        const dsg = this.cut!;
        if (this.ink) this.ink.visible = false;
        if (this.guide) this.guide.visible = false;
        this.d.reveal.start(dsg, this.d.sheet, this.d.bed.top, this.scale, this.d.camera);
        this.mode = 'reveal';
      }
    }
    if (this.mode === 'reveal' && !this.d.reveal.active) this.end();
  }

  /** The top-down shot over the bed while choosing, tracing and cutting (the reveal does its own). */
  applyCamera(camera: THREE.PerspectiveCamera, dt: number) {
    const on = this.mode === 'choose' || this.mode === 'trace' || this.mode === 'cut';
    this.weight += ((on ? 1 : 0) - this.weight) * Math.min(1, dt * 3);
    if (this.weight < 0.002) return;
    const e = this.weight * this.weight * (3 - 2 * this.weight);
    camera.position.lerp(this.camPose.pos, e);
    const look = new THREE.Vector3();
    camera.getWorldDirection(look).add(camera.position);
    camera.lookAt(look.lerp(this.camPose.look, e));
  }

  private frame() {
    const c = this.d.sheet.parent!.localToWorld(new THREE.Vector3(0, this.d.bed.top, 0));
    this.camPose.look.copy(c);
    this.camPose.pos.set(c.x, c.y + 2.35, c.z + 0.75);
  }

  /** Done: keep the piece, hang it up, back to the crates. */
  private end() {
    const p = people(this.d.w), d = this.cut;
    if (d) {
      const k: Keepsake = { design: d, suggestedBy: this.design!.id === 'freehand' ? 'you' : this.by, beers: this.beers, accuracy: this.accuracy,
        dayIndex: this.d.g.dayIndex, slot: p.keepsakes.length, sheet: this.sheetKind };
      p.keepsakes.push(k);
      this.d.save();
    }
    this.clearMeshes();
    this.d.cutView.set(null);
    const cv = this.d.cutView.group;
    this.d.sheet.add(cv); cv.position.y = this.d.bed.top + 0.003;
    if (this.offcut) { this.offcut.parent?.remove(this.offcut); this.offcut.geometry.dispose(); this.offcut = null; }
    this.d.gather(false);
    this.mode = 'off';
    const done = this.done; this.done = null;
    done?.(this.accuracy);
  }

  private pick(xs: string[]) { return xs[Math.floor(this.t * 7 + this.strokes.length) % xs.length]; }
}

const len = (s: Pt[]) => s.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0);

/** Points along polylines every `step` units. */
function sample(polys: Pt[][], step: number): Pt[] {
  const out: Pt[] = [];
  for (const pts of polys) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

/** Flat ribbons along polylines (x, z) in a parent's frame, `w` wide. */
function ribbons(lines: { pts: [number, number][]; w: number }[], mat: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  for (const { pts, w } of lines) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * w / 2, nz = dx / l * w / 2, ex = dx / l * w / 2, ez = dz / l * w / 2;
    const aL = [a[0] + nx - ex, 0, a[1] + nz - ez], aR = [a[0] - nx - ex, 0, a[1] - nz - ez];
    const bL = [b[0] + nx + ex, 0, b[1] + nz + ez], bR = [b[0] - nx + ex, 0, b[1] - nz + ez];
    pos.push(...aL, ...aR, ...bR, ...aL, ...bR, ...bL);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = 2;
  (m.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  return m;
}

export const friendName = (id: FriendId | 'you') => (id === 'you' ? 'You' : friendById(id).name);
