// The player: a round little worker. Capsule body, sphere head, two feet, a shadow blob that stays
// on the floor. All animation is procedural: bob while walking, feet stepping, lean into turns,
// a hop when you use something, squash when you land.
import * as THREE from 'three';
import type { Carry } from '../world/state.js';
import { WORLD } from '../world/worldConfig.js';
import { boxAt, toon } from './build.js';

const CARRY_COLOUR: Record<Carry, number> = {
  sheet: 0xd6bc8a, cut: 0xe9d6ac, scrap: 0x9a5a4a, extinguisher: 0xc0281e, bag: 0xd4cba6, offcuts: 0x9a8460, bundle: 0xc9a46a, debris: 0x7f858b, // debris: busted roller-door slats
};

export class PlayerView {
  readonly root = new THREE.Group();     // at the feet, on the floor; rotates to face
  private bodyPivot = new THREE.Group(); // leans and squashes
  private feet: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private carried = new THREE.Group();
  private carryMesh: THREE.Mesh;
  private phase = 0;
  private lean = 0;
  private squash = 0;
  private hopY = 0;
  private hopV = 0;
  private lastYaw = 0;
  private shrugT = 0;   // counts down through a shrug
  private sipT = 0;     // counts down through a sip
  private stumbleT = 0; // counts down through a stumble
  private can: THREE.Group;
  private canBody: THREE.Mesh;
  yaw = 0;

  constructor(scene: THREE.Scene) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.28, 4, 12), toon(0xe8892e)); // hi-vis orange
    body.position.y = 0.42; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), toon(0xf0c9a0));
    head.position.y = 0.9; head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), toon(0x2f4f6f));
    cap.position.y = 0.92;
    const brim = boxAt(0.2, 0.03, 0.14, 0x2f4f6f, 0, 0.94, -0.17);
    const eyes = new THREE.Group();
    for (const sx of [-0.06, 0.06]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
      e.position.set(sx, 0.92, -0.155); eyes.add(e);
    }
    this.bodyPivot.add(body, head, cap, brim, eyes, this.carried);
    for (const sx of [-0.1, 0.1]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), toon(0x3a2a1e));
      f.scale.set(1, 0.6, 1.4); f.position.set(sx, 0.045, 0); f.castShadow = true;
      this.feet.push(f); this.root.add(f);
    }
    this.carryMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.32), toon(0xffffff, true));
    this.carryMesh.position.set(0, 0.62, -0.28);
    this.carried.add(this.carryMesh);
    this.carried.visible = false;
    // a can in the right hand, held at the hip between sips
    this.can = new THREE.Group();
    this.canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 8), toon(0xc0281e, true));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.015, 8), toon(0xc8c8c8));
    lid.position.y = 0.072;
    this.can.add(this.canBody, lid);
    this.can.visible = false;
    this.bodyPivot.add(this.can);
    this.root.add(this.bodyPivot);
    scene.add(this.root);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x1a120a, transparent: true, opacity: 0.32, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
  }

  /** null: no can. 'full': a beer (with some in it). 'empty': done. */
  setCan(c: 'full' | 'empty' | null) {
    this.can.visible = c !== null;
    if (c) (this.canBody.material as THREE.MeshToonMaterial).color.setHex(c === 'full' ? 0xc0281e : 0x8a6a62);
  }
  /** Can up to the mouth and back down. */
  sip() { this.sipT = 0.8; }
  /** A lurch forward and a wobble: a fumbled step. */
  stumble() { this.stumbleT = 0.9; }

  /** Shoulders up, head tilted, a wobble side to side: "none left". */
  shrug() { this.shrugT = 0.9; }

  hop() { if (this.hopY <= 0.001) this.hopV = WORLD.hopVelocity; }

  setCarry(c: Carry | null) {
    this.carried.visible = c !== null;
    if (!c) return;
    (this.carryMesh.material as THREE.MeshToonMaterial).color.setHex(CARRY_COLOUR[c]);
    if (c === 'extinguisher') { this.carryMesh.scale.set(0.45, 5, 0.6); this.carryMesh.position.set(0.22, 0.45, -0.12); }
    else if (c === 'bundle') { this.carryMesh.scale.set(2.4, 4, 2.6); this.carryMesh.position.set(0, 1.27, 0); } // a strapped bundle overhead
    else if (c === 'bag' || c === 'offcuts') { this.carryMesh.scale.set(1, 5, 1.2); this.carryMesh.position.set(0, 0.5, -0.3); }
    else { this.carryMesh.scale.set(2.4, 1, 2.6); this.carryMesh.position.set(0, 1.18, 0); } // sheets go overhead
  }

  setVisible(v: boolean) { this.root.visible = v; this.shadow.visible = v; }

  /** x, z: feet position. vx, vz: velocity (m/s). */
  update(dt: number, x: number, z: number, vx: number, vz: number) {
    const speed = Math.hypot(vx, vz);
    const moving = speed > 0.15;
    if (moving) {
      const want = Math.atan2(-vx, -vz); // model faces -z
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, WORLD.turnRate * dt);
    }
    // lean into turns: proportional to how fast we're turning, and a little forward with speed
    let turn = this.yaw - this.lastYaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.lastYaw = this.yaw;
    const targetLean = THREE.MathUtils.clamp((turn / Math.max(dt, 1e-3)) * 0.06, -0.35, 0.35);
    this.lean += (targetLean - this.lean) * Math.min(1, 10 * dt);

    // hop and landing squash
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= WORLD.gravity * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) { this.hopY = 0; this.hopV = 0; this.squash = 1; }
    }
    this.squash = Math.max(0, this.squash - dt * 5);

    const k = Math.min(1, speed / WORLD.maxSpeed);
    this.phase += dt * (6 + 8 * k) * (moving ? 1 : 0);
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.06 * k : 0;
    const sq = Math.sin(this.squash * Math.PI) * 0.28;

    this.root.position.set(x, this.hopY, z);
    this.root.rotation.y = this.yaw;
    this.bodyPivot.position.y = bob;
    this.shrugT = Math.max(0, this.shrugT - dt);
    this.sipT = Math.max(0, this.sipT - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    const sipK = this.sipT > 0 ? Math.sin((0.8 - this.sipT) / 0.8 * Math.PI) : 0;   // 0 → 1 → 0
    const stumbleK = this.stumbleT > 0 ? Math.sin((0.9 - this.stumbleT) / 0.9 * Math.PI) : 0;
    // can: at the hip, swung up to the mouth for a sip
    this.can.position.set(0.22 - sipK * 0.14, 0.48 + sipK * 0.42, -0.06 - sipK * 0.14);
    this.can.rotation.x = sipK * 1.1;
    const shrug = this.shrugT > 0 ? Math.sin((0.9 - this.shrugT) / 0.9 * Math.PI) : 0;
    this.bodyPivot.rotation.z = -this.lean + shrug * Math.sin(this.shrugT * 22) * 0.12 + stumbleK * Math.sin(this.stumbleT * 18) * 0.2;
    this.bodyPivot.rotation.x = -0.12 * k - stumbleK * 0.45 + sipK * 0.12; // head back for a sip, pitch forward in a stumble
    this.bodyPivot.scale.set(1 + sq * 0.6 + shrug * 0.08, 1 - sq - shrug * 0.06, 1 + sq * 0.6);
    this.feet.forEach((f, i) => {
      const s = Math.sin(this.phase + i * Math.PI);
      f.position.z = moving ? s * 0.11 * k : 0;
      f.position.y = 0.045 + (moving ? Math.max(0, -Math.cos(this.phase + i * Math.PI)) * 0.06 * k : 0);
    });
    this.shadow.position.set(x, 0.015, z);
    const sh = 1 - Math.min(0.5, this.hopY * 1.5);
    this.shadow.scale.setScalar(sh);
  }
}
