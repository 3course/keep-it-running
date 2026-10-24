// The walkable shed in Three.js. Drives the existing Game (src/sim) through its public methods —
// this file only decides where you are, what you see, and turns taps into Game calls.
// Portrait, one thumb: hold and drag on the lower half for the stick, tap a thing to walk to it and
// use it, hold on the exhaust unit (or its label) to spray. WASD + E on desktop.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { Hud } from '../ui/hud.js';
import { renderDaySummary, renderWeekSummary } from '../ui/summary.js';
import { actionsFor, statusFor, type Action } from '../world/interactables.js';
import { COLS, OBJECTS, ROLLER_TILES, ROWS, T, ZONES, objectById, zoneAt, type ObjectId } from '../world/layout.js';
import { findPath, smooth, type P } from '../world/pathfind.js';
import { writeSave } from '../world/save.js';
import { absMinute, startNewDay, type WorldState } from '../world/state.js';
import { todoItems } from '../world/todo.js';
import { WORLD } from '../world/worldConfig.js';
import { buildWorld, type BuiltWorld, type ObjectView } from './build.js';
import { moveAndSlide, type Box } from './collide.js';
import { Effects } from './effects.js';
import { PlayerView } from './player.js';

const C = WORLD.cell;
const VW = WORLD.view.width, VH = WORLD.view.height;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

interface LabelEntry { id: ObjectId; el: HTMLDivElement; anchor: THREE.Vector3 }

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private built: BuiltWorld;
  private player: PlayerView;
  private effects: Effects;
  private hud: Hud;
  private sun: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private solid = new Set<number>();

  // movement
  private pos = { x: 0, z: 0 };
  private vel = { x: 0, z: 0 };
  private path: P[] | null = null;
  private pathIdx = 0;
  private goal: P[] = [];
  private pending: { id: ObjectId; act: boolean } | null = null;
  private stuck = { t: 0, x: 0, z: 0, replans: 0 };
  private keys = new Set<string>();
  private ePressed = false;
  private ptr: { id: number; x0: number; y0: number; t0: number; stickable: boolean; active: boolean } | null = null;
  private stickVec = { x: 0, y: 0 };
  private labelHold = false;
  private objectHold = false;

  // camera
  private camYaw = 0;
  private camLook = new THREE.Vector3();
  private lead = { x: 0, z: 0 };

  // clock, labels, debug
  private paused = false;
  private acc = 0;
  private last = 0;
  private labelSig = '';
  private labelEls: LabelEntry[] = [];
  private debug = new THREE.Group();
  private debugLabels: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];
  private time = 0;

  constructor(private container: HTMLElement, private g: Game, public w: WorldState, resumePaused: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(VW * WORLD.renderScale), Math.round(VH * WORLD.renderScale), false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { position: 'absolute', imageRendering: 'pixelated', touchAction: 'none' });
    container.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(WORLD.fov, VW / VH, 0.1, 120);
    this.built = buildWorld(this.scene);
    for (const o of OBJECTS) if (o.solid) for (let y = o.rect.y; y < o.rect.y + o.rect.h; y++) for (let x = o.rect.x; x < o.rect.x + o.rect.w; x++) this.solid.add(y * COLS + x);

    // light from the upper left, soft warm fill
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x7a6a52, 1.4));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    this.player = new PlayerView(this.scene);
    const ex = this.built.objects.get('exhaust')!;
    this.effects = new Effects(this.scene, new THREE.Vector3(ex.centre.x, ex.def.height + 0.15, ex.centre.z));
    this.buildDebug();

    this.pos = { x: w.px, z: w.py };
    this.player.yaw = Math.atan2(-w.fx, -w.fy);
    this.camLook.set(this.pos.x, 0.6, this.pos.z);
    this.paused = resumePaused;

    this.hud = new Hud(canvas, {
      goTo: id => this.goTo(id, true),
      togglePause: () => this.setPaused(!this.paused),
      knockOff: () => { this.g.knockOff(); this.hud.hideEndOfDay(); },
      overtime: () => { this.g.startOvertime(); this.hud.hideEndOfDay(); this.save(); },
    });
    this.hud.setPaused(this.paused);

    this.fit();
    window.addEventListener('resize', () => this.fit());
    this.bindInput(canvas);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.setPaused(true); this.save(); } });
    window.addEventListener('pagehide', () => this.save());
    (window as unknown as { kirScene: World3D }).kirScene = this;
    requestAnimationFrame(t => this.frame(t));
  }

  /** Fit the portrait canvas into the window; the render stays at 1/3 resolution, upscaled with chunky pixels. */
  private fit() {
    const aw = window.innerWidth, ah = window.innerHeight;
    const s = Math.min(aw / VW, ah / VH);
    const cw = VW * s, ch = VH * s;
    Object.assign(this.renderer.domElement.style, { width: `${cw}px`, height: `${ch}px`, left: `${(aw - cw) / 2}px`, top: `${(ah - ch) / 2}px` });
    this.hud?.layout();
  }

  // ---------- input ----------

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', e => {
      if (this.paused || this.g.phase !== 'day') return;
      canvas.setPointerCapture(e.pointerId);
      const L = this.hud.toLogical(e.clientX, e.clientY);
      const hit = this.pick(L.x, L.y);
      if ((hit === 'exhaust' || hit === 'duct') && this.canSpray()) { this.objectHold = true; return; }
      this.ptr = { id: e.pointerId, x0: L.x, y0: L.y, t0: performance.now(), stickable: L.y > VH * 0.5, active: false };
    });
    canvas.addEventListener('pointermove', e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      const L = this.hud.toLogical(e.clientX, e.clientY);
      const dx = L.x - p.x0, dy = L.y - p.y0, d = Math.hypot(dx, dy);
      if (p.stickable && !p.active && d > WORLD.stickDeadzone) { p.active = true; this.stopWalking(); }
      if (p.active) {
        const k = Math.min(1, d / WORLD.stickRadius);
        this.stickVec = d > 0 ? { x: dx / d * k, y: dy / d * k } : { x: 0, y: 0 };
        const r = Math.min(d, WORLD.stickRadius);
        this.hud.showStick(p.x0, p.y0, d > 0 ? dx / d * r : 0, d > 0 ? dy / d * r : 0);
      }
    });
    const up = (e: PointerEvent) => {
      this.objectHold = false;
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      const L = this.hud.toLogical(e.clientX, e.clientY);
      if (!p.active && performance.now() - p.t0 < WORLD.tapMaxMs && Math.hypot(L.x - p.x0, L.y - p.y0) < WORLD.tapMaxMove) this.tap(L.x, L.y);
      this.ptr = null;
      this.stickVec = { x: 0, y: 0 };
      this.hud.hideStick();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('pointerup', () => { this.labelHold = false; });
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === '`') { this.debug.visible = !this.debug.visible; this.debugLabels.forEach(d => { d.el.style.display = this.debug.visible ? 'block' : 'none'; }); }
      if (k === ' ') { this.setPaused(!this.paused); e.preventDefault(); }
      if (k === 'e' && !e.repeat) this.ePressed = true;
      this.keys.add(k);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
  }

  private ndc(lx: number, ly: number) { return new THREE.Vector2(lx / VW * 2 - 1, -(ly / VH * 2 - 1)); }

  /** Which object (if any) is under a logical-px point. */
  private pick(lx: number, ly: number): ObjectId | null {
    this.raycaster.setFromCamera(this.ndc(lx, ly), this.camera);
    for (const h of this.raycaster.intersectObjects(this.built.pickables, true)) {
      let o: THREE.Object3D | null = h.object, visible = true;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) visible = false;
      if (!visible) continue;
      while (o && !o.userData.objectId) o = o.parent;
      if (o) return o.userData.objectId as ObjectId;
    }
    return null;
  }

  private tap(lx: number, ly: number) {
    const id = this.pick(lx, ly);
    if (id) { this.player.hop(); this.goTo(id, true); return; }
    this.raycaster.setFromCamera(this.ndc(lx, ly), this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) this.walkToPoint(hit.x, hit.z);
  }

  // ---------- frame ----------

  private frame(now: number) {
    requestAnimationFrame(t => this.frame(t));
    const dtMs = this.last ? now - this.last : 16;
    this.last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    const g = this.g, w = this.w;

    // end of day / week screens
    if (g.phase === 'daySummary' || g.phase === 'weekSummary') {
      if (!this.hud.summaryShowing) this.showSummary();
    }
    if (w.dayIndex !== g.dayIndex && g.phase === 'day') {
      startNewDay(w, g);
      this.pos = { x: w.px, z: w.py }; this.vel = { x: 0, z: 0 }; this.stopWalking();
      this.save();
    }
    if (g.phase === 'endOfDayPrompt') { if (!this.hud.endOfDayShowing) this.hud.showEndOfDay(g); }
    else if (this.hud.endOfDayShowing) this.hud.hideEndOfDay();

    this.updateSpray();
    if (g.phase === 'day' && !this.paused) {
      this.acc += Math.min(dtMs, CONFIG.clock.realMsPerGameMinute * 5);
      let ticked = false;
      while (this.acc >= CONFIG.clock.realMsPerGameMinute && g.phase === 'day') {
        this.acc -= CONFIG.clock.realMsPerGameMinute;
        g.tick();
        ticked = true;
      }
      if (ticked) { this.syncWorld(); this.save(); }
    }
    this.syncWorld();
    this.move(dt);
    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.updateLabels();
    if (!this.hud.summaryShowing) this.hud.update(g, todoItems(g, w), w.done);
    this.renderer.render(this.scene, this.camera);
  }

  private showSummary() {
    this.save();
    this.hud.setHudVisible(false);
    const g = this.g;
    const done = () => { this.save(); this.hud.hideSummary(); this.hud.setHudVisible(true); };
    const week = () => renderWeekSummary(this.hud.showSummary(), g, done);
    if (g.phase === 'weekSummary') { week(); return; }
    renderDaySummary(this.hud.showSummary(), g, () => { this.save(); if (g.phase === 'weekSummary') week(); else done(); }, () => this.save());
  }

  /** Keep the physical shed in step with what the economy just did. */
  private syncWorld() {
    const g = this.g, w = this.w;
    if (w.bed === 'running') {
      const job = g.jobs.find(j => j.id === w.bedJobId);
      if (!job) w.bed = 'scrap';
      else if (job.status === 'done') w.bed = 'done';
      else if (job.status === 'scrapped' && !g.fault) w.bed = 'scrap';
    }
    if (g.today.sheetsDone > w.sheetsSeen) w.offcutBin = Math.min(1, w.offcutBin + (g.today.sheetsDone - w.sheetsSeen) * WORLD.offcutsPerSheet);
    w.sheetsSeen = g.today.sheetsDone;
    if (w.watchingSwap && g.replacing?.key !== w.watchingSwap) {
      if (w.watchingSwap === 'filter') w.oldBagWaiting = true;
      w.watchingSwap = null;
    }
    // the walk back with the extinguisher is a real walk now, not Game's timer
    if (g.fireResponse?.step === 'returning') g.fireResponse = null;
    const t = absMinute(g);
    if (w.toiletUntil !== null && t >= w.toiletUntil) w.toiletUntil = null;
    if (w.rollerUpUntil !== null && t >= w.rollerUpUntil && !this.onRollerTiles()) w.rollerUpUntil = null;
    if (w.finishedStack === 0) w.utePresent = false;
  }

  private canSpray() { return this.w.carrying === 'extinguisher' && !!this.g.fire && this.inRange('exhaust') && !this.paused && this.g.phase === 'day'; }

  /** Game puts a fire out only while its fire response is at the duct and spraying is held. */
  private updateSpray() {
    const g = this.g;
    const want = (this.labelHold || this.objectHold || this.keys.has('e')) && this.canSpray();
    if (want) {
      if (g.fireResponse?.step !== 'atDuct') g.fireResponse = { step: 'atDuct', remaining: 0 };
      if (!g.spraying) g.setSpraying(true);
    } else {
      if (g.fireResponse?.step === 'atDuct') g.fireResponse = null;
      if (g.spraying) g.setSpraying(false);
    }
  }

  // ---------- movement ----------

  private walkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const t = this.built.grid[y][x];
    if (t === T.WALL) return false;
    if (t === T.ROLLER && this.w.rollerUpUntil === null) return false;
    return !this.solid.has(y * COLS + x);
  };

  private boxes(): Box[] {
    return this.w.rollerUpUntil === null ? [...this.built.collisionBoxes, this.built.rollerBox] : this.built.collisionBoxes;
  }

  private move(dt: number) {
    const g = this.g, w = this.w;
    const frozen = this.paused || g.phase !== 'day' || g.busy !== null || w.toiletUntil !== null || this.hud.endOfDayShowing || this.hud.summaryShowing;
    let tx = 0, tz = 0;
    if (!frozen) {
      // screen-relative input (keyboard or stick) → world, using the camera's yaw
      let sx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
      let sy = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
      if (sx || sy) { const n = Math.hypot(sx, sy); sx /= n; sy /= n; } else { sx = this.stickVec.x; sy = this.stickVec.y; }
      if (sx || sy) {
        this.stopWalking();
        const fwd = { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) }, right = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) };
        tx = (right.x * sx - fwd.x * sy) * WORLD.maxSpeed;
        tz = (right.z * sx - fwd.z * sy) * WORLD.maxSpeed;
      } else if (this.path) {
        const t = this.followPath();
        tx = t.x; tz = t.z;
      }
      if (this.ePressed) this.useNearest();
    }
    this.ePressed = false;
    const k = Math.min(1, WORLD.accel * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    if (frozen) this.vel = { x: 0, z: 0 };
    const r = moveAndSlide(this.pos.x, this.pos.z, this.vel.x * dt, this.vel.z * dt, WORLD.playerRadius, this.boxes());
    if (r.hitX) this.vel.x *= 0.3;
    if (r.hitZ) this.vel.z *= 0.3;
    this.pos.x = r.x; this.pos.z = r.z;

    if (!frozen && this.pending && this.inRange(this.pending.id)) {
      const { id, act } = this.pending;
      this.stopWalking();
      if (act) {
        const runnable = actionsFor(id, g, w).filter(a => a.run && a.auto !== false);
        if (runnable.length === 1) this.doAction(runnable[0]);
      }
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.1) { w.fx = this.vel.x / sp; w.fy = this.vel.z / sp; }
    w.px = this.pos.x; w.py = this.pos.z;
  }

  /** Target velocity toward the next waypoint. */
  private followPath(): { x: number; z: number } {
    const p = this.path!;
    const wp = { x: (p[this.pathIdx].x + 0.5) * C, z: (p[this.pathIdx].y + 0.5) * C };
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
    const final = this.pathIdx === p.length - 1;
    if (d < (final ? 0.08 : 0.25)) {
      this.pathIdx++;
      if (this.pathIdx >= p.length) { this.path = null; if (this.pending && !this.inRange(this.pending.id)) this.pending = null; return { x: 0, z: 0 }; }
      return this.followPath();
    }
    // stuck on a corner: replan from here, then give up
    if (this.time - this.stuck.t > 0.5) {
      if (Math.hypot(this.pos.x - this.stuck.x, this.pos.z - this.stuck.z) < 0.05) {
        if (this.stuck.replans++ < 2) this.replan(); else { this.stopWalking(); return { x: 0, z: 0 }; }
      }
      this.stuck.t = this.time; this.stuck.x = this.pos.x; this.stuck.z = this.pos.z;
    }
    const s = WORLD.maxSpeed * (final ? Math.min(1, d / 0.6 + 0.3) : 1);
    return { x: dx / d * s, z: dz / d * s };
  }

  private stopWalking() { this.path = null; this.pending = null; }
  private cell(): P { return { x: Math.floor(this.pos.x / C), y: Math.floor(this.pos.z / C) }; }

  private planTo(goals: P[]): boolean {
    this.goal = goals;
    const found = findPath(COLS, ROWS, this.walkable, this.cell(), goals);
    if (!found) return false;
    this.path = smooth(this.walkable, found);
    this.pathIdx = this.path.length > 1 ? 1 : 0;
    this.stuck = { t: this.time, x: this.pos.x, z: this.pos.z, replans: 0 };
    return true;
  }
  private replan() { const p = this.pending; if (!this.planTo(this.goal)) this.stopWalking(); this.pending = p; }

  /** Walk to an object and, if there's exactly one obvious thing to do there, do it. */
  goTo(id: ObjectId, act: boolean) {
    if (this.paused || this.g.phase !== 'day') return;
    if (id === 'duct') id = 'exhaust'; // the fire is at the exhaust unit end of the duct
    this.pending = { id, act };
    if (this.inRange(id)) return; // move() picks it up this frame
    const r = objectById(id).rect, ring: P[] = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) ring.push({ x, y });
    }
    if (!this.planTo(ring)) this.pending = null;
  }

  private walkToPoint(wx: number, wz: number) {
    this.pending = null;
    const tx = Math.floor(wx / C), ty = Math.floor(wz / C);
    let best: P | null = null, bd = Infinity;
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
      if (!this.walkable(x, y)) continue;
      const d = Math.hypot(x - tx, y - ty);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) this.planTo([best]);
  }

  inRange(id: ObjectId): boolean {
    const b = this.built.objects.get(id)!.box;
    const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX), cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    return Math.hypot(this.pos.x - cx, this.pos.z - cz) <= WORLD.interactRange;
  }

  private onRollerTiles() {
    const c = this.cell();
    return ROLLER_TILES.some(r => r.x === c.x && Math.abs(r.y - c.y) <= 1);
  }

  // ---------- actions and labels ----------

  private doAction(a: Action) {
    if (this.paused || this.g.phase !== 'day' || !a.run) return;
    const before = todoItems(this.g, this.w);
    a.run();
    this.player.hop();
    const after = new Set(todoItems(this.g, this.w).map(i => i.key));
    for (const i of before) if (!after.has(i.key)) this.w.done.unshift(i.text);
    this.w.done = this.w.done.slice(0, 6);
    this.labelSig = '';
    this.save();
  }

  /** Desktop E: the first thing you can do at the nearest object in range. */
  private useNearest() {
    for (const o of OBJECTS) {
      if (!this.inRange(o.id)) continue;
      const a = actionsFor(o.id, this.g, this.w).find(x => x.run);
      if (a) { this.doAction(a); return; }
    }
  }

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * VW, y: (1 - p.y) / 2 * VH, behind: p.z > 1 };
  }

  private updateLabels() {
    const g = this.g, w = this.w;
    const near = this.paused || g.phase !== 'day' ? [] : OBJECTS.filter(o => o.id !== 'duct' && this.inRange(o.id));
    const entries = near.map(o => ({ o, acts: actionsFor(o.id, g, w), status: statusFor(o.id, g, w) })).filter(e => e.acts.length || e.status);
    const sig = JSON.stringify(entries.map(e => [e.o.id, e.acts.map(a => a.label), e.status, g.spraying]));
    if (sig !== this.labelSig) {
      this.labelSig = sig;
      for (const l of this.labelEls) l.el.remove();
      this.labelEls = [];
      for (const { o, acts, status } of entries) {
        const el = document.createElement('div');
        el.className = 'lbl';
        for (const a of acts) {
          const b = document.createElement('button');
          const held = a.hold && g.spraying;
          b.textContent = held ? 'Spraying…' : a.label;
          if (a.hold) b.className = held ? 'held' : 'hold';
          b.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation();
            if (a.hold) this.labelHold = true; else this.doAction(a);
          });
          el.appendChild(b);
        }
        if (status) { const s = document.createElement('div'); s.className = 'status'; s.textContent = status; el.appendChild(s); }
        this.hud.labels.appendChild(el);
        const v = this.built.objects.get(o.id)!;
        this.labelEls.push({ id: o.id, el, anchor: new THREE.Vector3(v.centre.x, o.height + 0.35, v.centre.z) });
      }
    }
    for (const l of this.labelEls) {
      const p = this.project(l.anchor);
      l.el.style.left = `${Math.max(60, Math.min(VW - 60, p.x))}px`;
      l.el.style.top = `${Math.max(70, Math.min(VH - 10, p.y))}px`;
      l.el.style.display = p.behind ? 'none' : 'flex';
    }
    for (const d of this.debugLabels) { const p = this.project(d.at); d.el.style.left = `${p.x}px`; d.el.style.top = `${p.y}px`; }
  }

  // ---------- camera and visuals ----------

  private updateCamera(dt: number) {
    const c = this.cell();
    const zone = zoneAt(c.x, c.y);
    const targetYaw = THREE.MathUtils.degToRad(zone?.yawDeg ?? 0);
    this.camYaw += angleDiff(this.camYaw, targetYaw) * Math.min(1, WORLD.camYawLerp * dt);
    const kl = Math.min(1, 2 * dt);
    this.lead.x += (this.vel.x / WORLD.maxSpeed * WORLD.camLead - this.lead.x) * kl;
    this.lead.z += (this.vel.z / WORLD.maxSpeed * WORLD.camLead - this.lead.z) * kl;
    const target = new THREE.Vector3(this.pos.x + this.lead.x, 0.6, this.pos.z + this.lead.z);
    this.camLook.lerp(target, Math.min(1, WORLD.camLerp * dt));
    const pitch = THREE.MathUtils.degToRad(WORLD.camPitchDeg);
    const horiz = WORLD.camDistance * Math.cos(pitch), height = WORLD.camDistance * Math.sin(pitch);
    this.camera.position.set(this.camLook.x + Math.sin(this.camYaw) * horiz, this.camLook.y + height, this.camLook.z + Math.cos(this.camYaw) * horiz);
    this.camera.lookAt(this.camLook);
    // the sun follows so the shadow map covers what's on screen
    this.sun.position.set(this.camLook.x - 7, 14, this.camLook.z - 6);
    this.sun.target.position.set(this.camLook.x, 0, this.camLook.z);

    // walls and tall things between the camera and the player go see-through
    const dir = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    for (const f of this.built.fadeables) {
      const cx = (f.box.minX + f.box.maxX) / 2 - this.pos.x, cz = (f.box.minZ + f.box.maxZ) / 2 - this.pos.z;
      const half = Math.max(f.box.maxX - f.box.minX, f.box.maxZ - f.box.minZ) / 2;
      const along = cx * dir.x + cz * dir.z, lateral = Math.abs(cx * dir.z - cz * dir.x);
      const between = along + half > 0.3 && along - half < WORLD.wallFadeDistance && lateral < 1.6 + half;
      const want = between ? 0.18 : 1;
      for (const m of f.mats) {
        m.opacity += (want - m.opacity) * Math.min(1, 8 * dt);
        m.depthWrite = m.opacity > 0.9;
      }
    }
  }

  private updateVisuals(dt: number) {
    const g = this.g, w = this.w, o = (id: ObjectId) => this.built.objects.get(id)! as ObjectView;

    // machine bed
    const m = o('machine'), mp = m.parts;
    const onBed = w.bed !== 'empty';
    mp.sheet.visible = onBed;
    ((mp.sheet as THREE.Mesh).material as THREE.MeshToonMaterial).color.setHex(w.bed === 'scrap' ? 0x9a5a4a : 0xd6bc8a);
    mp.clamps.visible = w.bed === 'clamped' || w.bed === 'running' || w.bed === 'done';
    const prog = g.current && w.bed === 'running' ? g.current.progress / g.current.cutMinutes : w.bed === 'done' ? 1 : 0;
    mp.cut.visible = prog > 0.02;
    mp.cut.scale.x = Math.max(0.02, prog);
    const bw = m.box.maxX - m.box.minX;
    const gx = w.bed === 'running' ? -bw / 2 + 0.4 + (bw - 0.8) * prog : 0;
    mp.gantry.position.x += (gx - mp.gantry.position.x) * Math.min(1, 6 * dt);
    if (g.machine === 'cutting') mp.gantry.position.z = Math.sin(this.time * 6) * 0.25;
    mp.light.visible = !!g.fault && Math.sin(this.time * 9) > 0;

    // extractor bag swells; dust on the floor once it's past the fire threshold
    const fill = 1 - g.wear.filter;
    const bag = o('extractor').parts.bag as THREE.Mesh;
    bag.scale.setScalar(0.6 + fill * 0.9);
    (bag.material as THREE.MeshToonMaterial).color.setHex(fill > CONFIG.fire.bagFullAbove ? 0xe2cf8a : 0xd4cba6);
    const level = fill > CONFIG.fire.bagFullAbove ? Math.ceil((fill - CONFIG.fire.bagFullAbove) / (1 - CONFIG.fire.bagFullAbove) * 4) : 0;
    this.built.dust.forEach((d, i) => { d.visible = i < level * 10; });

    // pallets, bin
    o('plyPallet').parts.stack.children.forEach((s, i) => { s.visible = i < g.queued.length; });
    o('finishedPallet').parts.stack.children.forEach((s, i) => { s.visible = i < w.finishedStack; });
    const binFill = o('offcutBin').parts.fill;
    binFill.scale.y = Math.max(0.001, w.offcutBin);
    // extinguishers on their hooks
    o('extinguisher').parts.can.visible = w.hooks.wall;
    o('spareExtinguisher').parts.can.visible = w.hooks.shed;
    // phone jiggles while it rings
    const ringing = g.distractions.some(d => d.kind === 'phone' || d.kind === 'bank');
    const hs = o('phone').parts.handset;
    hs.rotation.z = ringing ? Math.sin(this.time * 40) * 0.2 : 0;
    hs.position.y = o('phone').def.height + (ringing ? Math.abs(Math.sin(this.time * 20)) * 0.04 : 0);
    o('fridge').parts.glow.visible = g.fridgeOpen;
    // roller door rolls up into the lintel
    const door = o('rollerDoor').parts.door;
    const open = w.rollerUpUntil !== null ? 1 : 0;
    const cur = (door.userData.open as number | undefined) ?? 0;
    const next = cur + (open - cur) * Math.min(1, 3 * dt);
    door.userData.open = next;
    door.scale.y = 1 - next * 0.92; door.position.y = next * WORLD.lintel * 0.9;
    // exhaust fan spins while cutting
    if (g.machine === 'cutting') o('exhaust').parts.fan.rotation.y += dt * 12;

    // vehicles and the mate
    const courier = g.distractions.some(d => d.kind === 'courier');
    this.built.vehicles.truck.visible = courier;
    this.built.vehicles.ute.visible = !courier && w.utePresent;
    const mate = g.distractions.find(d => d.kind === 'friend');
    this.built.mate.visible = !!mate;
    if (mate) this.built.mate.rotation.y = Math.sin(this.time * 2) * 0.3 + Math.PI * 0.1;

    // fire and smoke
    const fire = g.fire;
    const smoke: 0 | 1 | 2 = fire ? 1 : g.machineDown ? 2 : 0;
    const flames: 0 | 1 | 2 = fire ? (fire.stage === 'duct' ? 2 : fire.minutes >= CONFIG.fire.smokeOnlyMinutes ? 1 : 0) : 0;
    const nozzle = g.spraying ? new THREE.Vector3(this.pos.x + w.fx * 0.3, 0.7, this.pos.z + w.fy * 0.3) : null;
    this.effects.update(dt, smoke, flames, nozzle);

    // player
    this.player.setCarry(w.carrying);
    this.player.setVisible(w.toiletUntil === null);
    this.player.update(dt, this.pos.x, this.pos.z, this.vel.x, this.vel.z);
  }

  private buildDebug() {
    const pts: number[] = [];
    const rect = (x0: number, z0: number, x1: number, z1: number) => {
      const y = 0.05;
      pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    };
    for (const z of ZONES) rect(z.rect.x * C, z.rect.y * C, (z.rect.x + z.rect.w) * C, (z.rect.y + z.rect.h) * C);
    const zoneGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.debug.add(new THREE.LineSegments(zoneGeo, new THREE.LineBasicMaterial({ color: 0x00e5ff })));
    pts.length = 0;
    const r = WORLD.interactRange;
    for (const o of OBJECTS) rect(o.rect.x * C - r, o.rect.y * C - r, (o.rect.x + o.rect.w) * C + r, (o.rect.y + o.rect.h) * C + r);
    const rangeGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.debug.add(new THREE.LineSegments(rangeGeo, new THREE.LineBasicMaterial({ color: 0xff3bd4 })));
    this.debug.visible = false;
    this.scene.add(this.debug);
    queueMicrotask(() => {
      for (const z of ZONES) {
        const el = document.createElement('div');
        el.textContent = z.name;
        Object.assign(el.style, { position: 'absolute', transform: 'translate(-50%,-50%)', font: '11px monospace', color: '#00e5ff', background: '#000a', padding: '1px 3px', display: 'none' });
        this.hud.labels.appendChild(el);
        this.debugLabels.push({ el, at: new THREE.Vector3((z.rect.x + z.rect.w / 2) * C, 0.1, (z.rect.y + z.rect.h / 2) * C) });
      }
    });
  }

  // ---------- pause and save ----------

  setPaused(p: boolean) {
    this.paused = p;
    this.hud?.setPaused(p);
    this.acc = 0;
    if (p) { this.labelHold = this.objectHold = false; this.stopWalking(); this.stickVec = { x: 0, y: 0 }; this.hud?.hideStick(); }
    this.labelSig = '';
    this.save();
  }
  get isPaused() { return this.paused; }
  private save() { writeSave(this.g, this.w); }

  // ---------- test hooks (window.kirScene) ----------

  /** CSS-pixel screen position of a world point. */
  screenOfPoint(x: number, y: number, z: number) {
    const p = this.project(new THREE.Vector3(x, y, z)), r = this.renderer.domElement.getBoundingClientRect(), k = r.width / VW;
    return { x: r.left + p.x * k, y: r.top + p.y * k };
  }
  screenOf(id: ObjectId) { const v = this.built.objects.get(id)!; return this.screenOfPoint(v.centre.x, v.def.height * 0.6, v.centre.z); }
  onScreen(id: ObjectId) {
    const v = this.built.objects.get(id)!, p = this.project(new THREE.Vector3(v.centre.x, v.def.height * 0.6, v.centre.z));
    return !p.behind && p.x > 20 && p.x < VW - 20 && p.y > 90 && p.y < VH - 20;
  }
  labelScreens() {
    return [...this.hud.labels.querySelectorAll<HTMLButtonElement>('.lbl button')].map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent ?? '', x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }
  pressLabel(text: string) {
    const b = [...this.hud.labels.querySelectorAll<HTMLButtonElement>('.lbl button')].find(x => x.textContent === text);
    if (!b) return false;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return true;
  }
  get playerPos() { return { x: this.pos.x, z: this.pos.z, tile: this.cell(), zone: zoneAt(this.cell().x, this.cell().y)?.name ?? null }; }
  get walking() { return !!this.path; }
}
