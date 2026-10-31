// People up close: a figure with a readable face (eyes, brows, mouth), two arms and a can, for the knock-off two-shot
// and the part-timer. Five expressions, a blink, and small idles — a sip, leaning back, looking out the door, picking
// at the can's label. Same round, toon style as the player; just enough face to read at the low render resolution.
import * as THREE from 'three';
import type { Expr } from '../people/dialogue/types.js';
import { toon } from './build.js';

const INK = new THREE.MeshBasicMaterial({ color: 0x1a1414 });
const MOUTH_IN = new THREE.MeshBasicMaterial({ color: 0x5a1e1e });
const TEAR = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });

export type Hair = 'cap' | 'bun' | 'beanie' | 'short' | 'pony';
export interface FigureLook { shirt: number; skin?: number; hair: Hair; hairColour?: number; canColour?: number }

type Idle = 'sip' | 'lean' | 'look' | 'pick' | null;

export class Figure {
  readonly root = new THREE.Group();   // at the feet; faces -z
  private body = new THREE.Group();    // tilts (lean back, laugh)
  private head = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private smile: THREE.Mesh;
  private open: THREE.Mesh;
  private flat: THREE.Mesh;
  private tears: THREE.Mesh[] = [];
  private armR = new THREE.Group();    // holds the can
  private armL = new THREE.Group();
  private legs = new THREE.Group();
  readonly can: THREE.Group;
  expr: Expr = 'relaxed';
  seated = true;
  private t = Math.random() * 10;
  private blinkAt = 2;
  private idle: Idle = null;
  private idleT = 0;
  private nextIdle = 2 + Math.random() * 3;
  /** Where "out the door" is, as a yaw to turn the head toward (radians, relative to facing). */
  lookYaw = 0.9;
  /** Seconds of talking left: the mouth moves. */
  talking = 0;
  walking = false;

  constructor(look: FigureLook) {
    const skin = look.skin ?? 0xf0c9a0;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.26, 4, 12), toon(look.shirt, true));
    torso.position.y = 0.2; torso.castShadow = true;
    this.body.add(torso);
    // head
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), toon(skin, true));
    skull.castShadow = true;
    this.head.add(skull);
    this.head.position.y = 0.62;
    this.body.add(this.head);
    const hairMat = toon(look.hairColour ?? 0x3a2a20, true);
    if (look.hair === 'cap') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.176, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), hairMat);
      cap.position.y = 0.02; this.head.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.13), hairMat); brim.position.set(0, 0.06, -0.17); this.head.add(brim);
    } else if (look.hair === 'beanie') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), hairMat);
      b.position.y = 0.03; b.scale.y = 1.15; this.head.add(b);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(0xf4efe0)); pom.position.y = 0.22; this.head.add(pom);
    } else {
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.178, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), hairMat);
      top.position.set(0, 0.015, 0.012); this.head.add(top);
      if (look.hair === 'bun') { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), hairMat); bun.position.set(0, 0.17, 0.08); this.head.add(bun); }
      if (look.hair === 'pony') { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.14, 3, 6), hairMat); p.position.set(0, 0.0, 0.17); p.rotation.x = 0.5; this.head.add(p); }
    }
    // face, on the -z side
    for (const sx of [-0.06, 0.06]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), INK);
      e.position.set(sx, 0.025, -0.155); e.scale.set(1, 1.25, 0.6); this.head.add(e); this.eyes.push(e);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), INK);
      b.position.set(sx, 0.08, -0.152); this.head.add(b); this.brows.push(b);
      const tear = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), TEAR);
      tear.position.set(sx + 0.012, -0.012, -0.158); tear.visible = false; this.head.add(tear); this.tears.push(tear);
    }
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 4, 10, Math.PI), INK);
    this.smile.position.set(0, -0.045, -0.158); this.smile.rotation.z = Math.PI; this.head.add(this.smile);
    this.open = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 6), MOUTH_IN);
    this.open.position.set(0, -0.06, -0.15); this.open.scale.set(1.2, 0.8, 0.4); this.head.add(this.open);
    this.flat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), INK);
    this.flat.position.set(0, -0.06, -0.156); this.head.add(this.flat);
    // arms: a sleeve and a hand, pivoting at the shoulder
    for (const [arm, sx] of [[this.armR, 0.2], [this.armL, -0.2]] as const) {
      arm.position.set(sx, 0.36, 0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 3, 8), toon(look.shirt, true));
      sleeve.position.y = -0.13; arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(skin, true));
      hand.position.y = -0.27; arm.add(hand);
      this.body.add(arm);
    }
    this.can = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), toon(look.canColour ?? 0x2f8f6f, true));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 10), toon(0xc8c8c8));
    lid.position.y = 0.066; this.can.add(can, lid);
    this.can.position.set(0, -0.3, -0.04);
    this.armR.add(this.can);
    // legs: seated (thighs forward) or standing
    const legMat = toon(0x2e3440, true);
    for (const sx of [-0.09, 0.09]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 3, 8), legMat);
      thigh.rotation.x = Math.PI / 2; thigh.position.set(sx, 0, -0.16); this.legs.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 3, 8), legMat);
      shin.position.set(sx, -0.19, -0.3); this.legs.add(shin);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0x3a2a1e)); foot.scale.set(1, 0.6, 1.4);
      foot.position.set(sx, -0.34, -0.34); this.legs.add(foot);
    }
    this.body.add(this.legs);
    this.root.add(this.body);
    this.setSeated(true);
    this.setExpr('relaxed');
  }

  /** Sitting on a crate (hips at crate height) or standing. */
  setSeated(seated: boolean) {
    this.seated = seated;
    this.body.position.y = seated ? 0.42 : 0.62;
    this.legs.rotation.x = seated ? 0 : -Math.PI / 2;
    this.legs.position.set(0, seated ? -0.02 : -0.05, seated ? 0 : 0.1);
  }

  setExpr(e: Expr) {
    this.expr = e;
    const [l, r] = this.eyes, [bl, br] = this.brows;
    for (const eye of this.eyes) { eye.scale.set(1, 1.25, 0.6); eye.position.y = 0.025; }
    bl.rotation.z = 0; br.rotation.z = 0; bl.position.y = 0.08; br.position.y = 0.08;
    this.smile.visible = false; this.open.visible = false; this.flat.visible = false;
    for (const t of this.tears) t.visible = false;
    switch (e) {
      case 'relaxed': this.smile.visible = true; this.smile.scale.set(0.8, 0.6, 1); break;
      case 'laughing':
        for (const eye of this.eyes) eye.scale.set(1.3, 0.35, 0.6);   // squeezed shut
        this.open.visible = true; this.open.scale.set(1.3, 1.1, 0.4);
        bl.position.y = br.position.y = 0.09; break;
      case 'thoughtful':
        for (const eye of this.eyes) eye.position.y = 0.04;           // looking up
        bl.rotation.z = -0.25; br.position.y = 0.095;                 // one brow up
        this.flat.visible = true; break;
      case 'misty':
        bl.rotation.z = -0.35; br.rotation.z = 0.35;                  // brows up in the middle
        this.smile.visible = true; this.smile.scale.set(0.6, 0.45, 1);
        for (const t of this.tears) t.visible = true; break;
      case 'animated':
        for (const eye of this.eyes) eye.scale.set(1.2, 1.5, 0.6);
        bl.position.y = br.position.y = 0.1;
        this.open.visible = true; this.open.scale.set(1, 1, 0.4); break;
    }
    void l; void r;
  }

  /** Start an idle now (the scene calls sip on a can crack). */
  play(i: Exclude<Idle, null>) { this.idle = i; this.idleT = 0; }

  update(dt: number) {
    this.t += dt;
    // blink (not while laughing: the eyes are shut already)
    this.blinkAt -= dt;
    const blink = this.blinkAt < 0 && this.blinkAt > -0.12 && this.expr !== 'laughing';
    if (this.blinkAt < -0.12) this.blinkAt = 2 + Math.random() * 3.5;
    for (const e of this.eyes) e.visible = !blink;
    // idles
    this.nextIdle -= dt;
    if (!this.idle && this.nextIdle <= 0) {
      const pool: Idle[] = ['sip', 'sip', 'lean', 'look', 'pick'];
      this.play(pool[Math.floor(Math.random() * pool.length)]!);
      this.nextIdle = 3 + Math.random() * 4;
    }
    let armR = -0.25, armL = -0.15, lean = 0, headYaw = 0, headPitch = 0, armRz = 0.15, armLz = -0.15;
    if (this.idle) {
      this.idleT += dt;
      const k = (len: number) => Math.sin(Math.min(1, this.idleT / len) * Math.PI); // 0 → 1 → 0
      if (this.idle === 'sip') { const s = k(1.4); armR = -0.25 - s * 1.9; armRz = 0.15 + s * 0.35; headPitch = -s * 0.35; if (this.idleT > 1.4) this.idle = null; }
      else if (this.idle === 'lean') { lean = -k(3) * 0.22; if (this.idleT > 3) this.idle = null; }
      else if (this.idle === 'look') { headYaw = k(2.6) * this.lookYaw; if (this.idleT > 2.6) this.idle = null; }
      else if (this.idle === 'pick') { const s = k(2.2); armL = -0.15 - s * 0.7; armLz = -0.15 + s * 0.45; headPitch = s * 0.25; if (this.idleT > 2.2) this.idle = null; }
    }
    // the face drives the body a little: a laugh rocks back, animated gestures
    if (this.expr === 'laughing') { lean -= 0.12 + Math.abs(Math.sin(this.t * 9)) * 0.06; headPitch -= 0.15; }
    if (this.expr === 'animated') { armL = -0.6 - Math.abs(Math.sin(this.t * 5)) * 0.8; armLz = -0.5; }
    if (this.expr === 'thoughtful' && !this.idle) { armL = -1.9; armLz = 0.75; headYaw += 0.15; }   // hand to chin
    if (this.expr === 'misty') headPitch += 0.12;
    const s = Math.min(1, dt * 10);
    this.body.rotation.x += (lean - this.body.rotation.x) * s;
    this.head.rotation.y += (headYaw - this.head.rotation.y) * s;
    this.head.rotation.x += (headPitch - this.head.rotation.x) * s;
    this.armR.rotation.x += (armR - this.armR.rotation.x) * s;
    this.armR.rotation.z += (armRz - this.armR.rotation.z) * s;
    this.armL.rotation.x += (armL - this.armL.rotation.x) * s;
    this.armL.rotation.z += (armLz - this.armL.rotation.z) * s;
    // talking: the mouth flaps
    if (this.talking > 0) {
      this.talking -= dt;
      if (this.expr === 'relaxed' || this.expr === 'thoughtful' || this.expr === 'misty') {
        const o = Math.sin(this.t * 18) > 0;
        this.open.visible = o; this.open.scale.set(0.9, 0.6, 0.4);
        this.smile.visible = !o && this.expr !== 'thoughtful'; this.flat.visible = !o && this.expr === 'thoughtful';
      }
    } else if (this.open.visible && (this.expr === 'relaxed' || this.expr === 'thoughtful' || this.expr === 'misty')) this.setExpr(this.expr);
    // walking (the friend you called, coming in): a bob
    this.body.position.y = (this.seated ? 0.42 : 0.62) + (this.walking ? Math.abs(Math.sin(this.t * 9)) * 0.04 : 0);
  }

  /** Head height in world space, for speech bubbles. */
  headWorld(out: THREE.Vector3) { return this.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.26, 0)); }
}
