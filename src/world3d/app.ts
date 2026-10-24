// The walkable shed in Three.js. Drives the existing Game (src/sim) through its public methods —
// this file only decides where you are, what you see, and turns taps into Game calls.
// Portrait, one thumb: hold and drag on the lower half for the stick, tap a thing to walk to it and
// use it, hold on the exhaust unit (or its label) to spray. WASD + E on desktop.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { Hints } from '../ui/hints.js';
import { Hud } from '../ui/hud.js';
import { renderDaySummary, renderWeekSummary } from '../ui/summary.js';
import { actionsFor, statusFor, uiHooks, type Action } from '../world/interactables.js';
import { COLS, MACHINE_SPOT, OBJECTS, ROLLER_TILES, ROWS, START_TILE, T, ZONES, objectById, solidCells, zoneAt, type ObjectId } from '../world/layout.js';
import { findPath, smooth, type P } from '../world/pathfind.js';
import { writeSave } from '../world/save.js';
import { absMinute, logEvent, startNewDay, type WorldState } from '../world/state.js';
import { TOUR, todoItems, tourActive } from '../world/todo.js';
import { TOO_EARLY, mateById } from '../data/mates.js';
import { WORLD } from '../world/worldConfig.js';
import { buildWorld, toon, toonRamp, type BuiltWorld, type ObjectView } from './build.js';
import { moveAndSlide, type Box } from './collide.js';
import { Effects } from './effects.js';
import { PlayerView } from './player.js';
import { RingSound, ringOn } from './ring.js';
import { describeGpu, TIERS, type GpuInfo, type TierSettings } from './gpu.js';
import { hideOverlay, showRendererFailure, showRestarting } from '../ui/failure.js';
import { Trail } from './trail.js';

const C = WORLD.cell;
const VW = WORLD.view.width, VH = WORLD.view.height;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

interface LabelEntry { id: string; el: HTMLDivElement; anchor: THREE.Vector3 }

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();       // rebuilt from state if the GPU context is lost and comes back
  readonly camera: THREE.PerspectiveCamera;
  private built!: BuiltWorld;
  private player!: PlayerView;
  private effects!: Effects;
  private hud: Hud;
  private sun!: THREE.DirectionalLight;
  private tier: TierSettings;
  // renderer health
  private started = false;         // a frame has rendered
  private failed = false;          // the failure card is up; the loop has stopped
  private contextLost = false;
  private pausedBeforeLoss = false;
  private lostTimer = 0;
  private raycaster = new THREE.Raycaster();
  private solid = new Set<number>();

  // movement
  private pos = { x: 0, z: 0 };
  private vel = { x: 0, z: 0 };
  private path: P[] | null = null;
  private pathIdx = 0;
  private goal: P[] = [];
  /** Where we're walking to; `want`: the notepad line tapped, whose action runs on arrival. */
  private pending: { id: ObjectId; act: boolean; highlight: boolean; want?: string } | null = null;
  private stuck = { t: 0, x: 0, z: 0, replans: 0 };
  private keys = new Set<string>();
  private ePressed = false;
  private ptr: { id: number; x0: number; y0: number; t0: number; stickable: boolean; active: boolean } | null = null;
  private stickVec = { x: 0, y: 0 };
  private labelHold = false;
  private labelPressed = false;  // a finger is down on a label: don't move or rebuild them under it
  private labelPressedAt = 0;
  /** Every action done, for tests and debugging: what was tapped and what it said. */
  readonly actionLog: { label: string; said: string; t: number }[] = [];
  private objectHold = false;

  // camera
  private camYaw = 0;
  private camLook = new THREE.Vector3();
  private lead = { x: 0, z: 0 };
  private camScale = 1; // pulls back a little outside

  // clock, labels, debug
  private paused = false;
  private acc = 0;
  private last = 0;
  private labelSig = '';
  private labelEls: LabelEntry[] = [];
  private debug = new THREE.Group();
  private debugLabels: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];
  private time = 0;
  private hints = new Hints();
  private ring = new RingSound();
  private flashRing!: THREE.Group;
  private flash: { id: ObjectId; t: number } | null = null;
  private trail!: Trail;
  private trailPath: P[] | null = null;   // the walk the trail was laid for (a notepad line)
  private guideFor: ObjectId | null = null; // first day: the tour stop the trail points at
  private guideT = 0;
  private signEls: HTMLDivElement[] = [];
  private spillLevel = 0;
  private shrugsSeen = 0;
  private bubbleT = 0;
  private bubbleText = '';
  // beer: cans put down around the shed, the one we're walking over to, sips seen
  private canMeshes = new Map<number, THREE.Group>();
  private pendingCan: number | null = null;
  private sipsSeen = 0;
  private mateSeen: { id: number; at: number } | null = null; // the mate at the door, and when they turned up

  /** `gpu`: what the device can do (gpu.ts); it picks the render tier. Throws if WebGL can't start at all. */
  constructor(private container: HTMLElement, private g: Game, public w: WorldState, resumePaused: boolean, readonly gpu: GpuInfo) {
    this.tier = TIERS[gpu.tier];
    this.renderer = new THREE.WebGLRenderer({ antialias: this.tier.antialias, powerPreference: this.tier.powerPreference });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(VW * WORLD.renderScale), Math.round(VH * WORLD.renderScale), false);
    this.renderer.shadowMap.enabled = this.tier.shadows;
    this.renderer.shadowMap.type = this.tier.shadowType;
    // a shader that won't compile is a dead view, not just a console message
    this.renderer.debug.onShaderError = (gl, program) => this.fail(`shader program failed to link: ${gl.getProgramInfoLog(program) || 'no log'}`);
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { position: 'absolute', imageRendering: 'pixelated', touchAction: 'none' });
    container.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', e => this.onContextLost(e));
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());

    this.camera = new THREE.PerspectiveCamera(WORLD.fov, VW / VH, 0.1, 120);
    this.solid = solidCells(); // solid objects and the big clutter
    this.buildScene();

    this.pos = { x: w.px, z: w.py };
    // a save from an older layout can leave you inside a wall: put you back somewhere sensible
    if (!this.walkable(Math.floor(this.pos.x / C), Math.floor(this.pos.z / C))) {
      const spot = w.tour ? START_TILE : MACHINE_SPOT;
      this.pos = { x: (spot.x + 0.5) * C, z: (spot.y + 0.5) * C };
    }
    this.camLook.set(this.pos.x, 0.6, this.pos.z);
    this.paused = resumePaused;

    this.hud = new Hud(canvas, {
      goTo: (targets, key) => { this.hints.mark('notepad'); this.goToNearest(targets, key); },
      putCanDown: () => { if (this.g.heldCan) { this.putCanDown(); this.player.hop(); logEvent(this.w, 'Put the can down'); this.save(); } },
      toggleMute: () => { this.ring.setMuted(!this.ring.muted); return this.ring.muted; },
      togglePause: () => this.setPaused(!this.paused),
      knockOff: () => { this.g.knockOff(); this.hud.hideEndOfDay(); },
      overtime: () => { this.g.startOvertime(); this.hud.hideEndOfDay(); this.save(); },
    });
    this.hud.setPaused(this.paused);
    this.hud.setMuted(this.ring.muted);
    if (gpu.tier !== 'full') this.hud.setTagNote(`${gpu.tier === 'bare' ? 'safe, no shadows' : 'safe'} (${gpu.why})`);
    this.buildDebugLabels();
    uiHooks.orderPly = () => this.hud.showPlyOrder(this.g, (t, n) => { if (this.g.orderPly(t, n)) { this.player.hop(); this.save(); } });
    this.buildSigns();

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
      this.ring.unlock(); // audio may only start after a gesture
      if (this.paused || this.g.phase !== 'day') return;
      canvas.setPointerCapture(e.pointerId);
      const L = this.hud.toLogical(e.clientX, e.clientY);
      const hit = this.pick(L.x, L.y);
      if ((hit === 'exhaust' || hit === 'duct') && this.canSpray()) { this.objectHold = true; return; }
      // a drag anywhere is the stick; a quick tap uses whatever's under it
      this.ptr = { id: e.pointerId, x0: L.x, y0: L.y, t0: performance.now(), stickable: true, active: false };
    });
    canvas.addEventListener('pointermove', e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      const L = this.hud.toLogical(e.clientX, e.clientY);
      const dx = L.x - p.x0, dy = L.y - p.y0, d = Math.hypot(dx, dy);
      if (p.stickable && !p.active && d > WORLD.stickDeadzone) { p.active = true; this.stopWalking(); this.hints.mark('drag'); }
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
    const release = () => {
      this.labelHold = false;
      if (this.labelPressed) { this.labelPressed = false; this.labelSig = ''; } // rebuild now the finger's off
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keydown', e => {
      this.ring.unlock();
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) this.hints.mark('drag');
      if (k === '`') { this.debug.visible = !this.debug.visible; this.debugLabels.forEach(d => { d.el.style.display = this.debug.visible ? 'block' : 'none'; }); }
      if (k === ' ') { this.setPaused(!this.paused); e.preventDefault(); }
      if (k === 'e' && !e.repeat) this.ePressed = true;
      this.keys.add(k);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
  }

  private ndc(lx: number, ly: number) { return new THREE.Vector2(lx / VW * 2 - 1, -(ly / VH * 2 - 1)); }

  /** Which object (if any) is under a logical-px point. */
  /** A can on the floor under a logical-px point (they're small: a generous invisible hit box each). */
  private pickCan(lx: number, ly: number): number | null {
    this.raycaster.setFromCamera(this.ndc(lx, ly), this.camera);
    const hit = this.raycaster.intersectObjects([...this.canMeshes.values()], true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.canId === undefined) o = o.parent;
    return o ? (o.userData.canId as number) : null;
  }

  private pick(lx: number, ly: number): ObjectId | null {
    this.raycaster.setFromCamera(this.ndc(lx, ly), this.camera);
    // every visible object along the ray, nearest hit first
    const hits: { id: ObjectId; dist: number }[] = [];
    for (const h of this.raycaster.intersectObjects(this.built.pickables, true)) {
      let o: THREE.Object3D | null = h.object, visible = true;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) visible = false;
      if (!visible) continue;
      while (o && !o.userData.objectId) o = o.parent;
      if (o && !hits.some(x => x.id === o!.userData.objectId)) hits.push({ id: o.userData.objectId as ObjectId, dist: h.distance });
    }
    if (!hits.length) return null;
    // small things next to big ones (the extinguisher by the roller door): prefer the smallest one close behind the first hit
    const area = (id: ObjectId) => { const r = objectById(id).rect; return r.w * r.h; };
    return hits.filter(x => x.dist - hits[0].dist < 1.5).sort((a, b) => area(a.id) - area(b.id))[0].id;
  }

  private tap(lx: number, ly: number) {
    const can = this.pickCan(lx, ly);
    if (can !== null) {
      const spot = this.w.canSpots![can];
      this.player.hop();
      this.walkToPoint(spot.x, spot.z);
      this.pendingCan = can;
      return;
    }
    const id = this.pick(lx, ly);
    if (id) { this.player.hop(); this.goTo(id, true); return; }
    this.raycaster.setFromCamera(this.ndc(lx, ly), this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) this.walkToPoint(hit.x, hit.z);
  }

  // ---------- frame ----------

  private frame(now: number) {
    if (this.failed) return; // the failure card is up: stop
    requestAnimationFrame(t => this.frame(t));
    if (this.contextLost) { this.last = now; return; } // clock stopped until the view's back
    try {
      this.step(now);
    } catch (e) {
      // the first frame failing means the view never started; later, log it and keep the game going
      if (!this.started) this.fail(e);
      else console.error('[Keep It Running] frame error', e);
      return;
    }
    if (!this.started) {
      this.started = true;
      if (this.renderer.getContext().isContextLost()) this.fail('the WebGL context was lost during the first frame');
      else console.info(`[Keep It Running] 3D view running · tier ${this.gpu.tier} (${this.gpu.why}) · ${this.gpu.renderer}`);
    }
  }

  private step(now: number) {
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
    // first day: the clock waits at 7:00 while you walk round, until the first cut starts
    if (g.phase === 'day' && !this.paused && !tourActive(w)) {
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
    this.updateTour();
    this.updateTrail(dt);
    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.updateLabels();
    this.updatePointers();
    this.updateSigns(dt);
    this.updateBubble(dt);
    this.updateMateBubble();
    this.updateRing();
    if (!this.hud.summaryShowing) {
      this.hud.update(g, todoItems(g, w), w.done);
      this.hud.showHint(g.phase === 'day' && !this.paused && !this.hud.isOpen ? this.hints.current : null);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- renderer health ----------

  /** Everything in the 3D scene, built from the shed's data and the current state. Run again after a lost context. */
  private buildScene() {
    this.built = buildWorld(this.scene, this.tier.pointLights);

    // light from the upper left, soft warm fill
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x7a6a52, 1.4));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = this.tier.shadows;
    this.sun.shadow.mapSize.set(this.tier.shadowMapSize, this.tier.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    this.player = new PlayerView(this.scene);
    this.player.yaw = Math.atan2(-this.w.fx, -this.w.fy);
    const ex = this.built.objects.get('exhaust')!;
    this.effects = new Effects(this.scene, new THREE.Vector3(ex.centre.x, ex.def.height + 0.15, ex.centre.z), this.tier.pointLights);
    this.buildDebug();
    this.buildFlashRing();
    this.trail = new Trail(this.scene);
    this.trailPath = null; this.guideFor = null;
    this.canMeshes.clear();
    this.labelSig = '';
  }

  /** Give up on the 3D view: save, stop the loop, and put the details where they can be copied. */
  private fail(error: unknown) {
    if (this.failed) return;
    this.failed = true;
    try { this.save(); } catch { /* the save is best-effort here */ }
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    showRendererFailure(describeGpu(this.gpu, msg), this.started ? 'The 3D view stopped on this device' : undefined);
  }

  private onContextLost(e: Event) {
    e.preventDefault(); // ask for it back
    if (!this.started) { this.fail('the WebGL context was lost while starting (the GPU process may have crashed)'); return; }
    if (this.contextLost || this.failed) return;
    this.contextLost = true;
    this.pausedBeforeLoss = this.paused;
    this.setPaused(true); // saves
    showRestarting();
    console.warn('[Keep It Running] WebGL context lost; waiting for it to come back');
    this.lostTimer = window.setTimeout(() => {
      if (this.contextLost) { this.contextLost = false; this.fail("the WebGL context was lost and didn't come back within 10 s"); }
    }, 10000);
  }

  /** The GPU's back: three re-creates its own GL state; we rebuild the scene from state and carry on. */
  private onContextRestored() {
    if (!this.contextLost || this.failed) return;
    window.clearTimeout(this.lostTimer);
    try {
      this.scene = new THREE.Scene();
      this.buildScene();
    } catch (e) { this.contextLost = false; this.fail(e); return; }
    this.contextLost = false;
    this.last = 0;
    hideOverlay();
    this.setPaused(this.pausedBeforeLoss);
    console.info('[Keep It Running] WebGL context restored; scene rebuilt');
  }

  private showSummary() {
    this.save();
    this.hud.hidePlyOrder();
    this.hud.setHudVisible(false);
    const g = this.g;
    const done = () => { this.save(); this.hud.hideSummary(); this.hud.setHudVisible(true); };
    const week = () => renderWeekSummary(this.hud.showSummary(), g, done);
    if (g.phase === 'weekSummary') { week(); return; }
    renderDaySummary(this.hud.showSummary(), g, () => { this.save(); if (g.phase === 'weekSummary') week(); else done(); }, () => this.save(), () => this.hints.reset());
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
    // stock news from the economy goes on the notepad: "4 sheets of formply left", "Out of MDF."
    const today = g.log.filter(l => l.dayIndex === g.dayIndex);
    for (const l of today.slice(w.newsSeen ?? 0)) {
      if (/^(\d+ sheets? of .+ left|Out of .+|Fumbled: .+|.+ grabbed a beer from the fridge|Finished the beer)\.$/.test(l.text)) {
        logEvent(w, l.text.replace(/\. Again\.$/, ' — again').replace(/\.$/, ''));
      }
      if (l.text.startsWith('Fumbled: ')) this.player.stumble();
      if (l.text.startsWith('Yuck')) this.say('Yuck. Warm.');
    }
    w.newsSeen = today.length;
    // the roller door stays up while you're carrying ply in from the truck
    if (g.truckOnApron?.stage === 'unloading') w.rollerUpUntil = Math.max(w.rollerUpUntil ?? 0, t + 2);
    if ((w.shrugs ?? 0) !== this.shrugsSeen) { this.shrugsSeen = w.shrugs ?? 0; this.player.shrug(); this.say('None left'); }
    if (g.sips !== this.sipsSeen) { this.sipsSeen = g.sips; this.player.sip(); }
    if (w.tour && !w.tour.cutStarted && w.bed === 'running') { w.tour.cutStarted = true; this.save(); } // the day proper starts now
  }

  /** First-day tour: each stop ticks off when you get there. */
  private updateTour() {
    const w = this.w;
    if (!tourActive(w) || this.paused) return;
    for (const t of TOUR) {
      if (w.tour!.visited.includes(t.id) || !this.inRange(t.id)) continue;
      w.tour!.visited.push(t.id);
      logEvent(w, `✓ ${t.text}`);
      this.save();
    }
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
        tx = (right.x * sx - fwd.x * sy) * this.maxSpeed;
        tz = (right.z * sx - fwd.z * sy) * this.maxSpeed;
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

    if (!frozen && this.pendingCan !== null) {
      const spot = this.w.canSpots?.[this.pendingCan];
      if (!spot) this.pendingCan = null;
      else if (Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z) <= WORLD.interactRange + 0.2) {
        const act = this.canActions(this.pendingCan)[0];
        this.stopWalking();
        if (act) this.doAction(act);
      }
    }
    if (!frozen && this.pending && this.inRange(this.pending.id)) {
      const { id, act, highlight, want } = this.pending;
      this.stopWalking();
      if (highlight) this.flash = { id, t: 0 };
      if (act) {
        const actions = actionsFor(id, g, w);
        const wanted = want ? actions.find(a => a.key === want && a.run) : undefined;
        const runnable = actions.filter(a => a.run && a.auto !== false);
        if (wanted) this.doAction(wanted);
        else if (runnable.length === 1) this.doAction(runnable[0]);
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
    const s = this.maxSpeed * (final ? Math.min(1, d / 0.6 + 0.3) : 1);
    return { x: dx / d * s, z: dz / d * s };
  }

  private stopWalking() { this.path = null; this.pending = null; this.pendingCan = null; }
  /** Top walking speed now: beer and a full bladder both slow you down. */
  private get maxSpeed() { return WORLD.maxSpeed * this.g.walkMult(); }
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
  goTo(id: ObjectId, act: boolean, highlight = false, want?: string) {
    if (this.paused || this.g.phase !== 'day') return;
    if (id === 'duct') id = 'exhaust'; // the fire is at the exhaust unit end of the duct
    this.trailPath = null;
    this.pending = { id, act, highlight, want };
    if (this.inRange(id)) return; // move() picks it up this frame
    const r = objectById(id).rect, ring: P[] = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) ring.push({ x, y });
    }
    if (!this.planTo(ring)) this.pending = null;
  }

  /** A notepad line: walk to the nearest of its objects (by walking distance), act, and flash it on arrival. */
  goToNearest(targets: ObjectId[], want?: string) {
    if (!targets.length) return;
    let best = targets[0], bestLen = Infinity;
    if (targets.length > 1) for (const id of targets) {
      if (this.inRange(id)) { best = id; break; }
      const r = objectById(id).rect, ring: P[] = [];
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) ring.push({ x, y });
      }
      const p = findPath(COLS, ROWS, this.walkable, this.cell(), ring);
      const len = p ? p.length : Infinity;
      if (len < bestLen) { bestLen = len; best = id; }
    }
    this.goTo(best, true, true, want);
    if (this.path) this.layTrail(); // show the way
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
    return ROLLER_TILES.some(r => Math.abs(r.x - c.x) + Math.abs(r.y - c.y) <= 1); // on or right next to the door
  }

  // ---------- actions and labels ----------

  /** Do an action and always answer it: a hop, and a line in the notepad's recent events. */
  private doAction(a: Action) {
    if (this.paused || this.g.phase !== 'day' || !a.run) return;
    const before = todoItems(this.g, this.w);
    if (a.twoHands && this.g.heldCan) this.putCanDown();
    const said = a.run() || a.done || a.label;
    this.player.hop();
    this.hints.mark('interact');
    this.actionLog.push({ label: a.label, said, t: this.time });
    const after = new Set(todoItems(this.g, this.w).map(i => i.key));
    // a line that vanished because of this action is done — except "grab the next sheet", which just hides while your hands are full
    let crossed = 0;
    for (const i of before) if (!after.has(i.key) && (i.key !== 'next' || this.w.carrying === 'sheet')) { logEvent(this.w, `✓ ${i.text}`); crossed++; }
    // nothing on the list to cross off: say what happened instead
    if (!crossed) logEvent(this.w, said);
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
    const live = !this.paused && g.phase === 'day';
    const near = live ? OBJECTS.filter(o => o.id !== 'duct' && this.inRange(o.id)) : [];
    const entries: { id: string; anchor: THREE.Vector3; acts: Action[]; status: string | null }[] = near.map(o => {
      const v = this.built.objects.get(o.id)!;
      return { id: o.id as string, anchor: new THREE.Vector3(v.centre.x, o.height + 0.35, v.centre.z), acts: actionsFor(o.id, g, w), status: statusFor(o.id, g, w) };
    });
    // cans on the floor within reach
    for (const c of live ? g.cans : []) {
      const spot = w.canSpots?.[c.id];
      if (c.held || !spot || Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z) > WORLD.interactRange + 0.2) continue;
      const status = c.fill > 0 ? `Beer · ${Math.round(c.fill * 100)}% left${c.warm ? ' · warm' : ''}` : 'Empty can';
      entries.push({ id: `can-${c.id}`, anchor: new THREE.Vector3(spot.x, 0.55, spot.z), acts: this.canActions(c.id), status });
    }
    const shown = entries.filter(e => e.acts.length || e.status);
    const sig = JSON.stringify(shown.map(e => [e.id, e.acts.map(a => a.label), e.status, g.spraying]));
    if (sig !== this.labelSig && !(this.labelPressed && this.time - this.labelPressedAt < 2)) {
      this.labelSig = sig;
      for (const l of this.labelEls) l.el.remove();
      this.labelEls = [];
      for (const { id, anchor, acts, status } of shown) {
        const el = document.createElement('div');
        el.className = 'lbl';
        for (const a of acts) {
          const b = document.createElement('button');
          const held = a.hold && g.spraying;
          b.textContent = held ? 'Spraying…' : a.label;
          if (a.hold) b.className = held ? 'held' : 'hold';
          b.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation();
            this.labelPressed = true; this.labelPressedAt = this.time;
            if (a.hold) { this.labelHold = true; return; }
            this.doAction(a);
            // the label ticks: it stays put (and isn't rebuilt) until the finger lifts
            b.classList.add('tick');
            b.textContent = `✓ ${a.label}`;
          });
          el.appendChild(b);
        }
        if (status) { const s = document.createElement('div'); s.className = 'status'; s.textContent = status; el.appendChild(s); }
        this.hud.labels.appendChild(el);
        this.labelEls.push({ id, el, anchor });
      }
    }
    // labels hold still under a finger (a lost pointerup can't freeze them for good)
    if (this.labelPressed && this.time - this.labelPressedAt < 2) return;
    this.labelPressed = false;
    for (const l of this.labelEls) {
      const p = this.project(l.anchor);
      const half = l.el.offsetWidth / 2 + 4; // keep the whole label on screen, however long it is
      l.el.style.left = `${Math.max(half, Math.min(VW - half, p.x))}px`;
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
    // outside reads bigger than inside: pull back a touch in the yard
    this.camScale += ((zone?.outside ? WORLD.camYardPullback : 1) - this.camScale) * Math.min(1, 1.5 * dt);
    const pitch = THREE.MathUtils.degToRad(WORLD.camPitchDeg), dist = WORLD.camDistance * this.camScale;
    const horiz = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
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
    // ply stock: one stack per line, a sheet of height per sheet on the pallet
    o('plyPallet').parts.stocks.children.forEach((stack, col) => {
      const n = g.stock[CONFIG.jobs.types[col].id];
      stack.children.forEach((s, i) => { s.visible = i < n; });
    });
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
    hs.position.y = (hs.userData.baseY as number) + (ringing ? Math.abs(Math.sin(this.time * 20)) * 0.04 : 0);
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
    const plyTruck = g.truckOnApron;
    const courier = !!plyTruck || g.distractions.some(d => d.kind === 'courier');
    this.built.vehicles.truck.visible = courier;
    const bundles = this.built.vehicles.truck.userData.bundles as THREE.Group;
    const onTray = plyTruck ? (plyTruck.stage === 'waiting' ? 3 : plyTruck.bundles.length - (w.carrying === 'bundle' ? 1 : 0)) : 0;
    bundles.children.forEach((b, i) => { b.visible = i < onTray; });
    this.built.vehicles.ute.visible = !courier && w.utePresent;
    const mate = g.distractions.find(d => d.kind === 'friend');
    this.built.mate.visible = !!mate;
    if (mate) {
      this.built.mate.rotation.y = Math.sin(this.time * 2) * 0.3 + Math.PI * 0.1;
      // each mate always wears the same shirt
      const shirt = mateById(mate.mate)?.shirt;
      const body = this.built.mate.children[0] as THREE.Mesh;
      if (shirt !== undefined && (body.material as THREE.MeshToonMaterial).color.getHex() !== shirt) body.material = toon(shirt);
    }

    // fire and smoke
    const fire = g.fire;
    const smoke: 0 | 1 | 2 = fire ? 1 : g.machineDown ? 2 : 0;
    const flames: 0 | 1 | 2 = fire ? (fire.stage === 'duct' ? 2 : fire.minutes >= CONFIG.fire.smokeOnlyMinutes ? 1 : 0) : 0;
    const nozzle = g.spraying ? new THREE.Vector3(this.pos.x + w.fx * 0.3, 0.7, this.pos.z + w.fy * 0.3) : null;
    this.effects.update(dt, smoke, flames, nozzle);

    this.updateFlash(dt);

    // player
    this.player.setCarry(w.carrying);
    const held = g.heldCan;
    this.player.setCan(held ? (held.fill > 0 ? 'full' : 'empty') : null);
    this.updateCans();
    this.hud.setCanChip(held && g.phase === 'day' ? (held.fill > 0 ? 'Put the beer down' : 'Put the empty down') : null);
    this.player.setVisible(w.toiletUntil === null);
    this.player.update(dt, this.pos.x, this.pos.z, this.vel.x, this.vel.z);
  }

  private buildDebug() {
    const visible = this.debug.visible && this.started; // keep the overlay's state across a rebuild
    this.debug = new THREE.Group();
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
    this.debug.visible = visible;
    this.scene.add(this.debug);
  }

  /** Zone names for the debug overlay (DOM, made once). */
  private buildDebugLabels() {
    for (const z of ZONES) {
      const el = document.createElement('div');
      el.textContent = z.name;
      Object.assign(el.style, { position: 'absolute', transform: 'translate(-50%,-50%)', font: '11px monospace', color: '#00e5ff', background: '#000a', padding: '1px 3px', display: 'none' });
      this.hud.labels.appendChild(el);
      this.debugLabels.push({ el, at: new THREE.Vector3((z.rect.x + z.rect.w / 2) * C, 0.1, (z.rect.y + z.rect.h / 2) * C) });
    }
  }

  // ---------- wayfinding ----------

  /** A yellow frame on the floor around whatever you just walked to from the notepad. */
  private buildFlashRing() {
    this.flashRing = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 4; i++) this.flashRing.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), mat));
    this.flashRing.visible = false;
    this.scene.add(this.flashRing);
  }

  private updateFlash(dt: number) {
    const f = this.flash;
    if (!f) return;
    f.t += dt;
    const v = this.built.objects.get(f.id)!;
    const k = f.t / 1.2;
    if (k >= 1) { this.flash = null; this.flashRing.visible = false; v.group.scale.set(1, 1, 1); return; }
    const m = 0.18 + k * 0.25, b = v.box, w = b.maxX - b.minX + m * 2, d = b.maxZ - b.minZ + m * 2, t = 0.1;
    const [n, s, e, wst] = this.flashRing.children as THREE.Mesh[];
    n.scale.set(w, 1, t); n.position.set(0, 0, -d / 2);
    s.scale.set(w, 1, t); s.position.set(0, 0, d / 2);
    e.scale.set(t, 1, d); e.position.set(w / 2, 0, 0);
    wst.scale.set(t, 1, d); wst.position.set(-w / 2, 0, 0);
    this.flashRing.position.set((b.minX + b.maxX) / 2, 0.03, (b.minZ + b.maxZ) / 2);
    this.flashRing.visible = true;
    (n.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    const bounce = Math.sin(Math.min(1, f.t / 0.35) * Math.PI) * 0.1;
    v.group.scale.set(1 + bounce * 0.4, 1 + bounce, 1 + bounce * 0.4);
  }

  /** Dotted path along the walk we just planned (a notepad line was tapped). */
  private layTrail() {
    const p = this.path!;
    this.trail.set([{ x: this.pos.x, z: this.pos.z }, ...p.slice(this.pathIdx).map(c => ({ x: (c.x + 0.5) * C, z: (c.y + 0.5) * C }))]);
    this.trailPath = p;
  }

  /**
   * The notepad trail follows the walk (re-laid if it replans) and fades when the walk ends. On the
   * first day, when no walk is on, a trail points at the next tour stop and keeps up as you wander.
   */
  private updateTrail(dt: number) {
    if (this.trailPath) {
      if (!this.path) { this.trail.clear(); this.trailPath = null; }
      else if (this.path !== this.trailPath) this.layTrail();
    } else if (tourActive(this.w) && !this.paused && this.g.phase === 'day') {
      const next = TOUR.find(t => !this.w.tour!.visited.includes(t.id))?.id ?? null;
      this.guideT -= dt;
      const stale = next !== this.guideFor || (this.guideT <= 0 && (!this.trail.active || this.trail.offBy(this.pos.x, this.pos.z) > 1.2));
      if (next && stale) {
        this.guideFor = next; this.guideT = 0.6;
        const r = objectById(next).rect, ring: P[] = [];
        for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
          if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) ring.push({ x, y });
        }
        const found = this.inRange(next) ? null : findPath(COLS, ROWS, this.walkable, this.cell(), ring);
        if (found) this.trail.set([{ x: this.pos.x, z: this.pos.z }, ...smooth(this.walkable, found).slice(1).map(c => ({ x: (c.x + 0.5) * C, z: (c.y + 0.5) * C }))]);
        else this.trail.clear();
      }
    } else if (this.guideFor) { this.guideFor = null; this.trail.clear(); }
    this.trail.update(dt, this.pos.x, this.pos.z);
  }

  private say(text: string) { this.bubbleText = text; this.bubbleT = 1.6; }

  /** What you can do with a can lying about: pick it up, if your hands are free. */
  private canActions(id: number): Action[] {
    const g = this.g, w = this.w, c = g.cans.find(x => x.id === id);
    if (!c || c.held || g.heldCan || w.carrying !== null) return [];
    return [{ label: c.fill > 0 ? 'Pick up the beer' : 'Pick up the empty', done: c.fill > 0 ? 'Picked the beer back up' : 'Picked up an empty', run: () => {
      if (!g.pickUpCan(id)) return "Can't pick it up";
      delete w.canSpots![id];
    } }];
  }

  /** The can in your hand goes down at your feet, a little in front. */
  private putCanDown() {
    const c = this.g.putDownCan();
    if (!c) return;
    const w = this.w, side = (c.id % 3 - 1) * 0.12;
    (w.canSpots ??= {})[c.id] = { x: this.pos.x + w.fx * 0.3 - w.fy * side, z: this.pos.z + w.fy * 0.3 + w.fx * side };
  }

  /** A mesh per can that's been put down: standing if there's beer in it, on its side when it's empty. */
  private updateCans() {
    const g = this.g, w = this.w;
    const down = new Map(g.cans.filter(c => !c.held && w.canSpots?.[c.id]).map(c => [c.id, c]));
    for (const [id, m] of this.canMeshes) if (!down.has(id)) { this.scene.remove(m); this.canMeshes.delete(id); }
    for (const [id, c] of down) {
      let m = this.canMeshes.get(id);
      if (!m) {
        m = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 8), new THREE.MeshToonMaterial({ color: 0xc0281e, gradientMap: toonRamp() }));
        body.castShadow = true;
        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
        hitbox.position.y = 0.2;
        m.add(body, hitbox);
        m.userData.canId = id;
        this.scene.add(m);
        this.canMeshes.set(id, m);
      }
      const spot = w.canSpots![id];
      const body = m.children[0] as THREE.Mesh;
      const empty = c.fill <= 0;
      body.rotation.z = empty ? Math.PI / 2 : 0;
      body.position.y = empty ? 0.06 : 0.075;
      (body.material as THREE.MeshToonMaterial).color.setHex(empty ? 0x8a6a62 : c.warm ? 0xb05a3a : 0xc0281e);
      m.position.set(spot.x, 0, spot.z);
    }
  }

  /** "None left" over your head after reaching for ply that isn't there. */
  private updateBubble(dt: number) {
    this.bubbleT = Math.max(0, this.bubbleT - dt);
    const b = this.hud.bubble;
    if (this.bubbleT <= 0) { b.style.display = 'none'; return; }
    const p = this.project(new THREE.Vector3(this.pos.x, 1.35, this.pos.z));
    b.textContent = this.bubbleText;
    b.style.display = 'block';
    b.style.left = `${p.x.toFixed(1)}px`; b.style.top = `${p.y.toFixed(1)}px`;
  }

  /**
   * The mate's line over their head when they turn up (and again when you're close and haven't answered).
   * Before the fridge opens it gets a follow-up after a beat: too early for a beer, but got a sec?
   */
  private updateMateBubble() {
    const g = this.g, b = this.hud.mateBubble;
    const mate = g.phase === 'day' ? g.distractions.find(d => d.kind === 'friend') : undefined;
    if (!mate) { this.mateSeen = null; b.style.display = 'none'; return; }
    if (this.mateSeen?.id !== mate.id) this.mateSeen = { id: mate.id, at: this.time };
    const t = this.time - this.mateSeen.at;
    const close = Math.hypot(this.built.mate.position.x - this.pos.x, this.built.mate.position.z - this.pos.z) < 2.5;
    const early = !g.fridgeOpen;
    let text: string | null = null;
    if (t < 4) text = mate.line;
    else if (early && t < 8) text = TOO_EARLY;
    else if (close && !mate.engaged) text = early ? TOO_EARLY : mate.line;
    if (!text || this.paused) { b.style.display = 'none'; return; }
    const p = this.project(this.built.mate.position.clone().setY(1.4));
    if (b.textContent !== text) b.textContent = text;
    b.style.display = p.behind ? 'none' : 'block';
    // keep the whole bubble on screen, even when the mate's at the edge (their pointer shows where)
    const half = b.offsetWidth / 2 + 6;
    const x = Math.max(half, Math.min(VW - half, p.x)), y = Math.max(b.offsetHeight + 80, Math.min(VH - 20, p.y));
    b.style.left = `${x.toFixed(1)}px`; b.style.top = `${y.toFixed(1)}px`;
  }

  /** Crisp lettering over each doorway's sign (the 3D sign is only a few pixels at this resolution). */
  private buildSigns() {
    for (const d of this.built.doorways) {
      const el = document.createElement('div');
      el.className = 'sign';
      el.textContent = d.def.sign;
      el.style.display = 'none';
      this.hud.labels.appendChild(el);
      this.signEls.push(el);
    }
  }

  /** Signs show when they're on screen and near you; the office door glows while the phone rings. */
  private updateSigns(dt: number) {
    const show = this.g.phase === 'day' && !this.hud.summaryShowing;
    this.built.doorways.forEach((d, i) => {
      const el = this.signEls[i];
      const p = this.project(d.signAt);
      const near = Math.hypot(d.signAt.x - this.pos.x, d.signAt.z - this.pos.z) < 11;
      const vis = show && near && !p.behind && p.x > 10 && p.x < VW - 10 && p.y > 60 && p.y < VH - 10;
      el.style.display = vis ? 'block' : 'none';
      if (vis) { el.style.left = `${p.x.toFixed(1)}px`; el.style.top = `${p.y.toFixed(1)}px`; }
    });
    const ringing = this.g.phase === 'day' && this.g.distractions.some(d => d.kind === 'phone' || d.kind === 'bank');
    this.spillLevel += ((ringing ? 1 : 0) - this.spillLevel) * Math.min(1, 3 * dt);
    for (const d of this.built.doorways) {
      if (!d.spill) continue;
      const k = this.spillLevel * (ringOn(this.time) ? 1 : 0.8);
      d.spill.mesh.visible = k > 0.01;
      d.spill.mat.opacity = k * 0.9;
      if (d.spill.lamp) d.spill.lamp.intensity = k * 10;
    }
  }

  /** Small icons on the screen edge pointing at problems you can't see. */
  private updatePointers() {
    const g = this.g, w = this.w;
    const list: { key: string; icon: string; x: number; y: number; angle: number; ring: boolean }[] = [];
    if (g.phase === 'day' && !this.paused && !this.hud.summaryShowing) {
      const at = (id: ObjectId) => { const v = this.built.objects.get(id)!; return new THREE.Vector3(v.centre.x, v.def.height, v.centre.z); };
      const problems: { key: string; icon: string; pos: THREE.Vector3; ring?: boolean }[] = [];
      if (g.distractions.some(d => d.kind === 'phone' || d.kind === 'bank')) problems.push({ key: 'phone', icon: '📞', pos: at('phone'), ring: true });
      if (g.fire) problems.push({ key: 'fire', icon: '🔥', pos: at('exhaust') });
      if (g.truckOnApron || g.distractions.some(d => d.kind === 'courier')) problems.push({ key: 'truck', icon: '🚚', pos: this.built.vehicles.truck.position.clone().setY(1.5) });
      else if (w.utePresent) problems.push({ key: 'ute', icon: '🛻', pos: this.built.vehicles.ute.position.clone().setY(1.2) });
      if (g.distractions.some(d => d.kind === 'friend')) problems.push({ key: 'mate', icon: '🙋', pos: this.built.mate.position.clone().setY(1) });
      const cx = VW / 2, cy = VH / 2, minX = 26, maxX = VW - 26, minY = 112, maxY = VH - 64;
      for (const pb of problems) {
        const p = pb.pos.clone().project(this.camera);
        let sx = (p.x + 1) / 2 * VW, sy = (1 - p.y) / 2 * VH;
        const behind = p.z > 1;
        if (!behind && sx > 16 && sx < VW - 16 && sy > 70 && sy < VH - 16) continue; // on screen: no pointer
        let dx = sx - cx, dy = sy - cy;
        if (behind) { dx = -dx; dy = -dy; }
        if (!dx && !dy) dy = 1;
        // slide out from the centre along that direction until we hit the inset edge
        const k = Math.min(dx > 0 ? (maxX - cx) / dx : dx < 0 ? (minX - cx) / dx : Infinity, dy > 0 ? (maxY - cy) / dy : dy < 0 ? (minY - cy) / dy : Infinity);
        sx = cx + dx * k; sy = cy + dy * k;
        list.push({ key: pb.key, icon: pb.icon, x: sx, y: sy, angle: Math.atan2(dy, dx), ring: !!pb.ring && ringOn(this.time) });
      }
    }
    this.hud.setPointers(list);
  }

  /** The phone, heard from where you are: panned toward the office, quieter further away. */
  private updateRing() {
    const g = this.g;
    const ringing = g.phase === 'day' && !this.paused && !this.hud.summaryShowing && g.distractions.some(d => d.kind === 'phone' || d.kind === 'bank');
    const ph = this.built.objects.get('phone')!.centre;
    const dx = ph.x - this.pos.x, dz = ph.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const right = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) };
    const pan = (dx * right.x + dz * right.z) / dist;
    const volume = THREE.MathUtils.clamp(1 - dist / 32, 0.12, 1);
    this.ring.update(ringing, this.time, pan, volume);
  }
  get sound() { return this.ring.state; }

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
    window.dispatchEvent(new PointerEvent('pointerup'));
    return true;
  }
  get playerPos() { return { x: this.pos.x, z: this.pos.z, tile: this.cell(), zone: zoneAt(this.cell().x, this.cell().y)?.name ?? null }; }
  get walking() { return !!this.path; }
}
