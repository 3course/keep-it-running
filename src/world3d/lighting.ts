// Mood lighting for the tiers that can afford it (TierSettings.detail.lighting), faked so it costs no real lights:
// fluorescent tube fittings hung over the factory floor (unlit bright boxes), the cool pools they throw on the concrete
// (high tier), a warm shaft of daylight through the roller door that grows as it rolls up, and the whole shed going a
// flickering red while there's a fire. Pools and shaft are additive, nearest-filtered gradients, banded so they read
// as pixel art.
import * as THREE from 'three';

/** A banded additive gradient on a tiny canvas: `shape(u, v)` (0..1 across) gives the strength there. */
function bandTex(w: number, h: number, rgb: string, shape: (u: number, v: number) => number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.round(Math.max(0, Math.min(1, shape((x + 0.5) / w, (y + 0.5) / h))) * 4) / 4; // four bands
    ctx.fillStyle = `rgba(${rgb},${a})`; ctx.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const additive = (map: THREE.Texture, opacity: number) =>
  new THREE.MeshBasicMaterial({ map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** Fittings over the factory floor and one over the dock, centres in metres (x, z); each hangs along x. */
const TUBES: [number, number][] = [[5, 8.5], [9, 8.5], [5, 12.5], [9, 12.5], [5, 16.5], [9, 16.5], [13, 13]];
const TUBE = { len: 1.3, y: 2.55 };

export class ShedLighting {
  private shaftFloor: THREE.Mesh;
  private shaftAir: THREE.Mesh | null = null;
  private fittings: { g: THREE.Group; mats: THREE.MeshBasicMaterial[] }[] = [];
  private fwd = new THREE.Vector3();
  private t = 0;
  private hemiBase: THREE.Color;
  private sunBase: number;
  private red = new THREE.Color(0xff5a3c);
  private pools: THREE.Mesh[] = [];
  /** Knock-off (0 day .. 1 night): the fluoros stay off and the door's light goes with the sky. The scene does the sky. */
  night = 0;

  /**
   * level 1 (mid): tubes, the shaft on the floor, the fire flicker. level 2 (high): plus the pools under the tubes
   * and the shaft in the air. door: the roller door's opening (metres): its inside face x, and its z span.
   */
  constructor(scene: THREE.Scene, level: 1 | 2, door: { x: number; z0: number; z1: number }, private hemi: THREE.HemisphereLight, private sun: THREE.DirectionalLight) {
    this.hemiBase = hemi.color.clone();
    this.sunBase = sun.intensity;
    const poolTex = bandTex(16, 8, '200,225,255', (u, v) => 1 - Math.max(Math.abs(u - 0.5) * 2, Math.abs(v - 0.5) * 2) ** 1.5);
    const poolMat = additive(poolTex, 0.24);
    for (const [x, z] of TUBES) {
      // a pale reflector with a bright tube down each side, on two chains; its own materials so it can fade alone
      const housing = new THREE.MeshBasicMaterial({ color: 0xc9ced3, transparent: true, depthWrite: false });
      const tube = new THREE.MeshBasicMaterial({ color: 0xf6fdff, transparent: true, depthWrite: false });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(TUBE.len, 0.05, 0.12), housing));
      for (const s of [-1, 1]) {
        const lit = new THREE.Mesh(new THREE.BoxGeometry(TUBE.len - 0.1, 0.045, 0.045), tube);
        lit.position.set(0, -0.035, s * 0.075); g.add(lit);
        const chain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), housing); // up out of view
        chain.position.set(s * TUBE.len * 0.35, 0.28, 0); g.add(chain);
      }
      g.position.set(x, TUBE.y, z);
      scene.add(g);
      this.fittings.push({ g, mats: [housing, tube] });
      if (level === 2) {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2).rotateX(-Math.PI / 2), poolMat);
        pool.position.set(x, 0.015, z); pool.renderOrder = 1;
        scene.add(pool); this.pools.push(pool);
      }
    }
    // the shaft: daylight in through the door, fading as it reaches into the shed, a little wider at the far end
    const reach = 4.2, w = door.z1 - door.z0, zc = (door.z0 + door.z1) / 2;
    const floorTex = bandTex(16, 16, '255,196,120', (u, v) => (1 - u) * (1 - Math.abs(v - 0.5) * 2 * (0.6 + 0.4 * u)) * 1.1);
    const shape = new THREE.Shape();
    shape.moveTo(0, -w / 2); shape.lineTo(-reach, -w / 2 - 0.5); shape.lineTo(-reach, w / 2 + 0.5); shape.lineTo(0, w / 2); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    // map u along the shaft (0 at the door), v across it
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, -pos.getX(i) / reach, (pos.getY(i) + w / 2 + 0.5) / (w + 1));
    geo.rotateX(-Math.PI / 2);
    this.shaftFloor = new THREE.Mesh(geo, additive(floorTex, 0));
    this.shaftFloor.position.set(door.x, 0.018, zc);
    this.shaftFloor.renderOrder = 1;
    scene.add(this.shaftFloor);
    if (level === 2) {
      // the beam itself, a faint slab leaning down from the top of the doorway to where the floor patch ends
      const airTex = bandTex(8, 16, '255,210,150', (u, v) => (1 - v) * 0.9 * (1 - Math.abs(u - 0.5) * 1.6));
      const len = Math.hypot(reach * 0.8, 2.1);
      this.shaftAir = new THREE.Mesh(new THREE.PlaneGeometry(w, len), additive(airTex, 0));
      this.shaftAir.rotation.set(0, Math.PI / 2, 0);
      this.shaftAir.rotateX(-Math.atan2(2.1, reach * 0.8));
      this.shaftAir.position.set(door.x - reach * 0.4, 1.05, zc);
      this.shaftAir.renderOrder = 1;
      scene.add(this.shaftAir);
    }
  }

  /** doorOpen: 0 shut .. 1 up. you: where you are (metres). fire: the flames showing (0 none or smoke only, so a smouldering spot stays a quiet tell). */
  update(dt: number, doorOpen: number, fire: 0 | 1 | 2, camera: THREE.Camera, you: { x: number; z: number }) {
    this.t += dt;
    // a fitting between the camera and you fades right back, so it never hides you or what you're working on
    camera.getWorldDirection(this.fwd);
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    for (const f of this.fittings) {
      const ahead = ((f.g.position.x - you.x) * this.fwd.x + (f.g.position.z - you.z) * this.fwd.z) / fl; // + beyond you
      const a = THREE.MathUtils.clamp(0.15 + (ahead + 0.5) / 2, 0.15, 1);
      for (const m of f.mats) m.opacity = a;
    }
    // knock-off: the tubes are off (dark glass), no pools, and the shaft is the last of the evening
    const off = this.night > 0;
    for (const f of this.fittings) f.mats[1].color.setHex(off ? 0x5a5f66 : 0xf6fdff);
    for (const p of this.pools) p.visible = !off;
    if (off) {
      (this.shaftFloor.material as THREE.MeshBasicMaterial).opacity = 0.5 * doorOpen * (1 - this.night);
      if (this.shaftAir) (this.shaftAir.material as THREE.MeshBasicMaterial).opacity = 0.2 * doorOpen * (1 - this.night);
      return;
    }
    // a sliver under a shut door; full when it's up
    const shaft = 0.12 + 0.88 * doorOpen;
    (this.shaftFloor.material as THREE.MeshBasicMaterial).opacity = 0.55 * shaft;
    if (this.shaftAir) (this.shaftAir.material as THREE.MeshBasicMaterial).opacity = 0.22 * doorOpen;
    // fire: the shed's light goes red and unsteady
    if (fire) {
      const flick = 0.5 + 0.5 * Math.sin(this.t * 17) * Math.sin(this.t * 6.1 + 1);
      const k = (fire === 2 ? 0.35 : 0.2) + 0.15 * flick;
      this.hemi.color.copy(this.hemiBase).lerp(this.red, k);
      this.sun.intensity = this.sunBase * (1 - 0.25 * k);
    } else if (this.sun.intensity !== this.sunBase) {
      this.hemi.color.copy(this.hemiBase);
      this.sun.intensity = this.sunBase;
    }
  }
}
