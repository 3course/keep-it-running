// The reveal when a sheet comes off: the camera pushes in, the piece lifts off the bed, dust puffs off it, and it turns
// once under a warm light, then the camera eases back. Under three seconds, and a tap skips it. The low tier and ?safe
// get the same moves with no extra light and no particles (and plain materials: piece.ts).
// Also renders the "after" thumbnails for the day's gallery from the same extruded piece.
import * as THREE from 'three';
import type { Design } from '../designs/types.js';
import { buildPiece, pieceThickness, type Piece } from './piece.js';

/** Seconds. */
export const REVEAL = { total: 2.8, pushIn: 0.6, liftAt: 0.25, liftFor: 0.7, spinAt: 0.8, spinFor: 1.45, outAt: 2.35 } as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export interface RevealTier { rich: boolean; light: boolean; particles: boolean }

const PUFF = 48;

export class Reveal {
  /** Seconds into the reveal; null when none is playing. */
  t: number | null = null;
  design: Design | null = null;
  private piece: Piece | null = null;
  private holder = new THREE.Group();   // at the piece's spot on the bed; turns to face the camera, and spins
  private tilt = new THREE.Group();     // tips the face up toward the camera
  private centre = new THREE.Group();   // puts the outline's middle on the pivot
  private light: THREE.PointLight | null = null;
  private dust: THREE.Points | null = null;
  private dustVel = new Float32Array(PUFF * 3);
  private dustT = -1;
  private size = 1;
  private yaw = 0;
  private look = new THREE.Vector3();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private thumbs = new Map<string, string>();

  constructor(private scene: THREE.Scene, readonly tier: RevealTier) {
    this.holder.add(this.tilt); this.tilt.add(this.centre);
    this.holder.visible = false;
    scene.add(this.holder);
    if (tier.light) {
      // always in the scene (intensity 0 until a reveal) so turning it up doesn't recompile every shader mid-reveal
      this.light = new THREE.PointLight(0xffb36b, 0, 6, 1.6);
      scene.add(this.light);
    }
    if (tier.particles) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PUFF * 3), 3));
      this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xeadfc6, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
      this.dust.frustumCulled = false; this.dust.visible = false;
      scene.add(this.dust);
    }
  }

  get active() { return this.t !== null; }

  /** Lift `d` off the sheet mesh `sheet` (its top `top` m above its centre), drawn at `scale` m per mm like the cut. */
  start(d: Design, sheet: THREE.Object3D, top: number, scale: number, camera: THREE.Camera) {
    this.end();
    this.design = d;
    const p = this.piece = buildPiece(d, scale, this.tier.rich);
    // centre the pivot on the outline (the piece is placed by its sheet, which can be off-centre)
    const box = new THREE.Box3().setFromObject(p.group);
    box.getCenter(this.v);
    this.size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    p.group.position.set(-this.v.x, -pieceThickness(d) / 2, -this.v.z);
    this.centre.add(p.group);
    sheet.updateWorldMatrix(true, false);
    this.v2.set(this.v.x, top + pieceThickness(d) / 2, this.v.z);
    sheet.localToWorld(this.v2);
    this.holder.position.copy(this.v2);
    this.look.copy(this.v2);
    // face the camera across the floor
    const cam = camera.position;
    this.yaw = Math.atan2(cam.x - this.v2.x, cam.z - this.v2.z);
    this.holder.rotation.set(0, this.yaw, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.holder.scale.setScalar(1);
    this.holder.visible = true;
    this.t = 0;
    this.dustT = -1;
  }

  skip() { this.end(); }

  private end() {
    this.t = null;
    this.holder.visible = false;
    if (this.piece) { this.centre.remove(this.piece.group); this.piece.dispose(); this.piece = null; }
    if (this.light) this.light.intensity = 0;
    if (this.dust) this.dust.visible = false;
  }

  /**
   * Step it, then move the camera: blend from where the view put it (`camera` as is, looking at `baseLook`) to a close
   * shot of the piece. Returns false once it's over.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, baseLook: THREE.Vector3): boolean {
    if (this.t === null) return false;
    this.t += dt;
    const t = this.t;
    if (t >= REVEAL.total) { this.end(); return false; }
    const lift = easeOut(clamp01((t - REVEAL.liftAt) / REVEAL.liftFor));
    const spin = easeInOut(clamp01((t - REVEAL.spinAt) / REVEAL.spinFor));
    const out = easeInOut(clamp01((t - REVEAL.outAt) / (REVEAL.total - REVEAL.outAt)));
    const liftH = 0.3 + this.size * 0.3;
    this.holder.position.y = this.look.y + lift * liftH;
    this.holder.rotation.y = this.yaw + spin * Math.PI * 2;
    this.tilt.rotation.x = lift * 0.95;
    this.holder.scale.setScalar(1 - out * 0.85);

    // camera: push in on the lifted piece, ease back out at the end
    const w = easeInOut(clamp01(t / REVEAL.pushIn)) * (1 - out);
    const target = this.v.set(this.look.x, this.look.y + lift * liftH, this.look.z);
    const from = this.v2.copy(camera.position).sub(baseLook).normalize();
    // far enough back that the piece fits the narrower way of the screen, with room round it
    const vfov = camera.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = 0.4 + (this.size * 0.62) / Math.tan(Math.min(vfov, hfov) / 2);
    const close = from.multiplyScalar(dist).add(target);
    camera.position.lerp(close, w);
    camera.lookAt(baseLook.clone().lerp(target, w));

    if (this.light) {
      // warm, from just in front of the piece and above it, toward the camera
      const toCam = this.v2.copy(camera.position).sub(target).normalize();
      this.light.position.copy(target).addScaledVector(toCam, 0.9);
      this.light.position.y += 0.5;
      this.light.intensity = 4.5 * Math.min(lift, 1 - out);
    }
    this.updateDust(dt, target, lift);
    return true;
  }

  private updateDust(dt: number, at: THREE.Vector3, lift: number) {
    const d = this.dust;
    if (!d) return;
    const pos = d.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    if (this.dustT < 0 && lift > 0.05) {
      // a puff off the piece as it comes up: from its edge, outward and up, then settling
      this.dustT = 0;
      for (let i = 0; i < PUFF; i++) {
        const ang = Math.random() * Math.PI * 2, r = this.size * (0.25 + Math.random() * 0.25);
        a[i * 3] = at.x + Math.cos(ang) * r; a[i * 3 + 1] = at.y - 0.02 + Math.random() * 0.05; a[i * 3 + 2] = at.z + Math.sin(ang) * r;
        const sp = 0.3 + Math.random() * 0.5;
        this.dustVel.set([Math.cos(ang) * sp, 0.35 + Math.random() * 0.5, Math.sin(ang) * sp], i * 3);
      }
      d.visible = true;
    }
    if (this.dustT < 0) return;
    this.dustT += dt;
    const k = Math.pow(0.12, dt);
    for (let i = 0; i < PUFF; i++) {
      this.dustVel[i * 3 + 1] -= 0.9 * dt;
      for (let c = 0; c < 3; c++) { this.dustVel[i * 3 + c] *= k; a[i * 3 + c] += this.dustVel[i * 3 + c] * dt; }
    }
    pos.needsUpdate = true;
    (d.material as THREE.PointsMaterial).opacity = 0.85 * (1 - clamp01(this.dustT / 1.3));
    if (this.dustT > 1.3) d.visible = false;
  }

  /**
   * The "after" for the gallery: the piece at three-quarters under the same kind of light, as a PNG data URL. Cached
   * per design. Renders off-screen with the game's renderer; null if that fails (a lost context).
   */
  thumbnail(renderer: THREE.WebGLRenderer, d: Design, w = 320, h = 240): string | null {
    const hit = this.thumbs.get(d.id);
    if (hit) return hit;
    try {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6a5a48, 1.6));
      const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); sun.position.set(-2, 4, 3); scene.add(sun);
      if (this.tier.light) { const warm = new THREE.PointLight(0xffb36b, 6, 8, 1.6); warm.position.set(1.2, 1.6, 1.8); scene.add(warm); }
      const p = buildPiece(d, 0.001, this.tier.rich);
      const box = new THREE.Box3().setFromObject(p.group), c = box.getCenter(new THREE.Vector3());
      const bw = box.max.x - box.min.x, bd = box.max.z - box.min.z;
      p.group.position.set(-c.x, 0, -c.z);
      const holder = new THREE.Group(), tilt = new THREE.Group();
      tilt.add(p.group); holder.add(tilt); scene.add(holder);
      // fit the outline to the frame (wide pieces by width, tall ones by height), stood up at three-quarters
      holder.scale.setScalar(Math.min(1.6 / bw, 1.15 / bd));
      tilt.rotation.x = 0.8; holder.rotation.y = -0.5;
      const cam = new THREE.PerspectiveCamera(36, w / h, 0.05, 20);
      cam.position.set(0, 0.3, 2.1); cam.lookAt(0, 0, 0);
      const rt = new THREE.WebGLRenderTarget(w, h, { samples: 0 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha(), prevColour = renderer.getClearColor(new THREE.Color());
      const prevShadow = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
      const px = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevColour, prevAlpha);
      renderer.shadowMap.enabled = prevShadow;
      rt.dispose(); p.dispose();
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // GL rows are bottom-up
      ctx.putImageData(img, 0, 0);
      const url = canvas.toDataURL('image/png');
      this.thumbs.set(d.id, url);
      return url;
    } catch (e) {
      console.warn('[Keep It Running] gallery thumbnail failed', e);
      return null;
    }
  }

  dispose() {
    this.end();
    this.scene.remove(this.holder);
    if (this.light) this.scene.remove(this.light);
    if (this.dust) { this.scene.remove(this.dust); this.dust.geometry.dispose(); (this.dust.material as THREE.Material).dispose(); }
  }
}
