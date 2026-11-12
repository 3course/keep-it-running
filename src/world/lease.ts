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
import { drawFortunes, fortuneMorning, type FortuneKind } from './leaseWeeks.js';
import { getItem, getJson, isObject, KEYS, setItem } from '../storage.js';

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
  /** The weeks this lease deals (src/world/leaseWeeks.ts), and the mornings already dealt. */
  fortunes?: (FortuneKind | null)[];
  dealtOn?: number[];
}

export interface PastLease { n: number; seed: number; ending: Ending; cash: number; rentDue: number; owed?: number; piece: string | null; jessFullTime: boolean; gifts: number; when: string }

const WOBBLES: WobbleKind[] = ['priceRise', 'quietCustomer', 'extractorDue', 'jessAnswer'];

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

/** The rent's due at close on this day of the lease (CONFIG.lease.dueDay). */
export const leaseLength = () => CONFIG.lease.dueDay;
/** Day 1..20 of the lease (the game's dayIndex counts every working day). */
export const leaseDay = (l: LeaseState, g: Game) => g.dayIndex - l.startDayIndex + 1;
/** "rent due in 19 days" / "rent due tomorrow" / "rent due today" ('' once it's past, or with no lease). */
export function rentClockText(g: Game, l: LeaseState | undefined): string {
  if (!l) return '';
  const left = leaseLength() - leaseDay(l, g);
  return left > 1 ? `rent due in ${left} days` : left === 1 ? 'rent due tomorrow' : left === 0 ? 'rent due today' : '';
}

/** "Mon, week 2 · rent due in 12 days": one day count, for the notepad's header and the title's Continue. */
export function dayHeading(g: Game, l: LeaseState | undefined): string {
  const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][(g.day - 1) % 5];
  const week = l ? Math.ceil(leaseDay(l, g) / CONFIG.week.days) : Math.ceil(g.dayIndex / CONFIG.week.days);
  return [`${dayName}, week ${week}`, rentClockText(g, l)].filter(Boolean).join(' · ');
}

export const leaseOver = (l: LeaseState, g: Game) => leaseDay(l, g) > leaseLength();
/** What'll be in the bank at the end of today, once the week's overheads are out on a Friday. */
export const projectedCash = (g: Game) => g.cash - (g.day >= CONFIG.week.days ? g.weeklyOverheadsDue : 0);

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

/** What this week of the lease is (null: an ordinary one), from the lease's own draw — known before Monday's dealt. */
export function weekKind(l: LeaseState | undefined, g: Game): FortuneKind | null {
  if (!l) return null;
  const wk = Math.floor((g.dayIndex - l.startDayIndex) / CONFIG.week.days);
  return (l.fortunes ??= drawFortunes(l.seed))[wk] ?? null;
}
export const quietWeek = (l: LeaseState | undefined, g: Game) => weekKind(l, g) === 'quiet';

/** Each morning: if it starts a week this lease dealt, set it going. Returns the kind once, on its first morning. */
export function dealWeek(l: LeaseState, g: Game, note: (k: FortuneKind) => string): FortuneKind | null {
  if ((l.dealtOn ??= []).includes(g.dayIndex)) return null;
  l.dealtOn.push(g.dayIndex);
  return fortuneMorning(l.fortunes ??= drawFortunes(l.seed), l.startDayIndex, g, note);
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
export const fillRun = (text: string, f: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k) => f[k] ?? m);

/** The favourite made piece: the best-traced thing cut after hours, else the design made most. */
export function favouritePiece(p: PeopleState): string | null {
  const k = [...p.keepsakes].sort((a, b) => b.accuracy - a.accuracy)[0];
  if (k) return k.design.name.toLowerCase();
  const gift = p.gifts.find(x => x.design);
  return gift?.design ? designById(gift.design)?.name.toLowerCase() ?? null : null;
}

// ---------- past leases (the office wall) ----------

const ENDINGS: readonly string[] = ['flying', 'comfortable', 'made', 'scraped', 'short'] satisfies Ending[];
const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e9, Math.min(1e9, v)) : 0);
const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : null);

/** A stored past lease, or null if it isn't one (a tampered or corrupted entry is dropped, not shown). */
function pastLease(v: unknown): PastLease | null {
  if (!isObject(v)) return null;
  const n = whole(v.n, 1_000_000), seed = whole(v.seed, 0xffffffff);
  if (n === null || seed === null || typeof v.ending !== 'string' || !ENDINGS.includes(v.ending)) return null;
  return {
    n, seed, ending: v.ending as Ending, cash: amount(v.cash), rentDue: amount(v.rentDue),
    ...(v.owed === undefined ? {} : { owed: amount(v.owed) }),
    piece: typeof v.piece === 'string' ? v.piece.slice(0, 200) : null,
    jessFullTime: v.jessFullTime === true,
    gifts: typeof v.gifts === 'number' && Number.isInteger(v.gifts) && v.gifts >= 0 ? Math.min(v.gifts, 10_000) : 0,
    when: typeof v.when === 'string' ? v.when.slice(0, 40) : '',
  };
}

export function pastLeases(): PastLease[] {
  return (getJson(KEYS.leases, Array.isArray) ?? []).slice(-12).map(pastLease).filter((x): x is PastLease => x !== null);
}
/** Bumped when a lease goes up on the wall (the view rebuilds its frames). */
export const wall = { version: 0 };
export function rememberLease(past: PastLease) {
  wall.version++;
  // (storage blocked: the wall just doesn't keep)
  const all = pastLeases().filter(x => !(x.n === past.n && x.seed === past.seed));
  setItem(KEYS.leases, JSON.stringify([...all, past].slice(-12)));
  setItem(KEYS.leaseNext, String(past.n + 1));
}
export function nextLeaseNumber(): number {
  return whole(Number(getItem(KEYS.leaseNext)), 1_000_000) ?? pastLeases().length + 1;
}
