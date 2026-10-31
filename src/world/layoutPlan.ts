// The factory floor as a plan you can rearrange. Pure (no DOM, no Three.js): the layout mode edits a Plan, this checks
// it, measures it with the same pathfinding the player walks by, and turns the measurements into LayoutEffects that
// Game reads — so the balance sim (`npm run sim -- layouts`) plays the same layouts the player can make.
//
// Fixed: the router (bolted down), walls, doors, the switchboard, the phone, desk, toilet, smoko chairs. Everything in
// STATIONS moves. Effects are measured against the default plan, so the default layout plays exactly as before.
import { CONFIG } from '../config.js';
import type { LayoutEffects } from '../sim/types.js';
import { COLS, DECOR, MACHINE_SPOT, OBJECTS, ROLLER_TILES, ROWS, T, buildGrid, objectById, type ObjectId, type Rect } from './layout.js';
import { findPath, type P } from './pathfind.js';

export type StationId = 'plyPallet' | 'finishedPallet' | 'extractor' | 'bitRack' | 'offcutBin' | 'compressor' | 'extinguisher'
  | 'fridge' | 'racks' | 'bench' | 'crates' | 'corkboard';
export interface Placement { x: number; y: number; rot: 0 | 1 }
export type Plan = Record<StationId, Placement>;

/** Each station: its footprint (cells, unrotated), how long it takes to shove it somewhere (game minutes), and its name. */
export const STATIONS: Record<StationId, { name: string; w: number; h: number; heave: number; wall?: boolean; solid: boolean }> = {
  plyPallet: { name: 'Raw sheets', w: 3, h: 3, heave: 5, solid: true },
  finishedPallet: { name: 'Finished pallet', w: 3, h: 3, heave: 4, solid: true },
  extractor: { name: 'Extractor', w: 3, h: 2, heave: 5, solid: true },
  bitRack: { name: 'Bit rack', w: 2, h: 1, heave: 2, solid: true },
  offcutBin: { name: 'Offcut bin', w: 2, h: 2, heave: 3, solid: true },
  compressor: { name: 'Compressor', w: 2, h: 2, heave: 4, solid: true },
  extinguisher: { name: 'Extinguisher hook', w: 1, h: 1, heave: 2, solid: true },
  fridge: { name: 'Bar fridge', w: 1, h: 2, heave: 3, solid: true },
  racks: { name: 'Storage shelves', w: 5, h: 2, heave: 5, solid: true },
  bench: { name: "Part-timer's bench", w: 3, h: 2, heave: 3, solid: true },
  crates: { name: 'Milk crates', w: 2, h: 3, heave: 2, solid: false },
  corkboard: { name: 'Corkboard', w: 3, h: 1, heave: 2, wall: true, solid: false },
};
export const STATION_IDS = Object.keys(STATIONS) as StationId[];

/** The switchboard (fixed): the extractor and the heater share its circuit; a compressor near it overloads it. */
export const SWITCHBOARD = { x: 21, y: 36 };

/** The plan as the shed was built. */
export const DEFAULT_PLAN: Plan = {
  plyPallet: { x: 6, y: 25, rot: 0 }, finishedPallet: { x: 19, y: 28, rot: 0 }, extractor: { x: 14, y: 14, rot: 0 },
  bitRack: { x: 7, y: 14, rot: 0 }, offcutBin: { x: 19, y: 22, rot: 0 }, compressor: { x: 6, y: 19, rot: 0 },
  extinguisher: { x: 28, y: 34, rot: 0 }, fridge: { x: 28, y: 35, rot: 0 }, racks: { x: 24, y: 14, rot: 0 },
  bench: { x: 12, y: 36, rot: 0 }, crates: { x: 26, y: 33, rot: 0 }, corkboard: { x: 8, y: 39, rot: 0 },
};

/** Three to compare in the sim (and to start from in layout mode). */
export const PRESETS: Record<'default' | 'compact' | 'dockFirst', Plan> = {
  default: DEFAULT_PLAN,
  // everything hugging the router: short walks, a cluttered machine, the extractor close (fires reach it faster)
  compact: { ...DEFAULT_PLAN, plyPallet: { x: 7, y: 28, rot: 0 }, finishedPallet: { x: 18, y: 28, rot: 0 }, bitRack: { x: 10, y: 20, rot: 0 },
    offcutBin: { x: 18, y: 22, rot: 0 }, extinguisher: { x: 9, y: 22, rot: 0 }, extractor: { x: 12, y: 16, rot: 0 }, compressor: { x: 19, y: 34, rot: 0 } },
  // deliveries and pickups first: both pallets by the roller door, the extractor tucked away up the back
  dockFirst: { ...DEFAULT_PLAN, plyPallet: { x: 25, y: 23, rot: 0 }, finishedPallet: { x: 23, y: 28, rot: 0 }, extractor: { x: 8, y: 14, rot: 0 },
    bitRack: { x: 11, y: 14, rot: 0 }, fridge: { x: 28, y: 37, rot: 0 }, crates: { x: 27, y: 41, rot: 0 } },
};

export const rectOf = (id: StationId, p: Placement): Rect => {
  const s = STATIONS[id];
  return p.rot ? { x: p.x, y: p.y, w: s.h, h: s.w } : { x: p.x, y: p.y, w: s.w, h: s.h };
};

const C = 0.5; // m per cell
const centre = (r: Rect) => ({ x: (r.x + r.w / 2) * C, z: (r.y + r.h / 2) * C });
const cellsOf = (r: Rect) => { const out: P[] = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y }); return out; };
const INDOOR = new Set<number>([T.FLOOR, T.OFFICE, T.STORAGE, T.DOCK]);

/** Fixed obstacles: the solid things that don't move (and the solid clutter that isn't a station). */
function fixedSolids(): Rect[] {
  const moving = new Set<string>(STATION_IDS);
  return [...OBJECTS.filter(o => o.solid && !moving.has(o.id)).map(o => o.rect), ...DECOR.filter(d => d.solid && d.kind !== 'bench').map(d => d.rect)];
}

/** Walkable cells for a plan (indoors and out, as the player walks). */
export function walkableFor(plan: Plan, grid = buildGrid()) {
  const block = new Set<number>();
  for (const r of [...fixedSolids(), ...STATION_IDS.filter(id => STATIONS[id].solid).map(id => rectOf(id, plan[id]))]) for (const c of cellsOf(r)) block.add(c.y * COLS + c.x);
  return (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x] !== T.WALL && !block.has(y * COLS + x);
}

/** What's wrong with where a station is (null: fine). */
export function problems(plan: Plan): Partial<Record<StationId, string>> {
  const grid = buildGrid(), out: Partial<Record<StationId, string>> = {};
  const fixed = fixedSolids(), machine = objectById('machine').rect;
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // the doors and the pickup in front of the roller door stay clear
  const clear: Rect[] = [{ x: ROLLER_TILES[0].x - 3, y: ROLLER_TILES[0].y, w: 3, h: ROLLER_TILES.length }];
  grid.forEach((row, y) => row.forEach((t, x) => { if (t === T.DOOR) clear.push({ x: x - 1, y: y - 1, w: 3, h: 3 }); }));
  clear.push({ x: MACHINE_SPOT.x - 1, y: MACHINE_SPOT.y - 1, w: 3, h: 3 }); // where you stand at the machine
  const walk = walkableFor(plan, grid);
  for (const id of STATION_IDS) {
    const r = rectOf(id, plan[id]), s = STATIONS[id];
    const cells = cellsOf(r);
    if (cells.some(c => c.y < 0 || c.x < 0 || c.y >= ROWS || c.x >= COLS || !INDOOR.has(grid[c.y][c.x]))) { out[id] = 'Not inside'; continue; }
    if (s.wall) { if (cells.some(c => grid[c.y - 1]?.[c.x] !== T.WALL)) out[id] = 'Needs a wall behind it'; continue; }
    if (overlaps(r, machine) || fixed.some(f => overlaps(r, f))) { out[id] = 'Something is already there'; continue; }
    const other = STATION_IDS.find(o => o !== id && STATIONS[o].solid && s.solid && overlaps(r, rectOf(o, plan[o])));
    if (other) { out[id] = `On top of the ${STATIONS[other].name.toLowerCase()}`; continue; }
    if (s.solid && clear.some(c => overlaps(r, c))) { out[id] = 'Blocking a door'; continue; }
    if (id === 'extractor') {
      const a = centre(r), m = centre(machine);
      if (Math.hypot(a.x - m.x, a.z - m.z) > CONFIG.layout.maxDuctMetres) { out[id] = 'Duct won’t reach the router'; continue; }
    }
    // you have to be able to get to it
    if (s.solid && !findPath(COLS, ROWS, walk, MACHINE_SPOT, around(r, walk))) out[id] = "Can't get to it";
  }
  return out;
}

/** Walkable cells beside a rect (where you'd stand to use it). */
function around(r: Rect, walk: (x: number, y: number) => boolean): P[] {
  const out: P[] = [];
  for (let x = r.x - 1; x <= r.x + r.w; x++) for (const y of [r.y - 1, r.y + r.h]) if (walk(x, y)) out.push({ x, y });
  for (let y = r.y; y < r.y + r.h; y++) for (const x of [r.x - 1, r.x + r.w]) if (walk(x, y)) out.push({ x, y });
  return out;
}

export interface LayoutMetrics {
  load: number; delivery: number; stack: number; pickup: number;   // m, one way
  bagTrip: number; duct: number; fix: number; fire: number; drain: number; binToRouter: number; binToSkip: number;
  clutter: number;              // stations crowding the router
  sharedCircuit: boolean;       // the compressor's on the extractor's circuit
  fridgeInSight: boolean;       // you can see the fridge from the router
  clearPath: boolean;           // a clear metre-wide run dock → router → finished pallet
}

/** Measure a plan by walking it. */
export function measure(plan: Plan): LayoutMetrics {
  const grid = buildGrid(), walk = walkableFor(plan, grid);
  const machine = objectById('machine').rect;
  const routerAt = [MACHINE_SPOT, ...around(machine, walk)];
  const at = (id: StationId) => around(rectOf(id, plan[id]), walk);
  const door: P[] = ROLLER_TILES.map(t => ({ x: t.x - 1, y: t.y }));
  const skip = around(objectById('skip').rect, walk);
  const len = (path: P[] | null) => {
    if (!path) return 60; // unreachable: as bad as it gets
    let d = 0; for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) * C;
    return d;
  };
  const dist = (from: P[], to: P[]) => Math.min(...from.slice(0, 4).map(f => len(findPath(COLS, ROWS, walk, f, to))));
  const c = (id: StationId) => centre(rectOf(id, plan[id])), mc = centre(machine);
  const near = (r: Rect) => r.x < machine.x + machine.w + 2 && machine.x - 2 < r.x + r.w && r.y < machine.y + machine.h + 2 && machine.y - 2 < r.y + r.h;
  // a clear run: walkable with a metre to spare (every cell's 2×2 block clear)
  const wide = (x: number, y: number) => walk(x, y) && walk(x + 1, y) && walk(x, y + 1) && walk(x + 1, y + 1);
  const fin = at('finishedPallet');
  const clearPath = !!findPath(COLS, ROWS, wide, door[2], routerAt) && !!findPath(COLS, ROWS, wide, MACHINE_SPOT, fin.length ? fin : [MACHINE_SPOT]);
  // in sight: no wall on the straight line from the router to the fridge, and not too far
  const f = c('fridge'), steps = 40;
  let blocked = false;
  for (let i = 1; i < steps; i++) {
    const x = Math.floor((mc.x + (f.x - mc.x) * i / steps) / C), y = Math.floor((mc.z + (f.z - mc.z) * i / steps) / C);
    if (grid[y]?.[x] === T.WALL) { blocked = true; break; }
  }
  const sw = { x: (SWITCHBOARD.x + 0.5) * C, z: (SWITCHBOARD.y + 0.5) * C }, comp = c('compressor');
  const L = CONFIG.layout;
  return {
    load: dist(routerAt, at('plyPallet')), delivery: dist(door, at('plyPallet')), stack: dist(routerAt, fin), pickup: dist(door, fin),
    bagTrip: dist(at('extractor'), skip), duct: Math.hypot(c('extractor').x - mc.x, c('extractor').z - mc.z),
    fix: dist(routerAt, at('bitRack')), fire: dist(routerAt, at('extinguisher')) + dist(at('extinguisher'), at('extractor')),
    drain: dist(routerAt, at('compressor')), binToRouter: dist(routerAt, at('offcutBin')), binToSkip: dist(at('offcutBin'), skip),
    clutter: STATION_IDS.filter(id => STATIONS[id].solid && near(rectOf(id, plan[id]))).length,
    sharedCircuit: Math.hypot(comp.x - sw.x, comp.z - sw.z) <= L.circuitReachMetres,
    fridgeInSight: !blocked && Math.hypot(f.x - mc.x, f.z - mc.z) <= L.fridgeSightMetres,
    clearPath,
  };
}

let defaultMetrics: LayoutMetrics | null = null;

/** What a plan does to the economy, relative to the default plan (which does nothing). Numbers: CONFIG.layout. */
export function effectsOf(m: LayoutMetrics): LayoutEffects {
  const d = defaultMetrics ??= measure(DEFAULT_PLAN);
  const L = CONFIG.layout, mpm = 1 / L.metresPerMinute;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const walkFactor = (x: LayoutMetrics) => (1 - Math.max(0, x.clutter - L.clutterFree) * L.clutterPenalty) * (x.clearPath ? 1 : L.blockedPathMult);
  return {
    loadMinutes: 2 * (m.load - d.load) * mpm,
    stackMinutes: (2 * (m.stack - d.stack) + L.pickupsPerStack * 2 * (m.pickup - d.pickup)) * mpm,
    unloadTripMinutes: 2 * (m.delivery - d.delivery) * mpm,
    filterMinutes: 2 * (m.bagTrip - d.bagTrip) * mpm,
    bitMinutes: 2 * (m.fix - d.fix) * mpm,
    fireWalkMinutes: (m.fire - d.fire) * mpm,
    drainMinutes: 2 * (m.drain - d.drain) * mpm,
    binTripMinutes: 2 * (m.binToSkip - d.binToSkip) * mpm,
    binFillMult: clamp(1 + (d.binToRouter - m.binToRouter) * L.binFillPerMetre, 0.8, 1.3),
    extractionFaultMult: clamp(1 + (m.duct - d.duct) * L.suctionPerMetre, 0.6, 1.6),
    chipMult: clamp(1 + (m.duct - d.duct) * L.suctionChipPerMetre, 0.8, 1.25),
    fireSpreadMult: clamp(1 + (d.duct - m.duct) * L.fireSpreadPerMetre, 0.7, 1.5),
    walkMult: walkFactor(m) / walkFactor(d),
    powerTripPerMinute: m.sharedCircuit && !d.sharedCircuit ? L.powerTripPerMinute : 0,
    beerTemptation: m.fridgeInSight && !d.fridgeInSight ? L.beerTemptation : 1,
    switchboardMinutes: 2 * Math.hypot(MACHINE_SPOT.x - SWITCHBOARD.x, MACHINE_SPOT.y - SWITCHBOARD.y) * C * mpm + 1,
  };
}

/** Put a plan into the shed's objects (the world rebuilds from these). Wall-mounted and people bits are read by their views. */
export function applyPlan(plan: Plan) {
  for (const id of STATION_IDS) {
    const o = OBJECTS.find(x => x.id === (id as ObjectId));
    if (o) Object.assign(o.rect, rectOf(id, plan[id]));
  }
  const bench = DECOR.find(d => d.kind === 'bench');
  if (bench) Object.assign(bench.rect, rectOf('bench', plan.bench));
  // the duct goes up from the extractor and out the back wall
  const duct = OBJECTS.find(o => o.id === 'duct'), ex = rectOf('extractor', plan.extractor);
  if (duct) duct.rect.x = ex.x + Math.floor(ex.w / 2);
}

/** Which stations differ between two plans. */
export const moved = (a: Plan, b: Plan) => STATION_IDS.filter(id => a[id].x !== b[id].x || a[id].y !== b[id].y || a[id].rot !== b[id].rot);
export const clonePlan = (p: Plan): Plan => JSON.parse(JSON.stringify(p));
/** A saved plan with any station it doesn't know about filled from the default. */
export const fullPlan = (p?: Partial<Plan> | null): Plan => ({ ...clonePlan(DEFAULT_PLAN), ...(p ?? {}) });

/** How far a station has moved from where it was built, in metres (for the views that place things by it). */
export function shift(plan: Plan | undefined, id: StationId): { x: number; z: number } {
  if (!plan) return { x: 0, z: 0 };
  const a = rectOf(id, plan[id]), b = rectOf(id, DEFAULT_PLAN[id]);
  return { x: (a.x - b.x) * C, z: (a.y - b.y) * C };
}
