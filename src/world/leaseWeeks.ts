// The weeks a lease deals (CONFIG.lease.fortunes): drawn from the lease's seed, so the same lease plays the same
// weeks. Upside a sharp operator can ride and a sloppy one mostly can't — a big order, a run of rushes, a cheap week
// on ply, a customer paying a premium — and quiet weeks that only cost you if you'd have filled them. A seed gets
// quiet weeks first (0–2, never two running), then 0–3 of the others, each on its own week. Plain: the sim's --lease report deals the same weeks through the same hooks.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';

export type FortuneKind = 'quiet' | 'bigOrder' | 'rushes' | 'plyDip' | 'premium';
export const FORTUNE_KINDS: FortuneKind[] = ['quiet', 'bigOrder', 'rushes', 'plyDip', 'premium'];

/** Which weeks of the lease get what (null: an ordinary week). */
export function drawFortunes(seed: number): (FortuneKind | null)[] {
  const F = CONFIG.lease.fortunes, weeks = CONFIG.lease.weeks;
  let s = (seed ^ 0x2545f491) >>> 0;
  const r = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
  const weighted = <T,>(xs: T[], w: (x: T) => number) => { const tot = xs.reduce((a, x) => a + w(x), 0); let k = r() * tot; for (const x of xs) { k -= w(x); if (k < 0) return x; } return xs[xs.length - 1]; };
  const out: (FortuneKind | null)[] = Array(weeks).fill(null);
  // quiet weeks first, never two running
  const q = weighted(F.quiet.countWeights.map((_, i) => i), i => F.quiet.countWeights[i]);
  for (let k = 0; k < q; k++) {
    const ok = out.map((_, i) => i).filter(i => !out[i] && out[i - 1] !== 'quiet' && out[i + 1] !== 'quiet');
    if (!ok.length) break;
    out[ok[Math.floor(r() * ok.length)]] = 'quiet';
  }
  const free = out.map((_, i) => i).filter(i => !out[i]);
  const n = Math.min(free.length, weighted(F.countWeights.map((_, i) => i), i => F.countWeights[i]));
  for (let k = 0; k < n; k++) {
    const wk = free.splice(Math.floor(r() * free.length), 1)[0];
    out[wk] = weighted(FORTUNE_KINDS, x => F[x].weight);
  }
  return out;
}

/** The first morning of a dealt week: set it going through Game's neutral hooks. `lastDay`: the week's last dayIndex. */
export function startFortune(kind: FortuneKind, g: Game, lastDay: number, note?: string) {
  const F = CONFIG.lease.fortunes;
  const f = { calls: 1, rushMult: 1, plyMult: 1, priceMult: 1, walkIns: 1, until: lastDay };
  switch (kind) {
    case 'quiet': f.calls = F.quiet.calls; f.walkIns = 0; break;
    case 'rushes': f.rushMult = F.rushes.rushMult; break;
    case 'plyDip': f.plyMult = F.plyDip.plyMult; break;
    case 'premium': f.priceMult = F.premium.priceMult; break;
    case 'bigOrder': g.leaseOrder(F.bigOrder.type, F.bigOrder.sheets, lastDay, F.bigOrder.priceMult, 'BIG ORDER'); break;
  }
  g.setFortune(f, note);
}

/** This morning, if it starts a dealt week of a lease that began on `startDayIndex`: the kind (already set going), else null. */
export function fortuneMorning(fortunes: (FortuneKind | null)[], startDayIndex: number, g: Game, note?: (k: FortuneKind) => string): FortuneKind | null {
  const d = g.dayIndex - startDayIndex, days = CONFIG.week.days;
  if (d < 0 || d % days !== 0) return null;
  const kind = fortunes[d / days] ?? null;
  if (kind) startFortune(kind, g, g.dayIndex + days - 1, note?.(kind));
  return kind;
}
