// Builds the shed out of boxes: floor, walls with doorways, every object at its real height, plus
// the things that come and go (vehicles, the mate, dust). Flat toon colours, warm palette.
import * as THREE from 'three';
import {
  buildGrid, COLS, isOutside, OBJECTS, ROLLER_TILES, ROWS, T, VEHICLE_BAY, type ObjectId, type PlacedObject, type Rect,
} from '../world/layout.js';
import { WORLD } from '../world/worldConfig.js';
import { mergeCells, rectToBox, type Box } from './collide.js';

const C = WORLD.cell;

export const PALETTE = {
  sky: 0xa9cfe0,
  floor: { [T.GROUND]: 0x8f8574, [T.STREET]: 0x45464a, [T.FLOOR]: 0xc4b08e, [T.OFFICE]: 0x86634a, [T.TOILET]: 0xdfe2da,
    [T.STORAGE]: 0xb5a283, [T.SHED]: 0x9a7f5a, [T.WALL]: 0x6b6258, [T.DOOR]: 0xb5a283, [T.ROLLER]: 0xa59a86,
    [T.APRON]: 0xa79f90, [T.DOCK]: 0xb9a582 } as Record<number, number>,
  speck: { [T.GROUND]: 0x6f6758, [T.FLOOR]: 0xe2cfa2, [T.DOCK]: 0xd8c497, [T.STORAGE]: 0xcbb68e, [T.STREET]: 0x55565a,
    [T.APRON]: 0x958d7f, [T.OFFICE]: 0x76563f, [T.SHED]: 0x846c4b } as Record<number, number>,
  brick: 0xefe3c8,      // cream-painted brick inside
  cladding: 0x4f6e4c,   // Colorbond green outside
  wallCap: 0xd9ccb0,
};

let gradient: THREE.DataTexture | null = null;
/** Three-step toon ramp: shadow, mid, lit. */
export function toonRamp() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}
const matCache = new Map<string, THREE.MeshToonMaterial>();
/** Shared toon material for a colour. Pass `own` for one you'll fade or recolour on its own. */
export function toon(colour: number, own = false, extra: THREE.MeshToonMaterialParameters = {}) {
  const key = `${colour}`;
  if (!own && !Object.keys(extra).length && matCache.has(key)) return matCache.get(key)!;
  const m = new THREE.MeshToonMaterial({ color: colour, gradientMap: toonRamp(), ...extra });
  if (!own && !Object.keys(extra).length) matCache.set(key, m);
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows; m.receiveShadow = true;
  return m;
}
/** A box sitting on the floor: centre (x, z), size (w, h, d), bottom at y0. */
export function boxAt(w: number, h: number, d: number, colour: number | THREE.Material, x = 0, y0 = 0, z = 0) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof colour === 'number' ? toon(colour) : colour);
  m.position.set(x, y0 + h / 2, z);
  return m;
}

export interface Fadeable { obj: THREE.Object3D; mats: THREE.Material[]; box: Box; height: number }

export interface ObjectView {
  def: PlacedObject;
  group: THREE.Group;
  /** Footprint in metres. */
  box: Box;
  centre: THREE.Vector3;
  parts: Record<string, THREE.Object3D>;
}

export interface BuiltWorld {
  grid: number[][];
  collisionBoxes: Box[];     // walls + solid furniture (the roller door is added while it's down)
  rollerBox: Box;
  objects: Map<ObjectId, ObjectView>;
  fadeables: Fadeable[];
  vehicles: { ute: THREE.Group; truck: THREE.Group };
  mate: THREE.Group;
  dust: THREE.Mesh[];
  pickables: THREE.Object3D[]; // things a tap can hit: object groups, vehicles, mate
  floor: THREE.Mesh;
}

// ---------- floor ----------

function buildFloor(grid: number[][]): THREE.Mesh {
  const px = 8; // texture px per cell
  const canvas = document.createElement('canvas');
  canvas.width = COLS * px; canvas.height = ROWS * px;
  const ctx = canvas.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const t = grid[y][x];
    ctx.fillStyle = `#${(PALETTE.floor[t] ?? 0xff00ff).toString(16).padStart(6, '0')}`;
    ctx.fillRect(x * px, y * px, px, px);
    const speck = PALETTE.speck[t];
    if (speck !== undefined) {
      ctx.fillStyle = `#${speck.toString(16).padStart(6, '0')}`;
      for (let i = 0; i < 3; i++) if (rnd() < 0.6) ctx.fillRect(x * px + Math.floor(rnd() * px), y * px + Math.floor(rnd() * px), 1, 1);
    }
    if (t === T.TOILET && (x + y) % 2) { ctx.fillStyle = '#cfd3ca'; ctx.fillRect(x * px, y * px, px, px); }
    if (t === T.STREET && y === ROWS - 2 && x % 4 < 2) { ctx.fillStyle = '#d8d0a0'; ctx.fillRect(x * px, y * px + 3, px, 2); }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS * C, ROWS * C), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp() }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(COLS * C / 2, 0, ROWS * C / 2);
  floor.receiveShadow = true;
  return floor;
}

// ---------- walls ----------

function wallMaterials(grid: number[][], r: Rect): THREE.MeshToonMaterial[] {
  // a face is Colorbond if most of the cells it looks onto are outside
  const side = (cells: [number, number][]) => {
    const looked = cells.filter(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS).map(([x, y]) => grid[y][x]);
    const out = looked.filter(isOutside).length;
    return toon(looked.length && out > looked.length / 2 ? PALETTE.cladding : PALETTE.brick, true, { transparent: true });
  };
  const xs = (y: number) => Array.from({ length: r.w }, (_, i) => [r.x + i, y] as [number, number]);
  const ys = (x: number) => Array.from({ length: r.h }, (_, i) => [x, r.y + i] as [number, number]);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  return [side(ys(r.x + r.w)), side(ys(r.x - 1)), toon(PALETTE.wallCap, true, { transparent: true }), toon(PALETTE.wallCap, true), side(xs(r.y + r.h)), side(xs(r.y - 1))];
}

function buildWalls(grid: number[][], scene: THREE.Object3D, fadeables: Fadeable[]): Box[] {
  const rects = mergeCells(COLS, ROWS, (x, y) => grid[y][x] === T.WALL);
  const boxes: Box[] = [];
  for (const r of rects) {
    const b = rectToBox(r, C);
    const mats = wallMaterials(grid, r);
    const m = mesh(new THREE.BoxGeometry(b.maxX - b.minX, WORLD.wallHeight, b.maxZ - b.minZ), mats);
    m.position.set((b.minX + b.maxX) / 2, WORLD.wallHeight / 2, (b.minZ + b.maxZ) / 2);
    scene.add(m);
    fadeables.push({ obj: m, mats, box: b, height: WORLD.wallHeight });
    boxes.push(b);
  }
  // lintels over doorways and the roller door opening
  const lintelH = WORLD.wallHeight - WORLD.lintel;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (grid[y][x] !== T.DOOR && grid[y][x] !== T.ROLLER) continue;
    const mat = toon(PALETTE.brick, true, { transparent: true });
    const m = boxAt(C, lintelH, C, mat, (x + 0.5) * C, WORLD.lintel, (y + 0.5) * C);
    scene.add(m);
    fadeables.push({ obj: m, mats: [mat], box: { minX: x * C, minZ: y * C, maxX: (x + 1) * C, maxZ: (y + 1) * C }, height: WORLD.wallHeight });
  }
  return boxes;
}

// ---------- objects ----------

type Builder = (g: THREE.Group, w: number, d: number, h: number, o: PlacedObject) => Record<string, THREE.Object3D>;

const sheetColour = 0xd6bc8a;

const BUILDERS: Partial<Record<ObjectId, Builder>> = {
  machine: (g, w, d, h, o) => {
    g.add(boxAt(w, h * 0.8, d, o.colour));                                   // frame
    g.add(boxAt(w - 0.15, 0.05, d - 0.15, 0x2c2c2e, 0, h * 0.8));            // spoilboard bed
    const sheet = boxAt(w - 0.4, 0.03, d - 0.4, sheetColour, 0, h * 0.8 + 0.05); sheet.visible = false; g.add(sheet);
    const clamps = new THREE.Group();
    for (const sx of [-1, 1]) clamps.add(boxAt(0.12, 0.08, d - 0.5, 0x333333, sx * (w / 2 - 0.3), h * 0.8 + 0.05));
    clamps.visible = false; g.add(clamps);
    const cut = boxAt(w - 0.6, 0.032, d - 0.6, 0x9a8460, 0, h * 0.8 + 0.06); cut.visible = false; g.add(cut);
    const gantry = new THREE.Group();
    gantry.add(boxAt(0.2, 0.55, d + 0.1, 0xd48a3c, 0, h * 0.8 + 0.4));      // beam
    gantry.add(boxAt(0.25, 0.35, 0.25, 0x555a60, 0, h * 0.8 + 0.12));       // spindle head
    for (const sz of [-1, 1]) gantry.add(boxAt(0.15, h * 0.8 + 0.95, 0.15, 0xd48a3c, 0, 0, sz * (d / 2 + 0.05)));
    g.add(gantry);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b1f }));
    light.position.set(w / 2 - 0.15, h * 0.8 + 0.15, -d / 2 + 0.15); light.visible = false; g.add(light);
    return { sheet, clamps, cut, gantry, light };
  },
  plyPallet: (g, w, d, h, o) => pallet(g, w, d, h, o, 0xd9be8c),
  finishedPallet: (g, w, d, h, o) => pallet(g, w, d, h, o, 0xe9d6ac),
  offcutBin: (g, w, d, h, o) => {
    for (const [x, z, bw, bd] of [[0, -d / 2 + 0.04, w, 0.08], [0, d / 2 - 0.04, w, 0.08], [-w / 2 + 0.04, 0, 0.08, d], [w / 2 - 0.04, 0, 0.08, d]] as const) {
      g.add(boxAt(bw, h, bd, o.colour, x, 0, z));
    }
    const fill = boxAt(w - 0.16, h * 0.95, d - 0.16, 0xb59a6a); fill.scale.y = 0.001; g.add(fill);
    return { fill };
  },
  bitRack: (g, w, d, h, o) => {
    g.add(boxAt(w, h, 0.12, o.colour, 0, 0, -d / 2 + 0.06));
    for (let i = 0; i < 5; i++) g.add(boxAt(0.05, 0.18, 0.05, 0xc8c8c8, -w / 2 + 0.2 + i * 0.15, h * 0.55, -d / 2 + 0.16));
    return {};
  },
  extractor: (g, w, d, h, o) => {
    g.add(boxAt(w * 0.55, h, d * 0.8, o.colour, -w * 0.2, 0, 0));
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), toon(0xd4cba6, true));
    bag.position.set(w * 0.25, 0.55, 0); bag.castShadow = true; g.add(bag);
    g.add(boxAt(0.12, 0.6, 0.12, 0x8a8f94, w * 0.25, 0.85, 0));
    return { bag };
  },
  compressor: (g, w, d, h, o) => {
    const tank = mesh(new THREE.CylinderGeometry(0.28, 0.28, w - 0.1, 12), toon(o.colour));
    tank.rotation.z = Math.PI / 2; tank.position.y = 0.32; g.add(tank);
    g.add(boxAt(0.4, 0.3, 0.35, 0x3a3a40, 0, 0.6, 0));
    return {};
  },
  duct: (g, w, d, h, o) => {
    // the pipe runs along under the roof; the rest of the vertical drop is the extractor's own stub
    g.add(boxAt(0.32, 0.32, d, o.colour, 0, h - 0.16));
    g.add(boxAt(0.32, h - 1.9, 0.32, o.colour, 0, 1.9, d / 2 - 0.16));
    return {};
  },
  exhaust: (g, w, d, h, o) => {
    g.add(boxAt(w - 0.2, h, d - 0.2, o.colour));
    const fan = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 12), toon(0x3a3e42));
    fan.position.y = h + 0.06; g.add(fan);
    g.add(boxAt(0.32, 2.3 - h, 0.32, 0x8a8f94, 0, h, d / 2 - 0.16)); // riser up to the duct
    return { fan };
  },
  extinguisher: (g, w, d, h, o) => extinguisher(g, h, o),
  spareExtinguisher: (g, w, d, h, o) => extinguisher(g, h, o),
  rollerDoor: (g, w, d, h, o) => {
    const door = new THREE.Group();
    const slats = boxAt(w, WORLD.lintel, 0.12, o.colour);
    door.add(slats);
    for (let i = 1; i < 10; i++) door.add(boxAt(w + 0.01, 0.02, 0.13, 0x7f858b, 0, i * WORLD.lintel / 10));
    g.add(door);
    return { door };
  },
  smoko: (g, w, d, h, o) => {
    for (const sx of [-0.45, 0.45]) {
      g.add(boxAt(0.45, h, 0.45, o.colour, sx, 0, 0));
      g.add(boxAt(0.45, 0.45, 0.08, o.colour, sx, h, -0.2));
    }
    return {};
  },
  desk: (g, w, d, h, o) => {
    g.add(boxAt(w, 0.05, d, o.colour, 0, h - 0.05));
    for (const sx of [-1, 1]) g.add(boxAt(0.06, h - 0.05, d - 0.1, shade(o.colour), sx * (w / 2 - 0.05)));
    g.add(boxAt(0.5, 0.35, 0.06, 0x2a2a2e, -0.3, h, -0.1));   // monitor
    g.add(boxAt(0.45, 0.02, 0.18, 0x3a3a3e, -0.3, h, 0.1));   // keyboard
    return {};
  },
  phone: (g, w, d, h, o) => {
    g.add(boxAt(w - 0.1, h, d - 0.1, o.colour));
    const handset = boxAt(0.22, 0.08, 0.14, 0x1e1e20, 0, h);
    g.add(handset);
    return { handset };
  },
  fridge: (g, w, d, h, o) => {
    g.add(boxAt(w - 0.05, h, d - 0.1, o.colour));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, h * 0.6, d * 0.6), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
    glow.position.set(-w / 2 + 0.01, h * 0.5, 0); glow.visible = false; g.add(glow);
    return { glow };
  },
  toilet: (g, w, d, h, o) => {
    const bowl = mesh(new THREE.CylinderGeometry(0.18, 0.14, h, 10), toon(o.colour)); bowl.position.set(0, h / 2, 0.05); g.add(bowl);
    g.add(boxAt(0.4, 0.4, 0.15, o.colour, 0, h, -0.17));
    return {};
  },
  racks: (g, w, d, h, o) => {
    for (const sx of [-1, 0, 1]) g.add(boxAt(0.08, h, d, 0x5a5f66, sx * (w / 2 - 0.05)));
    for (let i = 0; i < 14; i++) g.add(boxAt(w - 0.2, 0.03, d - 0.15, i % 3 ? 0xd6bc8a : 0xc7a878, 0, 0.1 + i * 0.1));
    return {};
  },
  bags: (g, w, d, h, o) => {
    for (const sx of [-0.25, 0.25]) g.add(boxAt(0.45, h, d - 0.1, o.colour, sx));
    return {};
  },
  skip: (g, w, d, h, o) => {
    for (const [x, z, bw, bd] of [[0, -d / 2 + 0.05, w, 0.1], [0, d / 2 - 0.05, w, 0.1], [-w / 2 + 0.05, 0, 0.1, d], [w / 2 - 0.05, 0, 0.1, d]] as const) {
      g.add(boxAt(bw, h, bd, o.colour, x, 0, z));
    }
    g.add(boxAt(w - 0.2, 0.3, d - 0.2, 0x6b5a44));
    return {};
  },
};

function shade(c: number, f = 0.75) { return new THREE.Color(c).multiplyScalar(f).getHex(); }

function pallet(g: THREE.Group, w: number, d: number, h: number, o: PlacedObject, sheet: number) {
  for (const sz of [-1, 0, 1]) g.add(boxAt(w - 0.1, h * 0.6, 0.12, o.colour, 0, 0, sz * (d / 2 - 0.12)));
  g.add(boxAt(w - 0.1, h * 0.4, d - 0.1, o.colour, 0, h * 0.6));
  const stack = new THREE.Group();
  for (let i = 0; i < 10; i++) { const s = boxAt(w - 0.25, 0.04, d - 0.25, i % 2 ? sheet : shade(sheet, 0.92), 0, h + i * 0.045); s.visible = false; stack.add(s); }
  g.add(stack);
  return { stack };
}

function extinguisher(g: THREE.Group, h: number, o: PlacedObject) {
  const can = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.11, 0.11, h * 0.85, 10), toon(o.colour)); body.position.y = h * 0.425; can.add(body);
  can.add(boxAt(0.06, h * 0.15, 0.06, 0x222222, 0, h * 0.85));
  g.add(can);
  const hook = boxAt(0.18, 0.05, 0.05, 0x777777, 0, h * 0.7, -0.15); g.add(hook);
  return { can };
}

function buildObject(o: PlacedObject): ObjectView {
  const box = rectToBox(o.rect, C);
  const w = box.maxX - box.minX, d = box.maxZ - box.minZ;
  const g = new THREE.Group();
  g.position.set((box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2);
  const parts = (BUILDERS[o.id] ?? ((gg, ww, dd, hh, oo) => { gg.add(boxAt(ww - 0.1, hh, dd - 0.1, oo.colour)); return {}; }))(g, w, d, o.height, o);
  g.traverse(c => { c.userData.objectId = o.id; });
  return { def: o, group: g, box, centre: new THREE.Vector3(g.position.x, o.height, g.position.z), parts };
}

// ---------- vehicles, mate, dust ----------

function buildVehicles() {
  const bay = rectToBox(VEHICLE_BAY, C);
  const cx = (bay.minX + bay.maxX) / 2, cz = (bay.minZ + bay.maxZ) / 2;
  const wheel = (x: number, z: number) => { const m = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), toon(0x1e1e20)); m.rotation.z = Math.PI / 2; m.position.set(x, 0.3, z); return m; };
  const ute = new THREE.Group();
  ute.add(boxAt(1.8, 0.7, 4.2, 0x3c6e9e, 0, 0.35));         // body, nose to the north
  ute.add(boxAt(1.7, 0.7, 1.6, 0x3c6e9e, 0, 1.05, -0.8));   // cab
  ute.add(boxAt(1.6, 0.4, 1.2, 0x9fc4d8, 0, 1.15, -1.35)); // windscreen
  for (const [x, z] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]) ute.add(wheel(x, z));
  ute.position.set(cx - 0.8, 0, cz); ute.visible = false;
  const truck = new THREE.Group();
  truck.add(boxAt(2.2, 2.2, 3.4, 0xe6e6e2, 0, 0.6, 0.6));  // box body
  truck.add(boxAt(2.2, 1.6, 1.4, 0xc0281e, 0, 0.6, -1.8));  // cab
  for (const [x, z] of [[-1.1, -1.8], [1.1, -1.8], [-1.1, 1.6], [1.1, 1.6]]) truck.add(wheel(x, z));
  truck.position.set(cx, 0, cz); truck.visible = false;
  for (const v of [ute, truck]) v.traverse(c => { c.userData.objectId = 'rollerDoor'; });
  return { ute, truck };
}

export function buildCharacter(body: number) {
  const g = new THREE.Group();
  const b = mesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 10), toon(body)); b.position.y = 0.45; g.add(b);
  const head = mesh(new THREE.SphereGeometry(0.17, 12, 10), toon(0xf0c9a0)); head.position.y = 0.95; g.add(head);
  return g;
}

function buildMate(at: Box) {
  const g = buildCharacter(0x5a8fc0);
  g.position.set((at.minX + at.maxX) / 2, 0, at.minZ - 0.45);
  g.visible = false;
  g.traverse(c => { c.userData.objectId = 'smoko'; });
  return g;
}

function buildDust(): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mat = new THREE.MeshBasicMaterial({ color: 0xe3d6b4, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.15 + rnd() * 0.35, 10), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((12 + rnd() * 12) * C, 0.012, (20 + rnd() * 16) * C);
    m.visible = false;
    out.push(m);
  }
  return out;
}

// ---------- everything ----------

export function buildWorld(scene: THREE.Scene): BuiltWorld {
  const grid = buildGrid();
  scene.background = new THREE.Color(PALETTE.sky);
  const floor = buildFloor(grid);
  scene.add(floor);
  const fadeables: Fadeable[] = [];
  const collisionBoxes = buildWalls(grid, scene, fadeables);
  const objects = new Map<ObjectId, ObjectView>();
  const pickables: THREE.Object3D[] = [];
  for (const o of OBJECTS) {
    const v = buildObject(o);
    scene.add(v.group);
    objects.set(o.id, v);
    pickables.push(v.group);
    if (o.solid) collisionBoxes.push(v.box);
    if (o.height >= 1.5) {
      const mats: THREE.Material[] = [];
      v.group.traverse(c => {
        const m = c as THREE.Mesh;
        if (m.isMesh && !Array.isArray(m.material)) { m.material = (m.material as THREE.Material).clone(); m.material.transparent = true; mats.push(m.material); }
      });
      fadeables.push({ obj: v.group, mats, box: v.box, height: o.height });
    }
  }
  const rt = ROLLER_TILES;
  const rollerBox: Box = { minX: rt[0].x * C, minZ: rt[0].y * C, maxX: (rt[rt.length - 1].x + 1) * C, maxZ: (rt[0].y + 1) * C };
  const vehicles = buildVehicles();
  scene.add(vehicles.ute, vehicles.truck);
  const mate = buildMate(objects.get('smoko')!.box);
  scene.add(mate);
  const dust = buildDust();
  for (const m of dust) scene.add(m);
  pickables.push(vehicles.ute, vehicles.truck, mate);
  return { grid, collisionBoxes, rollerBox, objects, fadeables, vehicles, mate, dust, pickables, floor };
}
