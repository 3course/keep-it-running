// People land on whole render pixels. The scene renders at a fraction of the screen and is scaled up nearest-neighbour,
// so a figure drifting a fraction of a pixel per frame shimmers: its legs and feet hop between rows. Just before each
// render, every registered figure root is moved along the camera ray so its feet sit on a whole render pixel (on the
// same floor height); straight after, it goes back, so nothing that reads positions ever sees the rounding.
import * as THREE from 'three';

const roots = new Set<THREE.Object3D>();

/** Snap this root (a figure, at its feet) to whole render pixels from now on. */
export function snapToPixels(o: THREE.Object3D) { roots.add(o); }
/** Stop snapping it (it's gone). */
export function unsnap(o: THREE.Object3D) { roots.delete(o); }

const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), size = new THREE.Vector2();

function inScene(o: THREE.Object3D, scene: THREE.Scene): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; }
  return false;
}

/** Snap every registered root that's showing; returns the undo (call it after rendering). */
export function snapAll(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer): () => void {
  renderer.getDrawingBufferSize(size);
  const W = size.x, H = size.y, moved: [THREE.Object3D, THREE.Vector3][] = [];
  for (const o of roots) {
    if (!o.parent) { roots.delete(o); continue; } // gone for good (a scene rebuilt)
    if (!inScene(o, scene)) continue;
    o.getWorldPosition(v);
    a.copy(v).project(camera);
    if (a.z < -1 || a.z > 1) continue; // behind the camera
    // the nearest whole pixel, back out along the camera ray to the same floor height
    const px = Math.round((a.x + 1) / 2 * W), py = Math.round((1 - a.y) / 2 * H);
    const nx = px / W * 2 - 1, ny = 1 - py / H * 2;
    a.set(nx, ny, -1).unproject(camera); b.set(nx, ny, 1).unproject(camera);
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-6) continue;
    const t = (v.y - a.y) / dy;
    const sx = a.x + (b.x - a.x) * t, sz = a.z + (b.z - a.z) * t;
    if (Math.hypot(sx - v.x, sz - v.z) > 0.25) continue; // (a grazing ray: leave it be)
    moved.push([o, o.position.clone()]);
    // parents only translate the figures, so the world shift is the local shift
    o.position.x += sx - v.x; o.position.z += sz - v.z;
  }
  return () => { for (const [o, p] of moved) o.position.copy(p); };
}
