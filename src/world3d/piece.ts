// The "after": a design extruded from the same SVG path the sketch drew and the router cut, so the finished piece is
// exactly that shape. Material looks per kind — formply with its grain and ply layers in the edge, painted MDF with
// raw MDF showing in the engraving, glossy acrylic with lit-up edges. `rich` false (the low tier, ?safe) keeps it to
// flat toon colours: no textures, no gloss.
import * as THREE from 'three';
import { flatDesign, type Pt } from '../designs/path.js';
import type { Design } from '../designs/types.js';
import { toonRamp } from './build.js';

/** Metres per mm for a design laid on the machine's bed (the sheet mesh is bedW × bedD m): big enough to read. */
export function bedScale(d: Design, bedW: number, bedD: number) {
  return 0.55 * Math.min(bedW / d.sheet.w, bedD / d.sheet.h);
}
/** How thick a piece looks (m): chunky enough to see at the low internal resolution. */
export const pieceThickness = (d: Design) => (d.kind === 'acrylic' ? 0.018 : 0.03);

/** Design mm → the piece's local floor plane (x, z) in metres, centred on the design's sheet. */
export const toLocal = (d: Design, s: number) => (p: Pt): [number, number] => [(p[0] - d.sheet.w / 2) * s, (p[1] - d.sheet.h / 2) * s];

function canvasTex(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

let texCache: { grain: THREE.Texture; layers: THREE.Texture; mdfEdge: THREE.Texture } | null = null;
function textures() {
  if (texCache) return texCache;
  // formply face: the phenolic film is see-through enough to show the grain under it
  const grain = canvasTex(32, 32, c => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 32, 32);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < 32; y += 2 + Math.floor(r() * 3)) {
      c.fillStyle = r() < 0.5 ? '#d8cbbf' : '#e6dcd2';
      for (let x = 0; x < 32; x++) if (r() < 0.8) c.fillRect(x, y + (Math.sin(x / 5 + y) > 0.6 ? 1 : 0), 1, 1);
    }
    c.fillStyle = '#c9b8a8'; c.fillRect(20, 12, 3, 2); c.fillRect(21, 11, 1, 4); // a knot
  });
  // ply edge: alternating veneers across the thickness (v runs through the thickness)
  const layers = canvasTex(8, 14, c => {
    for (let y = 0; y < 14; y++) { c.fillStyle = y === 0 || y === 13 ? '#5a2e1c' : y % 2 ? '#e2c48e' : '#c9a066'; c.fillRect(0, y, 8, 1); }
  });
  // raw MDF: flat tan with fine specks
  const mdfEdge = canvasTex(16, 16, c => {
    c.fillStyle = '#b48c62'; c.fillRect(0, 0, 16, 16);
    let s = 37; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { c.fillStyle = r() < 0.5 ? '#a8805a' : '#c09a70'; c.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1); }
  });
  return (texCache = { grain, layers, mdfEdge });
}

export interface Piece { group: THREE.Group; dispose(): void; size: number }

/**
 * The finished piece, lying flat (top face up, at y = thickness), in the same frame as the bed: design x → x,
 * design y → z, centred on the design's sheet, `s` metres per mm.
 */
export function buildPiece(d: Design, s: number, rich: boolean): Piece {
  const f = flatDesign(d), tl = toLocal(d, s), th = pieceThickness(d);
  // shape space is (x, -z) so that rotating -90° about X lays it on the floor with z = design y
  const v2 = (p: Pt) => { const [x, z] = tl(p); return new THREE.Vector2(x, -z); };
  let outer = f.outer.map(v2);
  if (THREE.ShapeUtils.area(outer) > 0) outer = outer.reverse(); // clockwise outline, anticlockwise holes: no surprises
  const shape = new THREE.Shape(outer);
  for (const h of f.holes) {
    let pts = h.map(v2);
    if (THREE.ShapeUtils.area(pts) < 0) pts = pts.reverse();
    shape.holes.push(new THREE.Path(pts));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 1 });
  const disposables: { dispose(): void }[] = [geo];
  const own = <T extends { dispose(): void }>(m: T) => { disposables.push(m); return m; };

  const colour = new THREE.Color(d.colour);
  let faces: THREE.Material, sides: THREE.Material, engraveColour: number;
  if (!rich) {
    faces = own(new THREE.MeshToonMaterial({ color: colour, gradientMap: toonRamp() }));
    sides = own(new THREE.MeshToonMaterial({ color: d.kind === 'acrylic' ? colour.clone().lerp(new THREE.Color(0xffffff), 0.45) : colour.clone().multiplyScalar(0.7), gradientMap: toonRamp() }));
    engraveColour = d.kind === 'mdf' ? 0xd2b48a : d.kind === 'acrylic' ? 0xffffff : 0x3a1e12;
  } else if (d.kind === 'formwork') {
    const t = textures();
    const map = t.grain.clone(); map.needsUpdate = true; map.repeat.set(2.2, 2.2); own(map);
    const edge = t.layers.clone(); edge.needsUpdate = true; edge.repeat.set(3, 1 / th); own(edge);
    faces = own(new THREE.MeshStandardMaterial({ color: colour, map, roughness: 0.42, metalness: 0 }));
    sides = own(new THREE.MeshStandardMaterial({ map: edge, roughness: 0.85 }));
    engraveColour = 0xe2c48e; // the V-bit goes through the film into the ply
  } else if (d.kind === 'mdf') {
    const t = textures();
    const edge = t.mdfEdge.clone(); edge.needsUpdate = true; edge.repeat.set(4, 4); own(edge);
    faces = own(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.62, metalness: 0 }));
    // the edges took the paint too, but MDF edges drink it: duller and a touch darker
    sides = own(new THREE.MeshStandardMaterial({ color: colour.clone().multiplyScalar(0.82), map: edge, roughness: 0.9 }));
    engraveColour = 0xc9a274; // raw MDF under the paint
  } else {
    faces = own(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.86,
      emissive: colour, emissiveIntensity: 0.18 }));
    // cut acrylic edges catch the light and glow
    sides = own(new THREE.MeshBasicMaterial({ color: colour.clone().lerp(new THREE.Color(0xffffff), 0.35) }));
    engraveColour = 0xf4f8ff; // frosted
  }
  const mesh = new THREE.Mesh(geo, [faces, sides]);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true; mesh.receiveShadow = rich;
  const group = new THREE.Group();
  group.add(mesh);

  // engraving: lines just above the top face
  const segs: number[] = [];
  for (const e of f.engraves) {
    const pts = e.closed ? [...e.pts, e.pts[0]] : e.pts;
    for (let i = 1; i < pts.length; i++) { const a = tl(pts[i - 1]), b = tl(pts[i]); segs.push(a[0], th + 0.0015, a[1], b[0], th + 0.0015, b[1]); }
  }
  if (segs.length) {
    const lg = own(new THREE.BufferGeometry());
    lg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    group.add(new THREE.LineSegments(lg, own(new THREE.LineBasicMaterial({ color: engraveColour }))));
  }
  const size = Math.max(d.sheet.w, d.sheet.h) * s;
  return { group, size, dispose: () => disposables.forEach(x => x.dispose()) };
}
