// The walkable shed. Drives the existing Game (src/sim) — this scene only decides where you are and
// turns taps into Game calls; it never touches balance. Portrait, one thumb: tap the floor to walk,
// tap a thing to walk to it and use it, hold on the exhaust unit to spray. WASD + E on desktop.
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { Hud } from '../ui/hud.js';
import { actionsFor, statusFor, type Action } from '../world/interactables.js';
import {
  buildGrid, COLS, OBJECTS, ROLLER_TILES, ROWS, T, TILE_COLOURS, ZONES, objectById, type ObjectId, type PlacedObject, type Rect,
} from '../world/layout.js';
import { findPath, smooth, type P } from '../world/pathfind.js';
import { writeSave } from '../world/save.js';
import { absMinute, newWorld, startNewDay, type Carry, type WorldState } from '../world/state.js';
import { todoItems } from '../world/todo.js';
import { WORLD } from '../world/worldConfig.js';

const TS = WORLD.tile;
const px = (r: Rect) => ({ x: r.x * TS, y: r.y * TS, w: r.w * TS, h: r.h * TS });
/** Drawn every frame instead of once, because they move or come and go. */
const DYNAMIC: ObjectId[] = ['phone', 'extinguisher', 'spareExtinguisher', 'rollerDoor', 'duct'];
const CARRY_LOOK: Record<Carry, { colour: number; text: string }> = {
  sheet: { colour: 0xcdb28a, text: 'sheet' }, cut: { colour: 0xe6d3a8, text: 'cut sheet' }, scrap: { colour: 0x9a5a4a, text: 'scrap' },
  extinguisher: { colour: 0xc0281e, text: 'extinguisher' }, bag: { colour: 0xb8b09a, text: 'full bag' }, offcuts: { colour: 0x8a7a5a, text: 'offcuts' },
};

export class WorldScene extends Phaser.Scene {
  private g!: Game;
  private w!: WorldState;
  private grid!: number[][];
  private solid = new Set<number>();
  private player!: Phaser.GameObjects.Arc;
  private body_!: Phaser.Physics.Arcade.Body;
  private rollerBody!: Phaser.GameObjects.Zone;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private solids: Phaser.GameObjects.Zone[] = [];
  private path: P[] | null = null;
  private pathIdx = 0;
  private pending: { id: ObjectId; act: boolean } | null = null;
  private stuck = { t: 0, x: 0, y: 0, replans: 0 };
  private hud!: Hud;
  private paused = false;
  private acc = 0;
  private lastReal = 0;
  private dyn!: Phaser.GameObjects.Graphics;
  private dust!: Phaser.GameObjects.Graphics;
  private dustLevel = -1;
  private smoke: Phaser.GameObjects.Arc[] = [];
  private glow!: Phaser.GameObjects.Arc;
  private carryText!: Phaser.GameObjects.Text;
  private mateText!: Phaser.GameObjects.Text;
  private vehicleText!: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private labelSig = '';
  private labelHold = false;
  private objectHold = false;
  private debug!: Phaser.GameObjects.Container;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'E', Phaser.Input.Keyboard.Key>;
  private onVisibility = () => { if (document.hidden) { this.setPaused(true); this.save(); } };
  private onPageHide = () => this.save();

  constructor() { super('world'); }

  create() {
    this.g = this.registry.get('game') as Game;
    this.w = (this.registry.get('world') as WorldState | undefined) ?? newWorld(this.g);
    this.registry.set('world', this.w);
    if (this.w.dayIndex !== this.g.dayIndex) startNewDay(this.w, this.g);
    this.paused = !!this.registry.get('resumePaused');
    this.registry.set('resumePaused', false);
    this.labels = []; this.labelSig = ''; this.path = null; this.pending = null; this.smoke = []; this.dustLevel = -1;

    this.buildMap();
    this.buildPlayer();
    this.buildEffects();
    this.buildDebug();
    this.buildInput();

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x1d1a17);
    cam.setBounds(0, 0, COLS * TS, ROWS * TS);
    cam.setZoom(WORLD.zoom);
    cam.startFollow(this.player, false, WORLD.cameraLerp, WORLD.cameraLerp);

    this.hud = new Hud(this.game.canvas, {
      goTo: id => this.goTo(id, true),
      togglePause: () => this.setPaused(!this.paused),
      knockOff: () => { this.g.knockOff(); this.hud.hideEndOfDay(); },
      overtime: () => { this.g.startOvertime(); this.hud.hideEndOfDay(); this.save(); },
    });
    this.hud.setPaused(this.paused);
    this.scale.on('resize', () => this.hud.layout());
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy();
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.onPageHide);
    });
    this.lastReal = 0;
    this.acc = 0;
    (window as unknown as { kirScene: WorldScene }).kirScene = this;
  }

  // ---------- building ----------

  private buildMap() {
    this.grid = buildGrid();
    this.solid.clear();
    for (const o of OBJECTS) if (o.solid) for (let y = o.rect.y; y < o.rect.y + o.rect.h; y++) for (let x = o.rect.x; x < o.rect.x + o.rect.w; x++) this.solid.add(y * COLS + x);

    if (!this.textures.exists('kir-tiles')) {
      const n = Math.max(...Object.keys(TILE_COLOURS).map(Number)) + 1;
      const tex = this.textures.createCanvas('kir-tiles', n * TS, TS)!;
      const ctx = tex.getContext();
      for (let i = 0; i < n; i++) {
        const c = Phaser.Display.Color.IntegerToColor(TILE_COLOURS[i] ?? 0xff00ff);
        ctx.fillStyle = c.rgba;
        ctx.fillRect(i * TS, 0, TS, TS);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.strokeRect(i * TS + 0.5, 0.5, TS - 1, TS - 1);
      }
      tex.refresh();
    }
    const map = this.make.tilemap({ data: this.grid, tileWidth: TS, tileHeight: TS });
    const tileset = map.addTilesetImage('kir-tiles', 'kir-tiles', TS, TS, 0, 0)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision([T.WALL]);
    this.physics.world.setBounds(0, 0, COLS * TS, ROWS * TS);

    // furniture: placeholder blocks with names
    const g = this.add.graphics().setDepth(1);
    const solids: Phaser.GameObjects.Zone[] = [];
    for (const o of OBJECTS) {
      const r = px(o.rect);
      if (!DYNAMIC.includes(o.id)) {
        g.fillStyle(o.colour, 1).fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        g.lineStyle(2, 0x000000, 0.35).strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      }
      this.add.text(r.x + r.w / 2, r.y + r.h / 2, o.name, { fontFamily: 'Courier New, monospace', fontSize: '11px', color: '#f4ecd2', align: 'center', wordWrap: { width: Math.max(r.w, 70) } })
        .setOrigin(0.5).setDepth(5).setAlpha(0.8);
      if (o.solid) {
        const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
        this.physics.add.existing(z, true);
        solids.push(z);
      }
    }
    const roller = { x: ROLLER_TILES[0].x * TS, y: ROLLER_TILES[0].y * TS, w: ROLLER_TILES.length * TS, h: TS };
    this.rollerBody = this.add.zone(roller.x + roller.w / 2, roller.y + roller.h / 2, roller.w, roller.h);
    this.physics.add.existing(this.rollerBody, true);
    this.solids = solids;
    this.layer = layer;
  }

  private buildPlayer() {
    this.player = this.add.circle(this.w.px, this.w.py, WORLD.playerRadius, 0xf2c76b).setDepth(6).setStrokeStyle(2, 0x2a1d12);
    this.physics.add.existing(this.player);
    this.body_ = this.player.body as Phaser.Physics.Arcade.Body;
    this.body_.setCircle(WORLD.playerRadius);
    this.body_.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.rollerBody);
    this.carryText = this.add.text(0, 0, '', { fontFamily: 'Courier New, monospace', fontSize: '11px', color: '#efe6d8', backgroundColor: '#00000088' })
      .setOrigin(0.5, 1).setDepth(7);
  }

  private buildEffects() {
    this.dyn = this.add.graphics().setDepth(2);
    this.dust = this.add.graphics().setDepth(1.5);
    const ex = px(objectById('exhaust').rect);
    const top = { x: ex.x + ex.w / 2, y: ex.y };
    this.glow = this.add.circle(top.x, top.y + ex.h / 2, 12, 0xff8a1f).setDepth(8).setVisible(false);
    this.tweens.add({ targets: this.glow, alpha: { from: 0.9, to: 0.35 }, duration: 260, yoyo: true, repeat: -1 });
    for (let i = 0; i < 4; i++) {
      const puff = this.add.circle(top.x, top.y, 7, 0x9a948c, 0.7).setDepth(8).setVisible(false);
      this.tweens.add({ targets: puff, y: top.y - 60, x: top.x + (i - 1.5) * 10, scale: { from: 0.6, to: 2.2 }, alpha: { from: 0.75, to: 0 },
        duration: 1600, delay: i * 400, repeat: -1 });
      this.smoke.push(puff);
    }
    this.mateText = this.add.text(0, 0, '', { fontFamily: 'Courier New, monospace', fontSize: '11px', color: '#efe6d8' }).setOrigin(0.5, 1).setDepth(7);
    this.vehicleText = this.add.text(0, 0, '', { fontFamily: 'Courier New, monospace', fontSize: '12px', color: '#efe6d8' }).setOrigin(0.5).setDepth(7);
  }

  private buildDebug() {
    this.debug = this.add.container(0, 0).setDepth(20).setVisible(false);
    const gfx = this.add.graphics();
    this.debug.add(gfx);
    for (const z of ZONES) {
      const r = px(z.rect);
      gfx.lineStyle(2, 0x00e5ff, 0.8).strokeRect(r.x, r.y, r.w, r.h);
      this.debug.add(this.add.text(r.x + 4, r.y + 4, z.name, { fontFamily: 'monospace', fontSize: '13px', color: '#00e5ff', backgroundColor: '#000000aa' }));
    }
    for (const o of OBJECTS) {
      const r = px(o.rect), m = WORLD.interactRange;
      gfx.lineStyle(1, 0xff3bd4, 0.8).strokeRoundedRect(r.x - m, r.y - m, r.w + 2 * m, r.h + 2 * m, m);
    }
  }

  private buildInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as typeof this.keys;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (e.key === '`') this.debug.setVisible(!this.debug.visible);
      if (e.key === ' ') this.setPaused(!this.paused);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.some(o => o.getData('label'))) return;
      if (this.paused || this.g.phase !== 'day') return;
      const obj = this.objectAt(p.worldX, p.worldY);
      if (obj) {
        if ((obj.id === 'exhaust' || obj.id === 'duct') && this.canSpray()) { this.objectHold = true; return; }
        this.goTo(obj.id, true);
        return;
      }
      // the truck and ute park on the apron: tapping them means the roller door
      if (this.onApronVehicle(p.worldX, p.worldY)) { this.goTo('rollerDoor', true); return; }
      this.walkToPoint(p.worldX, p.worldY);
    });
    const release = () => { this.labelHold = false; this.objectHold = false; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  // ---------- frame ----------

  update() {
    const g = this.g, w = this.w;
    if (g.phase === 'daySummary' || g.phase === 'weekSummary') {
      this.save();
      this.scene.start(g.phase);
      return;
    }
    if (w.dayIndex !== g.dayIndex) { startNewDay(w, g); this.player.setPosition(w.px, w.py); this.body_.reset(w.px, w.py); this.stopWalking(); }

    if (g.phase === 'endOfDayPrompt') { if (!this.hud.endOfDayShowing) this.hud.showEndOfDay(g); }
    else if (this.hud.endOfDayShowing) this.hud.hideEndOfDay();

    this.updateSpray();

    // the clock: one game minute per CONFIG.clock.realMsPerGameMinute of real time, never while paused or hidden
    const now = performance.now();
    const dt = this.lastReal ? Math.min(now - this.lastReal, CONFIG.clock.realMsPerGameMinute * 5) : 0;
    this.lastReal = now;
    if (g.phase === 'day' && !this.paused) {
      this.acc += dt;
      let ticked = false;
      while (this.acc >= CONFIG.clock.realMsPerGameMinute && g.phase === 'day') {
        this.acc -= CONFIG.clock.realMsPerGameMinute;
        g.tick();
        ticked = true;
      }
      if (ticked) { this.syncWorld(); this.save(); }
    }
    this.syncWorld();
    this.move();
    this.updateLabels();
    this.draw();
    this.hud.update(g, todoItems(g, w), w.done);
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
    if (g.today.sheetsDone > w.sheetsSeen) {
      w.offcutBin = Math.min(1, w.offcutBin + (g.today.sheetsDone - w.sheetsSeen) * WORLD.offcutsPerSheet);
    }
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
    (this.rollerBody.body as Phaser.Physics.Arcade.StaticBody).enable = w.rollerUpUntil === null;
  }

  private canSpray() {
    return this.w.carrying === 'extinguisher' && !!this.g.fire && this.inRange('exhaust') && !this.paused && this.g.phase === 'day';
  }

  /** Spraying: Game puts fires out only while its fire response is at the duct and spraying is held. */
  private updateSpray() {
    const g = this.g;
    const want = (this.labelHold || this.objectHold || this.keys.E.isDown) && this.canSpray();
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
    const t = this.grid[y][x];
    if (t === T.WALL) return false;
    if (t === T.ROLLER && this.w.rollerUpUntil === null) return false;
    return !this.solid.has(y * COLS + x);
  };

  private move() {
    const g = this.g, w = this.w, b = this.body_;
    const frozen = this.paused || g.phase !== 'day' || g.busy !== null || w.toiletUntil !== null || this.hud.endOfDayShowing;
    if (frozen) { b.setVelocity(0, 0); this.syncPos(); return; }

    const k = this.keys;
    let kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (kx || ky) {
      this.stopWalking();
      const n = Math.hypot(kx, ky); kx /= n; ky /= n;
      b.setVelocity(kx * WORLD.playerSpeed, ky * WORLD.playerSpeed);
    } else if (this.path) {
      this.followPath();
    } else {
      b.setVelocity(0, 0);
    }
    if (Phaser.Input.Keyboard.JustDown(k.E)) this.useNearest();

    if (this.pending && this.inRange(this.pending.id)) {
      const { id, act } = this.pending;
      this.stopWalking();
      if (act) {
        const runnable = actionsFor(id, g, w).filter(a => a.run && a.auto !== false);
        if (runnable.length === 1) this.doAction(runnable[0]);
      }
    }
    const v = b.velocity;
    if (v.lengthSq() > 100) { const n = v.length(); w.fx = v.x / n; w.fy = v.y / n; }
    this.syncPos();
    const cam = this.cameras.main;
    cam.followOffset.x += (-w.fx * WORLD.cameraLead - cam.followOffset.x) * 0.08;
    cam.followOffset.y += (-w.fy * WORLD.cameraLead - cam.followOffset.y) * 0.08;
  }

  private syncPos() { this.w.px = this.player.x; this.w.py = this.player.y; }

  private followPath() {
    const b = this.body_;
    const p = this.path!;
    const target = { x: (p[this.pathIdx].x + 0.5) * TS, y: (p[this.pathIdx].y + 0.5) * TS };
    const dx = target.x - this.player.x, dy = target.y - this.player.y, d = Math.hypot(dx, dy);
    if (d < 6) {
      this.pathIdx++;
      if (this.pathIdx >= p.length) { this.path = null; b.setVelocity(0, 0); if (this.pending && !this.inRange(this.pending.id)) this.pending = null; }
      return;
    }
    b.setVelocity(dx / d * WORLD.playerSpeed, dy / d * WORLD.playerSpeed);
    // stuck on a corner: replan once from here, then give up
    const now = this.time.now;
    if (now - this.stuck.t > 500) {
      if (Math.hypot(this.player.x - this.stuck.x, this.player.y - this.stuck.y) < 4) {
        if (this.stuck.replans++ < 2) this.replan(); else { this.stopWalking(); }
      }
      this.stuck.t = now; this.stuck.x = this.player.x; this.stuck.y = this.player.y;
    }
  }

  private stopWalking() { this.path = null; this.pending = null; this.body_?.setVelocity(0, 0); }

  private playerTile(): P { return { x: Math.floor(this.player.x / TS), y: Math.floor(this.player.y / TS) }; }

  private goal: P[] = [];
  private planTo(goals: P[]): boolean {
    this.goal = goals;
    const found = findPath(COLS, ROWS, this.walkable, this.playerTile(), goals);
    if (!found) return false;
    this.path = smooth(this.walkable, found);
    this.pathIdx = this.path.length > 1 ? 1 : 0;
    this.stuck = { t: this.time.now, x: this.player.x, y: this.player.y, replans: 0 };
    return true;
  }
  private replan() {
    const pending = this.pending;
    if (!this.planTo(this.goal)) this.stopWalking();
    this.pending = pending;
  }

  /** Walk to an object and, if there's exactly one thing to do there, do it. */
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

  private walkToPoint(wx: number, wy: number) {
    this.pending = null;
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    // nearest walkable tile to where you tapped
    let best: P | null = null, bd = Infinity;
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
      if (!this.walkable(x, y)) continue;
      const d = Math.hypot(x - tx, y - ty);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) this.planTo([best]);
  }

  inRange(id: ObjectId): boolean {
    const r = px(objectById(id).rect);
    const cx = Phaser.Math.Clamp(this.player.x, r.x, r.x + r.w), cy = Phaser.Math.Clamp(this.player.y, r.y, r.y + r.h);
    return Math.hypot(this.player.x - cx, this.player.y - cy) <= WORLD.interactRange;
  }

  private objectAt(wx: number, wy: number): PlacedObject | null {
    let best: PlacedObject | null = null, area = Infinity;
    for (const o of OBJECTS) {
      const r = px(o.rect), slop = 6;
      if (wx >= r.x - slop && wx <= r.x + r.w + slop && wy >= r.y - slop && wy <= r.y + r.h + slop && r.w * r.h < area) { best = o; area = r.w * r.h; }
    }
    return best;
  }

  private onApronVehicle(wx: number, wy: number) {
    const hasVehicle = this.w.utePresent || this.g.distractions.some(d => d.kind === 'courier');
    return hasVehicle && wx >= 6 * TS && wx <= 14 * TS && wy >= 51 * TS && wy <= 56 * TS;
  }

  private onRollerTiles() {
    const t = this.playerTile();
    return ROLLER_TILES.some(r => r.x === t.x && Math.abs(r.y - t.y) <= 0);
  }

  // ---------- actions and labels ----------

  private doAction(a: Action) {
    if (this.paused || this.g.phase !== 'day' || !a.run) return;
    const before = todoItems(this.g, this.w);
    a.run();
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

  private updateLabels() {
    const g = this.g, w = this.w;
    const near = this.paused || g.phase !== 'day' ? [] : OBJECTS.filter(o => o.id !== 'duct' && this.inRange(o.id));
    const entries = near.map(o => ({ o, acts: actionsFor(o.id, g, w), status: statusFor(o.id, g, w) })).filter(e => e.acts.length || e.status);
    const sig = JSON.stringify(entries.map(e => [e.o.id, e.acts.map(a => a.label), e.status, g.spraying]));
    if (sig === this.labelSig) return;
    this.labelSig = sig;
    for (const l of this.labels) l.destroy();
    this.labels = [];
    for (const { o, acts, status } of entries) {
      const r = px(o.rect);
      let y = r.y - 6;
      const x = r.x + r.w / 2;
      for (const a of [...acts].reverse()) {
        const held = a.hold && g.spraying;
        const t = this.add.text(x, y, held ? 'Spraying…' : a.label, {
          fontFamily: 'Courier New, monospace', fontSize: '17px', color: '#14110f', backgroundColor: held ? '#8fd37a' : a.hold ? '#f2a35b' : '#f2c76b',
          padding: { x: 8, y: 6 }, align: 'center', wordWrap: { width: 260 },
        }).setOrigin(0.5, 1).setDepth(10).setData('label', true).setInteractive({ useHandCursor: true });
        t.on('pointerdown', () => { if (a.hold) this.labelHold = true; else this.doAction(a); });
        this.labels.push(t);
        y -= t.height + 6;
      }
      if (status) {
        const s = this.add.text(x, acts.length ? y : r.y - 6, status, {
          fontFamily: 'Courier New, monospace', fontSize: '13px', color: '#efe6d8', backgroundColor: '#14110fcc', padding: { x: 6, y: 4 },
          align: 'center', wordWrap: { width: 280 },
        }).setOrigin(0.5, 1).setDepth(10);
        this.labels.push(s);
      }
    }
  }

  // ---------- drawing ----------

  private draw() {
    const g = this.g, w = this.w, d = this.dyn, time = this.time.now;
    d.clear();

    // machine bed: sheet, clamps, gantry, fault light
    const m = px(objectById('machine').rect);
    const bed = { x: m.x + 10, y: m.y + 10, w: m.w - 20, h: m.h - 20 };
    d.fillStyle(0x2a2622, 1).fillRect(bed.x, bed.y, bed.w, bed.h);
    if (w.bed !== 'empty') {
      d.fillStyle(w.bed === 'scrap' ? 0x9a5a4a : 0xcdb28a, 1).fillRect(bed.x + 6, bed.y + 6, bed.w - 12, bed.h - 12);
      if (w.bed !== 'placed') { d.fillStyle(0x333333, 1); for (const cx of [bed.x + 4, bed.x + bed.w - 10]) d.fillRect(cx, bed.y + 4, 6, bed.h - 8); }
    }
    const prog = g.current && w.bed === 'running' ? g.current.progress / g.current.cutMinutes : w.bed === 'done' ? 1 : 0;
    if (prog > 0) {
      d.lineStyle(2, 0x2a1d12, 1);
      const cols = 6, rows = 3, cw = (bed.w - 20) / cols, ch = (bed.h - 20) / rows;
      for (let i = 0; i < cols * rows && i / (cols * rows) <= prog; i++) d.strokeRect(bed.x + 10 + (i % cols) * cw, bed.y + 10 + Math.floor(i / cols) * ch, cw - 4, ch - 4);
    }
    const gx = bed.x + bed.w * (w.bed === 'running' ? prog : 0.5);
    d.fillStyle(g.machine === 'cutting' ? 0xd48a3c : 0x777777, 1).fillRect(gx - 5, m.y + 2, 10, m.h - 4);
    if (g.fault && Math.sin(time / 150) > 0) d.fillStyle(0xff3b1f, 1).fillCircle(m.x + m.w - 12, m.y + 12, 8);
    if (g.machineDown) d.fillStyle(0x000000, 0.6).fillRect(m.x, m.y, m.w, m.h);

    // extractor bag swells as it fills; dust on the floor once it's past the fire threshold
    const ext = px(objectById('extractor').rect);
    const fill = 1 - g.wear.filter;
    d.fillStyle(fill > CONFIG.fire.bagFullAbove ? 0xd8c890 : 0xc8c0a0, 1).fillCircle(ext.x + ext.w - 16, ext.y + ext.h / 2, 8 + fill * 14);
    const dustLevel = fill > CONFIG.fire.bagFullAbove ? Math.ceil((fill - CONFIG.fire.bagFullAbove) / (1 - CONFIG.fire.bagFullAbove) * 4) : 0;
    if (dustLevel !== this.dustLevel) {
      this.dustLevel = dustLevel;
      this.dust.clear();
      const rnd = new Phaser.Math.RandomDataGenerator(['dust']);
      for (let i = 0; i < dustLevel * 10; i++) {
        this.dust.fillStyle(0xc8bfa8, 0.55).fillCircle(rnd.between(12 * TS, 24 * TS), rnd.between(20 * TS, 32 * TS), rnd.between(6, 16));
      }
    }

    // pallets and bin
    const ply = px(objectById('plyPallet').rect);
    for (let i = 0; i < Math.min(8, g.queued.length); i++) d.fillStyle(0xd9be8c, 1).fillRect(ply.x + 8, ply.y + ply.h - 14 - i * 8, ply.w - 16, 6);
    const fin = px(objectById('finishedPallet').rect);
    for (let i = 0; i < Math.min(8, w.finishedStack); i++) d.fillStyle(0xe6d3a8, 1).fillRect(fin.x + 8, fin.y + fin.h - 14 - i * 8, fin.w - 16, 6);
    const bin = px(objectById('offcutBin').rect);
    d.fillStyle(0x9a8a5a, 1).fillRect(bin.x + 6, bin.y + bin.h - 6 - (bin.h - 12) * w.offcutBin, bin.w - 12, (bin.h - 12) * w.offcutBin);

    // duct up the wall, glowing when there's a duct fire
    const duct = px(objectById('duct').rect);
    d.fillStyle(g.machineDown ? 0x1a1a1a : g.fire?.stage === 'duct' ? 0xb8461e : 0x6b6560, 1).fillRect(duct.x + 8, duct.y, 16, duct.h);

    // extinguishers on their hooks
    for (const [id, hook] of [['extinguisher', 'wall'], ['spareExtinguisher', 'shed']] as const) {
      const r = px(objectById(id).rect);
      if (w.hooks[hook]) d.fillStyle(0xc0281e, 1).fillRoundedRect(r.x + 9, r.y + 4, 14, 26, 4);
      else d.lineStyle(2, 0x777777, 1).strokeRoundedRect(r.x + 9, r.y + 4, 14, 26, 4);
    }

    // phone shakes while it rings
    const ph = px(objectById('phone').rect);
    const ringing = g.distractions.some(x => x.kind === 'phone' || x.kind === 'bank');
    const shake = ringing ? Math.sin(time / 25) * 3 : 0;
    d.fillStyle(0x222222, 1).fillRect(ph.x + 6 + shake, ph.y + 8, ph.w - 12, ph.h - 14);
    if (ringing) d.fillStyle(0xf2c76b, 1).fillCircle(ph.x + ph.w - 6 + shake, ph.y + 6, 4);

    // bar fridge light after 2pm
    if (g.fridgeOpen) { const fr = px(objectById('fridge').rect); d.fillStyle(0xfff3a0, 0.9).fillRect(fr.x + 6, fr.y + 6, fr.w - 12, 6); }

    // roller door
    const rd = px(objectById('rollerDoor').rect);
    if (w.rollerUpUntil !== null) d.fillStyle(0x3a3a3a, 0.4).fillRect(rd.x, rd.y, rd.w, rd.h);
    else { d.fillStyle(0x8c8f94, 1).fillRect(rd.x, rd.y, rd.w, rd.h); d.lineStyle(1, 0x5a5d62, 1); for (let yy = rd.y + 6; yy < rd.y + rd.h; yy += 6) d.lineBetween(rd.x, yy, rd.x + rd.w, yy); }

    // ute for a pickup, truck for a delivery
    const courier = g.distractions.find(x => x.kind === 'courier');
    let vehicle = '';
    if (courier) { d.fillStyle(0xe0e0e0, 1).fillRect(6 * TS, 51 * TS, 8 * TS, 5 * TS); vehicle = 'Truck (delivery)'; }
    else if (w.utePresent) { d.fillStyle(0x3c6e9e, 1).fillRect(7 * TS, 52 * TS, 6 * TS, 3 * TS); vehicle = 'Ute (pickup)'; }
    this.vehicleText.setText(vehicle).setPosition(10 * TS, 53.5 * TS).setColor(courier ? '#222222' : '#efe6d8');

    // a mate at the smoko chairs (placeholder: people are Stage 2)
    const mate = g.distractions.find(x => x.kind === 'friend');
    const sm = px(objectById('smoko').rect);
    if (mate) d.fillStyle(0x7ab0d4, 1).fillCircle(sm.x + sm.w / 2, sm.y - 14, 11);
    this.mateText.setText(mate ? mate.title.replace(' wandered in', '') : '').setPosition(sm.x + sm.w / 2, sm.y - 26);

    // toilet occupied
    if (w.toiletUntil !== null) { const t = px(objectById('toilet').rect); d.fillStyle(0xc0281e, 1).fillCircle(t.x + t.w / 2, t.y + t.h + 4, 4); }

    // fire: smoke first, then the glow; black smoke once the extractor has gone up
    const fire = g.fire;
    for (const p of this.smoke) p.setVisible(!!fire || g.machineDown).setFillStyle(g.machineDown ? 0x222222 : 0x9a948c, 0.75);
    const glowing = !!fire && (fire.stage === 'duct' || fire.minutes >= CONFIG.fire.smokeOnlyMinutes);
    this.glow.setVisible(glowing);
    if (fire) this.glow.setRadius(fire.stage === 'duct' ? 22 : 12).setFillStyle(fire.stage === 'duct' ? 0xff4a1a : 0xff8a1f);
    if (g.spraying) {
      const ex = px(objectById('exhaust').rect);
      d.fillStyle(0xffffff, 0.6);
      for (let i = 0; i < 6; i++) d.fillCircle(Phaser.Math.Linear(this.player.x, ex.x + ex.w / 2, i / 6) + Math.sin(time / 40 + i) * 4, Phaser.Math.Linear(this.player.y, ex.y + ex.h / 2, i / 6), 5 + i);
    }

    // player: facing nose and what's in your hands
    d.fillStyle(0x2a1d12, 1).fillTriangle(
      this.player.x + w.fx * 16, this.player.y + w.fy * 16,
      this.player.x - w.fy * 6 + w.fx * 8, this.player.y + w.fx * 6 + w.fy * 8,
      this.player.x + w.fy * 6 + w.fx * 8, this.player.y - w.fx * 6 + w.fy * 8,
    );
    this.player.setVisible(w.toiletUntil === null);
    if (w.carrying) {
      const look = CARRY_LOOK[w.carrying];
      d.fillStyle(look.colour, 1).fillRect(this.player.x - 10, this.player.y - 30, 20, 12);
      this.carryText.setText(look.text).setPosition(this.player.x, this.player.y - 31).setVisible(true);
    } else this.carryText.setVisible(false);
  }

  // ---------- pause and save ----------

  setPaused(p: boolean) {
    this.paused = p;
    this.hud?.setPaused(p);
    this.lastReal = performance.now();
    this.acc = 0;
    if (p) { this.labelHold = this.objectHold = false; this.stopWalking(); }
    this.labelSig = '';
    this.save();
  }
  get isPaused() { return this.paused; }

  private save() { if (this.g && this.w) writeSave(this.g, this.w); }

  // ---------- test hooks (window.kirScene) ----------

  /** CSS-pixel screen position of a world point. */
  screenOfPoint(wx: number, wy: number) {
    const cam = this.cameras.main, r = this.game.canvas.getBoundingClientRect(), k = r.width / WORLD.view.width;
    return { x: r.left + (wx - cam.worldView.x) * cam.zoom * k, y: r.top + (wy - cam.worldView.y) * cam.zoom * k };
  }
  screenOf(id: ObjectId) { const r = px(objectById(id).rect); return this.screenOfPoint(r.x + r.w / 2, r.y + r.h / 2); }
  onScreen(id: ObjectId) {
    const v = this.cameras.main.worldView, r = px(objectById(id).rect);
    return r.x + r.w / 2 > v.x + 10 && r.x + r.w / 2 < v.right - 10 && r.y + r.h / 2 > v.y + 40 && r.y + r.h / 2 < v.bottom - 10;
  }
  labelScreens() {
    return this.labels.filter(l => l.getData('label')).map(l => {
      const t = l as Phaser.GameObjects.Text, b = t.getBounds();
      return { text: t.text, ...this.screenOfPoint(b.centerX, b.centerY) };
    });
  }
  /** Press a label by its text, as a tap on it would (for labels scrolled off screen). */
  pressLabel(text: string) {
    const l = this.labels.find(x => x.getData('label') && (x as Phaser.GameObjects.Text).text === text);
    if (!l) return false;
    l.emit('pointerdown');
    return true;
  }
  get playerPos() { return { x: this.player.x, y: this.player.y, tile: this.playerTile() }; }
  get walking() { return !!this.path; }
}
