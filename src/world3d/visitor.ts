// A visiting mate in the shed. Game decides what they do and when (seeded, a game minute at a time): where they're
// mooching about, when they come up to you, when they're yarning. This only walks them there: to a spot in their
// area, or up beside you when they've something to say. They never stop in a doorway, at the machine, the phone
// or the customer pickup (they walk through, they don't stand there), and they step aside when they're in your way.
import type { Distraction } from '../sim/types.js';
import { COLS, ROWS, VISITOR_AREAS, VISITOR_ARRIVAL, keepClearCells } from '../world/layout.js';
import { findPath, smooth, type P, type Walkable } from '../world/pathfind.js';
import { WORLD } from '../world/worldConfig.js';

const C = WORLD.cell;
const centre = (t: P) => ({ x: (t.x + 0.5) * C, z: (t.y + 0.5) * C });

/** Distance from a point to a segment, in metres. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Where you are and where you're walking: your position and the rest of your path (waypoints in metres). */
export interface PlayerTrack { x: number; z: number; route: { x: number; z: number }[] }

export class VisitorWalker {
  id: number | null = null;  // the visit being walked
  x = 0;
  z = 0;
  facing = 0;
  private path: P[] | null = null;
  private idx = 0;
  private goal: P | null = null;
  private goalKey = '';      // what the goal was picked for: a wander spot, or "near you"
  private wantKey = '';
  private asideUntil = 0;
  private readonly keepClear = keepClearCells();
  private readonly spots = new Map<string, P[]>();

  constructor(private walkable: Walkable) {}

  get cell(): P { return { x: Math.floor(this.x / C), y: Math.floor(this.z / C) }; }
  get walking() { return !!this.path; }
  /** Somewhere they'd stand: walkable, and not a doorway, the machine, the phone or the pickup. */
  canStand = (x: number, y: number) => this.walkable(x, y) && !this.keepClear.has(y * COLS + x);
  get onKeepClear() { const c = this.cell; return this.keepClear.has(c.y * COLS + c.x); }

  /** Test hook: stand them on a cell as if they'd walked there and meant to stay. */
  placeAt(x: number, y: number) {
    const p = centre({ x, y });
    this.x = p.x; this.z = p.z; this.path = null;
    this.goal = { x, y }; this.goalKey = this.wantKey;
  }

  update(dt: number, time: number, d: Distraction | undefined, you: PlayerTrack) {
    if (!d) { this.id = null; this.path = null; return; }
    if (this.id !== d.id) {
      // a new visit: they walk in from the dock
      this.id = d.id;
      const p = centre(VISITOR_ARRIVAL);
      this.x = p.x; this.z = p.z; this.path = null; this.goal = null; this.goalKey = '';
    }
    const talking = !!d.ask || d.engaged;
    this.wantKey = talking ? 'you' : `wander:${d.wander?.area}:${d.wander?.spot}`;

    if (time >= this.asideUntil && this.inTheWay(you)) {
      // in your way: get out of it, and stay out of it for a moment
      const t = this.nearest(this.cell, (x, y) => this.clearOf(you, x, y));
      if (t) { this.walkTo(t, 'aside'); this.asideUntil = time + 1.5; }
    } else if (time >= this.asideUntil) {
      const youCell = { x: Math.floor(you.x / C), y: Math.floor(you.z / C) };
      if (talking) {
        // up beside you: re-pick once you've moved off from where they were heading
        const far = !this.goal || this.goalKey !== 'you' || Math.hypot(this.goal.x - youCell.x, this.goal.y - youCell.y) > 3.5;
        if (far) {
          const t = this.nearest(youCell, (x, y) => { const r = Math.hypot(x - youCell.x, y - youCell.y); return r >= 1.4 && r <= 3; }, 6, this.cell);
          if (t) this.walkTo(t, 'you');
        }
      } else if (this.goalKey !== this.wantKey && d.wander) {
        const spots = this.areaSpots(d.wander.area);
        if (spots.length) this.walkTo(spots[Math.min(spots.length - 1, Math.floor(d.wander.spot * spots.length))], this.wantKey);
      }
    }
    // stopped somewhere they shouldn't stand (a doorway, the machine…): step off it
    if (!this.path && this.onKeepClear) {
      const t = this.nearest(this.cell, () => true);
      if (t) this.walkTo(t, this.goalKey);
    }
    this.follow(dt);
  }

  /** You're walking and they're on your route, or right on top of you. */
  private inTheWay(you: PlayerTrack) {
    if (!you.route.length) return false;
    if (Math.hypot(this.x - you.x, this.z - you.z) < 0.6) return true;
    return !this.routeClear(you, this.x, this.z);
  }

  private routeClear(you: PlayerTrack, px: number, pz: number) {
    let ax = you.x, az = you.z;
    for (const w of you.route) {
      if (segDist(px, pz, ax, az, w.x, w.z) < 0.55) return false;
      ax = w.x; az = w.z;
    }
    return true;
  }

  private clearOf(you: PlayerTrack, x: number, y: number) {
    const p = centre({ x, y });
    return Math.hypot(p.x - you.x, p.z - you.z) >= 1 && this.routeClear(you, p.x, p.z);
  }

  /** The nearest cell they could walk to and stand on (to `from`, ties to `near`) that passes `ok`, within `radius` cells. */
  private nearest(from: P, ok: (x: number, y: number) => boolean, radius = 8, near: P = from): P | null {
    const reach = this.reachable();
    let best: P | null = null, bd = Infinity;
    for (let y = from.y - radius; y <= from.y + radius; y++) for (let x = from.x - radius; x <= from.x + radius; x++) {
      if (!reach.has(y * COLS + x) || !this.canStand(x, y) || !ok(x, y)) continue;
      const d = Math.hypot(x - from.x, y - from.y) * 10 + Math.hypot(x - near.x, y - near.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  /** Every cell they can walk to from where they are (a flood fill: the shed's only a couple of thousand cells). */
  private reachable() {
    const start = this.cell, seen = new Set<number>([start.y * COLS + start.x]), queue = [start];
    while (queue.length) {
      const c = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c.x + dx, y = c.y + dy, k = y * COLS + x;
        if (!seen.has(k) && this.walkable(x, y)) { seen.add(k); queue.push({ x, y }); }
      }
    }
    return seen;
  }

  /** Cells in an area they'd stand on, in a fixed order (Game's 0..1 `spot` picks one). */
  private areaSpots(area: keyof typeof VISITOR_AREAS) {
    let s = this.spots.get(area);
    if (!s) {
      const r = VISITOR_AREAS[area];
      s = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (this.canStand(x, y)) s.push({ x, y });
      this.spots.set(area, s);
    }
    return s;
  }

  private walkTo(t: P, key: string) {
    this.goal = t; this.goalKey = key;
    const found = findPath(COLS, ROWS, this.walkable, this.cell, [t]);
    this.path = found ? smooth(this.walkable, found) : null;
    this.idx = this.path && this.path.length > 1 ? 1 : 0;
  }

  private follow(dt: number) {
    if (!this.path) return;
    let step = WORLD.visitorSpeed * dt;
    while (this.path && step > 0) {
      const wp = centre(this.path[this.idx]);
      const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.001) this.facing = Math.atan2(-dx, -dz);
      if (d <= step) {
        this.x = wp.x; this.z = wp.z; step -= d;
        if (++this.idx >= this.path.length) this.path = null;
      } else {
        this.x += dx / d * step; this.z += dz / d * step; step = 0;
      }
    }
  }
}
