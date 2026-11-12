// People up close: a figure with a readable face (eyes, brows, mouth), two arms and a can, for the knock-off two-shot
// and the part-timer. Five expressions, a blink, and small idles — a sip, leaning back, looking out the door, picking
// at the can's label. Same round, toon style as the player; just enough face to read at the low render resolution.
import * as THREE from 'three';
import type { Expr } from '../people/dialogue/types.js';
import { toon } from './build.js';
import { removeAndDispose, shared } from './dispose.js';
import { snapToPixels, unsnap } from './pixelSnap.js';

// shared by every face (never disposed)
const INK = shared(new THREE.MeshBasicMaterial({ color: 0x1a1414 }));
const MOUTH_IN = shared(new THREE.MeshBasicMaterial({ color: 0x5a1e1e }));
const TEAR = shared(new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));

export type Hair = 'bald' | 'buzz' | 'short' | 'cap' | 'beanie' | 'bun' | 'pony' | 'long' | 'mullet';
export type Build = 'slim' | 'medium' | 'broad';
export type Top = 'tee' | 'hivis' | 'flannie' | 'hoodie' | 'work' | 'footy' | 'apron';
export type Beard = 'none' | 'stubble' | 'moustache' | 'beard';
/**
 * Everything that makes a person look like themselves. Only `shirt` and `hair` are required; the rest default to a
 * medium-build bloke in a tee, trousers and boots (what every figure used to be). Named people have hand-set looks and
 * everyone else a seeded random one: src/world3d/looks.ts.
 */
export interface FigureLook {
  shirt: number; skin?: number; hair: Hair; hairColour?: number; canColour?: number;
  build?: Build;                 // torso and leg width
  height?: number;               // 0.9–1.08 of standard
  beard?: Beard;
  top?: Top; top2?: number;      // what's worn over the shirt, and its second colour (stripes, hoops, the vest, the apron)
  legs?: 'trousers' | 'shorts'; legColour?: number;
  shoes?: 'boots' | 'runners'; shoeColour?: number;
  glasses?: boolean; earmuffs?: boolean; pencil?: boolean; phone?: boolean;
  age?: 'young' | 'adult' | 'old';   // old: stooped, bushy brows; young: lanky
}

/** Chest width and depth, and how far apart the legs stand, per build. */
const BUILD: Record<Build, { chest: number; depth: number; legs: number }> = {
  slim: { chest: 0.86, depth: 0.9, legs: 0.9 },
  medium: { chest: 1, depth: 1, legs: 1 },
  broad: { chest: 1.22, depth: 1.1, legs: 1.22 },
};

type Idle = 'sip' | 'lean' | 'look' | 'pick' | null;

/** The walk: each stepped pose held this long (s); the stride angle (rad, ~18°); the lift on the passing poses (m). */
const STEP_SECONDS = 0.16;
const STRIDE = 0.32;
const STEP_LIFT = 0.03;

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
  private legs = new THREE.Group();    // at the hips, under the body (not in it: a lean or a laugh tilts the torso, never the legs)
  /** Each leg: a pivot at the hip, and the thigh, shin and foot hung from it (posed for sitting or standing). */
  private legParts: { pivot: THREE.Group; thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh; side: number }[] = [];
  /** Walking: which of the four stepped poses (neutral, left forward, neutral, right forward), and time in it. */
  /** Baseline forward tilt of the torso (an older bloke's stoop). */
  private hunch = 0;
  private stepPose = 0;
  private stepT = 0;
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
  /** Carrying something in both arms (boards). */
  armsUp = false;

  /** `snap: false` when something else (a parent that's moved and turned) is snapped to whole pixels instead. */
  constructor(look: FigureLook, opts: { snap?: boolean } = {}) {
    const L = { build: 'medium' as Build, height: 1, beard: 'none' as Beard, top: 'tee' as Top, legs: 'trousers' as const, legColour: 0x2e3440,
      shoes: 'boots' as const, age: 'adult' as const, ...look };
    const skin = L.skin ?? 0xf0c9a0, B = BUILD[L.build];
    this.root.scale.setScalar(L.height);
    this.hunch = L.age === 'old' ? -0.13 : L.age === 'adult' ? -0.02 : 0;
    // the chest: a torso, and what's worn on it (scaled for the build)
    const chest = new THREE.Group(); chest.scale.set(B.chest, 1, B.depth);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.26, 4, 12), toon(L.shirt, true));
    torso.position.y = 0.2; torso.castShadow = true;
    chest.add(torso);
    dress(chest, L);
    this.body.add(chest);
    // head
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), toon(skin, true));
    skull.castShadow = true;
    this.head.add(skull);
    this.head.position.y = 0.62;
    this.body.add(this.head);
    const hairMat = toon(L.hairColour ?? (L.age === 'old' ? 0xbfbfc4 : 0x3a2a20), true);
    addHair(this.head, L.hair, hairMat);
    // face, on the -z side
    const browGeo = L.age === 'old' ? new THREE.BoxGeometry(0.07, 0.026, 0.024) : new THREE.BoxGeometry(0.06, 0.014, 0.02);
    for (const sx of [-0.06, 0.06]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), INK);
      e.position.set(sx, 0.025, -0.155); e.scale.set(1, 1.25, 0.6); this.head.add(e); this.eyes.push(e);
      const b = new THREE.Mesh(browGeo, L.age === 'old' ? toon(L.hairColour ?? 0xbfbfc4) : INK);
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
    addBeard(this.head, L.beard, hairMat, skin);
    if (L.glasses) {
      for (const sx of [-0.06, 0.06]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 4, 12), INK); r.position.set(sx, 0.025, -0.165); this.head.add(r); }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), INK); bridge.position.set(0, 0.03, -0.168); this.head.add(bridge);
    }
    if (L.pencil) {
      const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 6), toon(0xe8c23a)); pen.position.set(0.168, 0.06, -0.03); pen.rotation.z = -0.35; this.head.add(pen);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.009, 0.025, 6), toon(0xd98a8a)); tip.position.set(0.19, 0.1, -0.03); tip.rotation.z = -0.35; this.head.add(tip);
    }
    if (L.earmuffs) { // round the neck: the band, and the pads resting on the chest
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 14), toon(0x2a2a2e)); band.position.y = 0.47; band.rotation.x = Math.PI / 2; this.body.add(band);
      for (const sx of [-0.13, 0.13]) { const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), toon(0xe86a1c)); pad.position.set(sx, 0.44, -0.1); pad.rotation.z = Math.PI / 2; this.body.add(pad); }
    }
    // arms: a sleeve and a hand, pivoting at the shoulder
    for (const [arm, sx] of [[this.armR, 0.2], [this.armL, -0.2]] as const) {
      arm.position.set(sx * B.chest, 0.36, 0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 3, 8), toon(L.top === 'footy' && L.top2 !== undefined ? L.shirt : L.shirt, true));
      sleeve.position.y = -0.13; arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(skin, true));
      hand.position.y = -0.27; arm.add(hand);
      this.body.add(arm);
    }
    if (L.phone) { // in the left hand, screen up
      const ph = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.014), toon(0x1e1e22)); ph.position.set(0, -0.3, -0.05); ph.rotation.x = -0.5; this.armL.add(ph);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.07, 0.004), new THREE.MeshBasicMaterial({ color: 0x9fd8ff })); scr.position.set(0, 0, -0.009); ph.add(scr);
    }
    this.can = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), toon(look.canColour ?? 0x2f8f6f, true));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 10), toon(0xc8c8c8));
    lid.position.y = 0.066; this.can.add(can, lid);
    this.can.position.set(0, -0.3, -0.04);
    this.armR.add(this.can);
    // legs: a pivot per hip; seated (thighs forward, shins down) or standing (straight down, feet flat on the ground)
    const legMat = toon(L.legColour, true), skinMat = toon(skin, true), shorts = L.legs === 'shorts';
    for (const [i, sx] of [-0.09, 0.09].entries()) {
      const pivot = new THREE.Group(); pivot.position.x = sx * B.legs;
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 3, 8), legMat);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 3, 8), shorts ? skinMat : legMat);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(L.shoes === 'runners' ? (L.shoeColour ?? 0xe9e6dc) : (L.shoeColour ?? 0x3a2a1e)));
      if (L.shoes === 'runners') {
        foot.scale.set(0.95, 0.5, 1.5);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.12), toon(0xd9643a)); stripe.position.set(sx < 0 ? -0.065 : 0.065, 0.01, 0); foot.add(stripe);
      } else foot.scale.set(1.05, 0.72, 1.5);
      pivot.add(thigh, shin, foot);
      this.legs.add(pivot);
      this.legParts.push({ pivot, thigh, shin, foot, side: i ? 1 : -1 });
    }
    this.root.add(this.legs, this.body);
    if (opts.snap !== false) snapToPixels(this.root); // on whole render pixels, every frame
    this.setSeated(true);
    this.setExpr('relaxed');
  }

  /** Sitting on a crate (hips at crate height) or standing (legs straight under the hips, both feet on the ground). */
  setSeated(seated: boolean) {
    this.seated = seated;
    this.body.position.y = seated ? 0.42 : 0.62;
    this.legs.position.set(0, seated ? 0.40 : 0.62, 0); // the hips
    for (const l of this.legParts) {
      l.pivot.rotation.set(0, 0, 0);
      if (seated) {
        l.thigh.rotation.x = Math.PI / 2; l.thigh.position.set(0, 0, -0.16);
        l.shin.position.set(0, -0.19, -0.3);
        l.foot.position.set(0, -0.34, -0.34);
      } else {
        // thigh, then shin, straight down; the foot's sole on the floor (hips at 0.62: 0.62 - 0.578 - 0.042 = 0)
        l.thigh.rotation.x = 0; l.thigh.position.set(0, -0.17, 0);
        l.shin.position.set(0, -0.43, 0);
        l.foot.position.set(0, l.foot.scale.y * 0.07 - 0.62, -0.04); // the sole on the floor, whatever shoe
      }
    }
    this.stepPose = 0; this.stepT = 0;
  }

  /**
   * The legs, each frame. Standing still: exactly straight (no sway). Walking: four stepped poses, held, not tweened —
   * at the low render resolution a few degrees of tilt reads as a kink; ±18° reads as a clean stride.
   */
  private poseLegs(dt: number) {
    if (this.seated) return;
    if (!this.walking) { if (this.stepPose !== 0) { this.stepPose = 0; this.stepT = 0; } }
    else { this.stepT += dt; if (this.stepT >= STEP_SECONDS) { this.stepT = 0; this.stepPose = (this.stepPose + 1) % 4; } }
    const swing = this.stepPose === 1 ? 1 : this.stepPose === 3 ? -1 : 0;
    for (const l of this.legParts) l.pivot.rotation.x = swing * l.side * STRIDE;
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
    let armR = -0.25, armL = -0.15, lean = this.hunch, headYaw = 0, headPitch = 0, armRz = 0.15, armLz = -0.15;
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
    if (this.armsUp) { armR = -1.3; armL = -1.3; armRz = 0.05; armLz = -0.05; }
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
    // the legs; walking, the body rises a step on the passing poses (a whole step, not a smooth bob)
    this.poseLegs(dt);
    const lift = this.walking && !this.seated && (this.stepPose === 0 || this.stepPose === 2) ? STEP_LIFT : 0;
    this.body.position.y = (this.seated ? 0.42 : 0.62) + lift;
    this.legs.position.y = (this.seated ? 0.40 : 0.62) + lift;
  }

  /**
   * Gone for good: off its parent, and its geometries and own materials given back (the shared ones stay: toon()'s
   * cache, the ink). Don't use it after.
   */
  dispose() {
    unsnap(this.root);
    removeAndDispose(this.root);
  }

  /** Head height in world space, for speech bubbles. (Writes into `out`: called per figure per frame, so no allocating.) */
  headWorld(out: THREE.Vector3) { this.head.getWorldPosition(out); out.y += 0.26; return out; }
}


/** Hair for a style; `m` is its material. */
function addHair(head: THREE.Group, style: Hair, m: THREE.Material) {
  const cap = (r: number, phi: number, y = 0.015, z = 0.012) => { const t = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, phi), m); t.position.set(0, y, z); head.add(t); return t; };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); head.add(b); return b; };
  switch (style) {
    case 'bald': break;
    case 'buzz': cap(0.172, Math.PI / 2.9, 0.012, 0.006); break;
    case 'cap': {
      cap(0.176, Math.PI / 2.3, 0.02, 0);
      box(0.2, 0.025, 0.13, 0, 0.06, -0.17); // the brim
      break;
    }
    case 'beanie': {
      const b = cap(0.18, Math.PI / 2.1, 0.03, 0); b.scale.y = 1.15;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(0xf4efe0)); pom.position.y = 0.22; head.add(pom);
      break;
    }
    case 'bun': cap(0.178, Math.PI / 2.6); { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m); bun.position.set(0, 0.17, 0.08); head.add(bun); } break;
    case 'pony': { cap(0.178, Math.PI / 2.6); const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.14, 3, 6), m); p.position.set(0, 0.0, 0.17); p.rotation.x = 0.5; head.add(p); break; }
    case 'long':
      cap(0.18, Math.PI / 2.5);
      box(0.34, 0.34, 0.1, 0, -0.08, 0.12);       // down the back
      for (const sx of [-0.15, 0.15]) box(0.05, 0.26, 0.1, sx, -0.04, 0.04); // and either side of the face
      break;
    case 'mullet':
      cap(0.178, Math.PI / 2.6);
      box(0.2, 0.24, 0.08, 0, -0.12, 0.14);        // business up front, party out the back
      for (const sx of [-0.16, 0.16]) box(0.03, 0.1, 0.05, sx, -0.02, 0.03);
      break;
    default: cap(0.178, Math.PI / 2.6); // short
  }
}

/** Facial hair, on the -z face, in front of the chin and behind the mouth. */
function addBeard(head: THREE.Group, kind: Beard, hair: THREE.Material, skin: number) {
  if (kind === 'none') return;
  const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); head.add(b); };
  if (kind === 'beard') { box(hair, 0.2, 0.075, 0.1, 0, -0.125, -0.12); for (const sx of [-0.1, 0.1]) box(hair, 0.03, 0.1, 0.1, sx, -0.08, -0.07); }
  else if (kind === 'moustache') box(hair, 0.11, 0.024, 0.04, 0, -0.03, -0.158);
  else box(toon(new THREE.Color(skin).multiplyScalar(0.72).getHex()), 0.19, 0.08, 0.1, 0, -0.11, -0.1); // stubble: a shadow along the jaw
}

/** What's worn on the torso (in the chest group, so it widens with the build). */
function dress(chest: THREE.Group, L: FigureLook) {
  const top = L.top ?? 'tee', c2 = L.top2;
  const box = (col: number, w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(col)); b.position.set(x, y, z); chest.add(b); return b; };
  const ring = (col: number, y: number, h: number, r = 0.204) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), toon(col)); m.position.y = y; chest.add(m); };
  switch (top) {
    case 'tee': break;
    case 'work': // a collar and a chest pocket
      for (const sx of [-1, 1]) { const c = box(L.shirt, 0.09, 0.035, 0.05, sx * 0.05, 0.5, -0.12); c.rotation.z = sx * -0.5; }
      box(c2 ?? 0x2a2a2e, 0.075, 0.075, 0.016, 0.09, 0.27, -0.197);
      break;
    case 'flannie': { // checks: dark bands round and strips down
      const dk = c2 ?? 0x2a1a14;
      for (const y of [0.1, 0.2, 0.3]) ring(dk, y, 0.03);
      for (const sx of [-0.07, 0.07]) box(dk, 0.03, 0.26, 0.012, sx, 0.2, -0.19);
      break;
    }
    case 'hoodie': // the hood bunched at the neck, a front pocket and drawstrings
      { const hood = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(L.shirt)); hood.position.set(0, 0.5, 0.12); hood.scale.set(1.3, 0.8, 0.9); chest.add(hood); }
      box(L.shirt, 0.17, 0.08, 0.02, 0, 0.08, -0.199);
      for (const sx of [-0.035, 0.035]) box(0xf1f1ea, 0.012, 0.09, 0.012, sx, 0.4, -0.2);
      break;
    case 'hivis': { // a vest over the shirt: bright, two reflective bands
      const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.213, 0.2, 4, 12), toon(c2 ?? 0xc6e32c)); vest.position.y = 0.2; chest.add(vest);
      ring(0xe9edf0, 0.14, 0.03, 0.218); ring(0xe9edf0, 0.27, 0.03, 0.218);
      break;
    }
    case 'footy': // hoops (generic colours: no real club's)
      for (const y of [0.1, 0.18, 0.26, 0.34]) ring(c2 ?? 0xf1f1ea, y, 0.04);
      break;
    case 'apron': // bib, neck strap, a pocket
      box(c2 ?? 0x7a5a3a, 0.3, 0.34, 0.02, 0, 0.12, -0.205);
      box(c2 ?? 0x7a5a3a, 0.04, 0.12, 0.02, 0, 0.44, -0.17);
      box(0x5a4028, 0.1, 0.07, 0.018, 0, 0.06, -0.22);
      break;
  }
}
