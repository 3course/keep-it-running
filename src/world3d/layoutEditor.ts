// Layout mode: the camera goes up to a clean top-down view with a 0.5 m grid, the clock stops, and the movable things
// become blocks you can drag (snapped to the grid) and tap to turn 90°. Anywhere they can't go glows red (blocking a
// door, on top of something, the extractor's duct won't reach the router, can't get to it). A card up top shows what
// the layout costs you — steps per job, the bag trip, a pickup, how long a duct fire takes to reach the machine — and
// what's changed against the layout you started with. Moving things costs time at the start of the day, not money.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { DEFAULT_PLAN, PRESETS, STATIONS, STATION_IDS, SWITCHBOARD, clonePlan, measure, moved, problems, rectOf, type LayoutMetrics, type Plan, type StationId } from '../world/layoutPlan.js';
import { WORLD } from '../world/worldConfig.js';
import { Talk } from '../ui/talk.js';

const C = WORLD.cell;
const COLOURS: Record<StationId, number> = {
  plyPallet: 0xd6bc8a, finishedPallet: 0xe9d6ac, extractor: 0x3f7070, bitRack: 0x9aa6b2, offcutBin: 0x4f6b3a, compressor: 0x5a5f9a,
  extinguisher: 0xc0281e, fridge: 0xe4e4e0, racks: 0x8a6a40, bench: 0xa07a48, crates: 0x2f6f9e, corkboard: 0xb88a5a,
};
const CSS = `
#kir-hud .layoutcard { position: absolute; left: 50%; top: calc(8px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); width: min(94%, 380px); z-index: 7;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 12px; padding: 6px 10px; font: 13px/1.35 'Courier New', monospace; color: #14110f; pointer-events: none; }
#kir-hud .layoutcard h3 { margin: 0 0 2px; font-size: 14px; }
#kir-hud .layoutcard .row { display: flex; justify-content: space-between; gap: 8px; }
#kir-hud .layoutcard .better { color: #2f7a2a; font-weight: 700; } #kir-hud .layoutcard .worse { color: #c0281e; font-weight: 700; }
#kir-hud .layoutcard .bad { color: #c0281e; }
#kir-hud .layouttag { position: absolute; transform: translate(-50%, -50%); font: 700 10px sans-serif; color: #14110f; background: rgba(251,250,244,.85);
  padding: 1px 4px; border-radius: 4px; pointer-events: none; z-index: 6; white-space: nowrap; }
#kir-hud .layouttag.bad { background: #ffb3a8; }
`;

/** What the card shows, from a plan's measurements. Minutes are game minutes (a real second each). */
export function estimates(m: LayoutMetrics) {
  const L = CONFIG.layout, speed = L.metresPerMinute;
  const fx = Math.max(0.7, Math.min(1.5, 1 + (measure(DEFAULT_PLAN).duct - m.duct) * L.fireSpreadPerMetre));
  return {
    steps: Math.round((2 * m.load + 2 * m.stack + m.pickup) / 0.7),                // steps you walk per sheet
    bag: (2 * m.bagTrip) / speed,                                                   // minutes to the skip and back with a bag
    pickup: (2 * m.pickup) / speed,                                                 // minutes per pickup trip
    fire: CONFIG.fire.ductFireAfterMinutes / fx,                                    // minutes before a spot fire reaches the duct
  };
}

export interface LayoutEditorDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  parent: HTMLElement;
  /** The meshes of the things that move (hidden while their blocks are being shoved about). */
  hide: (on: boolean) => void;
  project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean };
  /** Commit a new plan (minutes it costs: 0 on the free first day). */
  commit: (plan: Plan, minutes: number) => void;
  free: () => boolean;
  /** Back to the shed (the HUD comes back). */
  closed: () => void;
}

export class LayoutEditor {
  active = false;
  plan: Plan = clonePlan(DEFAULT_PLAN);
  private start: Plan = clonePlan(DEFAULT_PLAN);
  private group = new THREE.Group();
  private blocks = new Map<StationId, THREE.Mesh>();
  private tags = new Map<StationId, HTMLDivElement>();
  private card: HTMLDivElement | null = null;
  readonly talk: Talk;
  private drag: { id: StationId; dx: number; dy: number; x0: number; y0: number; t0: number; moved: boolean } | null = null;
  private ray = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private weight = 0;
  private pose = { pos: new THREE.Vector3(8.5, 25, 17.5), look: new THREE.Vector3(8.5, 0, 14.6) };
  private baseMetrics: LayoutMetrics | null = null;
  bad: Partial<Record<StationId, string>> = {};

  constructor(private d: LayoutEditorDeps) {
    if (!document.getElementById('kir-layout-css')) { const s = document.createElement('style'); s.id = 'kir-layout-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.talk = new Talk(d.parent, 'layout');
    d.scene.add(this.group);
    this.group.visible = false;
  }

  /** Into layout mode with the current plan. */
  enter(plan: Plan) {
    this.start = clonePlan(plan); this.plan = clonePlan(plan);
    this.baseMetrics = measure(this.start);
    this.active = true;
    this.build();
    this.d.hide(true);
    this.group.visible = true;
    this.card = document.createElement('div'); this.card.className = 'layoutcard'; this.d.parent.appendChild(this.card);
    this.refresh();
    this.ask();
  }

  private presetAt = 0;
  private ask() {
    const presets: [string, Plan][] = [['compact', PRESETS.compact], ['dock first', PRESETS.dockFirst], ['as built', DEFAULT_PLAN]];
    const [name, plan] = presets[this.presetAt % presets.length];
    this.talk.ask([{ text: 'Done', cls: 'door' }, { text: `Try ${name}` }, { text: 'Cancel', cls: 'home' }], i => {
      if (i === 0) { if (!this.done()) this.ask(); return; }
      if (i === 2) { this.exit(); return; }
      this.plan = clonePlan(plan); this.presetAt++;
      this.placeBlocks(); this.refresh(); this.ask();
    });
  }

  /** Done: if everything's somewhere it can go, it's the layout now (the shoving costs minutes). */
  private done(): boolean {
    if (Object.keys(this.bad).length) { this.flash(); return false; }
    const m = moved(this.start, this.plan);
    const minutes = this.d.free() ? 0 : m.reduce((s, id) => s + STATIONS[id].heave, 0);
    const plan = clonePlan(this.plan);
    this.exit();
    if (m.length) this.d.commit(plan, minutes);
    return true;
  }

  exit() {
    this.active = false; this.drag = null;
    this.group.visible = false;
    this.d.hide(false);
    this.talk.clear();
    this.card?.remove(); this.card = null;
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
    this.d.closed();
  }

  private build() {
    this.group.clear(); this.blocks.clear();
    // the grid, over the building
    const grid = new THREE.GridHelper(17, 34, 0x14110f, 0x6a6f74);
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.35;
    grid.position.set(8.75, 0.02, 14.75);
    this.group.add(grid);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(C, 1.6, C * 0.4), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
    sb.position.set((SWITCHBOARD.x + 0.5) * C, 0.8, (SWITCHBOARD.y + 0.8) * C);
    this.group.add(sb);
    for (const id of STATION_IDS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: COLOURS[id], transparent: true, opacity: 0.85 }));
      m.userData.station = id;
      this.group.add(m);
      this.blocks.set(id, m);
      const tag = document.createElement('div'); tag.className = 'layouttag'; tag.textContent = STATIONS[id].name;
      this.d.parent.appendChild(tag); this.tags.set(id, tag);
    }
    this.placeBlocks();
  }

  private placeBlocks() {
    for (const [id, m] of this.blocks) {
      const r = rectOf(id, this.plan[id]), h = STATIONS[id].wall ? 0.2 : 0.5;
      m.scale.set(r.w * C - 0.04, h, r.h * C - 0.04);
      m.position.set((r.x + r.w / 2) * C, h / 2, (r.y + r.h / 2) * C);
    }
  }

  /** Re-check the plan and redraw the card. */
  private refresh() {
    this.bad = problems(this.plan);
    for (const [id, m] of this.blocks) (m.material as THREE.MeshBasicMaterial).color.setHex(this.bad[id] ? 0xff4a3a : COLOURS[id]);
    for (const [id, t] of this.tags) { t.classList.toggle('bad', !!this.bad[id]); t.textContent = this.bad[id] ? `${STATIONS[id].name}: ${this.bad[id]}` : STATIONS[id].name; }
    if (!this.card) return;
    const now = estimates(measure(this.plan)), was = estimates(this.baseMetrics!), m = measure(this.plan), b = this.baseMetrics!;
    const row = (k: string, v: number, w: number, unit: string, lowerBetter = true) => {
      const diff = v - w, cls = Math.abs(diff) < 0.05 ? '' : (diff < 0) === lowerBetter ? 'better' : 'worse';
      return `<div class="row"><span>${k}</span><span class="${cls}">${v.toFixed(unit === '' ? 0 : 1)}${unit}${cls ? ` (${diff > 0 ? '+' : ''}${diff.toFixed(unit === '' ? 0 : 1)})` : ''}</span></div>`;
    };
    const flag = (k: string, v: boolean, w: boolean, good: string, badT: string) => `<div class="row"><span>${k}</span><span class="${v !== w ? (v ? 'worse' : 'better') : v ? 'bad' : ''}">${v ? badT : good}</span></div>`;
    const cost = this.d.free() ? 0 : moved(this.start, this.plan).reduce((s, id) => s + STATIONS[id].heave, 0);
    this.card.innerHTML = `<h3>Move things round · clock stopped</h3>`
      + row('Steps per job', now.steps, was.steps, '')
      + row('Bag trip to the skip', now.bag, was.bag, ' min')
      + row('Pickup trip', now.pickup, was.pickup, ' min')
      + row('Duct fire reaches machine', now.fire, was.fire, ' min', false)
      + flag('Power', m.sharedCircuit, b.sharedCircuit, 'own circuit', 'shares with the extractor: trips')
      + flag('Fridge from the router', m.fridgeInSight, b.fridgeInSight, 'out of sight', 'in sight: tempting')
      + flag('Dock → router → pallet', !m.clearPath, !b.clearPath, 'clear run', 'cluttered: slower')
      + `<div class="row"><span>Shoving it round</span><span>${this.d.free() ? 'free today' : `${cost} min`}</span></div>`;
  }

  private flash() {
    for (const [id, t] of this.tags) if (this.bad[id]) t.animate([{ transform: 'translate(-50%,-50%) scale(1.3)' }, { transform: 'translate(-50%,-50%) scale(1)' }], 400);
  }

  // ---------- input (the view routes canvas pointer events here while active) ----------

  pointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
    if (!this.active) return;
    const hit = this.floorAt(e.clientX, e.clientY);
    if (kind === 'down') {
      const r = this.d.canvas.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)), this.d.camera);
      const h = this.ray.intersectObjects([...this.blocks.values()])[0];
      if (!h || !hit) return;
      const id = h.object.userData.station as StationId, p = this.plan[id];
      this.drag = { id, dx: hit.x / C - p.x, dy: hit.z / C - p.y, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
    } else if (kind === 'move' && this.drag && hit) {
      const d = this.drag;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      d.moved = true;
      const x = Math.round(hit.x / C - d.dx), y = Math.round(hit.z / C - d.dy);
      const p = this.plan[d.id];
      if (p.x !== x || p.y !== y) { p.x = x; p.y = y; this.placeBlocks(); this.refresh(); }
    } else if (kind === 'up' && this.drag) {
      const d = this.drag; this.drag = null;
      // a tap turns it 90°
      if (!d.moved && performance.now() - d.t0 < 350) { const p = this.plan[d.id]; p.rot = p.rot ? 0 : 1; this.placeBlocks(); this.refresh(); }
    }
  }

  private floorAt(cx: number, cy: number) {
    const r = this.d.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1)), this.d.camera);
    const v = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.floor, v) ? v : null;
  }

  /** Test hook: move a station as a drag would. */
  place(id: StationId, x: number, y: number, rot?: 0 | 1) { Object.assign(this.plan[id], { x, y, ...(rot === undefined ? {} : { rot }) }); this.placeBlocks(); this.refresh(); }
  commitNow() { return this.done(); }

  // ---------- each frame ----------

  applyCamera(camera: THREE.PerspectiveCamera, dt: number) {
    this.weight += ((this.active ? 1 : 0) - this.weight) * Math.min(1, dt * 3);
    if (this.weight < 0.002) return;
    // high enough to see the whole building the narrow way
    const vfov = camera.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const h = Math.max(12.5 / 2 / Math.tan(hfov / 2), 17 / 2 / Math.tan(vfov / 2) / 0.52) * 1.0;
    // the building sits in the top two thirds: the replies are at the bottom
    this.pose.look.set(8.75, 0, 14.75 + h * 0.04);
    this.pose.pos.set(8.75, h, 14.75 + h * 0.1);
    const e = this.weight * this.weight * (3 - 2 * this.weight);
    const look = new THREE.Vector3(); camera.getWorldDirection(look).add(camera.position);
    camera.position.lerp(this.pose.pos, e);
    camera.lookAt(look.lerp(this.pose.look, e));
  }

  update() {
    if (!this.active) return;
    for (const [id, t] of this.tags) {
      const m = this.blocks.get(id)!, s = this.d.project(m.position.clone().setY(0.6));
      t.style.left = `${s.x}px`; t.style.top = `${s.y}px`;
    }
  }
}
