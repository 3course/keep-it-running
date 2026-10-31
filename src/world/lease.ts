// The Lease: a run of 20 working days (CONFIG.lease.weeks) on one seed. The landlord's letter on day 1 sets the rent
// due at the end — in the bank on day 20. Weekly beats come from the calendar, not a script (Friday's payday and a
// group night, Saturday's market, Sunday's postcard); in week 3 one wobble is drawn from a pool and set off — the
// game's own systems deal with it. Day 20 is the reckoning. Past leases hang in the office (their own storage key, so
// starting another lease doesn't take them down).
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { ledger } from '../sim/dennis.js';
import { PEOPLE } from '../people/config.js';
import { friendById } from '../people/friends.js';
import type { Ending, WobbleKind } from '../people/lines/lease.js';
import type { PeopleState } from '../people/state.js';
import { designById } from '../designs/index.js';

export interface LeaseDay { dayIndex: number; profit: number; revenue: number; story: string | null }
export interface LeaseState {
  n: number;                      // which lease this is (1st, 2nd…)
  seed: number;
  startDayIndex: number;
  rentDue: number;
  letterRead: boolean;
  wobble: { kind: WobbleKind; dayIndex: number; fired: boolean };
  days: LeaseDay[];
  sold: { name: string; price: number; dayIndex: number }[]; // the Saturday market
  ending: Ending | null;
  /** Last lease's shortfall that rode over (in rentDue already), and this one's (scraped it, short of the rent). */
  carried?: number;
  owed?: number;
}

export interface PastLease { n: number; seed: number; ending: Ending; cash: number; rentDue: number; owed?: number; piece: string | null; jessFullTime: boolean; gifts: number; when: string }

const WOBBLES: WobbleKind[] = ['priceRise', 'quietCustomer', 'extractorDue', 'jessAnswer'];
const PAST_KEY = 'kir-leases';
const NEXT_KEY = 'kir-lease-next';

/** A new lease from this game's first day. */
export function newLease(g: Game, n = nextLeaseNumber()): LeaseState {
  const L = CONFIG.lease, days = CONFIG.week.days;
  const r = (k: number) => ((Math.imul(g.seed ^ 0x9e3779b9, 2654435761 + k * 40503) >>> 0) / 4294967296);
  // week 3's wobble: which one, and which of the week's first three days
  const kind = WOBBLES[Math.floor(r(1) * WOBBLES.length)];
  const day = g.dayIndex + (L.wobbleWeek - 1) * days + Math.floor(r(2) * 3);
  // a near miss last time: the landlord let the rest ride, and here it is
  const carried = pastLeases().find(x => x.n === n - 1)?.owed ?? 0;
  return { n, seed: g.seed, startDayIndex: g.dayIndex, rentDue: L.rentDue + carried, carried, letterRead: false, wobble: { kind, dayIndex: day, fired: false }, days: [], sold: [], ending: null };
}

export const leaseLength = () => CONFIG.lease.weeks * CONFIG.week.days;
/** Day 1..20 of the lease (the game's dayIndex counts every working day). */
export const leaseDay = (l: LeaseState, g: Game) => g.dayIndex - l.startDayIndex + 1;
export const leaseOver = (l: LeaseState, g: Game) => leaseDay(l, g) > leaseLength();
/** What'll be in the bank at the end of today, once the week's overheads are out on a Friday. */
export const projectedCash = (g: Game) => g.cash - (g.day >= CONFIG.week.days ? CONFIG.economy.weeklyOverheads : 0);

export { outcome, owedAfter } from './leaseEnding.js';

/** The day's line in the lease's record (at the day summary). */
export function recordDay(l: LeaseState, g: Game) {
  if (l.days.some(d => d.dayIndex === g.dayIndex)) return;
  const d = g.today;
  l.days.push({ dayIndex: g.dayIndex, profit: Math.round(d.revenue - d.costs), revenue: Math.round(d.revenue), story: g.story });
}

/** Week 3's wobble, set off on its day: the game's own systems take it from there. True if it fired now. */
export function fireWobble(l: LeaseState, g: Game, p: PeopleState): boolean {
  const w = l.wobble;
  if (w.fired || g.dayIndex < w.dayIndex) return false;
  w.fired = true;
  const L = CONFIG.lease;
  switch (w.kind) {
    case 'priceRise': g.supplyCostMult = L.priceRise; break;
    case 'quietCustomer':
      g.callMult = L.quietCalls; g.callMultUntil = g.dayIndex + L.quietDays - 1;
      g.orderCalls.splice(Math.max(1, Math.round(g.orderCalls.length * L.quietCalls))); // today's too
      break;
    case 'extractorDue': g.wear.filter = Math.min(g.wear.filter, 0.15); break;
    case 'jessAnswer': p.trust = Math.max(p.trust, PEOPLE.partTimer.askAt); p.jessExtraDay = g.dayIndex; break;
  }
  return true;
}

/** Everything the ending's lines (and the postcards) can say about the run, read off the save. */
export function runFacts(l: LeaseState, g: Game, p: PeopleState) {
  const sorted = [...l.days].sort((a, b) => b.profit - a.profit);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const L = ledger(g.dennis);
  const fav = favouritePiece(p);
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-AU')}`;
  const dayName = (d?: LeaseDay) => (d ? `day ${d.dayIndex - l.startDayIndex + 1}` : 'day one');
  return {
    rent: money(l.rentDue), cash: money(projectedCash(g)), owed: money(l.owed ?? 0), carried: money(l.carried ?? 0), days: String(leaseLength()), landlord: '', lease: String(l.n),
    gifts: String(p.gifts.length), best: dayName(best), bestAmount: money(best?.profit ?? 0), worst: dayName(worst), worstAmount: money(worst?.profit ?? 0),
    piece: fav ?? 'the trophy', won: String(L.won), total: String(L.settled), net: money(L.net), jess: PEOPLE.partTimer.name,
    mate: p.lastFriend ? friendById(p.lastFriend).name : 'Eggby', nights: String(p.nights), beers: String(p.lastNight?.beers ?? 0),
    sheets: String(g.week.reduce((s, d) => s + d.sheetsDone, 0) + g.today.sheetsDone), kept: String(p.keepsakes.length),
    sold: String(l.sold.length),
  };
}
export type RunFacts = ReturnType<typeof runFacts>;
export const fillRun = (text: string, f: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k) => f[k] ?? m);

/** The favourite made piece: the best-traced thing cut after hours, else the design made most. */
export function favouritePiece(p: PeopleState): string | null {
  const k = [...p.keepsakes].sort((a, b) => b.accuracy - a.accuracy)[0];
  if (k) return k.design.name.toLowerCase();
  const gift = p.gifts.find(x => x.design);
  return gift?.design ? designById(gift.design)?.name.toLowerCase() ?? null : null;
}

// ---------- past leases (the office wall) ----------

export function pastLeases(): PastLease[] {
  try { return JSON.parse(localStorage.getItem(PAST_KEY) ?? '[]') as PastLease[]; } catch { return []; }
}
/** Bumped when a lease goes up on the wall (the view rebuilds its frames). */
export const wall = { version: 0 };
export function rememberLease(past: PastLease) {
  wall.version++;
  try {
    const all = pastLeases().filter(x => !(x.n === past.n && x.seed === past.seed));
    localStorage.setItem(PAST_KEY, JSON.stringify([...all, past].slice(-12)));
    localStorage.setItem(NEXT_KEY, String(past.n + 1));
  } catch { /* storage blocked: the wall just doesn't keep */ }
}
export function nextLeaseNumber(): number {
  try { return Number(localStorage.getItem(NEXT_KEY)) || pastLeases().length + 1; } catch { return 1; }
}
