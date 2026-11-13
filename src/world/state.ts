import type { JobTypeId } from '../config.js';
import type { Game } from '../sim/Game.js';
import { MACHINE_SPOT, START_TILE, type ObjectId } from './layout.js';
import { WORLD } from './worldConfig.js';
import type { PeopleState } from '../people/state.js';

/** What the player can be carrying. One thing at a time. */
export const CARRIES = ['sheet', 'cut', 'scrap', 'extinguisher', 'bag', 'offcuts', 'bundle', 'debris',
  'bit', 'newBag', 'stack', // a bit (or collet) from the rack, a new extractor bag, the finished stack for the ute
  'cans',                   // the morning after: empties on their way to the refund bag (w.canCount of them)
] as const;
export type Carry = (typeof CARRIES)[number];

/**
 * The physical shed: the things the economy (Game) doesn't model — where you are, what's in your hands,
 * what's on the bed and the pallets. Serialised alongside Game so a reload resumes exactly.
 */
export interface WorldState {
  v: 1;
  dayIndex: number;              // Game.dayIndex this state belongs to (a new day resets the per-day parts)
  px: number; py: number;        // player position in metres on the floor (x, z)
  fx: number; fy: number;        // facing (unit vector on the floor, x and z)
  carrying: Carry | null;
  bitFor?: JobTypeId | null; // the board the bit in your hand suits (fixing a dull bit)
  clamps?: number;               // clamps on the sheet on the bed (CONFIG.chore.clamp)
  carryCount?: number;           // finished boards in your arms (carried off the bed together)
  canCount?: number;             // empties in your arms, the morning after (carrying 'cans')
  extinguisherFrom: Hook | null;   // which extinguisher you're carrying (named for the hook it lives on)
  /** Extinguishers put down somewhere (off the hook, out of your hands): where, in metres. They stay there till picked up. */
  extAt?: Partial<Record<Hook, { x: number; z: number }>>;
  hooks: { wall: boolean; shed: boolean; exhaust?: boolean }; // extinguishers hanging up (exhaust: once bought)
  /** The wall extinguisher was off its bracket when today started (Kerr mentions the council's rule). */
  extOffOvernight?: boolean;
  /** The bed: empty → sheet placed → clamped → Game loads and cuts → done (or scrap) → unloaded. */
  bed: 'empty' | 'placed' | 'clamped' | 'running' | 'done' | 'scrap';
  bedJobId: number | null;
  finishedStack: number;         // cut sheets stacked on the finished pallet awaiting pickup
  utePresent: boolean;
  oldBagWaiting: boolean;        // a full bag lifted out of the extractor, still to go to the skip
  /** A visiting mate giving you a hand: who, doing what, which of how many (the notepad line). */
  mateHelp?: { who: string; word: string; n: number; of: number } | null;
  /** A visiting mate you've said you'll grab a beer for. */
  mateBeerFor?: string | null;
  watchingSwap: string | null;   // consumable Game is swapping, so we notice when it finishes
  toiletUntil: number | null;    // absolute game minute
  rollerUpUntil: number | null;  // absolute game minute
  done: string[];                // today's events, newest first: crossed-off to-dos ("✓ Clamp the sheet") and news ("4 sheets of formply left")
  newsSeen?: number;             // today's Game log entries already scanned for stock news
  shrugs?: number;               // bumped when you reach for a sheet that isn't there (the view shrugs)
  canSpots?: Record<number, { x: number; z: number }>; // where each can that's been put down is (metres)
  /** First day only: the walk-round before the first cut. The clock waits until that cut starts. */
  tour?: { visited: ObjectId[]; cutStarted: boolean } | null;
  /** Today's finished sheets and the design each was (src/designs), oldest first: the day summary's "Made today". */
  made?: { job: number; design: string }[];
  /** How many of today's `made` have gone out in a customer's ute (their reactions are for those). */
  pickedUp?: number;
  /** Who each pickup is (Game.pickups id → the customer's name, off the job's design), for the texts on the notepad. */
  pickupNames?: Record<number, string>;
  /** The factory floor as you've laid it out (src/world/layoutPlan.ts); missing: as built. */
  layout?: Partial<import('./layoutPlan.js').Plan>;
  /** The day the layout last changed (a mate'll have something to say about it). */
  layoutDay?: number;
  /** The Lease this run is (src/world/lease.ts); absent in the daily. */
  lease?: import('./lease.js').LeaseState;
  /** The first morning's intro at the cafe has played (or been skipped): it doesn't play again. */
  introDone?: boolean;
  /** Mornings at the cafe (the barista knows your order from the third). */
  cafeVisits?: number;
  /** Days Dennis came in for his coffee. */
  dennisCoffeeDay?: number[];
  /** Metres walked today, for the summary. */
  walkedToday?: number;
  /** Next door (for pointers home while you're away). */
  atNeighbour?: import('../sim/types.js').NeighbourId | null;
  /** First visit hint per neighbour (dismiss-by-doing). */
  neighbourHints?: Partial<Record<import('../sim/types.js').NeighbourId, boolean>>;
  /** The people side (src/people/state.ts): the part-timer, knock-off nights, gifts, keepsakes, the morning's cans. */
  people?: PeopleState;
}

export const absMinute = (g: Game) => g.dayIndex * 24 * 60 + g.minute;

/** The extinguisher hooks, and the object each hangs on. The exhaust one is there once it's bought. */
export type Hook = 'wall' | 'shed' | 'exhaust';
export const HOOKS: { hook: Hook; id: ObjectId }[] = [
  { hook: 'wall', id: 'extinguisher' }, { hook: 'shed', id: 'spareExtinguisher' }, { hook: 'exhaust', id: 'exhaustExtinguisher' },
];
// the back shed's walled off for now, so its spare isn't there to grab
export const hookThere = (g: Game, h: Hook) => h !== 'shed' && (h !== 'exhaust' || g.upgrades.has('exhaustExtinguisher'));
/** An extinguisher hanging on this hook now (a save from before the exhaust hook counts it as hung). */
export const onHook = (g: Game, w: WorldState, h: Hook) => hookThere(g, h) && w.hooks[h] !== false;
/** Where an extinguisher is: on its hook, in your hands, put down somewhere, or not in the shed (not bought / walled off). */
export type ExtPlace = { at: 'hook' } | { at: 'held' } | { at: 'down'; x: number; z: number } | { at: 'none' };
export function extPlace(g: Game, w: WorldState, h: Hook): ExtPlace {
  if (!hookThere(g, h)) return { at: 'none' };
  if (w.carrying === 'extinguisher' && w.extinguisherFrom === h) return { at: 'held' };
  const d = w.extAt?.[h];
  if (d) return { at: 'down', ...d };
  return w.hooks[h] !== false ? { at: 'hook' } : { at: 'none' };
}

/** How full the offcut bin is before it's worth bagging (the bigger bin lets it fill further). */
export const offcutsBagAt = (_g: Game) => WORLD.offcutsEmptyAt; // (the bigger bin holds more instead: Game.binSheets)

/** Today's event log (shown as toasts, and in the Log panel). The same line never goes in twice in a row. */
export function logEvent(w: WorldState, text: string) {
  const line = text.replace(/^• /, '');
  if (w.done[0] === line) return;
  w.done.unshift(line);
  if (w.done.length > 60) w.done.length = 60;
}

export function newWorld(g: Game): WorldState {
  const t = WORLD.cell;
  return {
    v: 1, dayIndex: g.dayIndex,
    px: (START_TILE.x + 0.5) * t, py: (START_TILE.y + 0.5) * t, fx: 0, fy: -1,
    carrying: null, extinguisherFrom: null, hooks: { wall: true, shed: true, exhaust: true }, extAt: {},
    bed: 'empty', bedJobId: null, finishedStack: 0, utePresent: false,
    oldBagWaiting: false, watchingSwap: null, toiletUntil: null, rollerUpUntil: null,
    done: [],
    tour: g.dayIndex === 1 ? { visited: [], cutStarted: false } : null, // a fresh save starts with the tour
  };
}

/** Overnight: back at the machine, hands empty, extinguishers rehung, pickups collected. The bed keeps what's on it. */
export function startNewDay(w: WorldState, g: Game) {
  const t = WORLD.cell;
  // the extinguisher stays where it was left (overnight too); in your hands at knock-off, it's down where you stood
  if (w.carrying === 'extinguisher' && w.extinguisherFrom) (w.extAt ??= {})[w.extinguisherFrom] = { x: w.px, z: w.py };
  w.dayIndex = g.dayIndex;
  w.px = (MACHINE_SPOT.x + 0.5) * t; w.py = (MACHINE_SPOT.y + 0.5) * t; w.fx = 0; w.fy = -1;
  w.tour = null;
  if (w.carrying === 'sheet' && w.bed === 'empty') w.bed = 'placed'; // left it on the bed
  w.carrying = null; w.extinguisherFrom = null; // (the hooks keep whatever's on them)
  w.extOffOvernight = w.hooks.wall === false;
  w.finishedStack = 0; w.utePresent = false; w.toiletUntil = null; w.rollerUpUntil = null;
  // (watchingSwap stays: a swap still going at knock-off carries on in the morning (Game.replacing), and the view puts
  // the old bag out when it's done, as it does in the day)
  w.done = []; w.newsSeen = 0; w.canSpots = {}; w.made = []; w.pickedUp = 0; w.walkedToday = 0;
  // a sheet cutting at knock-off was scrapped by Game; it's still lying on the bed
  if (w.bed === 'running') w.bed = 'scrap';
}
