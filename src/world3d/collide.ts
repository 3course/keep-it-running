// Collision on the floor plane: the player is a square of half-size r (close enough to a circle for
// walls and furniture), moved one axis at a time so it slides along whatever it hits.
import type { Rect } from '../world/layout.js';

export interface Box { minX: number; minZ: number; maxX: number; maxZ: number }

/** Merge cells matching `pick` into as few rectangles as possible (row runs, then stacked runs). */
export function mergeCells(cols: number, rows: number, pick: (x: number, y: number) => boolean): Rect[] {
  const runs: Rect[] = [];
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (!pick(x, y)) { x++; continue; }
      const start = x;
      while (x < cols && pick(x, y)) x++;
      runs.push({ x: start, y, w: x - start, h: 1 });
    }
  }
  // stack identical runs on consecutive rows
  const out: Rect[] = [];
  for (const r of runs) {
    const above = out.find(o => o.x === r.x && o.w === r.w && o.y + o.h === r.y);
    if (above) above.h += 1; else out.push({ ...r });
  }
  return out;
}

export const rectToBox = (r: Rect, cell: number): Box => ({ minX: r.x * cell, minZ: r.y * cell, maxX: (r.x + r.w) * cell, maxZ: (r.y + r.h) * cell });

const overlaps = (x: number, z: number, r: number, b: Box) => x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ;

/** Move (x, z) by (dx, dz), sliding along boxes. Returns the new position and which axes were blocked. */
export function moveAndSlide(x: number, z: number, dx: number, dz: number, r: number, boxes: Box[]) {
  const eps = 1e-4;
  let hitX = false, hitZ = false;
  x += dx;
  for (const b of boxes) {
    if (!overlaps(x, z, r, b)) continue;
    x = dx > 0 ? b.minX - r - eps : dx < 0 ? b.maxX + r + eps : x;
    hitX = true;
  }
  z += dz;
  for (const b of boxes) {
    if (!overlaps(x, z, r, b)) continue;
    z = dz > 0 ? b.minZ - r - eps : dz < 0 ? b.maxZ + r + eps : z;
    hitZ = true;
  }
  return { x, z, hitX, hitZ };
}
