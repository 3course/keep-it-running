// The "before": a customer's design as they'd hand it over — pencil on graph paper, lines that wobble and overshoot,
// the sizes written on, and a note scrawled in biro. Returns an SVG string (no DOM needed). The wobble is seeded by
// the design, so the same sketch looks the same every time.
import { flatDesign, bounds, type Pt } from './path.js';
import type { Design } from './types.js';

function rng(seed: string) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
  s = (s >>> 0) % 2147483646 + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n = (v: number) => v.toFixed(1);

/** Resample a polyline at roughly `step` units and push each point off the line by a slow wobble. */
function wobble(pts: Pt[], closed: boolean, step: number, amp: number, rnd: () => number, overshoot: number): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts;
  const out: Pt[] = [];
  let phase = rnd() * 6.28, freq = 0.6 + rnd() * 0.5;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / step));
    const nx = len ? -(b[1] - a[1]) / len : 0, ny = len ? (b[0] - a[0]) / len : 0;
    for (let j = i === 1 ? 0 : 1; j <= k; j++) {
      const t = j / k;
      phase += freq * (len / k) / step;
      const off = Math.sin(phase) * amp + (rnd() - 0.5) * amp * 0.5;
      out.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
    }
  }
  // a pencil line rarely stops where it should: run on a little past the end
  if (overshoot && out.length > 1) {
    const p = out[out.length - 1], q = out[out.length - 2];
    const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    out.push([p[0] + (p[0] - q[0]) / l * overshoot, p[1] + (p[1] - q[1]) / l * overshoot]);
  }
  return out;
}

const poly = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join('');

export interface SketchOpts { width?: number; height?: number; note?: boolean; dims?: boolean }

/** The sketch as an SVG string, `width` × `height` CSS px. */
export function sketchSvg(d: Design, o: SketchOpts = {}): string {
  const W = o.width ?? 300, H = o.height ?? 220, withNote = o.note ?? true, withDims = o.dims ?? true;
  const f = flatDesign(d), b = bounds([{ pts: f.outer, closed: true }]);
  const rnd = rng(d.id);
  // room round the drawing for the sizes (left, bottom) and the note (top)
  const padL = withDims ? 34 : 10, padB = withDims ? 26 : 10, padT = withNote ? 58 : 10, padR = 12;
  const s = Math.min((W - padL - padR) / b.w, (H - padT - padB) / b.h);
  const ox = padL + ((W - padL - padR) - b.w * s) / 2 - b.minX * s, oy = padT + ((H - padT - padB) - b.h * s) / 2 - b.minY * s;
  const tx = (p: Pt): Pt => [p[0] * s + ox, p[1] * s + oy];
  const step = 6, amp = 0.9;
  const pencil = (pts: Pt[], closed: boolean, width: number, alpha: number) => {
    const a = wobble(pts.map(tx), closed, step, amp, rnd, 3 + rnd() * 3);
    const b2 = wobble(pts.map(tx), closed, step, amp * 1.2, rnd, 1 + rnd() * 4); // went over it twice
    return `<path d="${poly(a)}" stroke-width="${width}" opacity="${alpha}"/><path d="${poly(b2)}" stroke-width="${width * 0.6}" opacity="${alpha * 0.55}"/>`;
  };

  let lines = pencil(f.outer, true, 1.6, 0.85);
  for (const c of f.cuts) lines += pencil(c.pts, c.closed, 1.3, 0.8);
  let engr = '';
  for (const e of f.engraves) {
    const pts = wobble(e.pts.map(tx), e.closed, 3, 0.4, rnd, 0);
    engr += `<path d="${poly(pts)}"/>`;
  }
  // sizes: overall width under it, height up the left, with ticks, in the customer's hand
  let dims = '';
  if (withDims) {
    const x0 = b.minX * s + ox, x1 = b.maxX * s + ox, y0 = b.minY * s + oy, y1 = b.maxY * s + oy;
    const yb = y1 + 12, xl = x0 - 14;
    dims = `<g class="dim" stroke="#3a3a44" stroke-width="0.9" fill="none" opacity="0.8">
      <path d="${poly(wobble([[x0, yb], [x1, yb]], false, 8, 0.5, rnd, 0))}"/><path d="M${n(x0)} ${n(yb - 4)}l0 8M${n(x1)} ${n(yb - 4)}l0 8"/>
      <path d="${poly(wobble([[xl, y0], [xl, y1]], false, 8, 0.5, rnd, 0))}"/><path d="M${n(xl - 4)} ${n(y0)}l8 0M${n(xl - 4)} ${n(y1)}l8 0"/></g>
      <text class="hand" x="${n((x0 + x1) / 2)}" y="${n(yb + 11)}" text-anchor="middle" font-size="11" fill="#2b2b33" transform="rotate(${n(rnd() * 2 - 1)} ${n((x0 + x1) / 2)} ${n(yb)})">${Math.round(b.w)}</text>
      <text class="hand" x="${n(xl - 4)}" y="${n((y0 + y1) / 2)}" text-anchor="middle" font-size="11" fill="#2b2b33" transform="rotate(-90 ${n(xl - 4)} ${n((y0 + y1) / 2)})">${Math.round(b.h)}</text>`;
  }
  // the note: biro, at a slight angle, wrapped onto two lines, signed
  let note = '';
  if (withNote) {
    const words = d.note.split(' ');
    const rows: string[] = [''];
    const max = Math.floor(W / 6.2);
    for (const w of words) { if ((rows[rows.length - 1] + ' ' + w).trim().length > max && rows.length < 3) rows.push(''); rows[rows.length - 1] = (rows[rows.length - 1] + ' ' + w).trim(); }
    const rot = (rnd() * 2 - 1.2).toFixed(1);
    note = `<g class="note" transform="rotate(${rot} ${W / 2} 20)" fill="#1d3d8f">${rows.slice(0, 3).map((r, i) => `<text class="hand" x="8" y="${13 + i * 12}" font-size="10.5">${esc(r)}</text>`).join('')}</g>
      <text class="hand" x="${W - 8}" y="${16 + Math.min(3, rows.length) * 12}" text-anchor="end" font-size="11" fill="#1d3d8f" transform="rotate(-2 ${W - 8} 40)">— ${esc(d.customer)}</text>`;
  }
  const pid = `gp-${d.id}-${W}`;
  return `<svg class="sketch" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sketch: ${esc(d.name)}">
    <defs><pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#9cc3d9" stroke-width="0.5"/></pattern>
      <pattern id="${pid}-b" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#7fb0cc" stroke-width="0.9"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="#fbfaf4"/><rect width="${W}" height="${H}" fill="url(#${pid})"/><rect width="${W}" height="${H}" fill="url(#${pid}-b)"/>
    <g fill="none" stroke="#37373f" stroke-linecap="round" stroke-linejoin="round">${lines}</g>
    <g fill="none" stroke="#6b6b78" stroke-width="0.9" stroke-dasharray="3 2" stroke-linecap="round">${engr}</g>
    ${dims}${note}
  </svg>`;
}

/** The handwriting look for the sketch's text: put once on the page. */
export const SKETCH_CSS = `.sketch .hand { font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Chalkboard SE', cursive; }`;
