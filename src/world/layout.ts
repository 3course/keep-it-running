// The shed as data: a grid of 0.5 m cells, rooms, and the objects in them with real heights.
// Top of the map (row 0) is the back of the site, the bottom is the street.
// World space: x = column * cell, z = row * cell, y up. North is -z.

export const COLS = 30;
export const ROWS = 77;

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

/** A room or area. yawDeg nudges the camera so the room is framed when you walk in. */
export interface Zone { name: string; rect: Rect; yawDeg: number }

export type ObjectId =
  | 'machine' | 'plyPallet' | 'finishedPallet' | 'offcutBin' | 'bitRack' | 'extractor' | 'compressor'
  | 'exhaust' | 'duct' | 'extinguisher' | 'rollerDoor' | 'smoko' | 'desk' | 'phone' | 'fridge'
  | 'toilet' | 'racks' | 'spareExtinguisher' | 'bags' | 'skip';

export interface PlacedObject {
  id: ObjectId;
  name: string;
  rect: Rect;
  height: number;   // m
  colour: number;
  solid: boolean;   // blocks walking
}

export const ZONES: Zone[] = [
  { name: 'Rear yard', rect: { x: 0, y: 0, w: 30, h: 11 }, yawDeg: 0 },
  { name: 'Back shed', rect: { x: 1, y: 1, w: 8, h: 6 }, yawDeg: -18 },
  { name: 'Exhaust unit', rect: { x: 20, y: 7, w: 5, h: 4 }, yawDeg: 15 },
  { name: 'Office', rect: { x: 1, y: 12, w: 8, h: 7 }, yawDeg: -18 },
  { name: 'Toilet', rect: { x: 10, y: 12, w: 3, h: 2 }, yawDeg: 0 },
  { name: 'Corridor', rect: { x: 10, y: 15, w: 3, h: 4 }, yawDeg: 0 },
  { name: 'Storage', rect: { x: 14, y: 12, w: 11, h: 7 }, yawDeg: 15 },
  { name: 'Factory floor', rect: { x: 1, y: 20, w: 24, h: 40 }, yawDeg: 0 },
  { name: 'Delivery dock', rect: { x: 1, y: 61, w: 24, h: 7 }, yawDeg: 0 },
  { name: 'Side alley', rect: { x: 26, y: 11, w: 4, h: 63 }, yawDeg: 22 },
  { name: 'Apron', rect: { x: 5, y: 69, w: 17, h: 5 }, yawDeg: 0 },
  { name: 'Street', rect: { x: 0, y: 74, w: 30, h: 3 }, yawDeg: 0 },
];

export const OBJECTS: PlacedObject[] = [
  // factory floor
  { id: 'machine', name: 'CNC router', rect: { x: 8, y: 26, w: 8, h: 5 }, height: 0.85, colour: 0x3d5a78, solid: true },
  { id: 'plyPallet', name: 'Ply pallet', rect: { x: 2, y: 33, w: 3, h: 3 }, height: 0.15, colour: 0xa07a48, solid: true },
  { id: 'finishedPallet', name: 'Finished pallet', rect: { x: 19, y: 33, w: 3, h: 3 }, height: 0.15, colour: 0x8a6a40, solid: true },
  { id: 'offcutBin', name: 'Offcut bin', rect: { x: 17, y: 27, w: 2, h: 2 }, height: 0.9, colour: 0x4f6b3a, solid: true },
  { id: 'bitRack', name: 'Bit rack', rect: { x: 15, y: 20, w: 2, h: 1 }, height: 1.3, colour: 0x6f7c88, solid: true },
  { id: 'extractor', name: 'Extractor', rect: { x: 21, y: 20, w: 3, h: 2 }, height: 2.0, colour: 0x3f7070, solid: true },
  { id: 'compressor', name: 'Compressor', rect: { x: 2, y: 52, w: 2, h: 2 }, height: 0.9, colour: 0x5a5f9a, solid: true },
  // duct: up from the extractor, along under the roof, out through the back wall to the exhaust unit
  { id: 'duct', name: 'Duct', rect: { x: 22, y: 11, w: 1, h: 9 }, height: 2.3, colour: 0x8a8f94, solid: false },
  { id: 'exhaust', name: 'Exhaust unit', rect: { x: 21, y: 8, w: 3, h: 3 }, height: 1.6, colour: 0x6b6f72, solid: true },
  // dock
  { id: 'extinguisher', name: 'Extinguisher', rect: { x: 16, y: 67, w: 1, h: 1 }, height: 0.6, colour: 0xc0281e, solid: true },
  { id: 'rollerDoor', name: 'Roller door', rect: { x: 9, y: 68, w: 6, h: 1 }, height: 2.4, colour: 0x9ea4aa, solid: false },
  { id: 'smoko', name: 'Smoko chairs', rect: { x: 19, y: 64, w: 3, h: 1 }, height: 0.45, colour: 0x7a5a3a, solid: true },
  // office
  { id: 'desk', name: 'Desk', rect: { x: 2, y: 13, w: 4, h: 1 }, height: 0.75, colour: 0x6b4e33, solid: true },
  { id: 'phone', name: 'Phone', rect: { x: 6, y: 13, w: 1, h: 1 }, height: 0.75, colour: 0x5a4632, solid: true },
  { id: 'fridge', name: 'Bar fridge', rect: { x: 7, y: 16, w: 1, h: 2 }, height: 0.9, colour: 0xe4e4e0, solid: true },
  // toilet, storage
  { id: 'toilet', name: 'Toilet', rect: { x: 11, y: 12, w: 1, h: 1 }, height: 0.45, colour: 0xf4f4f0, solid: true },
  { id: 'racks', name: 'Sheet racks', rect: { x: 15, y: 12, w: 9, h: 2 }, height: 1.8, colour: 0x8a6a40, solid: true },
  // back shed and yard
  { id: 'spareExtinguisher', name: 'Spare extinguisher', rect: { x: 2, y: 2, w: 1, h: 1 }, height: 0.6, colour: 0xc0281e, solid: true },
  { id: 'bags', name: 'Spare bags', rect: { x: 5, y: 2, w: 2, h: 1 }, height: 0.4, colour: 0xd0c8a8, solid: true },
  { id: 'skip', name: 'Skip', rect: { x: 10, y: 3, w: 3, h: 3 }, height: 1.1, colour: 0xc7782a, solid: true },
];

export const objectById = (id: ObjectId) => OBJECTS.find(o => o.id === id)!;

/** Where the player starts each day: just inside the roller door. */
export const START_TILE = { x: 12, y: 65 };

/** Cells of the roller door. */
export const ROLLER_TILES = Array.from({ length: 6 }, (_, i) => ({ x: 9 + i, y: 68 }));

/** Where the ute and truck park on the apron (cells). */
export const VEHICLE_BAY: Rect = { x: 7, y: 69, w: 8, h: 4 };

function fill(g: number[][], r: Rect, t: number) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = t;
}
function outline(g: number[][], r: Rect, t: number) {
  for (let x = r.x; x < r.x + r.w; x++) { g[r.y][x] = t; g[r.y + r.h - 1][x] = t; }
  for (let y = r.y; y < r.y + r.h; y++) { g[y][r.x] = t; g[y][r.x + r.w - 1] = t; }
}

export function buildGrid(): number[][] {
  const g = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(T.GROUND));
  fill(g, { x: 0, y: 74, w: COLS, h: 3 }, T.STREET);
  fill(g, { x: 5, y: 69, w: 17, h: 5 }, T.APRON);

  // the building: 13 m wide, 29 m deep
  fill(g, { x: 0, y: 11, w: 26, h: 58 }, T.FLOOR);
  outline(g, { x: 0, y: 11, w: 26, h: 58 }, T.WALL);
  // back band of rooms, walled off from the floor at row 19
  fill(g, { x: 1, y: 19, w: 24, h: 1 }, T.WALL);
  fill(g, { x: 1, y: 12, w: 8, h: 7 }, T.OFFICE);
  fill(g, { x: 9, y: 12, w: 1, h: 7 }, T.WALL);
  fill(g, { x: 10, y: 12, w: 3, h: 2 }, T.TOILET);
  fill(g, { x: 10, y: 14, w: 3, h: 1 }, T.WALL);
  fill(g, { x: 13, y: 12, w: 1, h: 7 }, T.WALL);
  fill(g, { x: 14, y: 12, w: 11, h: 7 }, T.STORAGE);
  // doorways are 2 cells (1 m) wide
  g[19][5] = g[19][6] = T.DOOR;     // office
  g[19][11] = g[19][12] = T.DOOR;   // corridor
  g[14][11] = g[14][12] = T.DOOR;   // toilet
  g[19][19] = g[19][20] = T.DOOR;   // storage
  g[21][25] = g[22][25] = T.DOOR;   // side door out to the alley
  // delivery dock, half-walled from the floor
  fill(g, { x: 1, y: 61, w: 24, h: 7 }, T.DOCK);
  fill(g, { x: 1, y: 60, w: 4, h: 1 }, T.WALL);
  fill(g, { x: 21, y: 60, w: 4, h: 1 }, T.WALL);
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
