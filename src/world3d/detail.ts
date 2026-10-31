// Extra detail for the tiers that can afford it (TierSettings.detail), added on top of the built world so the low tier's
// scene is exactly what it was. Everything is generated (no image files) from fixed seeds, tiny and nearest-filtered,
// so it reads as pixel art at the low internal resolution rather than as smooth textures.
import * as THREE from 'three';
import type { JobTypeId } from '../config.js';
import { COLS, ROWS, T, objectById, type Rect } from '../world/layout.js';
import type { BuiltWorld } from './build.js';
import { toonRamp } from './build.js';

/** A tiny seeded canvas texture: `paint(px, rnd)` draws it; nearest-filtered, tiling. */
function pixelTexture(size: number, seed: number, paint: (px: (x: number, y: number, c: string) => void, rnd: () => number) => void) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  paint((x, y, col) => { ctx.fillStyle = col; ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1); }, rnd);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const fill = (px: (x: number, y: number, c: string) => void, size: number, c: string) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px(x, y, c); };

/** The sheet looks: plywood grain (offcuts and finished work), film-faced formply, MDF, acrylic. */
function sheetTextures() {
  // plywood: pale with long darker grain lines and a knot
  const plywood = pixelTexture(16, 11, (px, rnd) => {
    fill(px, 16, '#d6bc8a');
    for (let y = 0; y < 16; y += 3 + Math.floor(rnd() * 2)) for (let x = 0; x < 16; x++) if (rnd() < 0.75) px(x, y + (rnd() < 0.2 ? 1 : 0), '#c3a473');
    px(11, 6, '#9a7a4a'); px(12, 6, '#9a7a4a'); px(11, 7, '#b08a58');
  });
  // formply: phenolic film over ply, a deep red-brown with the odd sheen pixel
  const formply = pixelTexture(16, 23, (px, rnd) => {
    fill(px, 16, '#8a4f32');
    for (let i = 0; i < 18; i++) px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), rnd() < 0.5 ? '#7a4329' : '#9c5a3a');
    for (let x = 2; x < 9; x++) px(x, 3, '#b0745a'); // the sheen
  });
  // MDF: flat tan with fine specks
  const mdf = pixelTexture(16, 37, (px, rnd) => {
    fill(px, 16, '#b48c62');
    for (let i = 0; i < 30; i++) px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), rnd() < 0.5 ? '#a8805a' : '#c09a70');
  });
  // acrylic: pale and cool, with a diagonal highlight and its protective film's edge
  const acrylic = pixelTexture(16, 41, px => {
    fill(px, 16, '#cfe2e8');
    for (let i = 0; i < 16; i++) { px(i, 15 - i, '#f4fbfc'); px(i + 1, 15 - i, '#e6f2f5'); }
    for (let x = 0; x < 16; x++) px(x, 0, '#b8d0d8');
  });
  return { plywood, formply, mdf, acrylic };
}

const sheetMat = (map: THREE.Texture, tint = 0xffffff) => new THREE.MeshToonMaterial({ color: tint, map, gradientMap: toonRamp() });

/** What a sheet of each job type looks like on the bed and on the pallet (the order is CONFIG.jobs.types). */
export interface SheetLooks { byType: Record<JobTypeId, THREE.Material>; scrap: THREE.Material; plywood: THREE.Material }

/** Put the textures on: the ply pallet's three stacks by type, the finished pallet, the leaning offcuts, the floor. */
export function applyTextures(built: BuiltWorld, grid: number[][]): SheetLooks {
  const t = sheetTextures();
  const looks: SheetLooks = {
    byType: { formwork: sheetMat(t.formply), joinery: sheetMat(t.mdf), signage: sheetMat(t.acrylic) },
    scrap: sheetMat(t.plywood, 0xb07a6a),
    plywood: sheetMat(t.plywood),
  };
  const darker = (m: THREE.Material) => { const c = (m as THREE.MeshToonMaterial).clone(); c.color.setHex(0xe6e6e6); return c; };
  // the ply pallet: one stack per stock line, in CONFIG.jobs.types order; alternate sheets a shade darker so they read as a stack
  const order: JobTypeId[] = ['formwork', 'joinery', 'signage'];
  built.objects.get('plyPallet')!.parts.stocks.children.forEach((stack, col) => {
    const m = looks.byType[order[col]], d = darker(m);
    stack.children.forEach((s, i) => { (s as THREE.Mesh).material = i % 2 ? m : d; });
  });
  const ply = looks.plywood, plyDark = darker(ply);
  built.objects.get('finishedPallet')!.parts.stack.children.forEach((s, i) => { (s as THREE.Mesh).material = i % 2 ? ply : plyDark; });
  enrichFloor(built.floor, grid);
  return looks;
}

/**
 * The concrete, closer up: mottling in every indoor cell, hairline cracks, a couple of oil stains near the machine and
 * tyre marks across the dock. Painted onto the floor's own canvas, so it costs nothing per frame.
 */
function enrichFloor(floor: THREE.Mesh, grid: number[][]) {
  const tex = (floor.material as THREE.MeshToonMaterial).map as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
  const px = canvas.width / COLS;
  let s = 97;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const indoors = (x: number, y: number) => grid[y]?.[x] === T.FLOOR || grid[y]?.[x] === T.DOCK || grid[y]?.[x] === T.STORAGE;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!indoors(x, y)) continue;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x * px + Math.floor(rnd() * px), y * px + Math.floor(rnd() * px), 1 + Math.floor(rnd() * 2), 1);
    }
    if (rnd() < 0.03) { // a hairline crack
      ctx.fillStyle = 'rgba(40,34,28,0.35)';
      let cx = x * px + Math.floor(rnd() * px), cy = y * px + Math.floor(rnd() * px);
      for (let k = 0; k < 10; k++) { ctx.fillRect(cx, cy, 1, 1); cx += rnd() < 0.6 ? 1 : 0; cy += rnd() < 0.5 ? 1 : -1; }
    }
  }
  const stain = (r: Rect, dx: number, dy: number, rad: number, col: string) => {
    const cx = (r.x + dx) * px, cy = (r.y + dy) * px;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * px);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - rad * px, cy - rad * px, rad * 2 * px, rad * 2 * px);
  };
  const machine = objectById('machine').rect;
  stain(machine, -0.8, 2.5, 1.4, 'rgba(30,26,24,0.35)');   // oil, off the machine's west end
  stain(machine, machine.w + 0.6, 1, 1.0, 'rgba(30,26,24,0.28)');
  // tyre marks: the pallet jack's track from the roller door across the dock
  ctx.fillStyle = 'rgba(40,36,32,0.18)';
  for (let x = 22 * px; x < 29 * px; x++) { ctx.fillRect(x, 29.5 * px, 1, 1); ctx.fillRect(x, 31.5 * px, 1, 1); }
  tex.needsUpdate = true;
}

/**
 * Sawdust round the router and the extractor: flecks that spread outward as the extractor bag fills (it fills as the
 * machine cuts) and vanish when the bag's changed. One instanced mesh, one draw call; the count drawn is the level.
 */
export class Sawdust {
  private mesh: THREE.InstancedMesh;
  private shown = -1;

  constructor(scene: THREE.Scene) {
    const tex = pixelTexture(8, 53, (px, rnd) => {
      // an irregular blob of pale chips, transparent round the edge
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const d = Math.hypot(x - 3.5, y - 3.5) + rnd() * 1.6;
        // bright chips with a darker fringe, so a fleck reads as a little pile on the sandy concrete
        if (d < 2.6) px(x, y, rnd() < 0.5 ? '#fbf1d2' : '#f3e2b0');
        else if (d < 3.7) px(x, y, rnd() < 0.6 ? '#b8975e' : '#e8d29c');
      }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const spots = [...sawdustSpots(objectById('machine').rect, 46, 3), ...sawdustSpots(objectById('extractor').rect, 26, 5)]
      .sort((a, b) => a.r - b.r); // nearest the machines first, so it spreads outward as it builds
    this.mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.compose(new THREE.Vector3(p.x, 0.012, p.z), q, new THREE.Vector3(p.size, 1, p.size));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** level: 0 (bag just changed) .. 1 (bag full). */
  update(level: number) {
    const n = Math.round(Math.max(0, Math.min(1, level)) * this.mesh.instanceMatrix.count);
    if (n === this.shown) return;
    this.shown = n;
    this.mesh.count = n;
  }

  /** For tests: how many flecks are down. */
  get count() { return this.mesh.count; }
}

/** Spots for sawdust round a footprint (metres): a ring just outside it, seeded, each with its distance out. */
function sawdustSpots(r: Rect, n: number, seed: number) {
  let s = seed * 7919;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const C = 0.5, x0 = r.x * C, z0 = r.y * C, w = r.w * C, d = r.h * C;
  const out: { x: number; z: number; r: number; size: number; rot: number }[] = [];
  for (let i = 0; i < n; i++) {
    // a point on the footprint's edge, pushed out by up to a metre (mostly close in)
    const t = rnd() * 2 * (w + d), out1 = Math.pow(rnd(), 1.6) * 1.0 + 0.08;
    let x: number, z: number;
    if (t < w) { x = x0 + t; z = z0 - out1; }
    else if (t < w + d) { x = x0 + w + out1; z = z0 + (t - w); }
    else if (t < 2 * w + d) { x = x0 + (t - w - d); z = z0 + d + out1; }
    else { x = x0 - out1; z = z0 + (t - 2 * w - d); }
    out.push({ x, z, r: out1 + rnd() * 0.2, size: 0.18 + rnd() * 0.3, rot: rnd() * Math.PI });
  }
  return out;
}
