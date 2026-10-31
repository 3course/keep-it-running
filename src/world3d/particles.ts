// Small particles for the tiers that can afford them (TierSettings.detail.particles): embers off a fire, sparks when a
// bit lets go, a puff of dust when a cut starts. Two pooled point clouds (additive for anything that glows, normal for
// dust), each one draw call. Points are square and sized in metres, so at the low internal resolution they land as
// one- or two-pixel specks, like the rest of the pixel art. Fire already has its own smoke, flames and glow
// (effects.ts) on every tier; this only adds to it.
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute vec3 tint;
  attribute float alpha;
  attribute float size;
  uniform float uHalfH;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // metres to pixels at this depth, never below one pixel so a speck doesn't vanish between frames
    gl_PointSize = alpha > 0.0 ? max(1.0, size * projectionMatrix[1][1] * uHalfH / gl_Position.w) : 0.0;
    vTint = tint; vAlpha = alpha;
  }`;
const FRAG = /* glsl */`
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.01) discard;
    gl_FragColor = vec4(vTint, vAlpha);
    #include <colorspace_fragment>
  }`;

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; r: number; g: number; b: number; a: number; grav: number; drag: number; floor: boolean }

/** A fixed pool of points: spawn() takes the oldest slot when it's full, so a burst never allocates. */
class Cloud {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private next = 0;
  private pos: Float32Array; private tint: Float32Array; private alpha: Float32Array; private size: Float32Array;

  constructor(scene: THREE.Scene, n: number, additive: boolean, private halfH: { value: number }) {
    this.pos = new Float32Array(n * 3); this.tint = new Float32Array(n * 3);
    this.alpha = new Float32Array(n); this.size = new Float32Array(n);
    for (let i = 0; i < n; i++) this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0, size: 0, r: 0, g: 0, b: 0, a: 0, grav: 0, drag: 0, floor: false });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uHalfH: halfH },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false; // positions move every frame; the whole cloud is a handful of points
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  spawn(o: Partial<P> & { x: number; y: number; z: number; life: number; size: number; r: number; g: number; b: number }) {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.ps.length;
    Object.assign(p, { vx: 0, vy: 0, vz: 0, a: 1, grav: 0, drag: 0, floor: false }, o, { age: 0 });
  }

  get live() { return this.ps.reduce((n, p) => n + (p.age < p.life ? 1 : 0), 0); }

  update(dt: number) {
    let any = false;
    this.ps.forEach((p, i) => {
      if (p.age >= p.life) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } return; }
      any = true;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && p.y < 0.02) { p.y = 0.02; p.vy = -p.vy * 0.3; p.vx *= 0.5; p.vz *= 0.5; } // sparks skip across the floor
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.tint[i * 3] = p.r; this.tint[i * 3 + 1] = p.g; this.tint[i * 3 + 2] = p.b;
      this.alpha[i] = p.a * (k < 0.1 ? 1 : 1 - (k - 0.1) / 0.9);
      this.size[i] = p.size;
    });
    if (!any) return;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.tint.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = true;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** What the scene is doing this frame, for the particles to follow. */
export interface ParticleState {
  /** 0 no fire, 1 spot (glowing in the extractor), 2 the duct's alight. */
  flames: 0 | 1 | 2;
  /** True on the frame a bit-related fault starts (the bit's chipping or let go). */
  bitBreak: boolean;
  /** True on the frame a cut starts. */
  cutStart: boolean;
  cutting: boolean;
  /** Where the spindle meets the sheet. */
  spindle: THREE.Vector3;
}

export class Particles {
  private glow: Cloud;
  private dust: Cloud;
  private halfH = { value: 100 };
  private emberAcc = 0;
  private trickleAcc = 0;
  private floorGlow: THREE.Mesh;
  private t = 0;

  /**
   * level 1 (mid tier): embers and bursts, sparser. level 2 (high): denser, plus a dust trickle while cutting.
   * fireAt: the top of the exhaust unit, where effects.ts puts the flames.
   */
  constructor(scene: THREE.Scene, private fireAt: THREE.Vector3, private level: 1 | 2) {
    this.glow = new Cloud(scene, level === 2 ? 160 : 80, true, this.halfH);
    this.dust = new Cloud(scene, level === 2 ? 90 : 45, false, this.halfH);
    // the orange pool a fire throws on the floor beneath it: an additive disc, stepped so it reads as pixel art
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8;
      const a = d < 0.45 ? 0.55 : d < 0.75 ? 0.32 : d < 1 ? 0.14 : 0;
      ctx.fillStyle = `rgba(255,120,40,${a})`; ctx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.floorGlow.position.set(fireAt.x, 0.02, fireAt.z);
    this.floorGlow.visible = false;
    scene.add(this.floorGlow);
  }

  /** For tests: points alive in each cloud. */
  get live() { return { glow: this.glow.live, dust: this.dust.live }; }

  /** halfH: half the drawing buffer's height in pixels (points are sized against it). */
  update(dt: number, s: ParticleState, halfH: number) {
    this.t += dt;
    this.halfH.value = halfH;
    const dense = this.level === 2 ? 1 : 0.5;
    const f = this.fireAt;

    // embers: orange-to-yellow specks lifting off the fire, wandering as they rise
    if (s.flames) {
      this.emberAcc += dt * (s.flames === 2 ? 22 : 9) * dense;
      for (; this.emberAcc >= 1; this.emberAcc--) {
        const hot = Math.random();
        this.glow.spawn({
          x: f.x + rnd(-0.3, 0.3), y: f.y + rnd(0.1, 0.5), z: f.z + rnd(-0.3, 0.3),
          vx: rnd(-0.25, 0.4), vy: rnd(0.6, 1.4) * (s.flames === 2 ? 1.3 : 1), vz: rnd(-0.25, 0.35), drag: 0.6,
          life: rnd(0.8, 1.8), size: rnd(0.06, 0.1), r: 1, g: 0.3 + hot * 0.4, b: 0.05 + hot * 0.1,
        });
      }
      const flick = 0.8 + 0.2 * Math.sin(this.t * 19) * Math.sin(this.t * 5.3);
      const sc = (s.flames === 2 ? 3.6 : 2.2) * flick;
      this.floorGlow.scale.set(sc, 1, sc);
      (this.floorGlow.material as THREE.MeshBasicMaterial).opacity = flick;
    }
    this.floorGlow.visible = s.flames > 0;

    // sparks: a hot spray off the spindle when the bit lets go, bouncing across the bed and floor
    if (s.bitBreak) {
      const n = Math.round(40 * dense);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = rnd(1.2, 3.2);
        this.glow.spawn({
          x: s.spindle.x, y: s.spindle.y, z: s.spindle.z,
          vx: Math.cos(a) * v, vy: rnd(0.8, 2.6), vz: Math.sin(a) * v, grav: 7, drag: 0.4, floor: true,
          life: rnd(0.35, 0.9), size: rnd(0.045, 0.075), r: 1, g: rnd(0.8, 1), b: rnd(0.4, 0.75),
        });
      }
    }

    // dust: a pale puff as the bit plunges in, and (high tier) a light trickle while it cuts
    const puff = (n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = rnd(0.2, 1) * speed;
        const shade = rnd(0.82, 0.95);
        this.dust.spawn({
          x: s.spindle.x + rnd(-0.08, 0.08), y: s.spindle.y + rnd(0, 0.08), z: s.spindle.z + rnd(-0.08, 0.08),
          vx: Math.cos(a) * v, vy: rnd(0.2, 0.7) * speed, vz: Math.sin(a) * v, grav: 0.6, drag: 2.2,
          life: rnd(0.6, 1.3), size: rnd(0.08, 0.15), r: shade, g: shade * 0.92, b: shade * 0.74, a: 0.9,
        });
      }
    };
    if (s.cutStart) puff(Math.round(26 * dense), 1);
    if (s.cutting && this.level === 2) {
      this.trickleAcc += dt * 7;
      for (; this.trickleAcc >= 1; this.trickleAcc--) puff(1, 0.6);
    } else this.trickleAcc = 0;

    this.glow.update(dt);
    this.dust.update(dt);
  }
}
