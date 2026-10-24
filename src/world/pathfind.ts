// A* on the tile grid (8-way, no corner cutting), plus line-of-sight smoothing so the player
// walks in straight lines rather than tile-by-tile zigzags.

export interface P { x: number; y: number }

export type Walkable = (x: number, y: number) => boolean;

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

/** Shortest path from start to the nearest of `goals`. Returns tiles including start and goal, or null. */
export function findPath(cols: number, rows: number, walkable: Walkable, start: P, goals: P[]): P[] | null {
  const goalSet = new Set(goals.filter(g => walkable(g.x, g.y)).map(g => g.y * cols + g.x));
  if (!goalSet.size) return null;
  const key = (x: number, y: number) => y * cols + x;
  const h = (x: number, y: number) => {
    let best = Infinity;
    for (const g of goals) best = Math.min(best, Math.hypot(g.x - x, g.y - y));
    return best;
  };
  const startKey = key(start.x, start.y);
  const gScore = new Map<number, number>([[startKey, 0]]);
  const came = new Map<number, number>();
  const open: { k: number; f: number }[] = [{ k: startKey, f: h(start.x, start.y) }];
  const closed = new Set<number>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open.splice(bi, 1)[0];
    if (closed.has(k)) continue;
    if (goalSet.has(k)) {
      const out: P[] = [];
      for (let c: number | undefined = k; c !== undefined; c = came.get(c)) out.push({ x: c % cols, y: Math.floor(c / cols) });
      return out.reverse();
    }
    closed.add(k);
    const x = k % cols, y = Math.floor(k / cols);
    for (const [dx, dy, cost] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(x + dx, y) || !walkable(x, y + dy))) continue; // no corner cutting
      const nk = key(nx, ny);
      const g = gScore.get(k)! + cost;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        came.set(nk, k);
        open.push({ k: nk, f: g + h(nx, ny) });
      }
    }
  }
  return null;
}

/** True if a straight walk between tile centres stays on walkable tiles (sampled at quarter tiles, with clearance). */
export function lineOfSight(walkable: Walkable, a: P, b: P): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    // check the tile under the line and the tiles a body's width either side
    for (const [ox, oy] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
      if (!walkable(Math.round(x + ox), Math.round(y + oy))) return false;
    }
  }
  return true;
}

/** Drop waypoints that can be skipped in a straight line. */
export function smooth(walkable: Walkable, path: P[]): P[] {
  if (path.length <= 2) return path;
  const out: P[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineOfSight(walkable, path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

export function pathLength(path: P[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return d;
}
