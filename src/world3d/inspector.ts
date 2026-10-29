// The council inspector (a rare event), on foot. Game says when they're here and when the walk-round is on; this only
// walks them: waiting just inside the roller door, then round the machine, the extractor and the wall extinguisher and
// back, lingering at each, and stopping to wait whenever you fall behind. The walk-round only counts while you're with
// them (the view calls Game.escort while you're within WORLD.inspectorStayClose).
import type { Game } from '../sim/Game.js';
import { COLS, ROWS } from '../world/layout.js';
import { findPath, smooth, type P, type Walkable } from '../world/pathfind.js';
import { WORLD } from '../world/worldConfig.js';

const C = WORLD.cell;
const centre = (t: P) => ({ x: (t.x + 0.5) * C, z: (t.y + 0.5) * C });

/** Where they wait (inside the roller door) and the stops on the walk-round: the machine, the extractor, the extinguisher. */
const DOOR: P = { x: 27, y: 31 };
const STOPS: P[] = [{ x: 13, y: 28 }, { x: 15, y: 17 }, { x: 27, y: 34 }, DOOR];

export class InspectorWalker {
  x = centre(DOOR).x;
  z = centre(DOOR).z;
  facing = Math.PI / 2;
  visible = false;
  private path: P[] | null = null;
  private idx = 0;
  private stop = 0;          // next stop on the round
  private linger = 0;        // seconds still to spend looking at this stop

  constructor(private walkable: Walkable) {}

  get walking() { return !!this.path; }

  update(dt: number, g: Game, you: { x: number; z: number }) {
    const r = g.rare;
    const here = r?.id === 'council' && r.phase === 'live' && g.phase === 'day';
    if (!here) { this.visible = false; this.path = null; this.stop = 0; this.linger = 0; this.place(DOOR); return; }
    this.visible = true;
    const near = Math.hypot(you.x - this.x, you.z - this.z) <= WORLD.inspectorStayClose;
    if (!g.inspectorTouring) {
      // waiting at the door, looking at you
      this.facing = Math.atan2(-(you.x - this.x), -(you.z - this.z));
      return;
    }
    if (near) g.escort(dt); // the walk-round counts while you're with them
    if (this.linger > 0) { this.linger -= dt; return; }
    if (!this.path) {
      if (this.stop >= STOPS.length) return; // round done: Game finishes it when the time's in
      const found = findPath(COLS, ROWS, this.walkable, this.cell, [STOPS[this.stop]]);
      this.path = found ? smooth(this.walkable, found) : null;
      this.idx = this.path && this.path.length > 1 ? 1 : 0;
      if (!this.path) { this.stop++; return; }
    }
    if (!near) return; // they wait for you to catch up
    this.follow(dt);
    if (!this.path) { this.stop++; this.linger = WORLD.inspectorLinger; }
  }

  private get cell(): P { return { x: Math.floor(this.x / C), y: Math.floor(this.z / C) }; }
  private place(t: P) { const p = centre(t); this.x = p.x; this.z = p.z; }

  private follow(dt: number) {
    let step = WORLD.inspectorSpeed * dt;
    while (this.path && step > 0) {
      const wp = centre(this.path[this.idx]);
      const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.001) this.facing = Math.atan2(-dx, -dz);
      if (d <= step) {
        this.x = wp.x; this.z = wp.z; step -= d;
        if (++this.idx >= this.path.length) this.path = null;
      } else { this.x += dx / d * step; this.z += dz / d * step; step = 0; }
    }
  }
}
