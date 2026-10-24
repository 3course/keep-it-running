// The shed as a tile grid. Top of the map is the back of the building, bottom is the street.
// Everything is in tile coordinates; WorldScene converts to pixels.

export const COLS = 30;
export const ROWS = 60;

export const T = {
  GROUND: 0,   // outside: gravel / concrete yard
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

export const TILE_COLOURS: Record<number, number> = {
  [T.GROUND]: 0x5c5a52, [T.STREET]: 0x2f2f33, [T.FLOOR]: 0x8a8378, [T.OFFICE]: 0x6b5a48,
  [T.TOILET]: 0xb8c4c8, [T.STORAGE]: 0x7a7266, [T.SHED]: 0x6e6450, [T.WALL]: 0x2a2420,
  [T.DOOR]: 0xa0763c, [T.ROLLER]: 0x8c8f94, [T.APRON]: 0x75736b, [T.DOCK]: 0x948a7a,
};

export interface Rect { x: number; y: number; w: number; h: number }

export interface Zone { name: string; rect: Rect }

export type ObjectId =
  | 'machine' | 'plyPallet' | 'finishedPallet' | 'offcutBin' | 'bitRack' | 'extractor' | 'compressor'
  | 'exhaust' | 'duct' | 'extinguisher' | 'rollerDoor' | 'smoko' | 'desk' | 'phone' | 'fridge'
  | 'toilet' | 'racks' | 'spareExtinguisher' | 'bags' | 'skip';

export interface PlacedObject {
  id: ObjectId;
  name: string;      // placeholder label drawn on it
  rect: Rect;
  colour: number;
  solid: boolean;    // blocks walking
}

export const ZONES: Zone[] = [
  { name: 'Rear yard', rect: { x: 0, y: 0, w: 30, h: 11 } },
  { name: 'Back shed', rect: { x: 1, y: 1, w: 8, h: 6 } },
  { name: 'Exhaust unit', rect: { x: 20, y: 7, w: 5, h: 4 } },
  { name: 'Office', rect: { x: 1, y: 12, w: 8, h: 7 } },
  { name: 'Toilet', rect: { x: 10, y: 12, w: 3, h: 2 } },
  { name: 'Corridor', rect: { x: 10, y: 15, w: 3, h: 4 } },
  { name: 'Storage', rect: { x: 14, y: 12, w: 11, h: 7 } },
  { name: 'Factory floor', rect: { x: 1, y: 20, w: 24, h: 23 } },
  { name: 'Delivery dock', rect: { x: 1, y: 44, w: 24, h: 6 } },
  { name: 'Side alley', rect: { x: 26, y: 11, w: 4, h: 46 } },
  { name: 'Apron', rect: { x: 5, y: 51, w: 17, h: 6 } },
  { name: 'Street', rect: { x: 0, y: 57, w: 30, h: 3 } },
];

export const OBJECTS: PlacedObject[] = [
  // factory floor
  { id: 'machine', name: 'CNC router', rect: { x: 8, y: 26, w: 8, h: 5 }, colour: 0x3b4a5c, solid: true },
  { id: 'plyPallet', name: 'Ply pallet', rect: { x: 2, y: 33, w: 3, h: 3 }, colour: 0xb08a55, solid: true },
  { id: 'finishedPallet', name: 'Finished pallet', rect: { x: 19, y: 33, w: 3, h: 3 }, colour: 0x8a6d44, solid: true },
  { id: 'offcutBin', name: 'Offcut bin', rect: { x: 17, y: 27, w: 2, h: 2 }, colour: 0x4a5a3a, solid: true },
  { id: 'bitRack', name: 'Bit rack', rect: { x: 15, y: 20, w: 2, h: 1 }, colour: 0x707a84, solid: true },
  { id: 'extractor', name: 'Extractor', rect: { x: 21, y: 20, w: 3, h: 2 }, colour: 0x4f6b6b, solid: true },
  { id: 'compressor', name: 'Compressor', rect: { x: 2, y: 40, w: 2, h: 2 }, colour: 0x5e5e8a, solid: true },
  // duct runs up from the extractor, through the back wall, to the exhaust unit outside
  { id: 'duct', name: 'Duct', rect: { x: 22, y: 11, w: 1, h: 9 }, colour: 0x6b6560, solid: false },
  { id: 'exhaust', name: 'Exhaust unit', rect: { x: 21, y: 8, w: 3, h: 3 }, colour: 0x55504a, solid: true },
  // dock
  { id: 'extinguisher', name: 'Extinguisher', rect: { x: 16, y: 49, w: 1, h: 1 }, colour: 0xc0281e, solid: true },
  { id: 'rollerDoor', name: 'Roller door', rect: { x: 9, y: 50, w: 6, h: 1 }, colour: 0x8c8f94, solid: false },
  { id: 'smoko', name: 'Smoko chairs', rect: { x: 19, y: 46, w: 3, h: 1 }, colour: 0x7a5a3a, solid: true },
  // office
  { id: 'desk', name: 'Desk + computer', rect: { x: 2, y: 13, w: 4, h: 1 }, colour: 0x5a4632, solid: true },
  { id: 'phone', name: 'Phone', rect: { x: 6, y: 13, w: 1, h: 1 }, colour: 0x222222, solid: true },
  { id: 'fridge', name: 'Bar fridge', rect: { x: 7, y: 16, w: 1, h: 2 }, colour: 0xd8d8d8, solid: true },
  // toilet, storage
  { id: 'toilet', name: 'Toilet', rect: { x: 11, y: 12, w: 1, h: 1 }, colour: 0xf0f0f0, solid: true },
  { id: 'racks', name: 'Sheet racks', rect: { x: 15, y: 12, w: 9, h: 2 }, colour: 0x9a7a4a, solid: true },
  // back shed and yard
  { id: 'spareExtinguisher', name: 'Spare extinguisher', rect: { x: 2, y: 2, w: 1, h: 1 }, colour: 0xc0281e, solid: true },
  { id: 'bags', name: 'Spare bags', rect: { x: 5, y: 2, w: 2, h: 1 }, colour: 0xc8c0a0, solid: true },
  { id: 'skip', name: 'Skip', rect: { x: 10, y: 3, w: 3, h: 3 }, colour: 0x6b4a2a, solid: true },
];

export const objectById = (id: ObjectId) => OBJECTS.find(o => o.id === id)!;

/** Where the player starts each day: just inside the roller door. */
export const START_TILE = { x: 12, y: 47 };

/** Tile indices of the roller door. */
export const ROLLER_TILES = Array.from({ length: 6 }, (_, i) => ({ x: 9 + i, y: 50 }));

function fill(g: number[][], r: Rect, t: number) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = t;
}
function outline(g: number[][], r: Rect, t: number) {
  for (let x = r.x; x < r.x + r.w; x++) { g[r.y][x] = t; g[r.y + r.h - 1][x] = t; }
  for (let y = r.y; y < r.y + r.h; y++) { g[y][r.x] = t; g[y][r.x + r.w - 1] = t; }
}

export function buildGrid(): number[][] {
  const g = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(T.GROUND));
  fill(g, { x: 0, y: 57, w: COLS, h: 3 }, T.STREET);
  fill(g, { x: 5, y: 51, w: 17, h: 6 }, T.APRON);

  // the building
  fill(g, { x: 0, y: 11, w: 26, h: 40 }, T.FLOOR);
  outline(g, { x: 0, y: 11, w: 26, h: 40 }, T.WALL);
  // back band of rooms, walled off from the floor at row 19
  fill(g, { x: 1, y: 19, w: 24, h: 1 }, T.WALL);
  fill(g, { x: 1, y: 12, w: 8, h: 7 }, T.OFFICE);
  fill(g, { x: 9, y: 12, w: 1, h: 7 }, T.WALL);
  fill(g, { x: 10, y: 12, w: 3, h: 2 }, T.TOILET);
  fill(g, { x: 10, y: 14, w: 3, h: 1 }, T.WALL);
  fill(g, { x: 13, y: 12, w: 1, h: 7 }, T.WALL);
  fill(g, { x: 14, y: 12, w: 11, h: 7 }, T.STORAGE);
  g[19][5] = T.DOOR;   // office
  g[19][11] = T.DOOR;  // corridor
  g[14][11] = T.DOOR;  // toilet
  g[19][19] = T.DOOR;  // storage
  g[21][25] = T.DOOR;  // side door out to the alley
  // delivery dock, half-walled from the floor
  fill(g, { x: 1, y: 44, w: 24, h: 6 }, T.DOCK);
  fill(g, { x: 1, y: 43, w: 4, h: 1 }, T.WALL);
  fill(g, { x: 21, y: 43, w: 4, h: 1 }, T.WALL);
  for (const t of ROLLER_TILES) g[t.y][t.x] = T.ROLLER;

  // back shed in the rear yard
  outline(g, { x: 1, y: 1, w: 8, h: 6 }, T.WALL);
  fill(g, { x: 2, y: 2, w: 6, h: 4 }, T.SHED);
  g[6][5] = T.DOOR;
  return g;
}

export const isWallTile = (t: number) => t === T.WALL;
