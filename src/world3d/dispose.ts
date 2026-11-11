// Giving GPU memory back. Three keeps a geometry's buffers, a material's program and a texture's upload until they're
// disposed; dropping the object from the scene isn't enough. Most things here are built per object (their geometry, and
// the materials made with `toon(c, true)` or `new THREE.Mesh…Material`), so they go with it. A few are shared by
// everything for the life of the page (the toon() cache, the toon ramp, the faces' ink, the piece textures): those are
// marked here, and never disposed.
import * as THREE from 'three';

const SHARED = new WeakSet<object>();

/** Mark a material, texture or geometry as shared for good: `disposeObject` leaves it alone. */
export function shared<T extends object>(x: T): T { SHARED.add(x); return x; }
export const isShared = (x: object) => SHARED.has(x);

/** A material and the textures it holds (unless they're shared). */
export function disposeMaterial(m: THREE.Material) {
  if (SHARED.has(m)) return;
  for (const v of Object.values(m)) if (v instanceof THREE.Texture && !SHARED.has(v)) v.dispose();
  m.dispose();
}

/**
 * Everything under `root` (itself included): geometries, materials and their textures (shared ones skipped), and a
 * light's shadow map. Doesn't detach it: do that too, or drop the scene it's in.
 */
export function disposeObject(root: THREE.Object3D) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry && !SHARED.has(m.geometry)) m.geometry.dispose();
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) disposeMaterial(mat);
    const l = o as THREE.Light & { shadow?: THREE.LightShadow };
    if (l.isLight && l.shadow) l.shadow.dispose();
  });
}

/** Detach `o` and dispose what it holds. */
export function removeAndDispose(o: THREE.Object3D) {
  o.removeFromParent();
  disposeObject(o);
}

/** Empty a group, disposing what was in it. */
export function disposeChildren(g: THREE.Object3D) {
  for (const c of [...g.children]) removeAndDispose(c);
}
