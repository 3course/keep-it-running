// The "during": the job's real toolpath on the sheet. The router head follows it (engraving, then holes, then the
// outer profile) and leaves the kerf behind as a dark groove — engraving lighter. Flat ribbons (a 1px line vanishes at
// the low internal resolution); cheap, so every tier gets it.
import * as THREE from 'three';
import { headAt, toolpath, type Move } from '../designs/path.js';
import type { Design } from '../designs/types.js';
import { bedScale, toLocal } from './piece.js';

export class CutPathView {
  readonly group = new THREE.Group();
  private lines: THREE.Mesh | null = null;
  private design: Design | null = null;
  private tp: { moves: Move[]; length: number } | null = null;
  /** Down-moves before each move (where each one's segment sits in the line buffer). */
  private before: number[] = [];
  private orig: Float32Array | null = null;
  private live = -1;       // the segment being drawn, shortened to the head
  private widths: number[] = [];
  private starts: [number, number][] = [];
  private tl: ((p: [number, number]) => [number, number]) | null = null;
  /** Where the head is (sheet-local x, z), last update. */
  readonly head = new THREE.Vector2();
  scale = 0;

  /** `sheet`: the sheet mesh on the bed (bedW × bedD m, top at `top` above its centre). */
  constructor(sheet: THREE.Object3D, readonly bedW: number, readonly bedD: number, top: number) {
    this.group.position.y = top + 0.003;
    sheet.add(this.group);
  }

  get current() { return this.design; }

  set(d: Design | null) {
    if (d === this.design) return;
    this.design = d;
    if (this.lines) { this.group.remove(this.lines); this.lines.geometry.dispose(); (this.lines.material as THREE.Material).dispose(); this.lines = null; }
    this.tp = null; this.orig = null; this.live = -1;
    if (!d) return;
    const s = this.scale = bedScale(d, this.bedW, this.bedD);
    const tl = this.tl = toLocal(d, s);
    const tp = this.tp = toolpath(d);
    const pos: number[] = [], col: number[] = [];
    // the kerf shows what's under the face: pale ply core through formply's dark film, dark through MDF and acrylic
    const [kc, ec] = KERF_COLOURS[d.kind];
    const kerf = new THREE.Color(kc), engrave = new THREE.Color(ec);
    this.before = []; this.starts = [];
    let n = 0;
    for (const m of tp.moves) {
      this.before.push(n);
      if (m.op === 'rapid') continue;
      const a = tl(m.from), b = tl(m.to), c = m.op === 'engrave' ? engrave : kerf;
      pos.push(...ribbon(a, b, m.op === 'engrave' ? ENGRAVE_W : KERF_W));
      this.starts.push(a);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      n++;
    }
    this.before.push(n);
    this.widths = tp.moves.filter(m => m.op !== 'rapid').map(m => (m.op === 'engrave' ? ENGRAVE_W : KERF_W));
    const geo = new THREE.BufferGeometry();
    this.orig = new Float32Array(pos);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  /** Show the path cut up to `t` (0..1) and put the head there. */
  update(t: number) {
    if (!this.tp || !this.lines || !this.orig || !this.tl) return;
    const h = headAt(this.tp, t);
    const [hx, hz] = this.tl(h.p);
    this.head.set(hx, hz);
    const attr = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const seg = h.down ? this.before[h.done] : -1;
    if (this.live >= 0 && this.live !== seg) arr.set(this.orig.subarray(this.live * 18, this.live * 18 + 18), this.live * 18);
    if (seg >= 0) {
      // the live segment runs from its start to the head
      arr.set(ribbon(this.starts[seg], [hx, hz], this.widths[seg]), seg * 18);
    }
    this.live = seg;
    attr.needsUpdate = true;
    const drawn = h.done >= this.tp.moves.length ? this.before[this.tp.moves.length] : this.before[h.done] + (h.down ? 1 : 0);
    this.lines.geometry.setDrawRange(0, drawn * 6);
  }
}

const KERF_W = 0.024, ENGRAVE_W = 0.012; // m, on the bed
const KERF_COLOURS: Record<Design['kind'], [number, number]> = { formwork: [0xf0d49a, 0xd9b77e], mdf: [0x3b2414, 0xf2e6cc], acrylic: [0x26323a, 0x6f8f9b] };

/** Two triangles, flat on the sheet, `w` wide from a to b (x, z). */
function ribbon(a: [number, number], b: [number, number], w: number): number[] {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l * w / 2, nz = dx / l * w / 2;
  // a little past each end so the corners close up
  const ex = dx / l * w / 2, ez = dz / l * w / 2;
  const aL = [a[0] + nx - ex, 0, a[1] + nz - ez], aR = [a[0] - nx - ex, 0, a[1] - nz - ez];
  const bL = [b[0] + nx + ex, 0, b[1] + nz + ez], bR = [b[0] - nx + ex, 0, b[1] - nz + ez];
  return [...aL, ...aR, ...bR, ...aL, ...bR, ...bL];
}
