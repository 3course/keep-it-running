// Builds the shed out of boxes: floor, walls with doorways, every object at its real height, plus
// the things that come and go (vehicles, the mate, dust). Flat toon colours, warm palette.
import * as THREE from 'three';
import {
  buildGrid, COLS, DECOR, DOORWAYS, isOutside, OBJECTS, ROLLER_TILES, ROWS, T, VEHICLE_BAY, objectById, type Decor, type Doorway, type ObjectId, type PlacedObject, type Rect,
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
  doorways: DoorwayView[];
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
    if (t === T.STREET && x === COLS - 2 && y % 4 < 2) { ctx.fillStyle = '#d8d0a0'; ctx.fillRect(x * px + 3, y * px, 2, px); }
  }
  paintFloorDecals(ctx, grid, px, rnd);
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

/** Wear and mess painted into the floor: sawdust drifts, a worn patch at the machine, pallet-jack tracks. */
function paintFloorDecals(ctx: CanvasRenderingContext2D, grid: number[][], px: number, rnd: () => number) {
  const centre = (r: Rect) => ({ x: (r.x + r.w / 2) * px, y: (r.y + r.h / 2) * px });
  const indoors = (cx: number, cy: number) => { const t = grid[Math.floor(cy / px)]?.[Math.floor(cx / px)]; return t === T.FLOOR || t === T.DOCK; };

  // the worn patch in front of the machine, where you stand all day
  const m = objectById('machine').rect;
  const wear = ctx.createRadialGradient(centre(m).x, (m.y + m.h + 1.5) * px, 2, centre(m).x, (m.y + m.h + 1.5) * px, 5 * px);
  wear.addColorStop(0, 'rgba(92,72,50,0.42)'); wear.addColorStop(1, 'rgba(92,72,50,0)');
  ctx.fillStyle = wear;
  ctx.save(); ctx.translate(centre(m).x, (m.y + m.h + 1.5) * px); ctx.scale(1, 0.45); ctx.translate(-centre(m).x, -(m.y + m.h + 1.5) * px);
  ctx.fillRect((m.x - 2) * px, (m.y + m.h - 4) * px, (m.w + 4) * px, 11 * px);
  ctx.restore();

  // pallet-jack tyre tracks: roller door → dock opening → each pallet
  const lane = (pts: [number, number][]) => {
    for (const off of [-0.65, 0.65]) {
      ctx.strokeStyle = 'rgba(58,44,32,0.32)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [nx, ny] = pts[Math.min(i + 1, pts.length - 1)], [ppx, ppy] = pts[Math.max(i - 1, 0)];
        const dx = nx - ppx, dy = ny - ppy, d = Math.hypot(dx, dy) || 1;
        const X = (x + (-dy / d) * off) * px, Y = (y + (dx / d) * off) * px;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.stroke();
    }
  };
  const ply = objectById('plyPallet').rect, fin = objectById('finishedPallet').rect;
  lane([[29, 31], [25, 31.5], [21, 32.5], [15, 32], [10.5, 30.5], [ply.x + ply.w + 0.4, ply.y + 1.5]]);
  lane([[29, 30], [25, 30.2], [fin.x + fin.w + 0.6, fin.y + 1.5]]);

  // sawdust: drifts thickest round the extractor, thinning across the floor
  const ex = centre(objectById('extractor').rect);
  for (let i = 0; i < 2200; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 1.8) * 16 * px;
    const x = ex.x + Math.cos(a) * r, y = ex.y + 2 * px + Math.sin(a) * r * 1.2;
    if (!indoors(x, y)) continue;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(236,214,160,0.9)' : 'rgba(214,190,140,0.8)';
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }
  for (let i = 0; i < 14; i++) { // soft drifts banked against the walls nearest the extractor
    const x = ex.x + (rnd() - 0.5) * 9 * px, y = ex.y + (0.5 + rnd() * 3) * px;
    if (!indoors(x, y)) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, (1 + rnd() * 1.6) * px);
    g.addColorStop(0, 'rgba(232,212,164,0.55)'); g.addColorStop(1, 'rgba(232,212,164,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 3 * px, y - 3 * px, 6 * px, 6 * px);
  }
  // and around the machine, where the cutting happens
  for (let i = 0; i < 500; i++) {
    const x = (m.x - 1 + rnd() * (m.w + 2)) * px, y = (m.y - 1 + rnd() * (m.h + 2)) * px;
    if (!indoors(x, y)) continue;
    ctx.fillStyle = 'rgba(236,214,160,0.85)';
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }
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

// ---------- doorways ----------

export interface DoorwayView {
  def: Doorway;
  /** Middle of the sign over the doorway, for the crisp DOM lettering. */
  signAt: THREE.Vector3;
  /** Warm light spilling out of the doorway (office only); fade its material and the lamp in and out. */
  spill?: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; lamp: THREE.PointLight };
}

function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4a3a22'; ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#f4ecd2'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 9);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A doorway that reads as one: frame, door swung open into the next room, mat on this side, sign over the top. */
function buildDoorway(dw: Doorway, scene: THREE.Object3D, fadeables: Fadeable[]): DoorwayView {
  const alongX = dw.along === 'x';
  // opening in metres: `a` runs along the wall, `n` across it (the swing side is +n when swing is positive)
  const a0 = (alongX ? dw.cell.x : dw.cell.y) * C, a1 = a0 + 2 * C;
  const n0 = (alongX ? dw.cell.y : dw.cell.x) * C, n1 = n0 + C;
  const s = alongX ? dw.swing.y : dw.swing.x;
  const swingFace = s > 0 ? n1 : n0, matFace = s > 0 ? n0 : n1;
  const at = (a: number, n: number, y = 0) => (alongX ? new THREE.Vector3(a, y, n) : new THREE.Vector3(n, y, a));
  const g = new THREE.Group();
  const fadeMats: THREE.Material[] = [];
  const own = (colour: number) => { const m = toon(colour, true, { transparent: true }); fadeMats.push(m); return m; };

  // frame: two jambs and a head, standing a little proud of both wall faces
  const frameMat = own(0x5a3f28), depth = C + 0.06;
  const piece = (w: number, h: number, a: number, y0: number) => {
    const m = boxAt(alongX ? w : depth, h, alongX ? depth : w, frameMat);
    m.position.copy(at(a, (n0 + n1) / 2, y0 + h / 2));
    g.add(m);
  };
  piece(0.07, WORLD.lintel, a0 + 0.035, 0);
  piece(0.07, WORLD.lintel, a1 - 0.035, 0);
  piece(a1 - a0, 0.08, (a0 + a1) / 2, WORLD.lintel - 0.04);

  // the door, hinged on the first jamb, swung all the way open into the room it leads to
  const doorW = a1 - a0 - 0.1, doorH = WORLD.lintel - 0.06;
  const pivot = new THREE.Group();
  pivot.position.copy(at(a0 + 0.06, swingFace + s * 0.03));
  const panel = boxAt(doorW, doorH, 0.045, own(0x9a6a3c), doorW / 2, 0);
  const inset = boxAt(doorW - 0.2, doorH * 0.36, 0.055, own(0x87592f), doorW / 2, doorH * 0.5);
  const inset2 = boxAt(doorW - 0.2, doorH * 0.3, 0.055, own(0x87592f), doorW / 2, doorH * 0.1);
  const knob = boxAt(0.06, 0.06, 0.1, own(0xd8c47a), doorW - 0.1, 0.98);
  pivot.add(panel, inset, inset2, knob);
  // local +x → into the room (along the swing), leaning back a touch toward the wall it's hinged on
  const dir = at(0, s); // direction across the wall
  pivot.rotation.y = Math.atan2(-dir.z, dir.x) + (alongX ? -s : s) * 0.05;
  g.add(pivot);

  // doormat on this side
  const matW = (a1 - a0) - 0.05, matD = 0.55;
  const matCentre = at((a0 + a1) / 2, matFace - s * (matD / 2 + 0.04), 0);
  const mat = boxAt(alongX ? matW : matD, 0.018, alongX ? matD : matW, 0x5b4636);
  mat.position.set(matCentre.x, 0.009, matCentre.z); mat.castShadow = false;
  const matInner = boxAt(alongX ? matW - 0.1 : matD - 0.1, 0.02, alongX ? matD - 0.1 : matW - 0.1, 0x7a6248);
  matInner.position.set(matCentre.x, 0.01, matCentre.z); matInner.castShadow = false;
  scene.add(mat, matInner);

  // sign on both faces of the lintel
  const tex = signTexture(dw.sign);
  for (const face of [n0, n1]) {
    const side = face === n0 ? -1 : 1;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.03), [
      own(0x2b2418), own(0x2b2418), own(0x2b2418), own(0x2b2418),
      ...[0, 1].map(() => { const sm = toon(0xffffff, true, { map: tex, transparent: true }); fadeMats.push(sm); return sm; }),
    ]);
    m.position.copy(at((a0 + a1) / 2, face + side * 0.03, WORLD.lintel + 0.15));
    if (!alongX) m.rotation.y = Math.PI / 2;
    g.add(m);
  }
  scene.add(g);
  const lo = at(a0, n0), hi = at(a1, n1);
  fadeables.push({ obj: g, mats: fadeMats, box: { minX: Math.min(lo.x, hi.x), minZ: Math.min(lo.z, hi.z), maxX: Math.max(lo.x, hi.x), maxZ: Math.max(lo.z, hi.z) }, height: WORLD.wallHeight });

  const view: DoorwayView = { def: dw, signAt: at((a0 + a1) / 2, (n0 + n1) / 2, WORLD.lintel + 0.15) };
  if (dw.light) {
    // warm light from the room beyond, fanning out across this side's floor: bright at the door, fading out
    const len = 3.2, far = 1.8;
    const pts: [number, number, number][] = [ // (a, n, brightness)
      [a0, swingFace, 1], [a1, swingFace, 1], [a1 + far / 2, matFace - s * len, 0], [a0 - far / 2, matFace - s * len, 0],
    ];
    const pos: number[] = [], col: number[] = [];
    for (const [pa, pn, b] of pts) { const v = at(pa, pn, 0.03); pos.push(v.x, v.y, v.z); col.push(b, b * 0.72, b * 0.38); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const spillMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const spill = new THREE.Mesh(geo, spillMat);
    spill.visible = false;
    const lamp = new THREE.PointLight(0xffb060, 0, 6, 1.4);
    lamp.position.copy(at((a0 + a1) / 2, swingFace + s * 0.9, 1.6));
    scene.add(spill, lamp);
    view.spill = { mesh: spill, mat: spillMat, lamp };
  }
  return view;
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
    // slats run along the opening, whichever way the wall runs
    const span = Math.max(w, d), door = new THREE.Group();
    door.add(boxAt(span, WORLD.lintel, 0.12, o.colour));
    for (let i = 1; i < 10; i++) door.add(boxAt(span + 0.01, 0.02, 0.13, 0x7f858b, 0, i * WORLD.lintel / 10));
    if (d > w) door.rotation.y = Math.PI / 2;
    g.add(door);
    return { door };
  },
  smoko: (g, w, d, h, o) => {
    for (const sx of [-0.45, 0.45]) {
      g.add(boxAt(0.45, h, 0.45, o.colour, sx, 0, 0));
      g.add(boxAt(0.45, 0.45, 0.08, o.colour, sx, h, -0.2));
    }
    // an upturned crate between the chairs for the mugs (and so the middle is tappable)
    g.add(boxAt(0.36, 0.34, 0.36, 0x8a6a40, 0, 0, 0.05));
    g.add(boxAt(0.08, 0.1, 0.08, 0xe9e2d0, 0.06, 0.34, 0.02));
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

// ---------- clutter ----------

const cyl = (r: number, h: number, colour: number, x = 0, y0 = 0, z = 0) => {
  const m = mesh(new THREE.CylinderGeometry(r, r, h, 10), toon(colour));
  m.position.set(x, y0 + h / 2, z);
  return m;
};

/** Workshop clutter, built from boxes and cylinders in the same palette. Group is centred on the footprint. */
function buildDecor(dc: Decor, grid: number[][]): THREE.Group {
  const b = rectToBox(dc.rect, C), w = b.maxX - b.minX, d = b.maxZ - b.minZ;
  const g = new THREE.Group();
  g.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  let seed = dc.rect.x * 31 + dc.rect.y * 17;
  const rnd = () => (seed = (seed * 16807 + 11) % 2147483647) / 2147483647;
  // which way is the nearest wall? (things lean against it)
  const wallSide = (() => {
    const at = (x: number, y: number) => grid[y]?.[x] === T.WALL;
    if (at(dc.rect.x - 1, dc.rect.y)) return { x: -1, z: 0 };
    if (at(dc.rect.x + dc.rect.w, dc.rect.y)) return { x: 1, z: 0 };
    if (at(dc.rect.x, dc.rect.y - 1)) return { x: 0, z: -1 };
    return { x: 0, z: 1 };
  })();
  switch (dc.kind) {
    case 'offcutStack': {
      // sheets of varying size leaning back against the wall
      const along = wallSide.x ? d : w;
      for (let i = 0; i < 5; i++) {
        const hgt = 0.6 + rnd() * 0.7, len = along * (0.35 + rnd() * 0.55);
        const sheet = boxAt(wallSide.x ? 0.03 : len, hgt, wallSide.x ? len : 0.03, i % 2 ? 0xd6bc8a : 0xc9a874);
        const off = (rnd() - 0.5) * (along - len);
        sheet.position.x += wallSide.x ? wallSide.x * (0.12 - i * 0.04) : off;
        sheet.position.z += wallSide.z ? wallSide.z * (0.12 - i * 0.04) : off;
        const lean = 0.18 + i * 0.03;
        if (wallSide.x) sheet.rotation.z = -wallSide.x * lean; else sheet.rotation.x = wallSide.z * lean;
        g.add(sheet);
      }
      break;
    }
    case 'pallet':
      for (const sz of [-1, 0, 1]) g.add(boxAt(w - 0.1, 0.09, 0.12, 0xa07a48, 0, 0, sz * (d / 2 - 0.12)));
      g.add(boxAt(w - 0.1, 0.05, d - 0.1, 0x8a6a40, 0, 0.09));
      for (let i = 0; i < 3; i++) g.add(boxAt(w - 0.3 - rnd() * 0.2, 0.04, d - 0.3, i % 2 ? 0xd9be8c : 0xcdb07c, (rnd() - 0.5) * 0.1, 0.14 + i * 0.045));
      break;
    case 'bench': {
      g.add(boxAt(w - 0.05, 0.06, d - 0.15, 0x8a6a40, 0, 0.86));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(boxAt(0.07, 0.86, 0.07, 0x5a4a38, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.12)));
      g.add(boxAt(w - 0.2, 0.04, d - 0.3, 0x6b5a44, 0, 0.25)); // shelf
      for (let i = 0; i < 3; i++) { // F-clamps lying on top
        const clamp = new THREE.Group();
        clamp.add(boxAt(0.04, 0.03, 0.32, 0x8a8f94), boxAt(0.12, 0.05, 0.04, 0xc0281e, 0.04, 0, 0.12), boxAt(0.12, 0.05, 0.04, 0x8a8f94, 0.04, 0, -0.12));
        clamp.position.set(-w / 2 + 0.3 + i * 0.35, 0.92, (rnd() - 0.5) * 0.3); clamp.rotation.y = rnd() * 0.6;
        g.add(clamp);
      }
      g.add(boxAt(0.22, 0.14, 0.18, 0x3d5a78, w / 2 - 0.25, 0.92, -0.1)); // vice
      break;
    }
    case 'broom': {
      const handle = cyl(0.018, 1.25, 0xb08a55);
      const head = boxAt(0.4, 0.07, 0.07, 0x3a3a3a, 0, 0);
      const broom = new THREE.Group(); broom.add(handle, head);
      broom.rotation.z = -0.25; broom.position.set(0.15, 0, wallSide.z * 0.1);
      g.add(broom);
      break;
    }
    case 'bin':
      g.add(boxAt(0.42, 0.9, 0.45, 0x2f6b3a), boxAt(0.46, 0.05, 0.5, 0x275a30, 0, 0.9, 0.02));
      for (const sx of [-1, 1]) { const wheel = cyl(0.07, 0.04, 0x1e1e20, sx * 0.2, 0.0, 0.2); wheel.rotation.z = Math.PI / 2; wheel.position.y = 0.07; g.add(wheel); }
      break;
    case 'trolley':
      g.add(boxAt(w - 0.25, 0.05, d - 0.3, 0x5a5f66, 0, 0.12));
      g.add(boxAt(0.05, 0.9, d - 0.3, 0x5a5f66, -w / 2 + 0.15, 0.12));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const wh = cyl(0.06, 0.05, 0x1e1e20, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2)); wh.rotation.x = Math.PI / 2; wh.position.y = 0.06; g.add(wh); }
      g.add(boxAt(w - 0.4, 0.3, d - 0.5, 0xc9a874, 0.05, 0.17)); // a few offcuts on it
      break;
    case 'hose': {
      // a coil of air hose hanging on a hook on the wall
      const hook = boxAt(0.05, 0.05, 0.18, 0x777777, wallSide.x * 0.2, 1.45, wallSide.z * 0.2);
      const coil = new THREE.Group();
      for (let i = 0; i < 3; i++) { const ring = cyl(0.2 - i * 0.03, 0.05, i % 2 ? 0xd4472a : 0xe0602e); ring.rotation.x = Math.PI / 2; coil.add(ring); }
      coil.position.set(wallSide.x * 0.16, 1.2, wallSide.z * 0.16);
      if (wallSide.x) coil.rotation.y = Math.PI / 2;
      g.add(hook, coil);
      break;
    }
    case 'drums': {
      const cols = [0x3d6f9e, 0xc0281e, 0x4f6e4c];
      [[-0.22, -0.2], [0.24, -0.15], [0.0, 0.26]].forEach(([x, z], i) => { g.add(cyl(0.29, 0.88, cols[i % 3], x, 0, z)); g.add(cyl(0.3, 0.03, 0x2a2a2a, x, 0.88, z)); });
      break;
    }
    case 'panels':
      for (let i = 0; i < 7; i++) g.add(boxAt(w - 0.2 - (i % 2) * 0.06, 0.04, d - 0.2, i % 2 ? 0xe9d6ac : 0xddc79a, (rnd() - 0.5) * 0.05, 0.12 + i * 0.045));
      g.add(boxAt(w - 0.1, 0.12, d - 0.1, 0x8a6a40));
      break;
    case 'cable': {
      // a cable snaking across the floor: short flat segments, walked over
      const n = 8, len = Math.max(w, d) / n;
      for (let i = 0; i < n; i++) {
        const seg = boxAt(len * 1.05, 0.025, 0.05, 0x1e1e20, -Math.max(w, d) / 2 + (i + 0.5) * len, 0, Math.sin(i * 1.3) * 0.18);
        seg.rotation.y = Math.cos(i * 1.3) * 0.35; seg.castShadow = false;
        g.add(seg);
      }
      if (d > w) g.rotation.y = Math.PI / 2;
      break;
    }
  }
  return g;
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
    m.position.set((9 + rnd() * 11) * C, 0.012, (15.5 + rnd() * 6) * C); // round the extractor
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
  // gravel out to the horizon, so there's no edge of the world past the yard
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon(PALETTE.floor[T.GROUND]));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(COLS * C / 2, -0.02, ROWS * C / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const fadeables: Fadeable[] = [];
  const collisionBoxes = buildWalls(grid, scene, fadeables);
  const doorways = DOORWAYS.map(d => buildDoorway(d, scene, fadeables));
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
  // clutter: only the big stuff blocks you
  for (const dc of DECOR) {
    scene.add(buildDecor(dc, grid));
    if (dc.solid) collisionBoxes.push(rectToBox(dc.rect, C));
  }
  const xs = ROLLER_TILES.map(t => t.x), ys = ROLLER_TILES.map(t => t.y);
  const rollerBox: Box = { minX: Math.min(...xs) * C, minZ: Math.min(...ys) * C, maxX: (Math.max(...xs) + 1) * C, maxZ: (Math.max(...ys) + 1) * C };
  const vehicles = buildVehicles();
  scene.add(vehicles.ute, vehicles.truck);
  const mate = buildMate(objects.get('smoko')!.box);
  scene.add(mate);
  const dust = buildDust();
  for (const m of dust) scene.add(m);
  pickables.push(vehicles.ute, vehicles.truck, mate);
  return { grid, collisionBoxes, rollerBox, objects, fadeables, vehicles, mate, dust, pickables, floor, doorways };
}
