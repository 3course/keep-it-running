// Three-quarter view look: palette, object heights, and the box/shadow drawing helpers.
// Pure presentation. Light comes from the top-left, so tops are lit, fronts are darker,
// and shadows fall down-right, longer as the day goes on.
import type { ObjectId } from './layout.js';
import { T } from './layout.js';
import { WORLD } from './worldConfig.js';

export const WALL_H = Math.round(WORLD.tile * 1.5); // walls stand 1.5 tiles tall

/** Floors and ground. Warm concrete, sawdust on the factory floor, gravel and Colorbond outside. */
export const FLOOR: Record<number, { base: number; speck: number; specks: number }> = {
  [T.GROUND]: { base: 0x7d7566, speck: 0x5f584c, specks: 14 },  // gravel yard
  [T.STREET]: { base: 0x3a3a3d, speck: 0x4a4a4e, specks: 10 },  // bitumen
  [T.FLOOR]: { base: 0xb7a58a, speck: 0xd8c39a, specks: 12 },   // concrete with sawdust
  [T.OFFICE]: { base: 0x7a5c44, speck: 0x6a4e39, specks: 8 },   // tired carpet
  [T.TOILET]: { base: 0xd8dcd4, speck: 0xc2c8c0, specks: 2 },   // tiles
  [T.STORAGE]: { base: 0xa8977d, speck: 0xc4ae88, specks: 8 },
  [T.SHED]: { base: 0x8e7656, speck: 0x76603f, specks: 6 },     // timber boards
  [T.WALL]: { base: 0x3a332c, speck: 0x3a332c, specks: 0 },     // hidden under the wall boxes
  [T.DOOR]: { base: 0xa8977d, speck: 0x8a7a62, specks: 3 },
  [T.ROLLER]: { base: 0x9a8f7c, speck: 0x8a7f6c, specks: 3 },
  [T.APRON]: { base: 0x9a9284, speck: 0x8a8274, specks: 8 },    // driveway concrete
  [T.DOCK]: { base: 0xa8977a, speck: 0xc9b48c, specks: 10 },
};

export const WALL = {
  brickTop: 0xf1e6cf, brickFront: 0xd8c9a9, brickLine: 0xc2b28f,   // cream-painted brick, inside
  claddingTop: 0x5d7a5a, claddingFront: 0x3f5a3f, claddingRib: 0x355035, // Colorbond green, outside
  edge: 0xfff8e8,                                                      // lit top-left edge
};

/** Height of each object's box in px — roughly true to life. */
export const HEIGHT: Record<ObjectId, number> = {
  machine: 18, plyPallet: 14, finishedPallet: 14, offcutBin: 28, bitRack: 38, extractor: 60, compressor: 30,
  exhaust: 46, duct: 40, extinguisher: 26, rollerDoor: WALL_H, smoko: 16, desk: 24, phone: 8, fridge: 44,
  toilet: 16, racks: 54, spareExtinguisher: 26, bags: 14, skip: 30,
};

/** Shadow length per px of height: short in the morning, long by knock-off. */
export function shadowScale(hour: number): number {
  const t = Math.max(0, Math.min(1, (hour - 7) / 10));
  return 0.3 + 0.6 * t;
}
export function shadowOffset(height: number, hour: number) {
  const s = shadowScale(hour) * height;
  return { dx: s * 0.75, dy: s * 0.45 };
}

export function shade(colour: number, f: number): number {
  const r = Math.min(255, Math.round(((colour >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((colour >> 8) & 255) * f));
  const b = Math.min(255, Math.round((colour & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/**
 * A box in three-quarter view. (x, y, w, d) is the footprint on the floor in px; h is its height.
 * The top face is drawn raised by h; the front face fills the gap down to the floor.
 */
export function box(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, d: number, h: number, colour: number, inset = 2) {
  const X = x + inset, Y = y + inset, Wd = w - inset * 2, D = d - inset * 2;
  const top = shade(colour, 1.12), front = shade(colour, 0.72);
  g.fillStyle(front, 1).fillRect(X, Y + D - h, Wd, h);          // front face
  g.fillStyle(top, 1).fillRect(X, Y - h, Wd, D);                // top face
  g.lineStyle(1, shade(colour, 1.4), 0.9).lineBetween(X, Y - h, X + Wd, Y - h).lineBetween(X, Y - h, X, Y - h + D); // lit edges
  g.lineStyle(1, shade(colour, 0.5), 0.8).lineBetween(X, Y + D, X + Wd, Y + D);  // grounded
  return { topX: X, topY: Y - h, topW: Wd, topD: D };
}

/** Soft shadow: a few stacked translucent rounded rects, offset down-right. */
export function softShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, d: number, dx: number, dy: number) {
  for (let i = 0; i < 3; i++) {
    const grow = i * 3;
    g.fillStyle(0x1a120a, 0.09).fillRoundedRect(x + dx - grow, y + dy - grow, w + grow * 2, d + grow * 2, 4 + grow);
  }
}
