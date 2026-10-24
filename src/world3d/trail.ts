// A dotted path on the floor from you to where you're headed. Dots you've walked past fade out;
// the rest draw in from your feet outward when the path is laid.
import * as THREE from 'three';

const SPACING = 0.42;   // m between dots
const MAX_DOTS = 90;

interface Dot { mesh: THREE.Group; mat: THREE.MeshBasicMaterial; under: THREE.MeshBasicMaterial; s: number; born: number; alpha: number }

export class Trail {
  private group = new THREE.Group();
  private pool: Dot[] = [];
  private live: Dot[] = [];
  private pts: { x: number; z: number; s: number }[] = [];
  private walked = 0;
  private age = 0;
  private fading = false;

  constructor(scene: THREE.Scene, colour = 0xffd75e) {
    // a bright dot on a dark one, so it reads on pale sawdust and dark office carpet alike
    const geo = new THREE.CircleGeometry(0.1, 8), underGeo = new THREE.CircleGeometry(0.15, 8);
    geo.rotateX(-Math.PI / 2); underGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_DOTS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthWrite: false });
      const under = new THREE.MeshBasicMaterial({ color: 0x2b2418, transparent: true, opacity: 0, depthWrite: false });
      const top = new THREE.Mesh(geo, mat), base = new THREE.Mesh(underGeo, under);
      top.position.y = 0.004; top.renderOrder = 3; base.renderOrder = 2;
      const mesh = new THREE.Group();
      mesh.add(base, top);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, under, s: 0, born: 0, alpha: 0 });
    }
    scene.add(this.group);
  }

  get active() { return this.live.length > 0 && !this.fading; }

  /** Lay a new path (metres, x/z), starting at the player. */
  set(points: { x: number; z: number }[]) {
    this.pts = [];
    let s = 0;
    points.forEach((p, i) => {
      if (i) s += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      this.pts.push({ x: p.x, z: p.z, s });
    });
    this.walked = 0; this.age = 0; this.fading = false;
    for (const d of this.live) d.mesh.visible = false;
    this.live = [];
    // skip the first half-metre (under your feet) and stop just short of the target
    for (let at = 0.5, i = 0; at < s - 0.1 && i < MAX_DOTS; at += SPACING, i++) {
      const d = this.pool[i], p = this.pointAt(at);
      d.mesh.position.set(p.x, 0.025, p.z);
      d.s = at; d.born = i * 0.025; d.alpha = 0;
      d.mat.opacity = d.under.opacity = 0;
      d.mesh.visible = true;
      this.live.push(d);
    }
  }

  /** Fade the whole path out (arrived, or took the stick). */
  clear() { this.fading = true; }

  /** How far the player is from the laid path, metres. */
  offBy(x: number, z: number) {
    let best = Infinity;
    for (let i = 1; i < this.pts.length; i++) best = Math.min(best, this.closest(i, x, z).d);
    return best;
  }

  update(dt: number, x: number, z: number) {
    if (!this.live.length) return;
    this.age += dt;
    // how far along the path you've got: the nearest point on it, never going backwards
    let bestD = Infinity, bestS = this.walked;
    for (let i = 1; i < this.pts.length; i++) {
      const c = this.closest(i, x, z);
      if (c.d < bestD) { bestD = c.d; bestS = c.s; }
    }
    if (bestD < 1.0) this.walked = Math.max(this.walked, bestS);
    let any = false;
    for (const d of this.live) {
      const want = this.fading || d.s < this.walked + 0.25 ? 0 : this.age >= d.born ? 0.9 : 0;
      d.alpha += (want - d.alpha) * Math.min(1, (want > d.alpha ? 10 : 6) * dt);
      // a slow shimmer running away from you down the path
      d.mat.opacity = d.alpha * (0.8 + 0.2 * Math.sin(this.age * 5 - d.s * 2.2));
      d.under.opacity = d.alpha * 0.5;
      if (d.alpha > 0.01 || want > 0) any = true;
    }
    if (!any) { for (const d of this.live) d.mesh.visible = false; this.live = []; this.fading = false; }
  }

  private pointAt(s: number) {
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      if (s <= b.s || i === this.pts.length - 1) {
        const t = b.s > a.s ? Math.min(1, (s - a.s) / (b.s - a.s)) : 0;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      }
    }
    return this.pts[0] ?? { x: 0, z: 0 };
  }

  private closest(i: number, x: number, z: number) {
    const a = this.pts[i - 1], b = this.pts[i];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    const t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t;
    return { d: Math.hypot(x - px, z - pz), s: a.s + (b.s - a.s) * t };
  }
}
