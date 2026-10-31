// The walkable shed in Three.js. Drives the existing Game (src/sim) through its public methods —
// this file only decides where you are, what you see, and turns taps into Game calls.
// Portrait, one thumb: hold and drag on the lower half for the stick, tap a thing to walk to it and
// use it, hold on the exhaust unit (or its label) to spray. WASD + E on desktop.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { Hints } from '../ui/hints.js';
import { GesturePad } from '../ui/gesture.js';
import { Hud } from '../ui/hud.js';
import { renderDaySummary, renderWeekSummary } from '../ui/summary.js';
import { track } from '../analytics.js';
import { actionsFor, inspectorActions, inspectorStatus, statusFor, uiHooks, uteActions, visitorActions, visitorStatus, type Action } from '../world/interactables.js';
import { OrderCard } from '../ui/orderCard.js';
import { faultTarget } from '../world/fixes.js';
import { COLS, MACHINE_SPOT, OBJECTS, ROLLER_TILES, ROWS, START_TILE, T, ZONES, objectById, solidCells, zoneAt, type ObjectId } from '../world/layout.js';
import { findPath, smooth, type P } from '../world/pathfind.js';
import { writeSave } from '../world/save.js';
import { absMinute, HOOKS, hookThere, logEvent, onHook, startNewDay, type WorldState } from '../world/state.js';
import { TOUR, todoItems, tourActive } from '../world/todo.js';
import { mateById } from '../data/mates.js';
import { WORLD } from '../world/worldConfig.js';
import { buildWorld, toon, toonRamp, type BuiltWorld, type ObjectView } from './build.js';
import { moveAndSlide, type Box } from './collide.js';
import { Effects } from './effects.js';
import { Particles } from './particles.js';
import { ShedLighting } from './lighting.js';
import { Outline } from './outline.js';
import { VisitorWalker } from './visitor.js';
import { InspectorWalker } from './inspector.js';
import { PlayerView } from './player.js';
import { RingSound, ringOn } from './ring.js';
import { describeGpu, TIERS, type GpuInfo, type TierSettings } from './gpu.js';
import { perf } from './perf.js';
import { applyTextures, Sawdust, type SheetLooks } from './detail.js';
import { hideOverlay, showRendererFailure, showRestarting } from '../ui/failure.js';
import { Trail } from './trail.js';

const C = WORLD.cell;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

interface LabelEntry { id: string; el: HTMLDivElement; anchor: THREE.Vector3 }

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();       // rebuilt from state if the GPU context is lost and comes back
  readonly camera: THREE.PerspectiveCamera;
  private built!: BuiltWorld;
  private player!: PlayerView;
  private effects!: Effects;
  particles: Particles | null = null;    // mid/high tiers (public for tests)
  lighting: ShedLighting | null = null;
  outline: Outline | null = null;        // high tier: the ink line pass
  private outlineDropped = false;        // the frame-rate guard turned it off; it stays off
  private lastFault: string | null = null;
  private wasCutting = false;
  private spindleAt = new THREE.Vector3();
  private drawSize = new THREE.Vector2();
  private hud: Hud;
  private sun!: THREE.DirectionalLight;
  private tier: TierSettings;
  // the viewport in CSS px: the canvas fills it, the render is 1/3 of it, the HUD lays out in it
  private vw: number = WORLD.view.width;
  private vh: number = WORLD.view.height;
  private coverLeft = 0;           // px on the left covered by the pinned notepad (landscape)
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
  private thumb = { x: 0, y: 0 };       // where the last finger is (logical px): aims the extinguisher
  private sprayHeld = false;             // the trigger was down last frame
  private flareUntil = 0;                // the flames jump while a let-go fire flares back
  private aimEl!: HTMLDivElement;        // the aim mark over your thumb
  private sprayRing!: HTMLDivElement;    // how far through putting it out, round the glow

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
  /** The one-thumb gesture card for hands-on jobs (public for tests); `gestureAt`: the thing it's for (walk away and it closes). */
  gesture!: GesturePad;
  /** The yes/no card for an order call you've picked up (public for tests). */
  orderCard!: OrderCard;
  private gestureAt: string | null = null;
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
  /** The visiting mate's walking (where they go is Game's call). Public for tests. */
  readonly visitor: VisitorWalker;
  /** The council inspector's walking (a rare event). Public for tests. */
  readonly inspector: InspectorWalker;
  private rareSeen: { key: string; at: number } | null = null; // last rare-event phase seen, and when its cue last played

  /** `gpu`: what the device can do (gpu.ts); it picks the render tier. Throws if WebGL can't start at all. */
  constructor(private container: HTMLElement, private g: Game, public w: WorldState, resumePaused: boolean, readonly gpu: GpuInfo) {
    this.tier = TIERS[gpu.tier];
    this.renderer = new THREE.WebGLRenderer({ antialias: this.tier.antialias, powerPreference: this.tier.powerPreference });
    this.renderer.setPixelRatio(1);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    // the tier's resolution (or ?res=), as a multiple of the original 1/3; frames are timed against the tier's target
    this.resMult = gpu.resOverride ?? this.tier.resMult;
    perf.tier = gpu.tier; perf.targetMs = this.tier.targetMs;
    this.renderer.setSize(Math.round(this.vw * this.renderScale), Math.round(this.vh * this.renderScale), false);
    this.renderer.shadowMap.enabled = this.tier.shadows;
    this.renderer.shadowMap.type = this.tier.shadowType;
    // a shader that won't compile is a dead view, not just a console message
    this.renderer.debug.onShaderError = (gl, program) => this.fail(`shader program failed to link: ${gl.getProgramInfoLog(program) || 'no log'}`);
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '100dvw', height: '100dvh', imageRendering: 'pixelated', touchAction: 'none' });
    container.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', e => this.onContextLost(e));
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());

    this.camera = new THREE.PerspectiveCamera(WORLD.fov, this.vw / this.vh, 0.1, 120);
    this.solid = solidCells(); // solid objects and the big clutter
    this.visitor = new VisitorWalker(this.walkable);
    this.inspector = new InspectorWalker(this.walkable);
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
    this.gesture = new GesturePad(this.hud.labels.parentElement!);
    this.orderCard = new OrderCard(this.hud.labels.parentElement!);
    uiHooks.orderCard = (d, offer, take, decline) => this.orderCard.show(this.g, d, offer, !!decline.highlight, () => this.runAction(take), () => this.runAction(decline));
    this.aimEl = document.createElement('div'); this.aimEl.className = 'aim';
    this.sprayRing = document.createElement('div'); this.sprayRing.className = 'sprayring';
    this.hud.labels.append(this.aimEl, this.sprayRing);
    this.hud.setPaused(this.paused);
    this.hud.setMuted(this.ring.muted);
    if (gpu.tier === 'low' || gpu.tier === 'bare') this.hud.setTagNote(`${gpu.tier === 'bare' ? 'safe, no shadows' : 'safe'} (${gpu.why})`);
    else if (gpu.resOverride !== null) this.hud.setTagNote(`res ×${gpu.resOverride}`);
    this.buildDebugLabels();
    uiHooks.orderPly = () => this.hud.showPlyOrder(this.g, (t, n) => { if (this.g.orderPly(t, n)) { this.player.hop(); this.save(); } });
    this.buildSigns();

    this.fit();
    window.addEventListener('resize', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    screen.orientation?.addEventListener?.('change', () => this.fit());
    this.bindInput(canvas);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.setPaused(true); this.save(); } });
    window.addEventListener('pagehide', () => this.save());
    (window as unknown as { kirScene: World3D }).kirScene = this;
    requestAnimationFrame(t => this.frame(t));
  }

  /**
   * Fill the viewport, any shape. The render is always 1/3 of it, upscaled with chunky pixels. Portrait keeps
   * the vertical field of view; landscape locks the horizontal one instead, so the shed doesn't shrink.
   */
  private fit() {
    const aw = Math.max(1, window.innerWidth), ah = Math.max(1, window.innerHeight);
    this.vw = aw; this.vh = ah;
    const rw = Math.round(aw * this.renderScale), rh = Math.round(ah * this.renderScale);
    this.renderer.setSize(rw, rh, false);
    this.outline?.setSize(rw, rh);
    perf.size = `${rw}×${rh}`; perf.resMult = this.resMult;
    const aspect = aw / ah;
    this.camera.aspect = aspect;
    this.camera.fov = aspect <= 1 ? WORLD.fov
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(WORLD.landscapeHFov) / 2) / aspect));
    this.camera.updateProjectionMatrix();
    this.hud?.layout(aw, ah);
    this.coverLeft = -1; // re-apply the view offset next frame
  }

  /** In landscape the notepad sits pinned on the left: centre the view on the part of the screen that's left. */
  private updateViewOffset() {
    const cover = this.hud.coverLeft;
    if (cover === this.coverLeft) return;
    this.coverLeft = cover;
    if (cover > 0) this.camera.setViewOffset(this.vw, this.vh, -cover / 2, 0, this.vw, this.vh);
    else this.camera.clearViewOffset();
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
    const track = (e: PointerEvent) => { this.thumb = this.hud.toLogical(e.clientX, e.clientY); };
    window.addEventListener('pointerdown', track, true);
    window.addEventListener('pointermove', track, true);
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

  private ndc(lx: number, ly: number) { return new THREE.Vector2(lx / this.vw * 2 - 1, -(ly / this.vh * 2 - 1)); }

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

  /** Internal render resolution as a multiple of WORLD.renderScale: the tier's, or ?res=; stepped down if frames are slow. */
  private resMult = 1;
  /** Sheet materials by job type, when the tier has textures. */
  private looks: SheetLooks | null = null;
  /** Sawdust building up round the router and extractor (decals tier). Public for tests. */
  sawdust: Sawdust | null = null;
  private get renderScale() { return WORLD.renderScale * this.resMult; }
  private lastFrameAt = 0;
  private slowChecks = 0;

  /**
   * Hold the tier's frame rate: every couple of seconds look at the median frame time; slow twice running and the
   * resolution steps down (never below the original 1/3, never when ?res= is set). Logged for "Copy details".
   */
  private holdFrameRate(now: number) {
    if (this.lastFrameAt) perf.add(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (this.gpu.resOverride !== null || this.paused || document.hidden) return;
    const r = perf.recent;
    if (r.frames < 120) return;
    if (r.median > this.tier.targetMs * 1.2) {
      if (++this.slowChecks < 2) { perf.reset(); return; }
      const next = Math.max(1, Math.round(this.resMult * 0.8 * 100) / 100);
      if (next < this.resMult) {
        perf.stepDowns.push(`×${this.resMult.toFixed(2)}→×${next.toFixed(2)} at ${r.median.toFixed(1)} ms`);
        console.info(`[Keep It Running] frames at ${r.median.toFixed(1)} ms (target ${this.tier.targetMs.toFixed(1)}): resolution ×${this.resMult} → ×${next}`);
        this.resMult = next;
        this.fit();
      } else if (this.outline) {
        // already at the base resolution and still slow: the ink line's the next thing to go
        perf.stepDowns.push(`outline off at ${r.median.toFixed(1)} ms`);
        console.info(`[Keep It Running] frames at ${r.median.toFixed(1)} ms at base resolution: outline off`);
        this.outline.dispose();
        this.outline = null;
        this.outlineDropped = true;
      }
    }
    this.slowChecks = 0;
    perf.reset();
  }

  private frame(now: number) {
    if (this.failed) return; // the failure card is up: stop
    requestAnimationFrame(t => this.frame(t));
    this.holdFrameRate(now);
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
    this.updateVisitor(dt);
    this.updateRare(dt);
    this.updateTour();
    this.updateTrail(dt);
    this.updateViewOffset();
    this.updateCamera(dt);
    this.updateVisuals(dt);
    // a gesture card closes if you walk off from what it's for, or the day stops
    if (this.gesture.active && (this.paused || this.g.phase !== 'day'
      || (this.gestureAt && OBJECTS.some(o => o.id === this.gestureAt) && !this.inRange(this.gestureAt as ObjectId)))) { this.gesture.close(); this.gestureAt = null; }
    // the order card goes if they ring off (or the day's over)
    if (this.orderCard.showing && (this.paused || this.g.phase !== 'day' || !this.g.distractions.some(d => d.id === this.orderCard.callId))) this.orderCard.close();
    this.updateLabels();
    this.updatePointers();
    this.updateSigns(dt);
    this.updateBubble(dt);
    this.updateMateBubble();
    this.updateRing();
    if (!this.hud.summaryShowing) {
      this.hud.update(g, todoItems(g, w), w.done);
      // the first fault: follow the pointer to where it is (cleared on getting there); the first gesture card (cleared doing one)
      if (g.fault && this.inRange(faultTarget(g, w) ?? 'machine')) this.hints.mark('fault');
      const hint = this.hints.current ?? (this.gesture.active ? this.hints.when('gesture') : g.fault ? this.hints.when('fault') : null);
      this.hud.showHint(g.phase === 'day' && !this.paused && !this.hud.isOpen ? hint : null);
    }
    if (this.outline) this.outline.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  // ---------- renderer health ----------

  /** Everything in the 3D scene, built from the shed's data and the current state. Run again after a lost context. */
  private buildScene() {
    this.built = buildWorld(this.scene, this.tier.pointLights);
    this.outline?.dispose(); this.outline = null;
    if (this.tier.detail.outline && !this.outlineDropped) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.outline = new Outline(size.x, size.y);
    }
    // the tier's extra detail, on top of the plain world (the low tier gets none of it)
    this.looks = this.tier.detail.textures ? applyTextures(this.built, this.built.grid) : null;
    this.sawdust = this.tier.detail.decals ? new Sawdust(this.scene) : null;

    // light from the upper left, soft warm fill
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x7a6a52, 1.4);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = this.tier.shadows;
    this.sun.shadow.mapSize.set(this.tier.shadowMapSize, this.tier.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);
    const lit = this.tier.detail.lighting, door = this.built.objects.get('rollerDoor')!.def.rect;
    this.lighting = lit ? new ShedLighting(this.scene, lit, { x: door.x * WORLD.cell, z0: door.y * WORLD.cell, z1: (door.y + door.h) * WORLD.cell }, hemi, this.sun) : null;

    this.player = new PlayerView(this.scene);
    this.player.yaw = Math.atan2(-this.w.fx, -this.w.fy);
    const ex = this.built.objects.get('exhaust')!;
    this.effects = new Effects(this.scene, new THREE.Vector3(ex.centre.x, ex.def.height + 0.15, ex.centre.z), this.tier.pointLights);
    const lvl = this.tier.detail.particles;
    this.particles = lvl ? new Particles(this.scene, new THREE.Vector3(ex.centre.x, ex.def.height + 0.15, ex.centre.z), lvl) : null;
    this.lastFault = this.g.fault?.def.id ?? null; this.wasCutting = this.g.machine === 'cutting';
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

  private lastTracked = '';

  private showSummary() {
    this.save();
    const gt = this.g, key = `${gt.dayIndex}-${gt.phase}`;
    if (key !== this.lastTracked) { // the summary can re-render (purchases, resume); count each day/week once per page load
      this.lastTracked = key;
      const d = gt.today;
      const margin = d.revenue > 0 ? Math.round(((d.revenue - d.costs) / d.revenue) * 100) : 0;
      track(gt.phase === 'weekSummary' ? 'week_complete' : 'day_complete', { day: d.day, day_index: gt.dayIndex, cash: Math.round(gt.cash), revenue: Math.round(d.revenue), margin_pct: margin, in_debt: gt.cash < 0 });
    }
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
      else if (job.status === 'done') { w.bed = CONFIG.chores ? 'empty' : 'done'; w.clamps = 0; } // its boards join the pile at the bed's end
      else if (job.status === 'scrapped' && !g.fault) w.bed = 'scrap';
    }
    w.offcutBin = g.offcutBin; // the bin's Game's now (CONFIG.chore.offcuts)
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
    // …and while you carry a pickup out to the ute
    if (w.carrying === 'stack' && w.utePresent && w.rollerUpUntil !== null) w.rollerUpUntil = Math.max(w.rollerUpUntil, t + 2);
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

  /** The glow at the top of the exhaust unit, on screen (logical px). */
  sprayTarget() {
    const ex = this.built.objects.get('exhaust')!;
    const p = this.project(new THREE.Vector3(ex.centre.x, ex.def.height + 0.3, ex.centre.z));
    return { x: p.x, y: p.y, above: WORLD.sprayAimAbove * this.hud.unit, radius: WORLD.sprayAimRadius * this.hud.unit };
  }

  /**
   * Game puts a fire out only while its fire response is at the duct and spraying is held. With a thumb: hold the
   * label (or the unit) and drag so the aim mark above your thumb sits on the glow; it only counts while it's on.
   * Let go before it's out and it flares back up (Game.sprayLetGo). Desktop E sprays straight at it.
   */
  private updateSpray() {
    const g = this.g;
    const can = this.canSpray();
    const thumbDown = (this.labelHold || this.objectHold) && can;
    const want = can && (thumbDown || this.keys.has('e'));
    const t = this.sprayTarget();
    const aim = { x: this.thumb.x, y: this.thumb.y - t.above };
    const onTarget = thumbDown ? Math.hypot(aim.x - t.x, aim.y - t.y) <= t.radius : want;
    if (want) {
      if (g.fireResponse?.step !== 'atDuct') g.fireResponse = { step: 'atDuct', remaining: 0 };
      if (g.spraying !== onTarget) g.setSpraying(onTarget);
    } else {
      if (this.sprayHeld && g.fire && g.sprayLetGo()) { this.flareUntil = this.time + WORLD.sprayFlareSeconds; logEvent(this.w, 'Let go too soon: it flared back up'); }
      if (g.fireResponse?.step === 'atDuct') g.fireResponse = null;
      if (g.spraying) g.setSpraying(false);
    }
    this.sprayHeld = want && !!g.fire;
    // the aim mark, and a ring round the glow filling as it goes out
    this.aimEl.style.display = thumbDown ? 'block' : 'none';
    this.aimEl.classList.toggle('on', onTarget);
    if (thumbDown) { this.aimEl.style.left = `${aim.x}px`; this.aimEl.style.top = `${aim.y}px`; }
    const f = g.fire;
    this.sprayRing.style.display = can && f ? 'block' : 'none';
    if (can && f) {
      this.sprayRing.style.left = `${t.x}px`; this.sprayRing.style.top = `${t.y}px`;
      this.sprayRing.style.width = this.sprayRing.style.height = `${t.radius * 2}px`;
      this.sprayRing.style.setProperty('--p', String(Math.min(1, f.sprayed / CONFIG.fire.sprayMinutes[f.stage])));
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
        if (wanted) this.doAction(wanted, id);
        else if (runnable.length === 1) this.doAction(runnable[0], id);
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
  private get maxSpeed() { return WORLD.maxSpeed * this.g.walkMult() * (this.inOffcuts() ? WORLD.offcutPileWalkMult : 1); }
  /** Wading through a spilled heap of offcuts round the bin. */
  private inOffcuts() {
    if (this.g.offcutPile <= 0) return false;
    const b = this.built.objects.get('offcutBin')!.centre;
    return Math.hypot(this.pos.x - b.x, this.pos.z - b.z) <= WORLD.offcutPileReach;
  }
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

  /**
   * Do an action and always answer it: a hop, and a line in the notepad's recent events. A hands-on one opens its
   * gesture first and happens when that's done (a beer can spoil it: then it's done again). `at`: what it's on.
   */
  private doAction(a: Action, at?: string) {
    if (this.paused || this.g.phase !== 'day' || !a.run) return;
    if (a.twoHands && this.g.heldCan) this.putCanDown();
    if (a.gesture) {
      this.gestureAt = at ?? null;
      this.gesture.open(a.gesture, choice => { this.gestureAt = null; this.hints.mark('gesture'); this.runAction(a, choice); }, () => this.g.gestureFumbled(a.label.toLowerCase()),
        () => { this.gestureAt = null; this.labelSig = ''; }, a.onTap && (n => { a.onTap!(n); this.labelSig = ''; }));
      return;
    }
    this.runAction(a);
  }

  private runAction(a: Action, choice?: number) {
    if (this.paused || this.g.phase !== 'day' || !a.run) return;
    const before = todoItems(this.g, this.w);
    const said = a.run(choice) || a.done || a.label;
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
      if (a) { this.doAction(a, o.id); return; }
    }
  }

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.vw, y: (1 - p.y) / 2 * this.vh, behind: p.z > 1 };
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
    // the visiting mate, when they're beside you
    const mate = live ? g.distractions.find(d => d.kind === 'friend') : undefined;
    if (mate && Math.hypot(this.visitor.x - this.pos.x, this.visitor.z - this.pos.z) <= WORLD.visitorTalkRange) {
      entries.push({ id: `visitor-${mate.id}`, anchor: new THREE.Vector3(this.visitor.x, 1.75, this.visitor.z), acts: visitorActions(g, mate), status: visitorStatus(g, mate) });
    }
    // the council inspector, when you're beside them
    if (live && this.inspector.visible && Math.hypot(this.inspector.x - this.pos.x, this.inspector.z - this.pos.z) <= WORLD.visitorTalkRange) {
      entries.push({ id: 'inspector', anchor: new THREE.Vector3(this.inspector.x, 1.75, this.inspector.z), acts: inspectorActions(g), status: inspectorStatus(g) });
    }
    // the customer's ute, when you've carried the stack out to it
    const ute = this.built.vehicles.ute;
    if (live && ute.visible && w.carrying === 'stack' && Math.hypot(ute.position.x - this.pos.x, ute.position.z - this.pos.z) <= WORLD.uteReach) {
      entries.push({ id: 'ute', anchor: new THREE.Vector3(ute.position.x, 1.9, ute.position.z), acts: uteActions(g, w), status: null });
    }
    const shown = entries.filter(e => e.acts.length || e.status);
    const sig = JSON.stringify(shown.map(e => [e.id, e.acts.map(a => [a.label, !!a.highlight]), e.status, g.spraying]));
    // (never under a thumb that's holding the trigger: the button it pressed has to stay put)
    if (sig !== this.labelSig && !this.labelHold && !(this.labelPressed && this.time - this.labelPressedAt < 2)) {
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
          else if (a.highlight) b.className = 'hot';
          b.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation();
            this.labelPressed = true; this.labelPressedAt = this.time;
            if (a.hold) { this.labelHold = true; return; }
            this.doAction(a, id);
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
      l.el.style.left = `${Math.max(this.coverLeft + half, Math.min(this.vw - half, p.x))}px`;
      l.el.style.top = `${Math.max(l.el.offsetHeight + 8, 70, Math.min(this.vh - 10, p.y))}px`; // the whole stack on screen, short screens too
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
    if (this.looks) {
      // the sheet on the bed looks like what it is: formply, MDF or acrylic (or ruined)
      const job = g.current ?? (g.inHand !== null ? g.jobs.find(j => j.id === g.inHand) : undefined) ?? g.nextUp();
      (mp.sheet as THREE.Mesh).material = w.bed === 'scrap' ? this.looks.scrap : job ? this.looks.byType[job.type] : this.looks.plywood;
    } else ((mp.sheet as THREE.Mesh).material as THREE.MeshToonMaterial).color.setHex(w.bed === 'scrap' ? 0x9a5a4a : 0xd6bc8a);
    // the clamps that went on (all four once it's clamped), the finished boards piled at the end
    const clampsOn = w.bed === 'clamped' ? 4 : w.bed === 'placed' || w.bed === 'running' || w.bed === 'scrap' ? (w.clamps ?? 4) : w.bed === 'done' ? 4 : 0;
    mp.clamps.children.forEach((c, i) => { c.visible = i < clampsOn; });
    mp.pile.children.forEach((b, i) => { b.visible = i < g.bedPile; });
    const prog = g.current && w.bed === 'running' ? g.current.progress / g.current.cutMinutes : w.bed === 'done' ? 1 : 0;
    // a ruined sheet shows how: slid off square with a wobbling cut (clamps), or lifted at one end (the vacuum)
    const bedJob = w.bed === 'scrap' && w.bedJobId !== null ? g.jobs.find(j => j.id === w.bedJobId) : undefined;
    const how = bedJob?.ruinedBy;
    mp.sheet.position.z = how === 'shift' ? 0.28 : 0;
    mp.sheet.rotation.set(how === 'lift' ? 0.12 : 0, how === 'shift' ? 0.09 : 0, 0);
    mp.cut.visible = prog > 0.02 || !!how;
    mp.cut.scale.x = Math.max(0.02, how ? 0.55 : prog);
    mp.cut.rotation.y = how === 'shift' ? Math.sin(this.time * 3) * 0.06 + 0.09 : 0;
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
    // sawdust round the machines: builds up as the bag fills, gone when it's changed
    this.sawdust?.update(1 - g.wear.filter);

    // pallets, bin
    // ply stock: one stack per line, a sheet of height per sheet on the pallet
    o('plyPallet').parts.stocks.children.forEach((stack, col) => {
      const n = g.stock[CONFIG.jobs.types[col].id];
      stack.children.forEach((s, i) => { s.visible = i < n; });
    });
    o('finishedPallet').parts.stack.children.forEach((s, i) => { s.visible = i < w.finishedStack && w.carrying !== 'stack'; }); // in your arms on the way to the ute
    const binFill = o('offcutBin').parts.fill;
    binFill.scale.y = Math.max(0.001, g.offcutBin);
    const heap = o('offcutBin').parts.heap;
    heap.visible = g.offcutPile > 0;
    heap.children.forEach((p, i) => { p.visible = i < g.offcutPile; });
    // extinguishers on their hooks
    for (const h of HOOKS) {
      o(h.id).group.visible = hookThere(g, h.hook);
      o(h.id).parts.can.visible = onHook(g, w, h.hook);
    }
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
    // a ute's clipped it (a rare event): the door hangs crooked and the busted slats pile up inside
    door.rotation.z = g.dockBlocked ? 0.12 : 0;
    this.built.debris.visible = g.dockBlocked || w.carrying === 'debris';
    this.built.debris.children.forEach((stack, i) => { stack.visible = g.dockBlocked && i < (g.rare!.tripsLeft ?? 0); });
    // milestones: the spark arrestor on the extractor, the second bit rack
    o('extractor').parts.arrestor.visible = g.hasMilestone('sparkArrestor');
    o('bitRack').parts.second.visible = g.hasMilestone('secondBitRack');
    // exhaust fan spins while cutting
    if (g.machine === 'cutting') o('exhaust').parts.fan.rotation.y += dt * 12;

    // vehicles and the mate
    const plyTruck = g.truckOnApron;
    const courier = !!plyTruck || g.distractions.some(d => d.kind === 'courier');
    this.built.vehicles.truck.visible = courier;
    const bundles = this.built.vehicles.truck.userData.bundles as THREE.Group;
    const onTray = plyTruck ? (plyTruck.stage === 'waiting' ? 3 : plyTruck.bundles.length - (w.carrying === 'bundle' ? 1 : 0)) : 0;
    bundles.children.forEach((b, i) => { b.visible = i < onTray; });
    // the ute that's about to clip the door (a rare event): backing up the apron toward it through the tell
    const ute = this.built.vehicles.ute;
    ute.userData.home ??= ute.position.clone();
    const reversing = g.rare?.id === 'uteClip' && g.rare.phase === 'tell';
    if (reversing) {
      const tell = Math.ceil(CONFIG.rareEvent.events.find(e => e.id === 'uteClip')!.tell.seconds * 1000 / CONFIG.clock.realMsPerGameMinute);
      const k = THREE.MathUtils.clamp(1 - (g.rare!.at - g.minute) / tell, 0, 1);
      const home = ute.userData.home as THREE.Vector3, door = o('rollerDoor').centre;
      ute.position.set(THREE.MathUtils.lerp(home.x, door.x + 2.2, k), 0, THREE.MathUtils.lerp(home.z, door.z, k));
      ute.rotation.y = Math.PI / 2;
    } else { ute.position.copy(ute.userData.home as THREE.Vector3); ute.rotation.y = 0; }
    ute.visible = reversing || (!courier && w.utePresent);
    // the council inspector
    const ins = this.built.inspector;
    ins.visible = this.inspector.visible;
    ins.position.set(this.inspector.x, 0, this.inspector.z);
    ins.rotation.y = this.inspector.facing;
    const mate = g.distractions.find(d => d.kind === 'friend');
    this.built.mate.visible = !!mate;
    if (mate) {
      const v = this.visitor;
      this.built.mate.position.set(v.x, 0, v.z);
      // facing where they're going; when they've stopped to talk to you, facing you
      const talking = (!!mate.ask || mate.engaged) && !v.walking;
      this.built.mate.rotation.y = talking ? Math.atan2(-(this.pos.x - v.x), -(this.pos.z - v.z)) + Math.sin(this.time * 2) * 0.15 : v.facing;
      // each mate always wears the same shirt
      const shirt = mateById(mate.mate)?.shirt;
      const body = this.built.mate.children[0] as THREE.Mesh;
      if (shirt !== undefined && (body.material as THREE.MeshToonMaterial).color.getHex() !== shirt) body.material = toon(shirt);
    }

    // fire and smoke
    const fire = g.fire;
    const smoke: 0 | 1 | 2 = fire ? 1 : g.machineDown ? 2 : 0;
    const flames: 0 | 1 | 2 = fire ? (fire.stage === 'duct' ? 2 : fire.lesson || fire.minutes >= CONFIG.fire.smokeOnlyMinutes ? 1 : 0) : 0;
    const nozzle = g.spraying ? new THREE.Vector3(this.pos.x + w.fx * 0.3, 0.7, this.pos.z + w.fy * 0.3) : null;
    // a fire let go too soon jumps up for a moment
    this.effects.update(dt, smoke, flames === 1 && this.time < this.flareUntil ? 2 : flames, nozzle);
    this.lighting?.update(dt, (o('rollerDoor').parts.door.userData.open as number | undefined) ?? 0, flames, this.camera, this.pos);
    if (this.particles) {
      // sparks when a bit-related fault starts (the bit's chipping or let go), a puff when a cut starts
      const faultId = g.fault?.def.id ?? null;
      const bitBreak = faultId !== null && faultId !== this.lastFault && g.fault!.def.consumable === 'bit';
      const cutting = g.machine === 'cutting';
      const head = mp.gantry.children[1];
      head.getWorldPosition(this.spindleAt); this.spindleAt.y -= 0.15;
      this.renderer.getDrawingBufferSize(this.drawSize);
      this.particles.update(dt, { flames, bitBreak, cutStart: cutting && !this.wasCutting, cutting, spindle: this.spindleAt }, this.drawSize.y / 2);
      this.lastFault = faultId; this.wasCutting = cutting;
    }

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

  /** What the visiting mate's come up to say, over their head until you answer (or they give up and start yarning). */
  private updateMateBubble() {
    const g = this.g, b = this.hud.mateBubble;
    const mate = g.phase === 'day' ? g.distractions.find(d => d.kind === 'friend') : undefined;
    const text = mate?.ask?.text;
    if (!text || this.paused) { b.style.display = 'none'; return; }
    const p = this.project(this.built.mate.position.clone().setY(1.4));
    if (b.textContent !== text) b.textContent = text;
    b.style.display = p.behind ? 'none' : 'block';
    // keep the whole bubble on screen, even when the mate's at the edge (their pointer shows where)
    const half = b.offsetWidth / 2 + 6;
    const x = Math.max(this.coverLeft + half, Math.min(this.vw - half, p.x)), y = Math.max(b.offsetHeight + 80, Math.min(this.vh - 20, p.y));
    b.style.left = `${x.toFixed(1)}px`; b.style.top = `${y.toFixed(1)}px`;
  }

  /** Walk the visiting mate: Game says where they want to be; they keep out of your way. */
  private updateVisitor(dt: number) {
    const mate = this.g.phase === 'day' ? this.g.distractions.find(d => d.kind === 'friend') : undefined;
    let route: { x: number; z: number }[] = [];
    if (this.path) route = this.path.slice(this.pathIdx).map(t => ({ x: (t.x + 0.5) * C, z: (t.y + 0.5) * C }));
    else if (Math.hypot(this.vel.x, this.vel.z) > 0.3) route = [{ x: this.pos.x + this.vel.x * 0.6, z: this.pos.z + this.vel.z * 0.6 }]; // on the stick: just ahead
    this.visitor.update(this.paused ? 0 : dt, this.time, mate, { x: this.pos.x, z: this.pos.z, route });
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
      const vis = show && near && !p.behind && p.x > 10 && p.x < this.vw - 10 && p.y > 60 && p.y < this.vh - 10;
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
      // a fault points where it needs you next: the extractor, the bit rack, the skip — not just the machine
      const ft = faultTarget(g, w);
      if (ft) problems.push({ key: 'fault', icon: '🔧', pos: at(ft) });
      if (g.truckOnApron || g.distractions.some(d => d.kind === 'courier')) problems.push({ key: 'truck', icon: '🚚', pos: this.built.vehicles.truck.position.clone().setY(1.5) });
      else if (w.utePresent) problems.push({ key: 'ute', icon: '🛻', pos: this.built.vehicles.ute.position.clone().setY(1.2) });
      if (g.distractions.some(d => d.kind === 'friend' && d.ask)) problems.push({ key: 'mate', icon: '🙋', pos: this.built.mate.position.clone().setY(1) });
      // today's rare event: its tell, then where it's waiting for you
      const r = g.rare;
      if (r?.phase === 'tell') problems.push({ key: 'rare', icon: r.id === 'council' ? '📋' : r.id === 'bigJob' ? '💼' : '🛻', pos: at(r.id === 'bigJob' ? 'phone' : 'rollerDoor'), ring: true });
      else if (g.inspectorWaiting) problems.push({ key: 'rare', icon: '📋', pos: this.built.inspector.position.clone().setY(1.2) });
      else if (g.dockBlocked) problems.push({ key: 'rare', icon: '🚧', pos: at('rollerDoor') });
      const left = Math.max(0, this.coverLeft), u = this.hud.unit;
      const cx = (left + this.vw) / 2, cy = this.vh / 2, minX = left + 26 * u, maxX = this.vw - 26 * u, minY = 130 * u, maxY = this.vh - 70 * u;
      for (const pb of problems) {
        const p = pb.pos.clone().project(this.camera);
        let sx = (p.x + 1) / 2 * this.vw, sy = (1 - p.y) / 2 * this.vh;
        const behind = p.z > 1;
        if (!behind && sx > left + 16 && sx < this.vw - 16 && sy > 70 && sy < this.vh - 16) continue; // on screen: no pointer
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

  /**
   * Today's rare event, in the shed: the inspector on foot (the walk-round counts while you're with them), the wall
   * extinguisher's state for the inspection, and the cues — heard every couple of seconds through the tell, and once
   * as it lands (a crunch for the ute).
   */
  private updateRare(dt: number) {
    const g = this.g, w = this.w;
    g.extinguisherAway = w.hooks.wall === false;
    this.inspector.update(this.paused ? 0 : dt, g, { x: this.pos.x, z: this.pos.z });
    const r = g.phase === 'day' && !this.paused ? g.rare : null;
    const key = r ? `${r.id}:${r.phase}` : '';
    if (!r || (r.phase !== 'tell' && r.phase !== 'live')) { this.rareSeen = r ? { key, at: this.time } : null; return; }
    const landed = r.phase === 'live' && this.rareSeen?.key !== key;
    const kind = r.id === 'council' ? 'knock' : r.id === 'bigJob' ? 'buzz' : 'beeper';
    const every = r.id === 'uteClip' ? 1 : 2.5;
    let play: 'knock' | 'buzz' | 'beeper' | 'crunch' | null = null;
    if (landed) play = r.id === 'uteClip' ? 'crunch' : r.id === 'council' ? 'knock' : null;
    else if (r.phase === 'tell' && (this.rareSeen?.key !== key || this.time - this.rareSeen.at >= every)) play = kind;
    if (this.rareSeen?.key !== key || play) this.rareSeen = { key, at: this.time };
    if (!play) return;
    const src = this.built.objects.get(r.id === 'bigJob' ? 'phone' : 'rollerDoor')!.centre;
    const dx = src.x - this.pos.x, dz = src.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const pan = (dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw)) / dist;
    this.ring.cue(play, pan, THREE.MathUtils.clamp(1 - dist / 32, 0.15, 1));
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
    // the compressor, hissing away: its pitch drops as water builds up in the tank
    const h = WORLD.hiss, cp = this.built.objects.get('compressor')!.centre;
    const cx = cp.x - this.pos.x, cz = cp.z - this.pos.z, cd = Math.hypot(cx, cz) || 1;
    const freq = g.compressorDue ? h.due : h.high - h.perSheet * g.compressorSheets;
    const live = g.phase === 'day' && !this.paused && !this.hud.summaryShowing;
    this.ring.hiss(freq, live ? h.volume * THREE.MathUtils.clamp(1 - cd / h.reach, 0.1, 1) : 0, (cx * right.x + cz * right.z) / cd);
  }
  /** For tests: the compressor's hiss now. */
  get hissNow() { return this.ring.hissNow; }
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
    const p = this.project(new THREE.Vector3(x, y, z));
    return { x: p.x, y: p.y }; // the canvas fills the viewport: its px are CSS px
  }
  screenOf(id: ObjectId) { const v = this.built.objects.get(id)!; return this.screenOfPoint(v.centre.x, v.def.height * 0.6, v.centre.z); }
  onScreen(id: ObjectId) {
    const v = this.built.objects.get(id)!, p = this.project(new THREE.Vector3(v.centre.x, v.def.height * 0.6, v.centre.z));
    return !p.behind && p.x > 20 && p.x < this.vw - 20 && p.y > 90 && p.y < this.vh - 20;
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
