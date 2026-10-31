// SVG path data → polylines, and the toolpath the router follows. Supports M L H V C S Q T A Z (absolute and
// relative). No DOM and no Three.js, so the sketch, the router, the extrusion and anything later (after-hours
// tracing) all flatten a design the same way.
import type { Design } from './types.js';

export type Pt = [number, number];
export interface Poly { pts: Pt[]; closed: boolean }

const CURVE_STEPS = 14;

/** Flatten SVG path data into one polyline per subpath. */
export function flatten(d: string): Poly[] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: Poly[] = [];
  let cur: Poly | null = null;
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  let lastCtrl: Pt | null = null, lastCmd = '';
  const num = () => Number(toks[i++]);
  const more = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const add = (p: Pt) => { if (!cur) { cur = { pts: [[x, y]], closed: false }; out.push(cur); } cur.pts.push(p); };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') {
      if (cur) { cur.closed = true; cur = null; }
      x = sx; y = sy; lastCtrl = null; lastCmd = 'Z';
      continue;
    }
    if (!more()) { i++; continue; } // a stray letter
    if (C === 'M') {
      x = ox + num(); y = oy + num(); sx = x; sy = y;
      cur = { pts: [[x, y]], closed: false }; out.push(cur);
      cmd = rel ? 'l' : 'L'; // further pairs are lines
      lastCtrl = null;
    } else if (C === 'L') { x = ox + num(); y = oy + num(); add([x, y]); lastCtrl = null; }
    else if (C === 'H') { x = ox + num(); add([x, y]); lastCtrl = null; }
    else if (C === 'V') { y = oy + num(); add([x, y]); lastCtrl = null; }
    else if (C === 'C' || C === 'S') {
      let c1: Pt;
      if (C === 'C') c1 = [ox + num(), oy + num()];
      else c1 = lastCtrl && /[CS]/.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
      const c2: Pt = [ox + num(), oy + num()], e: Pt = [ox + num(), oy + num()];
      const p0: Pt = [x, y];
      for (let k = 1; k <= CURVE_STEPS; k++) {
        const t = k / CURVE_STEPS, u = 1 - t;
        add([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]);
      }
      x = e[0]; y = e[1]; lastCtrl = c2;
    } else if (C === 'Q' || C === 'T') {
      let c: Pt;
      if (C === 'Q') c = [ox + num(), oy + num()];
      else c = lastCtrl && /[QT]/.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
      const e: Pt = [ox + num(), oy + num()], p0: Pt = [x, y];
      for (let k = 1; k <= CURVE_STEPS; k++) {
        const t = k / CURVE_STEPS, u = 1 - t;
        add([u * u * p0[0] + 2 * u * t * c[0] + t * t * e[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * e[1]]);
      }
      x = e[0]; y = e[1]; lastCtrl = c;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
      const e: Pt = [ox + num(), oy + num()];
      for (const p of arc([x, y], rx, ry, rot, !!large, !!sweep, e)) add(p);
      x = e[0]; y = e[1]; lastCtrl = null;
    } else { i++; continue; }
    lastCmd = C;
  }
  // a closed subpath that repeats its first point at the end: drop the duplicate
  for (const p of out) {
    const a = p.pts[0], b = p.pts[p.pts.length - 1];
    if (p.closed && p.pts.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) p.pts.pop();
  }
  return out.filter(p => p.pts.length > 1);
}

/** An SVG elliptical arc as points (endpoint parameterisation → centre, per the SVG spec). */
function arc(p0: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, p1: Pt): Pt[] {
  if (!rx || !ry) return [p1];
  const phi = rotDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = co * rx * y1 / ry, cy1 = -co * ry * x1 / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2, cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
  const pts: Pt[] = [];
  for (let k = 1; k <= n; k++) {
    const t = t0 + dt * k / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push(k === n ? p1 : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return pts;
}

/** Signed area (positive: clockwise in SVG's y-down space). */
export function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

export function bounds(polys: Poly[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p.pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** A design, flattened: the outer outline, holes (closed inner cuts) and engraving lines. */
export interface FlatDesign { outer: Pt[]; holes: Pt[][]; engraves: Poly[]; cuts: Poly[] }

const cache = new Map<string, FlatDesign>();
export function flatDesign(d: Design): FlatDesign {
  const hit = cache.get(d.id);
  if (hit) return hit;
  const outer = flatten(d.outer)[0]?.pts ?? [];
  const holes: Pt[][] = [], engraves: Poly[] = [], cuts: Poly[] = [];
  for (const p of d.inner) for (const poly of flatten(p.d)) {
    if (p.op === 'engrave') engraves.push(poly);
    else { cuts.push(poly); if (poly.closed && poly.pts.length > 2) holes.push(poly.pts); }
  }
  const f = { outer, holes, engraves, cuts };
  cache.set(d.id, f);
  return f;
}

/** One move of the toolpath: down (cutting or engraving) or a rapid in the air between them. */
export interface Move { from: Pt; to: Pt; op: 'cut' | 'engrave' | 'rapid'; at: number; len: number }

/**
 * The order the router cuts it: engraving first, then the holes, then the outer profile (so the part stays held
 * down until last), with rapids between. `at` is the distance along the whole path where each move starts.
 */
export function toolpath(d: Design): { moves: Move[]; length: number } {
  const f = flatDesign(d);
  const runs: { pts: Pt[]; op: 'cut' | 'engrave' }[] = [
    ...f.engraves.map(p => ({ pts: p.closed ? [...p.pts, p.pts[0]] : p.pts, op: 'engrave' as const })),
    ...f.cuts.map(p => ({ pts: p.closed ? [...p.pts, p.pts[0]] : p.pts, op: 'cut' as const })),
    { pts: [...f.outer, f.outer[0]], op: 'cut' },
  ];
  const moves: Move[] = [];
  let at = 0, pos: Pt | null = null;
  const push = (from: Pt, to: Pt, op: Move['op']) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (len < 1e-9) return;
    // rapids are quick: they count for a fraction of their length in time
    moves.push({ from, to, op, at, len: op === 'rapid' ? len * 0.15 : len });
    at += op === 'rapid' ? len * 0.15 : len;
  };
  for (const r of runs) {
    if (!r.pts.length) continue;
    if (pos) push(pos, r.pts[0], 'rapid');
    for (let k = 1; k < r.pts.length; k++) push(r.pts[k - 1], r.pts[k], r.op);
    pos = r.pts[r.pts.length - 1];
  }
  return { moves, length: at };
}

/** Where the head is a fraction `t` (0..1) of the way through the toolpath, and how many moves are done. */
export function headAt(tp: { moves: Move[]; length: number }, t: number): { p: Pt; done: number; down: boolean } {
  const s = Math.max(0, Math.min(1, t)) * tp.length;
  for (let i = 0; i < tp.moves.length; i++) {
    const m = tp.moves[i];
    if (s <= m.at + m.len) {
      const k = m.len ? (s - m.at) / m.len : 1;
      return { p: [m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k], done: i, down: m.op !== 'rapid' };
    }
  }
  const last = tp.moves[tp.moves.length - 1];
  return { p: last ? last.to : [0, 0], done: tp.moves.length, down: false };
}
