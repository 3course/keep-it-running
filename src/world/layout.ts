// The shed as data: a grid of 0.5 m cells, rooms, the working objects with real heights, and the
// clutter that makes it a real workshop. North (row 0) is the back of the site; the street runs down
// the east side. World space: x = column * cell, z = row * cell, y up. North is -z.
//
// The factory floor is 8 x 12 m. Walk times come from where the rooms sit, not from open floor:
// the office is off the near (south) end, the extractor and exhaust unit are at the far (north) end
// through the side door and round the back, and the dock runs down the long east side.
import type { VisitorArea } from '../sim/types.js';

export const COLS = 42;
export const ROWS = 48;

export const T = {
  GROUND: 0,   // outside: gravel yard
  STREET: 1,
  FLOOR: 2,    // factory floor and corridor
  OFFICE: 3,
  TOILET: 4,
  STORAGE: 5,
  SHED: 6,
  WALL: 7,
  DOOR: 8,
  ROLLER: 9,   // roller door: blocks unless it's up
  APRON: 10,
  DOCK: 11,
} as const;

/** True for ground that's outside the buildings (for Colorbond-green exterior wall faces). */
export const isOutside = (t: number) => t === T.GROUND || t === T.STREET || t === T.APRON;

export interface Rect { x: number; y: number; w: number; h: number }  // in cells; y is the row

/** A room or area. yawDeg nudges the camera so the room is framed when you walk in. outside: the camera pulls back. */
export interface Zone { name: string; rect: Rect; yawDeg: number; outside?: boolean }

export type ObjectId =
  | 'machine' | 'plyPallet' | 'finishedPallet' | 'offcutBin' | 'bitRack' | 'extractor' | 'compressor'
  | 'exhaust' | 'duct' | 'extinguisher' | 'rollerDoor' | 'smoko' | 'desk' | 'phone' | 'fridge'
  | 'toilet' | 'racks' | 'spareExtinguisher' | 'exhaustExtinguisher' | 'bags' | 'skip';

export interface PlacedObject {
  id: ObjectId;
  name: string;
  rect: Rect;
  height: number;   // m
  colour: number;
  solid: boolean;   // blocks walking
}

export const ZONES: Zone[] = [
  { name: 'Rear yard', rect: { x: 0, y: 0, w: 38, h: 13 }, yawDeg: 0, outside: true },
  { name: 'Back shed', rect: { x: 1, y: 1, w: 8, h: 6 }, yawDeg: -18, outside: true },
  { name: 'Exhaust unit', rect: { x: 12, y: 9, w: 7, h: 4 }, yawDeg: 0, outside: true },
  { name: 'Side yard', rect: { x: 0, y: 13, w: 5, h: 35 }, yawDeg: -20, outside: true },
  { name: 'Factory floor', rect: { x: 6, y: 14, w: 16, h: 24 }, yawDeg: 0 },
  { name: 'Storage', rect: { x: 23, y: 14, w: 6, h: 7 }, yawDeg: 15 },
  { name: 'Delivery dock', rect: { x: 23, y: 22, w: 6, h: 24 }, yawDeg: 15 },
  { name: 'Office', rect: { x: 6, y: 39, w: 12, h: 7 }, yawDeg: 0 },
  { name: 'Corridor', rect: { x: 19, y: 39, w: 3, h: 4 }, yawDeg: 0 },
  { name: 'Toilet', rect: { x: 19, y: 44, w: 3, h: 2 }, yawDeg: 0 },
  { name: 'Apron', rect: { x: 30, y: 13, w: 8, h: 35 }, yawDeg: 20, outside: true },
  { name: 'Street', rect: { x: 38, y: 0, w: 4, h: 48 }, yawDeg: 0, outside: true },
];

export const OBJECTS: PlacedObject[] = [
  // factory floor (x 6..21, y 14..37)
  { id: 'machine', name: 'CNC router', rect: { x: 10, y: 22, w: 8, h: 5 }, height: 0.85, colour: 0x3d5a78, solid: true },
  { id: 'plyPallet', name: 'Ply pallet', rect: { x: 6, y: 25, w: 3, h: 3 }, height: 0.15, colour: 0xa07a48, solid: true },
  { id: 'finishedPallet', name: 'Finished pallet', rect: { x: 19, y: 28, w: 3, h: 3 }, height: 0.15, colour: 0x8a6a40, solid: true },
  { id: 'offcutBin', name: 'Offcut bin', rect: { x: 19, y: 22, w: 2, h: 2 }, height: 0.9, colour: 0x4f6b3a, solid: true },
  { id: 'bitRack', name: 'Bit rack', rect: { x: 7, y: 14, w: 2, h: 1 }, height: 1.3, colour: 0x6f7c88, solid: true },
  { id: 'extractor', name: 'Extractor', rect: { x: 14, y: 14, w: 3, h: 2 }, height: 2.0, colour: 0x3f7070, solid: true },
  { id: 'compressor', name: 'Compressor', rect: { x: 6, y: 19, w: 2, h: 2 }, height: 0.9, colour: 0x5a5f9a, solid: true },
  // the duct goes straight up from the extractor and out through the back wall to the exhaust unit
  { id: 'duct', name: 'Duct', rect: { x: 15, y: 13, w: 1, h: 1 }, height: 2.3, colour: 0x8a8f94, solid: false },
  { id: 'exhaust', name: 'Exhaust unit', rect: { x: 14, y: 10, w: 3, h: 3 }, height: 1.6, colour: 0x6b6f72, solid: true },
  // only once it's bought (the "Extinguisher by the exhaust" upgrade): on a post beside the unit
  { id: 'exhaustExtinguisher', name: 'Extinguisher (exhaust)', rect: { x: 18, y: 11, w: 1, h: 1 }, height: 0.6, colour: 0xc0281e, solid: false },
  // dock (x 23..28, y 22..45), roller door in the east wall; extinguisher at its south end, in full view
  { id: 'extinguisher', name: 'Extinguisher', rect: { x: 28, y: 34, w: 1, h: 1 }, height: 0.6, colour: 0xc0281e, solid: true },
  { id: 'rollerDoor', name: 'Roller door', rect: { x: 29, y: 28, w: 1, h: 6 }, height: 2.4, colour: 0x9ea4aa, solid: false },
  { id: 'smoko', name: 'Smoko chairs', rect: { x: 24, y: 42, w: 3, h: 1 }, height: 0.45, colour: 0x7a5a3a, solid: true },
  // office (x 6..17, y 39..45): door at the west end; the phone on the back wall beside the desk, a straight run in from the door
  { id: 'desk', name: 'Desk', rect: { x: 9, y: 45, w: 4, h: 1 }, height: 0.75, colour: 0x6b4e33, solid: true },
  { id: 'phone', name: 'Phone', rect: { x: 8, y: 45, w: 1, h: 1 }, height: 1.5, colour: 0x5a4632, solid: false }, // wall-mounted, next to the computer
  { id: 'fridge', name: 'Bar fridge', rect: { x: 17, y: 40, w: 1, h: 2 }, height: 0.9, colour: 0xe4e4e0, solid: true },
  // toilet, storage
  { id: 'toilet', name: 'Toilet', rect: { x: 20, y: 45, w: 1, h: 1 }, height: 0.45, colour: 0xf4f4f0, solid: true },
  { id: 'racks', name: 'Sheet racks', rect: { x: 24, y: 14, w: 5, h: 2 }, height: 1.8, colour: 0x8a6a40, solid: true },
  // back shed and yard
  { id: 'spareExtinguisher', name: 'Spare extinguisher', rect: { x: 2, y: 2, w: 1, h: 1 }, height: 0.6, colour: 0xc0281e, solid: true },
  { id: 'bags', name: 'Spare bags', rect: { x: 5, y: 2, w: 2, h: 1 }, height: 0.4, colour: 0xd0c8a8, solid: true },
  { id: 'skip', name: 'Skip', rect: { x: 10, y: 2, w: 3, h: 3 }, height: 1.1, colour: 0xc7782a, solid: true },
];

/** Workshop clutter: no actions, just there. Solid only if it's big enough to walk into. */
export type DecorKind = 'offcutStack' | 'pallet' | 'bench' | 'broom' | 'bin' | 'trolley' | 'hose' | 'drums' | 'panels' | 'cable';
export interface Decor { kind: DecorKind; rect: Rect; solid: boolean }

// Clutter hugs the walls and corners; lanes from the machine to every door stay clear:
// west of the machine to the side door, south-west to the office door, south to the corridor,
// east to the dock opening, north to the extractor.
export const DECOR: Decor[] = [
  { kind: 'offcutStack', rect: { x: 6, y: 28, w: 1, h: 3 }, solid: true },   // leaning on the west wall
  { kind: 'offcutStack', rect: { x: 17, y: 14, w: 3, h: 1 }, solid: true },  // leaning on the north wall
  { kind: 'pallet', rect: { x: 6, y: 31, w: 3, h: 3 }, solid: true },        // second, half-empty pallet
  { kind: 'bin', rect: { x: 10, y: 37, w: 1, h: 1 }, solid: true },        // against the office wall, clear of its door
  { kind: 'broom', rect: { x: 17, y: 37, w: 1, h: 1 }, solid: false },
  { kind: 'bench', rect: { x: 12, y: 36, w: 3, h: 2 }, solid: true },        // workbench with clamps
  { kind: 'hose', rect: { x: 6, y: 22, w: 1, h: 1 }, solid: false },         // air hose coiled on a hook
  { kind: 'drums', rect: { x: 20, y: 14, w: 2, h: 2 }, solid: true },
  { kind: 'cable', rect: { x: 18, y: 24, w: 4, h: 1 }, solid: false },        // cable snaking off the machine
  { kind: 'panels', rect: { x: 23, y: 23, w: 2, h: 2 }, solid: true },       // finished panels waiting
  { kind: 'trolley', rect: { x: 24, y: 37, w: 2, h: 2 }, solid: true },
  { kind: 'drums', rect: { x: 27, y: 39, w: 2, h: 2 }, solid: true },
];

export const objectById = (id: ObjectId) => OBJECTS.find(o => o.id === id)!;

/** Where a fresh save starts: just inside the roller door. */
export const START_TILE = { x: 27, y: 30 };
/** Where the player starts every day after the first: in front of the machine. */
export const MACHINE_SPOT = { x: 13, y: 28 };

/** Cells of the roller door (in the dock's east wall). */
export const ROLLER_TILES = Array.from({ length: 6 }, (_, i) => ({ x: 29, y: 28 + i }));

/**
 * Doorways that should read as doors from the room you're in: a door swung open into the room it
 * leads to, a mat on your side, a sign over the top. `cell` is the doorway's first cell (it's 2 wide,
 * along the wall); `swing` is the direction the door opens into, as a unit step in cells.
 */
export interface Doorway { sign: string; cell: { x: number; y: number }; along: 'x' | 'y'; swing: { x: number; y: number }; light?: boolean }
export const DOORWAYS: Doorway[] = [
  { sign: 'OFFICE', cell: { x: 6, y: 38 }, along: 'x', swing: { x: 0, y: 1 }, light: true }, // warm light spills out while the phone rings
  { sign: 'STORAGE', cell: { x: 25, y: 21 }, along: 'x', swing: { x: 0, y: -1 } },
  { sign: 'YARD', cell: { x: 5, y: 16 }, along: 'y', swing: { x: -1, y: 0 } },
];

/** Where a visiting mate mooches about (CONFIG.visitors.areas): the factory floor, the office, round the smoko chairs. */
export const VISITOR_AREAS: Record<VisitorArea, Rect> = {
  floor: { x: 6, y: 14, w: 16, h: 24 },
  office: { x: 6, y: 39, w: 12, h: 7 },
  smoko: { x: 23, y: 39, w: 6, h: 7 },
};
/** Where a visiting mate walks in: the dock, by the smoko chairs. */
export const VISITOR_ARRIVAL = { x: 26, y: 37 };

/**
 * Cells a visitor never stops on: doorways and the cells either side, the roller door and the customer pickup in front
 * of it, the finished pallet, and round the machine and the phone. They can walk through; they don't stand there.
 */
export function keepClearCells(cols = COLS): Set<number> {
  const s = new Set<number>();
  const add = (r: Rect, pad: number) => {
    for (let y = r.y - pad; y < r.y + r.h + pad; y++) for (let x = r.x - pad; x < r.x + r.w + pad; x++) s.add(y * cols + x);
  };
  const grid = buildGrid();
  grid.forEach((row, y) => row.forEach((t, x) => { if (t === T.DOOR) add({ x, y, w: 1, h: 1 }, 1); }));
  add({ x: ROLLER_TILES[0].x - 3, y: ROLLER_TILES[0].y - 1, w: 4, h: ROLLER_TILES.length + 2 }, 0); // roller door and the pickup in front of it
  for (const id of ['machine', 'phone', 'finishedPallet'] as const) add(objectById(id).rect, 1);
  add({ ...MACHINE_SPOT, w: 1, h: 1 }, 1);
  return s;
}

/** Where the ute and truck park on the apron (cells). Vehicles face north. */
export const VEHICLE_BAY: Rect = { x: 31, y: 26, w: 6, h: 10 };

/** Cells a player can't walk through: solid objects and solid clutter. */
export function solidCells(cols = COLS): Set<number> {
  const s = new Set<number>();
  for (const r of [...OBJECTS.filter(o => o.solid).map(o => o.rect), ...DECOR.filter(d => d.solid).map(d => d.rect)]) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(y * cols + x);
  }
  return s;
}

function fill(g: number[][], r: Rect, t: number) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = t;
}
function outline(g: number[][], r: Rect, t: number) {
  for (let x = r.x; x < r.x + r.w; x++) { g[r.y][x] = t; g[r.y + r.h - 1][x] = t; }
  for (let y = r.y; y < r.y + r.h; y++) { g[y][r.x] = t; g[y][r.x + r.w - 1] = t; }
}

export function buildGrid(): number[][] {
  const g = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(T.GROUND));
  fill(g, { x: 38, y: 0, w: 4, h: ROWS }, T.STREET);
  fill(g, { x: 30, y: 22, w: 8, h: 20 }, T.APRON);

  // the building: 12.5 m wide, 17 m deep
  fill(g, { x: 5, y: 13, w: 25, h: 34 }, T.FLOOR);
  outline(g, { x: 5, y: 13, w: 25, h: 34 }, T.WALL);
  // dock and storage down the east side, half-walled from the floor with a wide opening
  fill(g, { x: 22, y: 14, w: 1, h: 12 }, T.WALL);
  fill(g, { x: 22, y: 36, w: 1, h: 2 }, T.WALL);
  fill(g, { x: 23, y: 14, w: 6, h: 7 }, T.STORAGE);
  fill(g, { x: 23, y: 21, w: 6, h: 1 }, T.WALL);
  fill(g, { x: 23, y: 22, w: 6, h: 24 }, T.DOCK);
  // the near (south) band: office, corridor, toilet
  fill(g, { x: 6, y: 38, w: 17, h: 1 }, T.WALL);
  fill(g, { x: 6, y: 39, w: 12, h: 7 }, T.OFFICE);
  fill(g, { x: 18, y: 39, w: 1, h: 7 }, T.WALL);
  fill(g, { x: 19, y: 39, w: 3, h: 4 }, T.FLOOR);
  fill(g, { x: 19, y: 43, w: 3, h: 1 }, T.WALL);
  fill(g, { x: 19, y: 44, w: 3, h: 2 }, T.TOILET);
  fill(g, { x: 22, y: 39, w: 1, h: 7 }, T.WALL);
  // doorways are 2 cells (1 m) wide
  g[38][6] = g[38][7] = T.DOOR;     // office, at its west end
  g[38][19] = g[38][20] = T.DOOR;   // corridor
  g[43][20] = g[43][21] = T.DOOR;   // toilet
  g[21][25] = g[21][26] = T.DOOR;   // storage, off the dock
  g[16][5] = g[17][5] = T.DOOR;     // side door out to the yard
  for (const t of ROLLER_TILES) g[t.y][t.x] = T.ROLLER;

  // back shed in the rear yard
  outline(g, { x: 1, y: 1, w: 8, h: 6 }, T.WALL);
  fill(g, { x: 2, y: 2, w: 6, h: 4 }, T.SHED);
  g[6][5] = g[6][6] = T.DOOR;
  return g;
}

export const zoneAt = (cx: number, cy: number) => ZONES.find(z =>
  // smallest zone containing the cell, so rooms win over the yard around them
  cx >= z.rect.x && cx < z.rect.x + z.rect.w && cy >= z.rect.y && cy < z.rect.y + z.rect.h && !ZONES.some(o => o !== z
    && cx >= o.rect.x && cx < o.rect.x + o.rect.w && cy >= o.rect.y && cy < o.rect.y + o.rect.h && o.rect.w * o.rect.h < z.rect.w * z.rect.h));
