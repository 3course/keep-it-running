// Fire and smoke at the exhaust unit, and the extinguisher spray. Smoke is a pool of soft spheres
// that rise, swell and fade; fire is a few flickering emissive shapes with a point light.
import * as THREE from 'three';

interface Puff { m: THREE.Mesh; age: number; life: number; vx: number; vz: number }

export class Effects {
  private puffs: Puff[] = [];
  private spray: Puff[] = [];
  private flames: THREE.Mesh[] = [];
  private light: THREE.PointLight;
  private fireGroup = new THREE.Group();
  private emitAcc = 0;
  private sprayAcc = 0;
  private t = 0;

  constructor(scene: THREE.Scene, private origin: THREE.Vector3) {
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbdb6aa, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.puffs.push({ m, age: 0, life: 1, vx: 0, vz: 0 });
    }
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.spray.push({ m, age: 0, life: 1, vx: 0, vz: 0 });
    }
    const flameMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [c, s, x, z] of [[0xff6a1a, 0.45, 0, 0], [0xffb02e, 0.32, 0.18, 0.1], [0xff8a1f, 0.28, -0.2, -0.05]] as const) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(s * 0.6, s * 1.6, 7), flameMat(c));
      f.position.set(x, s * 0.8, z); f.userData.base = s;
      this.flames.push(f); this.fireGroup.add(f);
    }
    this.light = new THREE.PointLight(0xff7a2a, 0, 6, 1.6);
    this.light.position.set(0, 0.8, 0.6);
    this.fireGroup.add(this.light);
    this.fireGroup.position.copy(origin);
    this.fireGroup.visible = false;
    scene.add(this.fireGroup);
  }

  /**
   * smoke: 0 none, 1 grey (fire), 2 black (extractor gone). flames: 0 none, 1 spot glow, 2 duct fire.
   * sprayFrom/sprayTo: set while spraying.
   */
  update(dt: number, smoke: 0 | 1 | 2, flames: 0 | 1 | 2, sprayFrom: THREE.Vector3 | null) {
    this.t += dt;
    // smoke
    if (smoke) {
      this.emitAcc += dt * (smoke === 2 ? 9 : 6);
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const p = this.puffs.find(q => !q.m.visible);
        if (!p) break;
        p.age = 0; p.life = 2.2 + Math.random() * 1.2;
        p.vx = (Math.random() - 0.5) * 0.25 + 0.15; p.vz = (Math.random() - 0.5) * 0.25 + 0.1; // drifts with the breeze
        p.m.position.set(this.origin.x + (Math.random() - 0.5) * 0.4, this.origin.y + 0.2, this.origin.z + (Math.random() - 0.5) * 0.4);
        (p.m.material as THREE.MeshBasicMaterial).color.setHex(smoke === 2 ? 0x2a2622 : Math.random() < 0.5 ? 0xbdb6aa : 0xd6d0c4);
        p.m.visible = true;
      }
    }
    for (const p of this.puffs) {
      if (!p.m.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.m.visible = false; continue; }
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y += (0.9 - 0.4 * k) * dt;
      p.m.scale.setScalar(0.15 + k * 0.55);
      (p.m.material as THREE.MeshBasicMaterial).opacity = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.55;
    }

    // fire
    this.fireGroup.visible = flames > 0;
    if (flames) {
      const big = flames === 2 ? 1.7 : 1;
      this.flames.forEach((f, i) => {
        const s = f.userData.base as number;
        const flick = 0.75 + 0.35 * Math.abs(Math.sin(this.t * (11 + i * 3.7) + i)) + Math.random() * 0.1;
        f.scale.set(big * (0.9 + Math.random() * 0.15), big * flick, big * (0.9 + Math.random() * 0.15));
        f.position.y = s * 0.8 * big * flick;
      });
      this.light.intensity = (flames === 2 ? 9 : 5) * (0.75 + 0.25 * Math.sin(this.t * 23) * Math.sin(this.t * 7));
    }

    // spray: white particles from the nozzle to the fire
    if (sprayFrom) {
      this.sprayAcc += dt * 30;
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        const p = this.spray.find(q => !q.m.visible);
        if (!p) break;
        p.age = 0; p.life = 0.45;
        p.m.position.copy(sprayFrom);
        p.vx = (this.origin.x - sprayFrom.x) / p.life + (Math.random() - 0.5) * 0.6;
        p.vz = (this.origin.z - sprayFrom.z) / p.life + (Math.random() - 0.5) * 0.6;
        p.m.userData.vy = (this.origin.y + 0.3 - sprayFrom.y) / p.life;
        p.m.visible = true;
      }
    }
    for (const p of this.spray) {
      if (!p.m.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.m.visible = false; continue; }
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y += (p.m.userData.vy as number) * dt;
      p.m.scale.setScalar(0.05 + k * 0.18);
      (p.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    }
  }
}
